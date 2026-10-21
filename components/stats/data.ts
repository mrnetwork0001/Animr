import { isTeeVerified, receiptCostUsd } from "@/lib/agent/receipts";
import { zgProviderInfo } from "@/lib/agent/zg-compute";
import { MAX_DECISIONS_PER_AGENT, getStore } from "@/lib/agent/store";
import type { AgentRecord, Decision } from "@/lib/agent/types";
import { DAY_MS, HOUR_MS, RIDE_WINDOW_HOURS, addDays, bellTime, parseDay, utcDay } from "@/lib/bell/rules";
import { KEYS, bellDays, parseRide } from "@/lib/bell/store";
import type { FanState } from "@/lib/bell/types";
import { type DayStats, readStats as readHeistToday } from "@/lib/heist/store";
import { getKv } from "@/lib/kv";
import { optOutSummary } from "@/lib/optout";
import { getVersusCounts } from "@/lib/rewind/counters";
import type { BellDayStat, DayCount, StatsResponse, StatsSection } from "./types";

// Server-only (lib/kv.ts, the agent store): the numbers behind /stats and GET /api/stats. Client components never
// import this module; they take a StatsResponse as a prop. Counts only: no fan ids, IPs or wallet addresses leave it.
//
// Sources (read-only):
//   Daily Bell  lib/bell/store.ts KEYS: the index / live / open day lists and animr:bell:rides:<day> (fanId -> ride)
//   Fans        animr:fans (fanId -> FanState)
//   Versus      lib/rewind/counters.ts getVersusCounts() (animr:versus:count:bouts / :picks, per-instance totals)
//   Replays     replay:count:served (optional: the number shows once that counter exists; see readCounter)
//   Heist       animr:heist:stats:<day> (lib/heist/store.ts: per-instance day totals, kept 8 days), animr:heist:hof
//   Agents      lib/agent/store.ts: every record and its stored decisions (the newest 200 per agent)
//   Opt-outs    lib/optout.ts
// Owned here (written at most once per computation, i.e. about once a minute per instance):
//   animr:stats:first-seen  hash  metric -> first UTC day it was counted above 0 ("since" for plain counters)
//   animr:stats:daily       hash  day -> DailySnapshot: plain counters' totals that day, for the per-day bars
//   animr:stats:heist-days  hash  day -> DayStats: finished heist days, copied before lib/heist drops them

/** Numbers are recomputed at most this often per server instance (GET /api/stats is CDN-cached as long). */
export const STATS_CACHE_SECONDS = 60;
/** Per-day bars cover the last 7 to 14 days (from the day a number started counting). */
const SERIES_MAX_DAYS = 14;
const SERIES_MIN_DAYS = 7;
/** Bells on the calendar strip. */
const STRIP_DAYS = 21;
/** Past heist days still kept by lib/heist/store.ts (it drops the day hash 8 days back). */
const HEIST_KEPT_DAYS = 7;
const AGENT_READS_AT_ONCE = 6;

const FIRST_SEEN_KEY = "animr:stats:first-seen";
const DAILY_KEY = "animr:stats:daily";
const HEIST_ARCHIVE_KEY = "animr:stats:heist-days";
const heistDayKey = (day: string) => `animr:heist:stats:${day}`;
const HEIST_WALL_KEY = "animr:heist:hof";

/**
 * Time Machine replays served: no feature counts them yet. Bump this key (any shape readCounter accepts, e.g. the
 * Versus counters' per-instance hash) and the number shows up. Redis maps both spellings to one entry (lib/kv.ts
 * redisKey); the local file store keeps them apart, so both are read and the larger wins.
 */
const REPLAY_COUNTER_KEYS = ["replay:count:served", "animr:replay:count:served"] as const;

type DailySnapshot = { fans?: number; bouts?: number; picks?: number; replays?: number };
type Metric = keyof DailySnapshot;

// --- Helpers ---------------------------------------------------------------------------------

const ZERO_DAY: DayStats = { attempts: 0, caves: 0, refusals: 0, usdMicro: 0 };
const DAY_FIELDS = Object.keys(ZERO_DAY) as (keyof DayStats)[];

function count(value: unknown): number {
  const n = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
}

/** A counter's value however it was stored: a number, a numeric string or an object with a count/total/value. */
function counterValue(value: unknown): number {
  if (value && typeof value === "object") {
    const { count: c, total, value: v } = value as Record<string, unknown>;
    return Math.floor(count(c ?? total ?? v));
  }
  return Math.floor(count(value));
}

