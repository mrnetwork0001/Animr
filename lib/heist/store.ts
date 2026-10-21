import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { Address } from "viem";
import { getKv } from "../kv";
import { HEIST_LIMITS } from "./config";
import type {
  AdminHallOfFameEntry,
  DefenderIntent,
  DefenderSource,
  HallOfFameEntry,
  HeistCounters,
  NoClaimReason,
  ProofKind,
  WallCheck,
} from "./types";

// Heist state in lib/kv.ts (Upstash Redis in production, JSON files locally). Keys start with "animr:heist:".
//  - sessions:   animr:heist:session:<id>  JSON, expires an hour after the last message
//  - day stats:  animr:heist:stats:<day>   hash, one field per server instance { attempts, caves, refusals, usdMicro }.
//                Each instance only ever writes its own field (its running totals), so concurrent instances never
//                lose each other's updates and no INCRBY is needed; readers sum the fields.
//  - 0G budget:  animr:heist:llm-inflight:<day>  hash ticket -> ms: defender turns holding a reserve of the day's 0G
//                budget until their cost is booked (see reserveLlmTurn)
//  - wall:       animr:heist:hof (zset id -> ms) + animr:heist:hof:entries (hash id -> StoredHallOfFameEntry)
//  - limits:     animr:heist:rl:<bucket>:<ip hash>:<window> fixed-window counters (kv.incr)

const PREFIX = "animr:heist";
const DAY_MS = 86_400_000;
const STATS_KEEP_DAYS = 8;

export type StoredTurn = {
  /** The visitor's message: kept only for the session's LLM context, expires with it, never published. */
  user: string;
  reply: string;
  intent: DefenderIntent;
  amount: number | null;
  temptation: number;
  source: DefenderSource;
  model: string | null;
};

export type StoredCave = {
  turn: number;
  reply: string;
  amount: number | null;
  source: DefenderSource;
  model: string | null;
  at: string;
  proof: { kind: ProofKind; reason?: NoClaimReason | null; refused: boolean; blockNumber: string | null; error: string | null } | null;
  /** Why it can't go on the wall (null = eligible). */
  wallProblem: string | null;
};

export type HeistSession = {
  id: string;
  /** Hash of the visitor's IP (never the IP itself). */
  ip: string;
  createdAt: number;
  lastAt: number;
  /** The House Chog when the session started, and the weak spot it plays with. */
  tokenId: number | null;
  spotId: string;
  patience: number;
  temptation: number;
  recipient: Address | null;
  turns: StoredTurn[];
  cave: StoredCave | null;
  hofId: string | null;
};

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function newSessionId(): string {
  return randomUUID();
}

export function isSessionId(raw: unknown): raw is string {
  return typeof raw === "string" && SESSION_ID.test(raw);
}

const sessionKey = (id: string) => `${PREFIX}:session:${id}`;

export async function loadSession(id: string): Promise<HeistSession | null> {
  return getKv().get<HeistSession>(sessionKey(id));
}

export async function saveSession(session: HeistSession): Promise<void> {
  await getKv().set(sessionKey(session.id), session, HEIST_LIMITS.sessionTtlMs);
}

/** Serializes the turns of one session across requests and instances; null when another turn holds it. */
export function lockSession(id: string): Promise<string | null> {
  return getKv().acquireLock(`heist:session:${id}`, 45_000);
}

export async function unlockSession(id: string, token: string): Promise<void> {
  await getKv().releaseLock(`heist:session:${id}`, token).catch(() => {});
}

// --- Day stats ---------------------------------------------------------------------------------

export type DayStats = { attempts: number; caves: number; refusals: number; usdMicro: number };

const ZERO: DayStats = { attempts: 0, caves: 0, refusals: 0, usdMicro: 0 };

/** UTC day, YYYY-MM-DD. */
export function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function nextUtcMidnight(now = Date.now()): string {
  return new Date((Math.floor(now / DAY_MS) + 1) * DAY_MS).toISOString();
}

const statsKey = (day: string) => `${PREFIX}:stats:${day}`;

