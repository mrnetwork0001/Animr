import { randomUUID } from "node:crypto";
import { isZgConfigured } from "../agent/zg-compute";
import { animrTradeGuardAddress } from "../contracts/animr-trade-guard";
import { CALL_RESERVE_MICRO_USD, DEMO_RECIPIENT, HEIST_LIMITS, HEIST_TITLE, dailyCapMicroUsd, parseAddress } from "./config";
import { defend } from "./defender";
import { readHouse } from "./house";
import { addressIn, moderateNickname, redactAddresses, wallProblem } from "./moderation";
import { operatorFromEnv } from "./operator";
import { buildPersona, defenderProfile } from "./persona";
import { busyProof, runHeistProof } from "./proof";
import {
  type DayStats,
  type HeistSession,
  type StoredHallOfFameEntry,
  addHallOfFame,
  bumpStats,
  countersOf,
  hashIp,
  hitLimit,
  isSessionId,
  listHallOfFame,
  listHallOfFameForAdmin,
  loadSession,
  lockSession,
  newSessionId,
  nextUtcMidnight,
  publicEntry,
  readStats,
  releaseLlmTurn,
  removeHallOfFame,
  reserveLlmTurn,
  reviewHallOfFame,
  saveSession,
  sharedStateMissing,
  unlockSession,
} from "./store";
import type { ChatResponse, HallOfFameEntry, HeistProof, HeistState, ProofResponse } from "./types";

// The heist's server logic behind app/api/heist/*. Route handlers stay thin: they parse the request, call one of
// these and turn a HeistError into its status.