const isWrongType = (error: unknown) => error instanceof Error && /WRONGTYPE/i.test(error.message);

/**
 * A plain counter however the feature stores it: a number (SET or INCR), a hash of per-instance totals (summed, like
 * the heist's day stats) or a sorted set (its size). Null when no key exists. Note: lib/kv.ts's incr() is memory-only
 * on the local file store, so only SET/HSET-backed counters show there.
 */
async function readCounter(keys: readonly string[]): Promise<number | null> {
  const kv = getKv();
  let best: number | null = null;
  for (const key of keys) {
    let value: number | null = null;
    try {
      const raw = await kv.get<unknown>(key);
      if (raw !== null) value = counterValue(raw);
    } catch (error) {
      if (!isWrongType(error)) throw error;
      try {
        const fields = Object.values(await kv.hgetall<unknown>(key));
        if (fields.length) value = fields.reduce<number>((sum, field) => sum + counterValue(field), 0);
      } catch (hashError) {
        if (!isWrongType(hashError)) throw hashError;
        const size = await kv.zcard(key);
        if (size) value = size;
      }
    }
    if (value !== null) best = Math.max(best ?? 0, value);
  }
  return best;
}

/** The last `n` UTC days ending today, oldest first. */
function lastDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
}

/** Days for a per-day series: from the day it started counting (at least SERIES_MIN_DAYS, at most SERIES_MAX_DAYS). */
function seriesDays(today: string, since: string | null): string[] {
  const elapsed = since ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / DAY_MS) + 1 : 0;
  return lastDays(today, Math.min(SERIES_MAX_DAYS, Math.max(SERIES_MIN_DAYS, elapsed)));
}

const series = (days: string[], valueOf: (day: string) => number): DayCount[] => days.map((day) => ({ day, value: valueOf(day) }));

function minDay(...days: (string | null | undefined)[]): string | null {
  const valid = days.filter((day): day is string => typeof day === "string" && parseDay(day) !== null);
  return valid.length ? valid.reduce((a, b) => (a < b ? a : b)) : null;
}

const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Runs `fn` over `items`, `limit` at a time, keeping the order of the results. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// --- Daily Bell and fans -----------------------------------------------------------------------------

/** One ride: who (a fan id, never shown) and the UTC day it was taken. */
type Ride = { fan: string; day: string };

type BellData = { all: string[]; live: string[]; open: Set<string>; rides: Map<string, Ride[]> };

async function readBell(today: string): Promise<BellData> {
  const kv = getKv();
  const [all, live, open] = await Promise.all([bellDays("all"), bellDays("live"), bellDays("open")]);
  const liveSet = new Set(live);
  // Rides sit under live Bells, plus the ones booked ahead for the next Bell (today's or tomorrow's, not rung yet).
  const days = [...live, ...[today, addDays(today, 1)].filter((day) => !liveSet.has(day))];
  const hashes = await Promise.all(days.map((day) => kv.hgetall<unknown>(KEYS.rides(day))));
  const rides = new Map(
    days.map((bellDay, i) => [
      bellDay,
      Object.entries(hashes[i]).map(([fan, raw]): Ride => {
        // Rides stored before ride times were kept count on their Bell's day.
        const at = parseRide(raw)?.at ?? 0;
        return { fan, day: at > 0 ? utcDay(at) : bellDay };
      }),
    ]),
  );
  return { all, live, open: new Set(open), rides };
}

