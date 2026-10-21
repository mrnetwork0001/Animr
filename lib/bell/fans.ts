import { createHash, randomBytes } from "node:crypto";
import { getChog } from "../dna/chogs";
import { moderateNickname } from "../heist/moderation";
import { getKv } from "../kv";
import { isHiddenChog } from "../visibility";
import { nextRideDay, parseDay, utcDay } from "./rules";
import { KEYS, type StoredRide, bellDays, parseRide, readFan, readSummary, writeFans } from "./store";
import type { BellSummary, FanResponse, FanStanding, FanState } from "./types";

// Fans: visitors identified by an httpOnly cookie holding a random secret. The public fanId is a hash of
// it, so ids shown in the standings can't be used to act as someone else. No wallet, points only.

export const FAN_COOKIE = "animr_fan";
export const FAN_COOKIE_MAX_AGE_S = 365 * 24 * 3600;
export const NICKNAME_MAX = 20;
/** Rides kept in a fan's history (newest first). */
const MAX_HISTORY = 60;
/** A fan's record is rewritten whole, so its writers (ride, nickname, settlement credit) take this lock. */
const FAN_LOCK_TTL_MS = 10_000;
const FAN_LOCK_WAIT_MS = 4_000;
/** Read-only views (fan cards, standings) share the live-Bell list for this long per instance. */
const CONTEXT_TTL_MS = 5_000;

/** A Bell action the client can fix or retry; `status` is the HTTP status to answer with. */
export class BellError extends Error {
  name = "BellError";
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function newFanToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The fan id behind a cookie value, or null when the value isn't one of ours. */
export function fanIdFromToken(token: string | undefined): string | null {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return `fan_${createHash("sha256").update(token).digest("hex").slice(0, 16)}`;
}

/** Letters, numbers, spaces, "_" and "-", at most 20 characters; "" clears the nickname. */
export function sanitizeNickname(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/<[^>]*>/g, " ")
    .replace(/[^\p{L}\p{N} _-]+/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NICKNAME_MAX)
    .trim();
}

/** Consecutive live Bells ridden, ending with `day` (0 when `day` wasn't ridden). */
export function streakEndingAt(ridden: Set<string>, liveDays: string[], day: string): number {
  let streak = 0;
  for (let i = liveDays.indexOf(day); i >= 0 && ridden.has(liveDays[i]); i--) streak++;
  return streak;
}

export function rideOpen(bell: BellSummary, now: number): boolean {
  return bell.kind === "live" && bell.status === "open" && now < Date.parse(bell.rideWindowClosesAt);
}

/**
 * Runs `fn` holding the fan's lock, so a ride, a nickname and a settlement credit never overwrite each
 * other's copy of the record. Waits a few seconds for a busy lock, then answers 409 (retry).
 */
export async function withFanLock<T>(fanId: string, fn: () => Promise<T>): Promise<T> {
  const kv = getKv();
  const name = `fan:${fanId}`;
  const deadline = Date.now() + FAN_LOCK_WAIT_MS;
  let token = await kv.acquireLock(name, FAN_LOCK_TTL_MS);
  while (!token && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    token = await kv.acquireLock(name, FAN_LOCK_TTL_MS);
  }
  if (!token) throw new BellError("Your fan card is busy updating. Try again in a moment.", 409);
  try {
    return await fn();
  } finally {
    await kv.releaseLock(name, token).catch(() => {});
  }
}

type FanContext = { liveDays: string[]; latest: BellSummary | null; now: number };

const globalForFans = globalThis as typeof globalThis & {
  __animrFanContext?: { expires: number; liveDays: string[]; latest: BellSummary | null };
};

/** The live Bells and the latest one; `cached` reuses a few-seconds-old copy (read-only views only). */
async function fanContext(now = Date.now(), cached = false): Promise<FanContext> {
  const hit = globalForFans.__animrFanContext;
  if (cached && hit && hit.expires > Date.now()) return { liveDays: hit.liveDays, latest: hit.latest, now };
  const liveDays = await bellDays("live");
  const latest = liveDays.length ? await readSummary(liveDays[liveDays.length - 1]) : null;
  globalForFans.__animrFanContext = { expires: Date.now() + CONTEXT_TTL_MS, liveDays, latest };
  return { liveDays, latest, now };
}

function blankFan(fanId: string): FanState {
  return { fanId, points: 0, streak: 0, history: [] };
}

/** A ride booked on a Bell that hasn't rung yet (see rideBell): a day after the latest live Bell, today or later. */
function bookedRide(fan: FanState, { latest, now }: FanContext): FanState["history"][number] | undefined {
  const today = utcDay(now);
  const after = latest?.day ?? "";
  return fan.history.find((entry) => parseDay(entry.day) !== null && entry.day > after && entry.day >= today);
}

/** The stored fan with a live streak (a missed Bell breaks it), the ride on the latest Bell and a booked next ride. */
function view(fan: FanState, context: FanContext): FanState {
  const { liveDays, latest, now } = context;
  const ridden = new Set(fan.history.map((entry) => entry.day));
  const days = [...liveDays];
  // The latest Bell can't break a streak while it is still open for rides.
  if (latest && !ridden.has(latest.day) && rideOpen(latest, now)) days.pop();
  const streak = days.length ? streakEndingAt(ridden, days, days[days.length - 1]) : 0;
  const current = latest ? fan.history.find((entry) => entry.day === latest.day) : undefined;
  const booked = bookedRide(fan, context);
  // Names saved before moderation existed are checked again: one that fails falls back to "Anon fan xxxx".
  const nickname = shownNickname(fan.nickname);
  return {
    fanId: fan.fanId,
    ...(nickname && { nickname }),
    points: fan.points,
    streak,
    ...(current && { ride: { day: current.day, tokenId: current.tokenId } }),
    ...(booked && { next: { day: booked.day, tokenId: booked.tokenId } }),
    history: fan.history,
  };
}