type Local = { instance: string; day: string; totals: DayStats; swept: boolean };
// One running total per server instance, shared by every route bundle (and kept across dev hot reloads).
const globalForHeist = globalThis as typeof globalThis & { __animrHeistStats?: Local };

function local(day: string): Local {
  const current = (globalForHeist.__animrHeistStats ??= { instance: randomUUID(), day, totals: { ...ZERO }, swept: false });
  if (current.day !== day) {
    current.day = day;
    current.totals = { ...ZERO };
    current.swept = false;
  }
  return current;
}

/** Adds to today's totals (this instance's field). */
export async function bumpStats(delta: Partial<DayStats>, now = Date.now()): Promise<void> {
  const day = utcDay(now);
  const mine = local(day);
  for (const key of Object.keys(delta) as (keyof DayStats)[]) mine.totals[key] += Math.max(0, delta[key] ?? 0);
  const kv = getKv();
  await kv.hset(statsKey(day), { [mine.instance]: { ...mine.totals } });
  if (!mine.swept) {
    // Once per instance and day: drop the hash of a week ago (the Kv interface has no TTL for hashes).
    mine.swept = true;
    await kv.del(statsKey(utcDay(now - STATS_KEEP_DAYS * DAY_MS))).catch(() => {});
  }
}

/** Today's totals across all instances. */
export async function readStats(now = Date.now()): Promise<DayStats> {
  const day = utcDay(now);
  const fields = await getKv().hgetall<Partial<DayStats>>(statsKey(day));
  const mine = local(day);
  // This instance's own field comes from memory (the stored copy may lag a write still in flight).
  const sum = { ...mine.totals };
  for (const [instance, value] of Object.entries(fields)) {
    if (instance === mine.instance || typeof value !== "object" || value === null) continue;
    for (const key of Object.keys(ZERO) as (keyof DayStats)[]) {
      const n = Number(value[key]);
      if (Number.isFinite(n) && n > 0) sum[key] += n;
    }
  }
  return sum;
}

/** A defender turn's hold on `reserveMicroUsd` of the day's 0G budget (reserveLlmTurn). */
export type LlmTicket = { key: string; id: string };

/** A held reserve older than this is a turn that died before booking its cost: it no longer counts. */
const TICKET_MAX_AGE_MS = 120_000;
let sweptTicketsDay: string | null = null;

/**
 * Reserves `reserveMicroUsd` of today's 0G budget for one defender turn before it calls a model, safely across
 * instances and without a lock: the turn first registers its ticket, then counts every live ticket (its own
 * included) at the full reserve next to the costs already booked. Of any two concurrent turns, the one that counts
 * later sees the other, so the turns that pass never add up past the cap (a burst right at the cap may nap a few too
 * many, never let too many through). Returns null (ticket withdrawn) when this turn would cross the cap: it naps.
 * Otherwise book the turn's cost with bumpStats first, then releaseLlmTurn(ticket).
 */
export async function reserveLlmTurn(capMicroUsd: number, reserveMicroUsd: number, now = Date.now()): Promise<LlmTicket | null> {
  const kv = getKv();
  const day = utcDay(now);
  const ticket: LlmTicket = { key: `${PREFIX}:llm-inflight:${day}`, id: randomUUID() };
  if (sweptTicketsDay !== day) {
    // Once per instance and day: drop the ticket hash of two days ago (hashes have no TTL here).
    sweptTicketsDay = day;
    await kv.del(`${PREFIX}:llm-inflight:${utcDay(now - 2 * DAY_MS)}`).catch(() => {});
  }
  await kv.hset(ticket.key, { [ticket.id]: Date.now() });
  // Tickets first, then the costs: a turn releases its ticket only after its cost is written, so a ticket missing
  // here means its cost is in the stats read next (read both at once and a turn could slip between the two).
  const held = await kv.hgetall<unknown>(ticket.key);
  const stats = await readStats(now);
  const oldest = Date.now() - TICKET_MAX_AGE_MS;
  const stale = Object.entries(held)
    .filter(([id, at]) => id !== ticket.id && !(Number(at) >= oldest))
    .map(([id]) => id);
  if (stale.length) await kv.hdel(ticket.key, ...stale).catch(() => {});
  const live = Object.keys(held).filter((id) => id !== ticket.id && !stale.includes(id)).length + 1;
  if (stats.usdMicro + live * reserveMicroUsd <= capMicroUsd) return ticket;
  await releaseLlmTurn(ticket);
  return null;
}