function bellSection(data: BellData, today: string, now: number) {
  const liveSet = new Set(data.live);
  const riders = (day: string) => (data.rides.get(day) ?? []).map((ride) => ride.fan);

  const recent: BellDayStat[] = data.all.slice(-STRIP_DAYS).map((day) => ({
    day,
    kind: liveSet.has(day) ? "live" : "replay",
    settled: !data.open.has(day),
    rides: riders(day).length,
  }));

  // Every ride, booked ahead or not, on the day it was taken.
  const everyone = new Set<string>();
  const ridesByDay = new Map<string, number>();
  let total = 0;
  let firstRide: string | null = null;
  for (const list of data.rides.values()) {
    for (const ride of list) {
      total++;
      everyone.add(ride.fan);
      ridesByDay.set(ride.day, (ridesByDay.get(ride.day) ?? 0) + 1);
      firstRide = minDay(firstRide, ride.day);
    }
  }

  // Day-1 return over consecutive live Bells; a pair counts once the second Bell's ride window has closed.
  let eligible = 0;
  let returned = 0;
  const backToBack = new Set<string>();
  for (const day of data.live) {
    const next = addDays(day, 1);
    if (!liveSet.has(next)) continue;
    const first = riders(day);
    const second = new Set(riders(next));
    let both = 0;
    for (const fan of first) {
      if (!second.has(fan)) continue;
      both++;
      backToBack.add(fan);
    }
    if (now >= bellTime(next) + RIDE_WINDOW_HOURS * HOUR_MS) {
      eligible += first.length;
      returned += both;
    }
  }

  // Longest run of consecutive live Bells ridden by one fan (the Bell's own streak rule).
  let runs = new Map<string, number>();
  let longest = 0;
  for (const day of data.live) {
    const next = new Map<string, number>();
    for (const fan of riders(day)) {
      const run = (runs.get(fan) ?? 0) + 1;
      next.set(fan, run);
      longest = Math.max(longest, run);
    }
    runs = next;
  }

  const latestLive = data.live[data.live.length - 1];
  const windowCloses = latestLive ? bellTime(latestLive) + RIDE_WINDOW_HOURS * HOUR_MS : 0;
  return {
    bell: {
      live: data.live.length,
      settled: data.live.filter((day) => !data.open.has(day)).length,
      replayed: data.all.filter((day) => !liveSet.has(day)).length,
      firstLiveDay: data.live[0] ?? null,
      ridesOpenUntil: now < windowCloses ? new Date(windowCloses).toISOString() : null,
      recent,
    },
    rides: {
      total,
      riders: everyone.size,
      perDay: series(seriesDays(today, firstRide ?? data.live[0] ?? null), (day) => ridesByDay.get(day) ?? 0),
      since: firstRide,
    },
    retention: {
      d1Pct: eligible ? round((100 * returned) / eligible) : null,
      returned,
      eligible,
      backToBack: backToBack.size,
      longestStreak: longest,
      since: data.live[0] ?? null,
    },
  };
}

type FanData = { total: number; nicknamed: number; points: number; firstRide: string | null };

async function readFans(): Promise<FanData> {
  const fans = await getKv().hgetall<FanState>(KEYS.fans);
  const data: FanData = { total: 0, nicknamed: 0, points: 0, firstRide: null };
  for (const fan of Object.values(fans)) {
    if (!fan || typeof fan !== "object") continue;
    data.total++;
    if (typeof fan.nickname === "string" && fan.nickname.trim()) data.nicknamed++;
    data.points += count(fan.points);
    for (const entry of Array.isArray(fan.history) ? fan.history : []) {
      data.firstRide = minDay(data.firstRide, entry?.day);
    }
  }
  return data;
}

// --- Heist ------------------------------------------------------------------------------------

function dayStats(raw: unknown): DayStats {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof DayStats, unknown>>;
  return Object.fromEntries(DAY_FIELDS.map((key) => [key, count(value[key])])) as DayStats;
}

/** A heist day hash (one field per server instance, each its running totals) summed; null when empty. */
function sumInstances(hash: Record<string, unknown>): DayStats | null {
  const fields = Object.values(hash);
  if (!fields.length) return null;
  const total = { ...ZERO_DAY };
  for (const field of fields) {
    const stats = dayStats(field);
    for (const key of DAY_FIELDS) total[key] += stats[key];
  }
  return total;
}

const sameStats = (a: DayStats, b: DayStats) => DAY_FIELDS.every((key) => a[key] === b[key]);

async function readHeist(today: string, now: number): Promise<{ days: Map<string, DayStats>; wall: number }> {
  const kv = getKv();
  const past = Array.from({ length: HEIST_KEPT_DAYS }, (_, i) => addDays(today, -(i + 1)));
  const [todayStats, hashes, archive, wall] = await Promise.all([
    readHeistToday(now),
    Promise.all(past.map((day) => kv.hgetall<unknown>(heistDayKey(day)))),
    kv.hgetall<unknown>(HEIST_ARCHIVE_KEY),
    kv.zcard(HEIST_WALL_KEY),
  ]);
  const days = new Map<string, DayStats>();
  for (const [day, stats] of Object.entries(archive)) if (parseDay(day) && day < today) days.set(day, dayStats(stats));
  // Finished days still kept by the heist win over (and refresh) the archived copy.
  const archiveNow: Record<string, DayStats> = {};
  past.forEach((day, i) => {
    const live = sumInstances(hashes[i]);
    if (!live) return;
    const kept = days.get(day);
    if (!kept || !sameStats(kept, live)) archiveNow[day] = live;
    days.set(day, live);
  });
  if (DAY_FIELDS.some((key) => todayStats[key] > 0)) days.set(today, dayStats(todayStats));
  if (Object.keys(archiveNow).length) {
    await kv.hset(HEIST_ARCHIVE_KEY, archiveNow).catch((error) => console.error("[animr] stats: heist archive:", error));
  }
  return { days, wall };
}

