import { getChog } from "../dna/chogs";
import { chogName } from "../dna/population";
import { getKv } from "../kv";
import { resolveUri } from "../nft";
import type { BellCall, BellSummary, ChogBellRecord, FanState } from "./types";

// Daily Bell persistence on lib/kv.ts. Server-only (Chog names and images come from data/chogs.json).
//   animr:bell:index          zset  day -> ring time (ms), every Bell
//   animr:bell:live           zset  day -> ring time, live Bells only
//   animr:bell:open           zset  day -> horizon (ms), Bells awaiting settlement
//   animr:bell:summary:<day>  BellSummary
//   animr:bell:calls:<day>    CallsBlob (all 1,969 calls, compact)
//   animr:bell:rides:<day>    hash  fanId -> StoredRide ({ tokenId, at }; a bare tokenId before Oct 19). A ride
//                                   booked before its Bell rings sits under that Bell's day (at < ring time).
//   animr:bell:purse:<day>    OraclePurseRecord (lib/bell/purse.ts; written by scripts/send-oracle-purse.mts)
//   animr:bell:records        hash  tokenId -> StoredRecord
//   animr:bell:chog-points    zset  tokenId -> totalPoints
//   animr:bell:meta           BellMeta
//   (lib/kv.ts namespaces every key per deployment in Redis: "animr:production:bell:index")
//   animr:fans                hash  fanId -> FanState
//   animr:fans:points         zset  fanId -> points
export const KEYS = {
  index: "animr:bell:index",
  live: "animr:bell:live",
  open: "animr:bell:open",
  summary: (day: string) => `animr:bell:summary:${day}`,
  calls: (day: string) => `animr:bell:calls:${day}`,
  rides: (day: string) => `animr:bell:rides:${day}`,
  purse: (day: string) => `animr:bell:purse:${day}`,
  records: "animr:bell:records",
  chogPoints: "animr:bell:chog-points",
  meta: "animr:bell:meta",
  fans: "animr:fans",
  fanPoints: "animr:fans:points",
} as const;

/** Which genome built the replayed Bells (a new one rebuilds them in place, live Bells or not). */
export type BellMeta = { genomeVersion: string; seededAt: string; days: string[] };

/** A fan's ride on a Bell: the Chog and when it was taken (ms), which sets the ride's entry price. */
export type StoredRide = { tokenId: number; at: number };

/** Rides stored before ride times were (a bare token id) count from the Bell's entry. */
export function parseRide(raw: unknown): StoredRide | null {
  if (typeof raw === "number" || typeof raw === "string") {
    const tokenId = Number(raw);
    return Number.isInteger(tokenId) ? { tokenId, at: 0 } : null;
  }
  const ride = raw as Partial<StoredRide> | null;
  return ride && Number.isInteger(Number(ride.tokenId)) ? { tokenId: Number(ride.tokenId), at: Number(ride.at) || 0 } : null;
}

/** ChogBellRecord plus what makes settlement idempotent. */
export type StoredRecord = ChogBellRecord & { lastDay: string; errorSum: number };

export function publicRecord(record: StoredRecord | null | undefined, tokenId: number): ChogBellRecord {
  return {
    tokenId,
    calls: record?.calls ?? 0,
    hits: record?.hits ?? 0,
    oracleWins: record?.oracleWins ?? 0,
    avgErrorPts: record?.avgErrorPts ?? 0,
    totalPoints: record?.totalPoints ?? 0,
  };
}

/**
 * Name and gateway image URL of a Chog (images are frozen on IPFS, so calls store neither). The name is
 * its persona name ("Rocket Ears"), the one every page shows under "Chog #id"; the metadata name
 * ("CHOG #1463") only appears on its profile and in the lookup.
 */
export function chogCard(tokenId: number): { name: string; image: string } {
  const chog = getChog(tokenId);
  return { name: chog ? chogName(chog) : `Chog #${tokenId}`, image: chog?.image ? resolveUri(chog.image) : "" };
}

/**
 * Old genome wording in stored theses, shown in today's words. A Bell keeps the calls it rang with, so lines the
 * genome has since reworded (lib/dna/genome.ts: no wagering words) are updated as they are read, not rewritten.
 */
const REWORDED: readonly [RegExp, string][] = [
  [/\bso I bet the other way\b/g, "so I trade the other way"],
  // Bells stored before the voice lines read the move's sign: a drop is a breakdown, not a breakout.
  [/saw the breakout: (-[\d.]+% (?:on the day|this hour))\. Chasing it to/g, "saw the breakdown: $1. Riding it to"],
  [/Strength begets strength\. (-[\d.]+%)/g, "Weakness begets weakness. $1"],
];