/** A heist request the client can fix or retry; `status` is the HTTP status, `retryAfter` seconds for a 429. */
export class HeistError extends Error {
  name = "HeistError";
  constructor(
    message: string,
    readonly status = 400,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

/**
 * Today's 0G budget is spent, or can't be enforced (Vercel without Redis). Only meaningful with a key: without one
 * every reply is a template anyway. A turn still reserves its share before calling a model (reserveLlmTurn).
 */
function isNapping(stats: DayStats): boolean {
  return isZgConfigured() && (sharedStateMissing() || stats.usdMicro + CALL_RESERVE_MICRO_USD > dailyCapMicroUsd());
}

export async function getHeistState(now = Date.now()): Promise<HeistState> {
  const [house, stats, hallOfFame] = await Promise.all([readHouse(), readStats(now), listHallOfFame()]);
  const persona = buildPersona(house.tokenId, { now });
  return {
    title: HEIST_TITLE,
    house,
    defender: defenderProfile(persona, isZgConfigured()),
    counters: countersOf(stats, now),
    budget: { napping: isNapping(stats), resetsAt: nextUtcMidnight(now) },
    limits: { maxMessageChars: HEIST_LIMITS.maxMessageChars, replyMaxChars: HEIST_LIMITS.replyMaxChars },
    guard: { address: animrTradeGuardAddress ?? null },
    operator: operatorFromEnv(),
    demoRecipient: DEMO_RECIPIENT,
    hallOfFame,
  };
}

/** A visitor's message, normalized; at most HEIST_LIMITS.maxMessageChars. */
export function cleanMessage(raw: unknown): string {
  if (typeof raw !== "string") throw new HeistError("Send a JSON body { message }.");
  const text = raw
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) throw new HeistError("Say something first.");
  if (text.length > HEIST_LIMITS.maxMessageChars) {
    throw new HeistError(`Keep it under ${HEIST_LIMITS.maxMessageChars} characters.`, 413);
  }
  return text;
}

export type ChatInput = { ip: string; sessionId?: unknown; message: unknown; recipient?: unknown };

/** One message to the House Chog: the defender replies; if it agrees to pay, the proof runs. */
export async function chatTurn(input: ChatInput, now = Date.now()): Promise<ChatResponse> {
  const message = cleanMessage(input.message);
  const ip = hashIp(input.ip);
  const { ipMessages, ipSessions } = HEIST_LIMITS;
  const limited = await hitLimit("msg", ip, ipMessages.limit, ipMessages.windowMs, now);
  if (limited) throw new HeistError("Easy there, smooth talker. Try again in a few minutes.", 429, limited);

  let session = isSessionId(input.sessionId) ? await loadSession(input.sessionId) : null;
  if (!session) {
    const capped = await hitLimit("session", ip, ipSessions.limit, ipSessions.windowMs, now);
    if (capped) throw new HeistError("That's a lot of heists for one day. Come back tomorrow!", 429, capped);
    const house = await readHouse();
    const persona = buildPersona(house.tokenId, { now });
    session = {
      id: newSessionId(),
      ip,
      createdAt: now,
      lastAt: 0,
      tokenId: house.tokenId,
      spotId: persona.weakSpot.id,
      patience: persona.patience,
      temptation: 0,
      recipient: null,
      turns: [],
      cave: null,
      hofId: null,
    };
  }

  const lock = await lockSession(session.id);
  if (!lock) throw new HeistError("Still thinking about your last message…", 409);
  try {
    // A parallel request may have finished a turn while this one waited for the lock.
    if (session.lastAt) session = (await loadSession(session.id)) ?? session;
    if (session.cave) throw new HeistError("It already said yes! Start a new heist to try again.", 409);
    if (session.turns.length >= session.patience) throw new HeistError("Out of messages. Start a new heist!", 409);
    if (now - session.lastAt < HEIST_LIMITS.messageGapMs) throw new HeistError("One message at a time.", 429, 2);
    return await playTurn(session, message, input.recipient, now);
  } finally {
    await unlockSession(session.id, lock);
  }
}

async function playTurn(session: HeistSession, message: string, rawRecipient: unknown, now: number): Promise<ChatResponse> {
  const [house, stats] = await Promise.all([readHouse(), readStats(now)]);
  // A model is only called once this turn's share of the budget is reserved (safe across instances).
  const ticket = !isNapping(stats) && isZgConfigured() ? await reserveLlmTurn(dailyCapMicroUsd(), CALL_RESERVE_MICRO_USD, now) : null;
  const progress = { booked: false };
  try {
    return await answerTurn(session, message, rawRecipient, now, { house, stats, napping: isZgConfigured() && !ticket, progress });
  } finally {
    if (ticket) {
      // The cost is booked before the reserve is let go; a turn that failed before booking books the reserve itself.
      if (!progress.booked) await bumpStats({ usdMicro: CALL_RESERVE_MICRO_USD }, now).catch(() => {});
      await releaseLlmTurn(ticket);
    }
  }
}

async function answerTurn(
  session: HeistSession,
  message: string,
  rawRecipient: unknown,
  now: number,
  context: { house: Awaited<ReturnType<typeof readHouse>>; stats: DayStats; napping: boolean; progress: { booked: boolean } },
): Promise<ChatResponse> {
  const { house, stats, napping, progress } = context;
  const persona = buildPersona(session.tokenId, { now, spotId: session.spotId });
  const turn = session.turns.length + 1;
  // Who the AI would pay: an address the visitor typed, else their connected wallet, else one named earlier.
  const recipient = parseAddress(addressIn(message)) ?? parseAddress(rawRecipient) ?? session.recipient;
  const balance = house.tokenId === session.tokenId && house.chogBalance !== null ? Number(house.chogBalance) : NaN;

  const { turn: defender, costMicroUsd } = await defend({
    persona,
    history: session.turns.map(({ user, reply }) => ({ user, reply })),
    message,
    turn,
    patience: session.patience,
    temptation: session.temptation,
    vaultChog: Number.isFinite(balance) ? balance : null,
    napping,
    seed: session.id,
  });

  const caved = defender.intent === "transfer";
  const proof = caved ? await caveProof({ recipient, amountChog: defender.amount, tokenId: session.tokenId }, now) : null;
  const refused = proof?.kind === "live" && proof.refused;
  const delta = { attempts: 1, caves: caved ? 1 : 0, refusals: refused ? 1 : 0, usdMicro: costMicroUsd };
  // bumpStats counts this instance's totals in memory first, so the cost is booked even if the write fails.
  progress.booked = true;
  await bumpStats(delta, now);

  const wall = caved ? wallProblem(defender.reply, [...session.turns.map((t) => t.user), message]) : null;
  session.turns.push({
    user: message,
    reply: defender.reply,
    intent: defender.intent,
    amount: defender.amount,
    temptation: defender.temptation,
    source: defender.source,
    model: defender.model,
  });
  session.temptation = defender.temptation;
  // The gap to the next message counts from when this reply was ready, not from when the request arrived.
  session.lastAt = Date.now();
  session.recipient = recipient ?? null;
  if (caved) {
    session.cave = {
      turn,
      reply: defender.reply,
      amount: defender.amount,
      source: defender.source,
      model: defender.model,
      at: new Date(now).toISOString(),
      proof: proof
        ? {
            kind: proof.kind,
            reason: proof.reason,
            refused: proof.refused,
            blockNumber: proof.blockNumber,
            error: proof.results[0]?.error ?? null,
          }
        : null,
      wallProblem: wall,
    };
  }
  await saveSession(session);

  const done = caved || turn >= session.patience;
  const totals = {
    attempts: stats.attempts + delta.attempts,
    caves: stats.caves + delta.caves,
    refusals: stats.refusals + delta.refusals,
    usdMicro: stats.usdMicro + delta.usdMicro,
  };
  return {
    sessionId: session.id,
    turn,
    turnsLeft: Math.max(0, session.patience - turn),
    done,
    defender,
    proof,
    hint: !done && !napping && turn >= 2 && defender.temptation < 0.5 ? persona.weakSpot.hint : null,
    hallOfFame: { eligible: caved && wall === null, reason: caved ? wall : null },
    counters: countersOf(totals, now),
  };
}

/** The proof for a caving reply, under the same all-visitors cap as "Act as the AI" (it protects the public RPC). */
async function caveProof(input: Parameters<typeof runHeistProof>[0], now: number): Promise<HeistProof> {
  const busy = await hitLimit("proof-all", "all", HEIST_LIMITS.globalProofsPerMinute, 60_000, now);
  return busy ? busyProof(input) : runHeistProof(input);
}

/** "Act as the AI": the proof without a chat (works while the Chog naps). */
export async function actAsAi(input: { ip: string; recipient?: unknown }, now = Date.now()): Promise<ProofResponse> {
  const ip = hashIp(input.ip);
  const { ipProofs, globalProofsPerMinute } = HEIST_LIMITS;
  const limited =
    (await hitLimit("proof", ip, ipProofs.limit, ipProofs.windowMs, now)) ??
    (await hitLimit("proof-all", "all", globalProofsPerMinute, 60_000, now));
  if (limited) throw new HeistError("Monad is busy answering other robbers. Try again in a moment.", 429, limited);

  const house = await readHouse();
  const proof = await runHeistProof({ recipient: parseAddress(input.recipient), amountChog: null, tokenId: house.tokenId });
  const refused = proof.kind === "live" && proof.refused;
  if (refused) await bumpStats({ refusals: 1 }, now);
  const stats = await readStats(now);
  return { proof, counters: countersOf(stats, now) };
}

/** Puts a session's caving reply on the wall under a sanitized nickname (once per session). */
export async function submitHallOfFame(
  input: { ip: string; sessionId: unknown; nickname: unknown },
  now = Date.now(),
): Promise<HallOfFameEntry> {
  const { ipHallOfFame } = HEIST_LIMITS;
  const limited = await hitLimit("hof", hashIp(input.ip), ipHallOfFame.limit, ipHallOfFame.windowMs, now);
  if (limited) throw new HeistError("That's enough fame for one day.", 429, limited);
  if (!isSessionId(input.sessionId)) throw new HeistError("Send a JSON body { sessionId, nickname }.");
  const nickname = moderateNickname(input.nickname);
  if (!nickname) throw new HeistError("Pick a different nickname: letters, numbers, spaces, _ or -.", 422);

  const lock = await lockSession(input.sessionId);
  if (!lock) throw new HeistError("Still working on that heist. Try again in a second.", 409);
  try {
    const session = await loadSession(input.sessionId);
    if (!session) throw new HeistError("That heist expired. Con it again!", 404);
    const cave = session.cave;
    if (!cave) throw new HeistError("Only an AI that said yes goes on the wall.", 409);
    if (session.hofId) throw new HeistError("This one is already on the wall.", 409);
    if (cave.wallProblem) throw new HeistError(cave.wallProblem, 422);
    const check = cave.proof
      ? {
          kind: cave.proof.kind,
          reason: cave.proof.reason ?? null,
          refused: cave.proof.refused,
          blockNumber: cave.proof.blockNumber,
          error: cave.proof.kind === "live" ? cave.proof.error : null,
        }
      : null;
    const live = check?.kind === "live" && check.refused;
    const entry: StoredHallOfFameEntry = {
      id: randomUUID(),
      nickname,
      reply: redactAddresses(cave.reply),
      // An LLM's words wait for a moderator (HEIST_ADMIN_SECRET); a template's are ours and show at once.
      review: cave.source === "0g" ? "held" : "auto",
      amountChog: cave.amount,
      at: new Date(now).toISOString(),
      source: cave.source,
      model: cave.model,
      check,
      blockNumber: live ? check.blockNumber : null,
      error: live ? check.error : null,
    };
    await addHallOfFame(entry);
    await saveSession({ ...session, hofId: entry.id });
    return publicEntry(entry);
  } finally {
    await unlockSession(input.sessionId, lock);
  }
}

export { listHallOfFame, listHallOfFameForAdmin, removeHallOfFame, reviewHallOfFame };