/** Ends a turn's hold on the budget; call it after the turn's cost is booked (bumpStats). */
export async function releaseLlmTurn(ticket: LlmTicket): Promise<void> {
  await getKv().hdel(ticket.key, ticket.id).catch(() => {});
}

let warnedShared = false;

/**
 * True on Vercel without Redis: the file store is per instance there, so the daily 0G cap and every rate limit would
 * be per instance too. The heist then fails closed (the House Chog naps: templates only).
 */
export function sharedStateMissing(): boolean {
  const missing = Boolean(process.env.VERCEL) && getKv().kind === "file";
  if (missing && !warnedShared) {
    warnedShared = true;
    console.warn("[animr] heist: no Redis on Vercel (UPSTASH_REDIS_REST_URL/TOKEN), so the daily 0G cap can't be enforced: the House Chog naps.");
  }
  return missing;
}

export function countersOf(stats: DayStats, now = Date.now()): HeistCounters {
  return {
    day: utcDay(now),
    attemptsToday: stats.attempts,
    cavesToday: stats.caves,
    refusalsToday: stats.refusals,
  };
}

// --- Hall of Fame ------------------------------------------------------------------------------

const HOF = `${PREFIX}:hof`;
const HOF_ENTRIES = `${PREFIX}:hof:entries`;

/**
 * A wall entry as stored: the reply is always kept, and `review` says whether it may show. "auto": a template's words
 * (shown at once). "held": an LLM wrote them (hidden until a moderator approves). "approved": an LLM's, approved.
 * Entries stored before review existed have no `review` (an LLM's are then held) and no `check`.
 */
export type StoredHallOfFameEntry = Omit<HallOfFameEntry, "reply" | "replyHeld" | "check"> & {
  reply: string;
  review?: AdminHallOfFameEntry["review"];
  check?: WallCheck | null;
};

function reviewOf(entry: StoredHallOfFameEntry): AdminHallOfFameEntry["review"] {
  return entry.review ?? (entry.source === "0g" ? "held" : "auto");
}

function checkOf(entry: StoredHallOfFameEntry): WallCheck | null {
  if (entry.check) return entry.check;
  // Before checks were stored, only a live refusal kept its block and error.
  return entry.blockNumber && entry.error
    ? { kind: "live", reason: null, refused: true, blockNumber: entry.blockNumber, error: entry.error }
    : null;
}

/** What the public wall shows: exactly the public fields, a held reply left out. */
export function publicEntry(entry: StoredHallOfFameEntry): HallOfFameEntry {
  const held = reviewOf(entry) === "held";
  return {
    id: entry.id,
    nickname: entry.nickname,
    reply: held ? null : entry.reply,
    replyHeld: held,
    amountChog: entry.amountChog,
    at: entry.at,
    source: entry.source,
    model: entry.model,
    check: checkOf(entry),
    blockNumber: entry.blockNumber ?? null,
    error: entry.error ?? null,
  };
}

export async function addHallOfFame(entry: StoredHallOfFameEntry): Promise<void> {
  const kv = getKv();
  await kv.hset(HOF_ENTRIES, { [entry.id]: entry });
  await kv.zadd(HOF, { member: entry.id, score: Date.parse(entry.at) });
  const total = await kv.zcard(HOF);
  const excess = total - HEIST_LIMITS.hallOfFameKept;
  if (excess > 0) {
    const oldest = (await kv.zrange(HOF, 0, excess - 1)).map((e) => e.member);
    if (oldest.length) {
      await kv.zrem(HOF, ...oldest);
      await kv.hdel(HOF_ENTRIES, ...oldest);
    }
  }
}