function shownThesis(thesis: string): string {
  return REWORDED.reduce((text, [from, to]) => text.replace(from, to), thesis);
}

function shownCall<T extends BellCall | undefined>(call: T): T {
  if (!call || typeof call.thesis !== "string") return call;
  const thesis = shownThesis(call.thesis);
  return thesis === call.thesis ? call : { ...call, thesis };
}

// --- Calls: [tokenId, forecastPct, conviction, thesis index, flags, points?, errorPts?] rows plus a
// table of distinct theses (genome theses repeat a lot), ~10x smaller than BellCall JSON.

type CallRow = [number, number, number, number, number, number?, number?];
type CallsBlob = { v: 1; theses: string[]; rows: CallRow[] } & CallAnchors;

/**
 * Prices calls were made at when that wasn't the 15:00 UTC close (WMON per $CHOG): each claimed agent's
 * 0G call is scored from the price it saw when it decided, and genome calls from a live snapshot (no
 * fresh candles at the ring) from that snapshot's price. Without one, a call counts from the Bell's entry.
 */
export type CallAnchors = { entries?: Record<string, number>; genomeEntry?: number };
const LLM = 1;
const CLAIMED = 2;
const HIT = 4;

function encodeCalls(calls: BellCall[], anchors: CallAnchors = {}): CallsBlob {
  const theses: string[] = [];
  const indexes = new Map<string, number>();
  const rows = calls.map((call): CallRow => {
    let thesis = indexes.get(call.thesis);
    if (thesis === undefined) {
      thesis = theses.push(call.thesis) - 1;
      indexes.set(call.thesis, thesis);
    }
    const flags = (call.source === "llm" ? LLM : 0) | (call.claimed ? CLAIMED : 0) | (call.hit ? HIT : 0);
    const row: CallRow = [call.tokenId, call.forecastPct, call.conviction, thesis, flags];
    if (call.points !== undefined) row.push(call.points, call.errorPts ?? 0);
    return row;
  });
  const entries = Object.entries(anchors.entries ?? {}).filter(([, price]) => price > 0 && Number.isFinite(price));
  return {
    v: 1,
    theses,
    rows,
    ...(entries.length && { entries: Object.fromEntries(entries) }),
    ...(anchors.genomeEntry && anchors.genomeEntry > 0 && { genomeEntry: anchors.genomeEntry }),
  };
}

function decodeCalls(blob: CallsBlob): BellCall[] {
  const theses = blob.theses.map((text) => (typeof text === "string" ? shownThesis(text) : ""));
  return blob.rows.map(([tokenId, forecastPct, conviction, thesis, flags, points, errorPts]) => ({
    tokenId,
    ...chogCard(tokenId),
    forecastPct,
    conviction,
    thesis: theses[thesis] ?? "",
    source: flags & LLM ? "llm" : "genome",
    claimed: Boolean(flags & CLAIMED),
    ...(points !== undefined && { points, errorPts: errorPts ?? 0, hit: Boolean(flags & HIT) }),
  }));
}

// Decoded calls per Bell, reused until the Bell changes (settlement adds points).
const callsCache = new Map<string, { stamp: string; calls: BellCall[]; byId: Map<number, BellCall>; anchors: CallAnchors }>();
const CALLS_CACHE_SIZE = 8;

async function cachedCalls(summary: BellSummary) {
  // Changes whenever the calls do: settlement, a re-ring, or replays rebuilt by a new genome.
  const stamp = JSON.stringify([
    summary.status,
    summary.rungAt,
    summary.actualPct,
    summary.bullPct,
    summary.histogram,
    summary.boldest[0]?.thesis ?? "",
  ]);
  const hit = callsCache.get(summary.day);
  if (hit?.stamp === stamp) return hit;
  const blob = await getKv().get<CallsBlob>(KEYS.calls(summary.day));
  const calls = blob ? decodeCalls(blob) : [];
  const anchors: CallAnchors = { ...(blob?.entries && { entries: blob.entries }), ...(blob?.genomeEntry && { genomeEntry: blob.genomeEntry }) };
  const entry = { stamp, calls, byId: new Map(calls.map((call) => [call.tokenId, call])), anchors };
  callsCache.delete(summary.day);
  callsCache.set(summary.day, entry);
  if (callsCache.size > CALLS_CACHE_SIZE) callsCache.delete(callsCache.keys().next().value as string);
  return entry;
}

/** Every call of a Bell, sorted by token id (shared: don't mutate). */
export async function readCalls(summary: BellSummary): Promise<BellCall[]> {
  return (await cachedCalls(summary)).calls;
}