// --- Claimed agents ------------------------------------------------------------------------------

type AgentSummary = {
  /** The agent's lastDecisionAt when summarized: its stored decisions only change with a new decision. */
  at: string | null;
  stored: number;
  llm: number;
  tee: number;
  paper: number;
  onchain: number;
  zgMicro: number;
  perDay: Record<string, number>;
  /** LLM decisions per serving provider and model ("<address> <model>"), for the provider-tier counts. */
  providers: Record<string, number>;
};

function summarize(decisions: Decision[], at: string | null): AgentSummary {
  const summary: AgentSummary = { at, stored: 0, llm: 0, tee: 0, paper: 0, onchain: 0, zgMicro: 0, perDay: {}, providers: {} };
  for (const decision of decisions) {
    if (!decision || typeof decision !== "object") continue;
    summary.stored++;
    if (decision.decidedBy === "llm") summary.llm++;
    if (isTeeVerified(decision)) summary.tee++;
    const provider = typeof decision.zg?.provider === "string" ? decision.zg.provider.trim().toLowerCase() : "";
    if (/^0x[0-9a-f]{40}$/.test(provider)) {
      const key = `${provider} ${decision.model ?? ""}`;
      summary.providers[key] = (summary.providers[key] ?? 0) + 1;
    }
    // An on-chain trade counts once it has a transaction; paper fills are simulated.
    if (decision.trade?.mode === "onchain" && decision.trade.txHash) summary.onchain++;
    else if (decision.trade?.mode === "paper") summary.paper++;
    summary.zgMicro += Math.round((receiptCostUsd(decision) ?? 0) * 1e6);
    const day = typeof decision.at === "string" ? decision.at.slice(0, 10) : "";
    if (parseDay(day)) summary.perDay[day] = (summary.perDay[day] ?? 0) + 1;
  }
  return summary;
}

type Slot = { value?: StatsResponse; at: number; pending?: Promise<StatsResponse> };

// Shared by every route bundle of one server instance (and kept across dev hot reloads).
const globalForStats = globalThis as typeof globalThis & {
  __animrStats?: Slot;
  __animrStatsAgents?: Map<string, AgentSummary>;
};

type ProviderTiers = { teeML: number; teeTLS: number; standard: number };

/**
 * How many stored LLM decisions each kind of 0G provider served, labelled from the Router's public provider list
 * (zgProviderInfo, cached ~1 h). A provider's tier says how it serves calls, not that a given call was verified.
 */
async function providerTiers(summaries: AgentSummary[]): Promise<ProviderTiers> {
  const counts = new Map<string, number>();
  for (const summary of summaries) {
    for (const [key, n] of Object.entries(summary.providers ?? {})) counts.set(key, (counts.get(key) ?? 0) + n);
  }
  const tiers: ProviderTiers = { teeML: 0, teeTLS: 0, standard: 0 };
  await Promise.all(
    [...counts].map(async ([key, n]) => {
      const [address, model] = key.split(" ");
      const info = await zgProviderInfo(address, model || undefined);
      if (info?.label === "TeeML") tiers.teeML += n;
      else if (info?.label === "TeeTLS") tiers.teeTLS += n;
      else if (info?.label === "standard") tiers.standard += n;
    }),
  );
  return tiers;
}

async function readAgents(): Promise<{ agents: AgentRecord[]; summaries: AgentSummary[]; tiers: ProviderTiers }> {
  const store = getStore();
  const agents = await store.listAgents();
  const cache = (globalForStats.__animrStatsAgents ??= new Map());
  const summaries = await mapLimit(agents, AGENT_READS_AT_ONCE, async (agent) => {
    const hit = cache.get(agent.tokenId);
    if (hit && hit.at === agent.lastDecisionAt) return hit;
    const summary = summarize(await store.listDecisions(agent.tokenId, MAX_DECISIONS_PER_AGENT), agent.lastDecisionAt);
    cache.set(agent.tokenId, summary);
    return summary;
  });
  return { agents, summaries, tiers: await providerTiers(summaries) };
}

// --- Plain counters: first-seen days and daily snapshots ---------------------------------------------