async function withRank(fan: FanState): Promise<FanResponse> {
  const kv = getKv();
  const [rank, fans] = await Promise.all([kv.zrevrank(KEYS.fanPoints, fan.fanId), kv.zcard(KEYS.fanPoints)]);
  return { ...fan, ...(rank !== null && { rank: rank + 1 }), fans };
}

export async function getFan(fanId: string): Promise<FanResponse> {
  const [stored, context] = await Promise.all([readFan(fanId), fanContext(Date.now(), true)]);
  return withRank(view(stored ?? blankFan(fanId), context));
}

/**
 * A nickname as it may be shown on the public standings, or undefined: the heist's moderation (slurs, profanity,
 * wagering words, put-downs of holders, links, addresses, and names that pass for the team or a brand).
 */
export function shownNickname(nickname: string | undefined): string | undefined {
  if (!nickname) return undefined;
  const moderated = moderateNickname(nickname);
  return moderated && moderated !== "Anonymous" ? sanitizeNickname(moderated) || undefined : undefined;
}

/** Sets ("" clears) the fan's nickname; one the standings couldn't show is refused (422). */
export async function setNickname(fanId: string, raw: unknown): Promise<FanResponse> {
  if (typeof raw !== "string") throw new BellError("Expected a JSON body { nickname }.");
  const nickname = sanitizeNickname(raw);
  if (raw.trim() && !nickname) throw new BellError("Use letters, numbers, spaces, _ or - in your nickname.");
  if (nickname && shownNickname(nickname) !== nickname) {
    throw new BellError("Pick a different nickname: it shows on the public standings, so keep it friendly and your own.", 422);
  }
  await withFanLock(fanId, async () => {
    const fan: FanState = { ...((await readFan(fanId)) ?? blankFan(fanId)) };
    if (nickname) fan.nickname = nickname;
    else delete fan.nickname;
    await writeFans([fan]);
  });
  return getFan(fanId);
}

/**
 * The Bell a ride taken at `now` goes to: the latest live Bell while its ride window is open, else the next Bell
 * (nextRideDay), so a late ride never hits a closed door. `booked` is true for the next Bell.
 */
export async function rideTarget(now = Date.now()): Promise<{ day: string; booked: boolean }> {
  const { latest, liveDays } = await fanContext(now);
  if (latest && rideOpen(latest, now)) return { day: latest.day, booked: false };
  return { day: nextRideDay(now, liveDays[liveDays.length - 1]), booked: true };
}

/**
 * Rides `tokenId`, one ride per Bell. While the latest live Bell's ride window is open the ride is on that Bell
 * and counts from the first hourly close after `now` (settlement reads that close), so the move since the ring
 * that a late rider has already seen earns nothing. Once the window has closed (or before the first live Bell)
 * the ride books the next Bell (FanState.next) and counts from its ring, like every ride taken before it.
 */
export async function rideBell(fanId: string, tokenId: number, now = Date.now()): Promise<FanResponse> {
  if (!Number.isInteger(tokenId) || !getChog(tokenId)) throw new BellError("Pick a Chog by its token id (1-1969).");
  // A Chog its holder hid ("Hide my Chog") is off the Bell's public lists, so it can't be ridden either.
  if (await isHiddenChog(tokenId)) throw new BellError("That Chog's holder took it out of Animr's public pages. Pick another Chog.", 404);
  const { day, booked } = await rideTarget(now);
  const kv = getKv();
  // Atomic: concurrent requests (or tabs) can't both take this Bell's ride.
  if (!(await kv.hsetnx(KEYS.rides(day), fanId, { tokenId, at: now } satisfies StoredRide))) {
    const current = parseRide(await kv.hget<unknown>(KEYS.rides(day), fanId));
    const which = booked ? `the next Bell (${day}, 15:00 UTC)` : `the ${day} Bell`;
    throw new BellError(`You're already riding Chog #${current?.tokenId ?? "?"} at ${which}. One ride per Bell.`, 409);
  }
  // The rides hash is the source of truth: settlement restores a history entry lost here.
  await withFanLock(fanId, async () => {
    const fan = (await readFan(fanId)) ?? blankFan(fanId);
    const history = [{ day, tokenId }, ...fan.history.filter((entry) => entry.day !== day)];
    await writeFans([{ ...fan, history: history.slice(0, MAX_HISTORY) }]);
  });
  return getFan(fanId);
}

/** Fans with the most points, best first. */
export async function topFans(limit = 50): Promise<FanStanding[]> {
  const kv = getKv();
  const ids = (await kv.zrange(KEYS.fanPoints, 0, limit - 1, { rev: true })).map((entry) => entry.member);
  if (!ids.length) return [];
  const [fans, context] = await Promise.all([kv.hmget<FanState>(KEYS.fans, ids), fanContext(Date.now(), true)]);
  return fans.flatMap((fan, i) => {
    if (!fan) return [];
    const { fanId, nickname, points, streak } = view(fan, context);
    return [{ fanId, ...(nickname && { nickname }), points, streak, rank: i + 1 }];
  });
}