export async function readCall(summary: BellSummary, tokenId: number): Promise<BellCall | undefined> {
  return (await cachedCalls(summary)).byId.get(tokenId);
}

/** The prices a Bell's calls were made at, where they weren't its 15:00 UTC entry. */
export async function readAnchors(summary: BellSummary): Promise<CallAnchors> {
  return (await cachedCalls(summary)).anchors;
}

export async function writeCalls(day: string, calls: BellCall[], anchors?: CallAnchors): Promise<void> {
  callsCache.delete(day);
  await getKv().set(KEYS.calls(day), encodeCalls(calls, anchors));
}

// --- Summaries and the index ---

export async function readSummary(day: string): Promise<BellSummary | null> {
  const summary = await getKv().get<BellSummary>(KEYS.summary(day));
  if (!summary) return summary;
  return {
    ...summary,
    boldest: Array.isArray(summary.boldest) ? summary.boldest.map(shownCall) : summary.boldest,
    featured: Array.isArray(summary.featured) ? summary.featured.map(shownCall) : summary.featured,
    ...(summary.oracle && { oracle: shownCall(summary.oracle) }),
    ...(summary.mostRekt && { mostRekt: shownCall(summary.mostRekt) }),
  };
}

/**
 * Saves the summary and keeps the index, live list and open list in step with it. Not atomic: a run that
 * dies halfway leaves a summary without its index entries, which ringBell and settleDue repair by
 * writing the summary again (see isListed).
 */
export async function writeSummary(summary: BellSummary): Promise<void> {
  const kv = getKv();
  const ring = Date.parse(summary.rungAt);
  await kv.set(KEYS.summary(summary.day), summary);
  await kv.zadd(KEYS.index, { member: summary.day, score: ring });
  if (summary.kind === "live") await kv.zadd(KEYS.live, { member: summary.day, score: ring });
  if (summary.status === "open") await kv.zadd(KEYS.open, { member: summary.day, score: Date.parse(summary.horizonAt) });
  else await kv.zrem(KEYS.open, summary.day);
}

/** Whether a stored summary's index entries are all in place (false after a write that died halfway). */
export async function isListed(summary: BellSummary): Promise<boolean> {
  const kv = getKv();
  const [index, live, open] = await Promise.all([
    kv.zscore(KEYS.index, summary.day),
    summary.kind === "live" ? kv.zscore(KEYS.live, summary.day) : Promise.resolve(0),
    kv.zscore(KEYS.open, summary.day),
  ]);
  return index !== null && live !== null && (summary.status === "open") === (open !== null);
}

/** Days with a Bell, oldest first. */
export async function bellDays(which: "all" | "live" | "open" = "all"): Promise<string[]> {
  const key = which === "live" ? KEYS.live : which === "open" ? KEYS.open : KEYS.index;
  return (await getKv().zrange(key, 0, -1)).map((entry) => entry.member).sort();
}

export async function latestSummary(which: "all" | "live" = "all"): Promise<BellSummary | null> {
  const [latest] = await getKv().zrange(which === "live" ? KEYS.live : KEYS.index, -1, -1);
  return latest ? readSummary(latest.member) : null;
}

// --- Records ---

export async function readRecords(): Promise<Record<string, StoredRecord>> {
  return getKv().hgetall<StoredRecord>(KEYS.records);
}

export async function readRecord(tokenId: number): Promise<StoredRecord | null> {
  return getKv().hget<StoredRecord>(KEYS.records, String(tokenId));
}

export async function writeRecords(records: StoredRecord[]): Promise<void> {
  if (!records.length) return;
  const kv = getKv();
  await kv.hset(KEYS.records, Object.fromEntries(records.map((record) => [String(record.tokenId), record])));
  await kv.zadd(KEYS.chogPoints, ...records.map((record) => ({ member: String(record.tokenId), score: record.totalPoints })));
}

/** Token ids with the most season points, best first. */
export async function topChogIds(limit: number): Promise<number[]> {
  return (await getKv().zrange(KEYS.chogPoints, 0, limit - 1, { rev: true })).map((entry) => Number(entry.member));
}

// --- Fans ---

export function readFan(fanId: string): Promise<FanState | null> {
  return getKv().hget<FanState>(KEYS.fans, fanId);
}

/** Saves fans; the ones who have ridden are ranked by points. */
export async function writeFans(fans: FanState[]): Promise<void> {
  if (!fans.length) return;
  const kv = getKv();
  await kv.hset(KEYS.fans, Object.fromEntries(fans.map((fan) => [fan.fanId, fan])));
  const ranked = fans.filter((fan) => fan.history.length);
  await kv.zadd(KEYS.fanPoints, ...ranked.map((fan) => ({ member: fan.fanId, score: fan.points })));
}