/** Per-day increments of a cumulative counter from its daily snapshots (the first snapshot carries all before it). */
function snapshotSeries(snapshots: Record<string, DailySnapshot>, metric: Metric, days: string[]): DayCount[] {
  const known = Object.entries(snapshots)
    .filter(([day, snap]) => parseDay(day) && snap && typeof snap[metric] === "number")
    .map(([day, snap]) => [day, snap[metric] as number] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const byDay = new Map(known);
  let previous = [...known].reverse().find(([day]) => day < days[0])?.[1];
  return days.map((day) => {
    const total = byDay.get(day);
    if (total === undefined) return { day, value: 0 };
    const value = previous === undefined ? total : Math.max(0, total - previous);
    previous = total;
    return { day, value };
  });
}

// --- The whole page --------------------------------------------------------------------------------

/** Computes every number now (several store reads). Prefer getStats(), which caches it for a minute. */
export async function computeStats(now = Date.now()): Promise<StatsResponse> {
  const kv = getKv();
  const today = utcDay(now);
  const unavailable: StatsSection[] = [];
  const section = async <T>(name: StatsSection, read: () => Promise<T>): Promise<T | null> => {
    try {
      return await read();
    } catch (error) {
      console.error(`[animr] stats: couldn't read ${name}:`, error);
      unavailable.push(name);
      return null;
    }
  };

  const [bellData, fans, counters, heist, agentData, optout, owned] = await Promise.all([
    section("bell", () => readBell(today)),
    section("fans", readFans),
    section("versus", async () => {
      const [{ bouts, picks }, replays] = await Promise.all([getVersusCounts(), readCounter(REPLAY_COUNTER_KEYS)]);
      return { bouts, picks, replays };
    }),
    section("heist", () => readHeist(today, now)),
    section("agents", readAgents),
    section("optout", optOutSummary),
    Promise.all([kv.hgetall<string>(FIRST_SEEN_KEY), kv.hgetall<DailySnapshot>(DAILY_KEY)]).catch((error) => {
      console.error("[animr] stats: couldn't read the stats history:", error);
      return null;
    }),
  ]);
  const [firstSeen, snapshots] = owned ?? [{} as Record<string, string>, {} as Record<string, DailySnapshot>];

  // Today's totals of the plain counters, and the first day each was counted (only from sections that loaded).
  const observed: DailySnapshot = {
    ...(fans && { fans: fans.total }),
    ...(counters && { bouts: counters.bouts, picks: counters.picks }),
    ...(counters?.replays != null && { replays: counters.replays }),
  };
  const seen: Record<string, number | undefined> = { fans: observed.fans, versus: observed.bouts, replays: observed.replays };
  const firstSeenNow = Object.entries(seen).filter(([metric, value]) => (value ?? 0) > 0 && !firstSeen[metric]);
  for (const [metric] of firstSeenNow) firstSeen[metric] = today;
  const snapshot = { ...snapshots[today], ...observed };
  const snapshotChanged = (Object.keys(observed) as Metric[]).some((metric) => snapshots[today]?.[metric] !== observed[metric]);
  snapshots[today] = snapshot;
  if (owned) {
    // Bookkeeping only: a failed write costs a "since" or a bar, never the page.
    await Promise.all([
      ...firstSeenNow.map(([metric]) => kv.hsetnx(FIRST_SEEN_KEY, metric, today)),
      ...(snapshotChanged ? [kv.hset(DAILY_KEY, { [today]: snapshot })] : []),
    ]).catch((error) => console.error("[animr] stats: couldn't save the stats history:", error));
  }

  // Daily Bell, rides and retention.
  const bellPart = bellData
    ? bellSection(bellData, today, now)
    : {
        bell: { live: 0, settled: 0, replayed: 0, firstLiveDay: null, ridesOpenUntil: null, recent: [] },
        rides: { total: 0, riders: 0, perDay: series(seriesDays(today, null), () => 0), since: null },
        retention: { d1Pct: null, returned: 0, eligible: 0, backToBack: 0, longestStreak: 0, since: null },
      };
  const rungToday = bellData?.all.includes(today) ?? false;
  const nextBellAt = new Date(bellTime(today) + (rungToday ? DAY_MS : 0)).toISOString();

  // Fans.
  // A ride booked ahead sits on tomorrow's Bell: "since" never goes past today.
  const fansSince = minDay(fans?.firstRide, firstSeen.fans, fans?.total ? today : null);
  const fansPart = {
    total: fans?.total ?? 0,
    nicknamed: fans?.nicknamed ?? 0,
    points: Math.round(fans?.points ?? 0),
    perDay: snapshotSeries(snapshots, "fans", seriesDays(today, fansSince)),
    since: fansSince,
  };

  // Versus and replays.
  const versusSince = (counters?.bouts ?? 0) > 0 ? minDay(firstSeen.versus) : null;
  const versus = {
    bouts: counters?.bouts ?? 0,
    picks: counters?.picks ?? 0,
    perDay: snapshotSeries(snapshots, "bouts", seriesDays(today, versusSince)),
    since: versusSince,
  };
  const replays =
    counters?.replays != null ? { served: counters.replays, since: counters.replays > 0 ? minDay(firstSeen.replays) : null } : null;

  // Heist.
  const heistDays = heist?.days ?? new Map<string, DayStats>();
  const heistTotals = { ...ZERO_DAY };
  let heistSince: string | null = null;
  for (const [day, stats] of heistDays) {
    for (const key of DAY_FIELDS) heistTotals[key] += stats[key];
    if (stats.attempts > 0) heistSince = minDay(heistSince, day);
  }
  const heistPart = {
    attempts: heistTotals.attempts,
    caves: heistTotals.caves,
    refusals: heistTotals.refusals,
    stolenChog: 0 as const,
    wall: heist?.wall ?? 0,
    perDay: series(seriesDays(today, heistSince), (day) => heistDays.get(day)?.attempts ?? 0),
    since: heistSince,
  };

  // Claimed agents.
  const agents = agentData?.agents ?? [];
  const summaries = agentData?.summaries ?? [];
  const perDay: Record<string, number> = {};
  for (const summary of summaries) for (const [day, n] of Object.entries(summary.perDay)) perDay[day] = (perDay[day] ?? 0) + n;
  const agentsSince = minDay(...agents.map((agent) => (typeof agent.activatedAt === "string" ? agent.activatedAt.slice(0, 10) : null)));
  const total = (pick: (summary: AgentSummary) => number) => summaries.reduce((sum, summary) => sum + pick(summary), 0);
  const agentsPart = {
    claimed: agents.filter((agent) => agent.active).length,
    claimedEver: agents.length,
    decisions: agents.reduce((sum, agent) => sum + count(agent.decisions), 0),
    stored: total((s) => s.stored),
    llm: total((s) => s.llm),
    teeVerified: total((s) => s.tee),
    providerTiers: agentData?.tiers ?? { teeML: 0, teeTLS: 0, standard: 0 },
    paperTrades: total((s) => s.paper),
    onchainTrades: total((s) => s.onchain),
    perDay: series(seriesDays(today, agentsSince), (day) => perDay[day] ?? 0),
    since: agentsSince,
  };

  const agentsUsd = total((s) => s.zgMicro) / 1e6;
  const heistUsd = heistTotals.usdMicro / 1e6;
  return {
    computedAt: new Date(now).toISOString(),
    nextBellAt,
    unavailable,
    ...bellPart,
    fans: fansPart,
    versus,
    replays,
    heist: heistPart,
    agents: agentsPart,
    zg: { agentsUsd, heistUsd, totalUsd: agentsUsd + heistUsd },
    optout: { hidden: optout?.hidden ?? 0, since: optout?.since?.slice(0, 10) ?? null },
  };
}

/** The numbers, recomputed at most once a minute per server instance (concurrent callers share one computation). */
export function getStats(): Promise<StatsResponse> {
  const slot = (globalForStats.__animrStats ??= { at: 0 });
  if (slot.value && Date.now() - slot.at < STATS_CACHE_SECONDS * 1000) return Promise.resolve(slot.value);
  slot.pending ??= computeStats()
    .then((value) => {
      slot.value = value;
      slot.at = Date.now();
      return value;
    })
    .catch((error) => {
      // A failed refresh keeps serving the last numbers rather than an error page.
      if (slot.value) return slot.value;
      throw error;
    })
    .finally(() => {
      slot.pending = undefined;
    });
  return slot.pending;
}

/**
 * Recomputes now and refreshes the cache. Besides serving fresher numbers, a computation copies finished heist days
 * before lib/heist drops them (after 8 days) and snapshots the plain counters: call it from a daily cron so that
 * history survives even when nobody opens /stats for a week.
 */
export async function refreshStats(): Promise<StatsResponse> {
  const value = await computeStats();
  globalForStats.__animrStats = { value, at: Date.now() };
  return value;
}