async function storedHallOfFame(limit: number): Promise<StoredHallOfFameEntry[]> {
  const kv = getKv();
  const ids = (await kv.zrange(HOF, 0, limit - 1, { rev: true })).map((e) => e.member);
  if (!ids.length) return [];
  const entries = await kv.hmget<StoredHallOfFameEntry>(HOF_ENTRIES, ids);
  return entries.filter(
    (entry): entry is StoredHallOfFameEntry => entry !== null && typeof entry === "object" && typeof entry.reply === "string",
  );
}

/** The newest entries as the public wall shows them (held replies left out). */
export async function listHallOfFame(limit: number = HEIST_LIMITS.hallOfFameShown): Promise<HallOfFameEntry[]> {
  return (await storedHallOfFame(limit)).map(publicEntry);
}

/** The moderator's view: every kept entry with its reply and review state. */
export async function listHallOfFameForAdmin(limit: number = HEIST_LIMITS.hallOfFameKept): Promise<AdminHallOfFameEntry[]> {
  return (await storedHallOfFame(limit)).map((entry) => ({ ...publicEntry(entry), reply: entry.reply, review: reviewOf(entry) }));
}

/** Moderation: shows (approved) or holds an LLM-written reply. True when the entry exists. */
export async function reviewHallOfFame(id: string, approved: boolean): Promise<boolean> {
  const kv = getKv();
  const entry = await kv.hget<StoredHallOfFameEntry>(HOF_ENTRIES, id);
  if (!entry || typeof entry !== "object" || (await kv.zscore(HOF, id)) === null) return false;
  // A template's reply has nothing to review; it stays shown.
  if (reviewOf(entry) !== "auto") await kv.hset(HOF_ENTRIES, { [id]: { ...entry, review: approved ? "approved" : "held" } });
  return true;
}

/** Removes an entry (moderation). True when it existed. */
export async function removeHallOfFame(id: string): Promise<boolean> {
  const kv = getKv();
  const existed = (await kv.zscore(HOF, id)) !== null;
  await kv.zrem(HOF, id);
  await kv.hdel(HOF_ENTRIES, id);
  return existed;
}

// --- Rate limits -------------------------------------------------------------------------------

let ipKey: Buffer | undefined;

/**
 * The secret behind hashIp: HEIST_IP_SALT, else a key derived from CRON_SECRET (set wherever the cron runs), else a
 * random key per server process (local dev; on several instances the per-IP limits would then be per instance).
 */
function ipHashKey(): Buffer {
  if (ipKey) return ipKey;
  const secret = process.env.HEIST_IP_SALT?.trim() || process.env.CRON_SECRET?.trim();
  if (!secret && process.env.VERCEL) console.warn("[animr] heist: set HEIST_IP_SALT (or CRON_SECRET): IP hashes fall back to a per-instance key.");
  ipKey = secret ? createHmac("sha256", secret).update("animr:heist:ip-hash").digest() : randomBytes(32);
  return ipKey;
}

/**
 * A keyed (HMAC-SHA256), day-scoped hash of the visitor's IP, truncated to 80 bits: enough to rate-limit, but without
 * the server's secret nobody can test IPs against it (a plain hash of the 2^32 IPv4 addresses falls in seconds), and
 * the same IP hashes differently every UTC day. Per-IP windows are at most a day and start at UTC midnight.
 */
export function hashIp(ip: string, now = Date.now()): string {
  return createHmac("sha256", ipHashKey()).update(`${utcDay(now)}|${ip}`).digest("hex").slice(0, 20);
}

/** Fixed-window limit: null while under `limit`, else the seconds until the window resets. */
export async function hitLimit(bucket: string, who: string, limit: number, windowMs: number, now = Date.now()): Promise<number | null> {
  const window = Math.floor(now / windowMs);
  const count = await getKv().incr(`${PREFIX}:rl:${bucket}:${who}:${window}`, windowMs);
  if (count <= limit) return null;
  return Math.max(1, Math.ceil(((window + 1) * windowMs - now) / 1000));
}
