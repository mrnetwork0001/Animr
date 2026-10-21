import { runAgentOnce } from "../agent/engine";
import { getMarketSnapshot } from "../agent/market";
import { getStore } from "../agent/store";
import { displayThesis, ownTraitNames } from "../agent/thesis-safety";
import type { AgentRecord, Decision, MarketSnapshot } from "../agent/types";
import { isFlaggedTokenId, scrubTraitText } from "../brand-safety";
import { chogLabel } from "../chog-id";
import { allChogs, getChog } from "../dna/chogs";
import { GENOME_VERSION, deriveGenome, genomeForecast } from "../dna/genome";
import { type Candle, type CandleSeries, getCandleSeries, snapshotAt } from "../dna/history";
import type { ChogSnapshot, Genome } from "../dna/types";
import { getKv } from "../kv";
import { awardBellTrophies } from "../trophies/hooks";
import { loadVisibility } from "../visibility";
import { BellError, streakEndingAt, topFans, withFanLock } from "./fans";
import { bellPurse } from "./purse";
import { visibleSummary } from "./showcase";
import {
  DAY_MS,
  HORIZON_HOURS,
  HOUR_MS,
  REPLAY_DAYS,
  RIDE_WINDOW_HOURS,
  addDays,
  bearPct,
  bellTime,
  boldest,
  bullPct,
  clampForecast,
  extremes,
  histogram,
  round,
  scoreCall,
  streakBonus,
  thesisTemplate,
  utcDay,
} from "./rules";
import {
  type BellMeta,
  type CallAnchors,
  KEYS,
  type StoredRecord,
  bellDays,
  chogCard,
  isListed,
  latestSummary,
  parseRide,
  publicRecord,
  readAnchors,
  readCall,
  readCalls,
  readFan,
  readRecord,
  readRecords,
  readSummary,
  topChogIds,
  writeCalls,
  writeFans,
  writeRecords,
  writeSummary,
} from "./store";
import type {
  BellCall,
  BellCallSort,
  BellCallsResponse,
  BellCronResponse,
  BellLive,
  BellStandingsResponse,
  BellSummary,
  BellSummaryResponse,
  ChogBellResponse,
  FanState,
} from "./types";

// The Daily Bell: at 15:00 UTC every Chog calls $CHOG's next 24h (its genome; claimed agents through
// their 0G Compute brain), and 24h later the real CHOG/WMON candles settle every call. Server-only.

/** A ring may use candles this old when the newest hour isn't in yet (settlement re-reads the entry). */
const STALE_MS = 3 * HOUR_MS;
/** The live ring waits this long after 15:00 UTC, so the candle closing at 15:00 is in the data. */
export const RING_LAG_MS = 60_000;
/** Settlement waits this long after the horizon... */
const SETTLE_GRACE_MS = 10 * 60_000;
/** ...and only trusts candles fetched at least this long after it (the horizon hour's trades are indexed). */
const SETTLE_LAG_MS = 5 * 60_000;
/** Without a trade in the horizon hour, a quiet pool settles on its last close (if it's this recent)... */
const MAX_QUIET_GAP_MS = 6 * HOUR_MS;
/** ...once data fetched this long after the horizon still shows no trade (a quiet hour, not a lagging API). */
const QUIET_GRACE_MS = 2 * HOUR_MS;
/** Riders credited at once at settlement (each under its fan lock). */
const CREDIT_CONCURRENCY = 8;
const AGENT_CONCURRENCY = 4;
const AGENT_TIMEOUT_MS = 75_000;
/** Claimed agents get this long (from the start of the ring) to make their calls. */
const AGENT_BUDGET_MS = 180_000;
const MAINTAIN_LOCK = "bell:maintain";
const MAINTAIN_LOCK_TTL_MS = 5 * 60_000;
const LAZY_INTERVAL_MS = 60_000;
const SEED_WAIT_MS = 25_000;
const FEATURED_MAX = 12;
const FEATURED_CLAIMED_MAX = 8;
/** After the first live Bell, days without a Bell this recent are replayed (a missed cron). */
const MISSED_DAYS_REPLAYED = 3;

/**
 * Version of the replayed history (BellMeta.genomeVersion): the genome's, plus a suffix bumped when a
 * Bell-side change alters replayed calls (.2: the ten 1:1 Legendaries call with their named genomes;
 * .3: varied forecast lines naming the signal trait, ±4% chaos calls, persona names, varied showcases).
 * A new version rebuilds every replayed Bell in place and recomputes the records, live Bells or not.
 */
const HISTORY_VERSION = `${GENOME_VERSION}.3`;

const iso = (ms: number) => new Date(ms).toISOString();
const unit = (value: number) => round(Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)));

// --- Candles (t = open time; a candle's close is the price at t + 1h) ---

/** What a Bell decision may conclude from the candles: the series and when it was fetched (ms). */
type Series = Pick<CandleSeries, "candles" | "fetchedAt">;

const closeMs = (candle: Candle) => (candle.t + 3600) * 1000;

/** Index of the last candle closed at or before `ms`, or -1. */
function closedAt(candles: readonly Candle[], ms: number): number {
  let [lo, hi, found] = [0, candles.length - 1, -1];
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (closeMs(candles[mid]) <= ms) [found, lo] = [mid, mid + 1];
    else hi = mid - 1;
  }
  return found;
}

/** WMON per $CHOG at `ms`: the last close at or before it, if it is at most `maxAgeMs` older. */
function priceAt(candles: readonly Candle[], ms: number, maxAgeMs = 0): number | null {
  const i = closedAt(candles, ms);
  return i >= 0 && ms - closeMs(candles[i]) <= maxAgeMs ? candles[i].close : null;
}

/**
 * The real price at the horizon, or null while it can't be known for sure. Settlement is final, so it
 * needs data fetched after the horizon hour was indexed: the close of a traded horizon hour, or, for an
 * hour without trades, the last close once data fetched QUIET_GRACE later still shows none (a lagging
 * API looks exactly like a quiet pool until then). The committed file only settles horizons it was
 * fetched well after; gaps carried forward to "now" never count as trades.
 */
function settlePriceAt({ candles, fetchedAt }: Series, horizonMs: number, now: number): number | null {
  if (now < horizonMs + SETTLE_GRACE_MS || fetchedAt < horizonMs + SETTLE_LAG_MS) return null;
  const i = closedAt(candles, horizonMs);
  if (i < 0) return null;
  if (closeMs(candles[i]) === horizonMs && candles[i].volume > 0) return candles[i].close;
  let traded = i;
  while (traded >= 0 && candles[traded].volume <= 0) traded--;
  if (traded < 0) return null;
  const quiet = fetchedAt >= horizonMs + QUIET_GRACE_MS && horizonMs - closeMs(candles[traded]) <= MAX_QUIET_GAP_MS;
  return quiet ? candles[i].close : null;
}

/** Candles a caller passed in (tests, one run sharing them) count as complete data. */
function givenSeries(options: { series?: Series; candles?: readonly Candle[] }): Series | undefined {
  return options.series ?? (options.candles ? { candles: options.candles, fetchedAt: Number.MAX_SAFE_INTEGER } : undefined);
}

// --- Calls ---

const genomes = new Map<number, Genome>();

function cleanThesis(text: unknown): string {
  const clean = (typeof text === "string" ? text : "")
    .replace(/\s*\(Guardrail:[^)]*\)\s*$/, "") // the trade guardrail note, not part of the forecast
    .replace(/\s+/g, " ")
    .trim();
  // An AI may echo a flagged trait value from the metadata: show its neutral name (lib/brand-safety.ts).
  return scrubTraitText(clean.slice(0, 280)) || "No comment.";
}

function genomeCall(chog: ChogSnapshot, market: MarketSnapshot, claimed: boolean): BellCall {
  let genome = genomes.get(chog.id);
  // The metadata name gives the ten 1:1 Legendaries their own genomes (as in the league and replays).
  if (!genome) genomes.set(chog.id, (genome = deriveGenome(chog.traits, chog.name)));
  const forecast = genomeForecast(genome, market);
  return {
    tokenId: chog.id,
    ...chogCard(chog.id),
    forecastPct: clampForecast(forecast.pct),
    conviction: unit(forecast.conviction),
    thesis: cleanThesis(forecast.thesis),
    source: "genome",
    claimed,
  };
}

/** Active agents of real Chogs (the claimed Chogs). */
async function activeAgents(): Promise<AgentRecord[]> {
  return (await getStore().listAgents()).filter((agent) => agent.active && getChog(Number(agent.tokenId)));
}

export type RunAgent = (agent: AgentRecord, options?: { deadline?: number }) => Promise<Decision>;
/** A claimed agent's 0G call and the price it saw when it decided (the call is scored from there). */
type AgentCall = Pick<BellCall, "forecastPct" | "conviction" | "thesis"> & { entry: number };

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * A claimed agent's 0G call: a decision it already made since the ring, else one fresh run of its brain
 * (told to send no on-chain trade past the budget, which the Bell stops waiting at).
 */
async function agentCall(agent: AgentRecord, ringMs: number, deadline: number, run: RunAgent): Promise<AgentCall | null> {
  const [latest] = await getStore().listDecisions(agent.tokenId, 1);
  let decision: Decision | undefined = latest?.forecast && Date.parse(latest.at) >= ringMs ? latest : undefined;
  if (!decision) {
    const budget = Math.min(AGENT_TIMEOUT_MS, deadline - Date.now());
    if (budget <= 0) return null;
    decision = await withTimeout(run(agent, { deadline: Date.now() + budget }), budget);
  }
  const pct = decision.forecast?.pct;
  const entry = decision.market?.priceQuote;
  if (decision.decidedBy !== "llm" || typeof pct !== "number" || !Number.isFinite(pct) || !(typeof entry === "number" && entry > 0)) {
    return null;
  }
  // Moderation hook: an LLM thesis that fails the checks shows as a template line (lib/agent/thesis-safety.ts).
  const thesis = cleanThesis(displayThesis(decision, ownTraitNames(agent.persona?.traits)));
  return { forecastPct: clampForecast(pct), conviction: unit(decision.confidence), thesis, entry };
}

async function agentCalls(agents: AgentRecord[], ringMs: number, deadline: number, run: RunAgent) {
  const calls = new Map<number, AgentCall>();
  const queue = [...agents];
  const worker = async () => {
    for (let agent = queue.shift(); agent; agent = queue.shift()) {
      try {
        const call = await agentCall(agent, ringMs, deadline, run);
        if (call) calls.set(Number(agent.tokenId), call);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`[animr] Bell: Chog #${agent.tokenId}'s agent made no call (its genome calls instead): ${reason}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(AGENT_CONCURRENCY, agents.length) }, worker));
  return calls;
}

/** Showcase slots leave out Chogs whose traits or art carry flagged words (lib/brand-safety.ts). */
const notShowcased = (tokenId: number) => isFlaggedTokenId(tokenId);

/**
 * Claimed Chogs (0G calls first), then the season's top oracles: no flagged Chogs, and at most two
 * calls with the same line (numbers aside), so the row never reads like one card repeated.
 */
async function featuredCalls(calls: BellCall[]): Promise<BellCall[]> {
  const byId = new Map(calls.map((call) => [call.tokenId, call]));
  const claimed = calls
    .filter((call) => call.claimed && !notShowcased(call.tokenId))
    .sort((a, b) => Number(b.source === "llm") - Number(a.source === "llm") || a.tokenId - b.tokenId)
    .slice(0, FEATURED_CLAIMED_MAX);
  const featured = [...claimed];
  const lines = new Map<string, number>();
  for (const call of featured) lines.set(thesisTemplate(call.thesis), (lines.get(thesisTemplate(call.thesis)) ?? 0) + 1);
  for (const id of await topChogIds(FEATURED_MAX * 4)) {
    if (featured.length >= FEATURED_MAX) break;
    const call = byId.get(id);
    if (!call || featured.includes(call) || notShowcased(id)) continue;
    const line = thesisTemplate(call.thesis);
    if ((lines.get(line) ?? 0) >= 2) continue;
    lines.set(line, (lines.get(line) ?? 0) + 1);
    featured.push(call);
  }
  return featured;
}

// --- Ring and settle ---

export type RingOptions = {
  now?: number;
  /** Candles to use (complete data); defaults to the shared series. */
  candles?: readonly Candle[];
  series?: Series;
  /** Ring again over an existing Bell (rebuilding replays for a new genome). */
  force?: boolean;
  /** Live: stop starting agent runs after this time (ms). */
  deadline?: number;
  /** Defaults to the active agents (claimed Chogs). */
  agents?: AgentRecord[];
  /** Defaults to runAgentOnce (one real decision through the agent's 0G brain). */
  runAgent?: RunAgent;
};

/**
 * Rings the Bell of `day` (idempotent): a genome call for all 1,969 Chogs from the market at 15:00 UTC,
 * and for "live" Bells a call from every claimed agent's 0G brain. Replays have no ride window.
 */
export async function ringBell(day: string, kind: BellSummary["kind"] = "live", options: RingOptions = {}) {
  const existing = options.force ? null : await readSummary(day);
  if (existing) {
    // A ring that died between its summary and its index entries: finish it.
    if (!(await isListed(existing))) await writeSummary(existing);
    return existing;
  }
  const now = options.now ?? Date.now();
  const ringMs = bellTime(day);
  if (kind === "live" && now < ringMs) throw new BellError(`The ${day} Bell rings at ${iso(ringMs)}.`, 409);
  const { candles } =
    givenSeries(options) ?? (await getCandleSeries(kind === "live" ? { minFetchedAt: ringMs + RING_LAG_MS } : {}));
  const index = closedAt(candles, ringMs);
  const fresh = index >= 1 && ringMs - closeMs(candles[index]) <= STALE_MS;
  if (!fresh && kind === "replay") throw new BellError(`No candles around ${day} to replay its Bell.`, 409);
  const market = fresh ? snapshotAt(candles, index) : await getMarketSnapshot();
  // Calls made from a later live snapshot count from its price, never from a 15:00 close they didn't see.
  const anchors: CallAnchors = fresh || !market.priceQuote ? {} : { genomeEntry: market.priceQuote };

  const agents = options.agents ?? (await activeAgents());
  const claimed = new Set(agents.map((agent) => Number(agent.tokenId)));
  const calls = allChogs().map((chog) => genomeCall(chog, market, claimed.has(chog.id)));
  if (kind === "live" && agents.length) {
    // A wall-clock budget, even when `now` is simulated.
    const deadline = options.deadline ?? Date.now() + AGENT_BUDGET_MS;
    const llm = await agentCalls(agents, ringMs, deadline, options.runAgent ?? runAgentOnce);
    const entries: Record<string, number> = {};
    for (const call of calls) {
      const llmCall = llm.get(call.tokenId);
      if (!llmCall) continue;
      const { entry, ...made } = llmCall;
      Object.assign(call, made, { source: "llm" });
      entries[String(call.tokenId)] = entry;
    }
    if (Object.keys(entries).length) anchors.entries = entries;
  }

  const rungAt = kind === "live" ? Math.max(now, ringMs) : ringMs;
  const summary: BellSummary = {
    day,
    rungAt: iso(rungAt),
    horizonAt: iso(ringMs + HORIZON_HOURS * HOUR_MS),
    // Anchored to 15:00 UTC: a late ring doesn't stretch the window.
    rideWindowClosesAt: iso(kind === "live" ? Math.max(rungAt, ringMs + RIDE_WINDOW_HOURS * HOUR_MS) : rungAt),
    status: "open",
    kind,
    entryPrice: (fresh ? priceAt(candles, ringMs, STALE_MS) : market.priceQuote) ?? null,
    settlePrice: null,
    actualPct: null,
    calls: calls.length,
    bullPct: bullPct(calls),
    bearPct: bearPct(calls),
    histogram: histogram(calls),
    boldest: boldest(calls, day, 8, notShowcased),
    featured: await featuredCalls(calls),
  };
  await writeCalls(day, calls, anchors);
  await writeSummary(summary);
  return summary;
}

/** Adds one settled Bell to the season records; `lastDay` makes a repeat a no-op (Bells settle oldest first). */
function accumulateRecords(records: Record<string, StoredRecord>, day: string, calls: BellCall[], oracleId?: number) {
  const updated: StoredRecord[] = [];
  for (const call of calls) {
    const prev = records[String(call.tokenId)];
    if (prev && prev.lastDay >= day) continue;
    const count = (prev?.calls ?? 0) + 1;
    const errorSum = (prev?.errorSum ?? 0) + (call.errorPts ?? 0);
    const record: StoredRecord = {
      tokenId: call.tokenId,
      calls: count,
      hits: (prev?.hits ?? 0) + (call.hit ? 1 : 0),
      oracleWins: (prev?.oracleWins ?? 0) + (call.tokenId === oracleId ? 1 : 0),
      avgErrorPts: round(errorSum / count),
      totalPoints: (prev?.totalPoints ?? 0) + (call.points ?? 0),
      lastDay: day,
      errorSum: round(errorSum, 4),
    };
    records[String(call.tokenId)] = record;
    updated.push(record);
  }
  return updated;
}

async function applyRecords(day: string, calls: BellCall[], oracleId?: number) {
  await writeRecords(accumulateRecords(await readRecords(), day, calls, oracleId));
}

/** Runs `fn` over `items`, `limit` at a time. */
async function eachLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) await fn(items[i]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Fans who rode a Chog on this Bell earn points for its call plus their streak bonus (once per ride).
 * A ride counts from the first hourly close after it was taken: its call is scored against $CHOG's move
 * from that close to the settlement, so riding late can't cash in on the move since 15:00.
 */
async function creditRiders(
  day: string,
  calls: BellCall[],
  { candles, entryPrice, settlePrice }: { candles: readonly Candle[]; entryPrice: number; settlePrice: number },
) {
  const kv = getKv();
  const rides = await kv.hgetall<unknown>(KEYS.rides(day));
  const fanIds = Object.keys(rides);
  if (!fanIds.length) return;
  const byId = new Map(calls.map((call) => [call.tokenId, call]));
  const liveDays = await bellDays("live");
  const ringMs = bellTime(day);
  await eachLimit(fanIds, CREDIT_CONCURRENCY, async (fanId) => {
    const ride = parseRide(rides[fanId]);
    if (!ride) return;
    const fromMs = Math.max(ringMs, Math.ceil(ride.at / HOUR_MS) * HOUR_MS);
    const from = fromMs > ringMs ? (priceAt(candles, fromMs, STALE_MS) ?? entryPrice) : entryPrice;
    const call = byId.get(ride.tokenId);
    const ridePoints = call ? scoreCall(call.forecastPct, round((settlePrice / from - 1) * 100)).points : 0;
    await withFanLock(fanId, async () => {
      const fan: FanState = (await readFan(fanId)) ?? { fanId, points: 0, streak: 0, history: [] };
      // The rides hash is the source of truth; restore the history entry if a write lost it.
      let entry = fan.history.find((item) => item.day === day);
      if (entry?.points !== undefined) return;
      if (!entry) {
        entry = { day, tokenId: ride.tokenId };
        fan.history = [...fan.history, entry].sort((a, b) => b.day.localeCompare(a.day));
      }
      entry.tokenId = ride.tokenId;
      const streak = streakEndingAt(new Set(fan.history.map((item) => item.day)), liveDays, day);
      entry.points = ridePoints + streakBonus(streak);
      fan.points += entry.points;
      await writeFans([fan]);
    });
  });
}

export type SettleOptions = {
  now?: number;
  candles?: readonly Candle[];
  series?: Series;
  /** False leaves the season records alone (a rebuild recomputes them in one pass). */
  records?: boolean;
};
type ReplayOptions = SettleOptions & { settle?: boolean; rebuild?: boolean };

/**
 * Settles a Bell whose horizon has passed against the real CHOG/WMON closes (idempotent). Returns null
 * while the price at the horizon can't be known for sure yet (see settlePriceAt). Each call is scored
 * from the price it was made at: the 15:00 UTC close, or its own (CallAnchors).
 */
export async function settleBell(day: string, options: SettleOptions = {}): Promise<BellSummary | null> {
  const summary = await readSummary(day);
  if (!summary) throw new BellError(`There's no Bell on ${day}.`, 404);
  if (summary.status === "settled") {
    // A settlement that died before its index update: finish it.
    if (!(await isListed(summary))) await writeSummary(summary);
    return summary;
  }
  const now = options.now ?? Date.now();
  const horizonMs = Date.parse(summary.horizonAt);
  if (now < horizonMs + SETTLE_GRACE_MS) return null;
  const series = givenSeries(options) ?? (await getCandleSeries({ minFetchedAt: horizonMs + SETTLE_LAG_MS }));
  const settlePrice = settlePriceAt(series, horizonMs, now);
  const entryPrice = priceAt(series.candles, bellTime(day), STALE_MS) ?? summary.entryPrice;
  if (settlePrice === null || !entryPrice) return null;
  const actualPct = round((settlePrice / entryPrice - 1) * 100);
  const moveFrom = (price: number | undefined) => (price && price > 0 ? round((settlePrice / price - 1) * 100) : actualPct);
  const anchors = await readAnchors(summary);
  const genomeMove = moveFrom(anchors.genomeEntry);

  const calls = (await readCalls(summary)).map((call) => {
    const own = anchors.entries?.[String(call.tokenId)];
    const move = own ? moveFrom(own) : call.source === "genome" ? genomeMove : actualPct;
    return { ...call, ...scoreCall(call.forecastPct, move) };
  });
  // Records credit the true Oracle; the showcase cards leave flagged Chogs out.
  const truth = extremes(calls, day);
  const { oracle, mostRekt } = extremes(calls, day, notShowcased);
  // Each step is idempotent and the summary flips to "settled" last, so a retry after a crash is safe.
  await writeCalls(day, calls, anchors);
  if (options.records !== false) await applyRecords(day, calls, truth.oracle?.tokenId);
  if (summary.kind === "live") await creditRiders(day, calls, { candles: series.candles, entryPrice, settlePrice });
  const settled: BellSummary = {
    ...summary,
    status: "settled",
    entryPrice,
    settlePrice,
    actualPct,
    boldest: boldest(calls, day, 8, notShowcased),
    featured: await featuredCalls(calls),
    ...(oracle && { oracle }),
    ...(mostRekt && { mostRekt }),
  };
  await writeSummary(settled);
  return settled;
}

/** Settles open Bells oldest first (records rely on that order), up to the first that can't settle yet. */
async function settleDue(options: SettleOptions): Promise<string[]> {
  const settled: string[] = [];
  for (const day of await bellDays("open")) {
    if (!(await settleBell(day, options))) break;
    settled.push(day);
  }
  return settled;
}

/**
 * Rebuilds the Bells of the `days` days before today from real candles (genome calls only, kind
 * "replay"), newer than any existing Bell, and settles them oldest first, so the history is never
 * empty. Yesterday's stays open until its horizon (today 15:00 UTC) when that is still ahead.
 * Returns the days it added. `rebuild` replays every day again in place (a new genome; records must
 * be reset first) and drops days outside the window.
 */
export async function replayBells(days = REPLAY_DAYS, options: ReplayOptions = {}): Promise<string[]> {
  const now = options.now ?? Date.now();
  const series = givenSeries(options) ?? (await getCandleSeries());
  const { candles } = series;
  if (!candles.length) return [];
  const until = Math.min(now, closeMs(candles[candles.length - 1]));
  const chosen: string[] = [];
  for (let day = addDays(utcDay(now), -1); chosen.length < days; day = addDays(day, -1)) {
    const ringMs = bellTime(day);
    if (ringMs > until) continue;
    if (closedAt(candles, ringMs) < 24) break;
    chosen.unshift(day);
  }
  const existing = await bellDays();
  const latest = existing[existing.length - 1] ?? "";
  const added = options.rebuild ? chosen : chosen.filter((day) => day > latest);
  if (added.length) {
    const kv = getKv();
    const agents = await activeAgents();
    // Once live Bells exist, a missed day that fans booked rides on rings late as a live Bell (genome calls from its
    // 15:00 candle, no agent run for a past hour), so its rides are scored and credited like any other: a ride is
    // never lost to a missed cron. A missed day nobody rode is replayed.
    const liveSeason = !options.rebuild && (await kv.zcard(KEYS.live)) > 0;
    for (const day of added) {
      const rode = liveSeason && (await kv.hlen(KEYS.rides(day))) > 0;
      if (rode) await ringBell(day, "live", { now, series, agents: [] });
      else await ringBell(day, "replay", { now, series, agents, force: options.rebuild });
    }
  }
  if (options.rebuild) await dropBells(existing.filter((day) => !chosen.includes(day)));
  if (options.settle !== false) await settleDue({ now, series });
  return added;
}

async function dropBells(days: string[]): Promise<void> {
  if (!days.length) return;
  const kv = getKv();
  await kv.del(...days.flatMap((day) => [KEYS.summary(day), KEYS.calls(day), KEYS.rides(day)]));
  for (const key of [KEYS.index, KEYS.live, KEYS.open]) await kv.zrem(key, ...days);
}

/** Deletes every Bell, record and ride (fans keep their points). For dev resets. */
export async function clearBells(): Promise<void> {
  await dropBells(await bellDays());
  await getKv().del(KEYS.index, KEYS.live, KEYS.open, KEYS.records, KEYS.chogPoints, KEYS.meta);
}

/**
 * After the first live Bell: rebuilds every replayed Bell in place with the current genome (live Bells
 * are history and keep their calls), then recomputes the season records from every settled Bell in
 * day order. Returns the days rebuilt.
 */
async function rebuildReplays(options: { now: number; series: Series }): Promise<string[]> {
  const days = await bellDays();
  const agents = await activeAgents();
  const rebuilt: string[] = [];
  for (const day of days) {
    if ((await readSummary(day))?.kind !== "replay") continue;
    try {
      await ringBell(day, "replay", { ...options, agents, force: true });
      await settleBell(day, { ...options, records: false });
      rebuilt.push(day);
    } catch (error) {
      console.warn(`[animr] Bell: couldn't rebuild the ${day} replay:`, (error as Error).message);
    }
  }
  const records: Record<string, StoredRecord> = {};
  for (const day of days) {
    const summary = await readSummary(day);
    // Open Bells add theirs when they settle (after every settled one, as settlement goes oldest first).
    if (summary?.status !== "settled") continue;
    const calls = await readCalls(summary);
    accumulateRecords(records, day, calls, extremes(calls, day).oracle?.tokenId);
  }
  await getKv().del(KEYS.records, KEYS.chogPoints);
  await writeRecords(Object.values(records));
  return rebuilt;
}

/**
 * Keeps the history complete up to yesterday: the replayed season on a fresh deploy, a replay of any
 * recent day the live Bell missed (a failed cron), and when the history version changes, every replayed
 * Bell rebuilt (before the first live Bell the whole window is replayed again; after it, in place).
 * BellMeta records the version only when this actually (re)built the replays.
 */
async function ensureHistory(options: ReplayOptions & { now: number; series: Series }): Promise<number> {
  const kv = getKv();
  const [count, live, meta] = await Promise.all([kv.zcard(KEYS.index), kv.zcard(KEYS.live), kv.get<BellMeta>(KEYS.meta)]);
  const stale = count > 0 && meta?.genomeVersion !== HISTORY_VERSION;
  const rebuilt = stale && live ? await rebuildReplays(options) : [];
  if (stale && !live) await kv.del(KEYS.records, KEYS.chogPoints);
  const added = await replayBells(live ? MISSED_DAYS_REPLAYED : REPLAY_DAYS, { ...options, rebuild: stale && !live });
  if (stale || (count === 0 && added.length)) {
    const days = [...new Set([...rebuilt, ...added])].sort();
    await kv.set(KEYS.meta, { genomeVersion: HISTORY_VERSION, seededAt: iso(options.now), days } satisfies BellMeta);
  }
  return rebuilt.length + added.length;
}

/**
 * The cron's job (idempotent, one run at a time): replay the history if missing, settle every Bell
 * whose horizon has passed, then ring today's Bell from 15:01 UTC if it hasn't rung. A failing replay
 * or settlement is logged and never keeps today's Bell from ringing.
 */
export async function maintainBells(options: { now?: number; deadline?: number } = {}): Promise<BellCronResponse> {
  const kv = getKv();
  const token = await kv.acquireLock(MAINTAIN_LOCK, MAINTAIN_LOCK_TTL_MS);
  if (!token) throw new BellError("The Bell is busy ringing or settling. Try again in a minute.", 409);
  try {
    const now = options.now ?? Date.now();
    const result: BellCronResponse = {};
    try {
      const series = await getCandleSeries();
      const replayed = await ensureHistory({ now, series, settle: false });
      if (replayed) result.replayed = replayed;
    } catch (error) {
      console.error("[animr] Bell: keeping the history failed:", error);
    }
    try {
      const settled = await settleDue({ now });
      if (settled.length) result.settled = settled.join(",");
    } catch (error) {
      console.error("[animr] Bell: settling failed:", error);
    }
    const today = utcDay(now);
    if (now >= bellTime(today) + RING_LAG_MS) {
      const rung = await readSummary(today);
      if (!rung) {
        await ringBell(today, "live", { now, deadline: options.deadline });
        result.rung = today;
      } else if (!(await isListed(rung))) {
        await writeSummary(rung);
      }
    }
    // Trophies (lib/trophies): the winners of recent settled live Bells get theirs minted into their own wallets.
    // Idempotent and never throws; a no-op until NEXT_PUBLIC_TROPHIES_ADDRESS is set.
    await awardBellTrophies();
    return result;
  } finally {
    await kv.releaseLock(MAINTAIN_LOCK, token).catch(() => {});
  }
}

/** True when maintenance is due now, else the earliest time (ms) it can become due. */
async function maintenanceDue(now: number): Promise<true | number> {
  const kv = getKv();
  const today = utcDay(now);
  const [latest, meta, oldestOpen, rungToday] = await Promise.all([
    kv.zrange(KEYS.index, -1, -1),
    kv.get<BellMeta>(KEYS.meta),
    kv.zrange(KEYS.open, 0, 0),
    kv.zscore(KEYS.index, today),
  ]);
  const latestDay = latest[0]?.member ?? "";
  // The history must reach yesterday, built by this history version.
  if (latestDay < addDays(today, -1) || meta?.genomeVersion !== HISTORY_VERSION) return true;
  const ringAt = bellTime(today) + RING_LAG_MS;
  if (rungToday === null && now >= ringAt) return true;
  const settleAt = oldestOpen.length ? oldestOpen[0].score + SETTLE_GRACE_MS : Infinity;
  if (settleAt <= now) return true;
  const midnight = Date.parse(`${addDays(today, 1)}T00:00:00Z`);
  return Math.min(rungToday === null ? ringAt : ringAt + DAY_MS, settleAt, midnight);
}

const globalForBell = globalThis as typeof globalThis & { __animrBellCheckedAt?: number; __animrBellQuietUntil?: number };

/**
 * For after() in read routes: a backstop for the once-a-day cron (Vercel Hobby fires it anywhere in
 * the hour). Checks at most once a minute per instance, and not again before the next thing can be
 * due (a ring, a horizon, midnight); never throws.
 */
export async function maintainBellsIfDue(): Promise<void> {
  const now = Date.now();
  if (now - (globalForBell.__animrBellCheckedAt ?? 0) < LAZY_INTERVAL_MS) return;
  if (now < (globalForBell.__animrBellQuietUntil ?? 0)) return;
  globalForBell.__animrBellCheckedAt = now;
  try {
    const due = await maintenanceDue(now);
    if (due === true) await maintainBells({ now });
    else globalForBell.__animrBellQuietUntil = due;
  } catch (error) {
    if (!(error instanceof BellError)) console.error("[animr] Bell maintenance failed:", error);
  }
}

// --- Reads ---

/** Builds the replayed history on a fresh deploy (or waits for the run that is building it). */
async function seedHistory(): Promise<void> {
  const kv = getKv();
  const deadline = Date.now() + SEED_WAIT_MS;
  while (Date.now() < deadline) {
    const token = await kv.acquireLock(MAINTAIN_LOCK, MAINTAIN_LOCK_TTL_MS);
    if (token) {
      try {
        await ensureHistory({ now: Date.now(), series: await getCandleSeries() });
      } finally {
        await kv.releaseLock(MAINTAIN_LOCK, token).catch(() => {});
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (await kv.zcard(KEYS.index)) return;
  }
}

/** The latest rung Bell (live or replay); never empty once the candles are reachable. */
export async function getLatestBell(): Promise<BellSummary | null> {
  const latest = await latestSummary();
  if (latest) return latest;
  await seedHistory();
  return latestSummary();
}

export function getBell(day: string): Promise<BellSummary | null> {
  return readSummary(day);
}

/** Where $CHOG trades now against an open Bell's entry (provisional; settlement uses the hourly closes). */
export async function liveMove(bell: BellSummary): Promise<BellLive | undefined> {
  if (bell.status !== "open" || !bell.entryPrice) return undefined;
  const market = await withTimeout(getMarketSnapshot(), 2_000).catch(() => null);
  if (!market?.priceQuote) return undefined;
  const movePct = round((market.priceQuote / bell.entryPrice - 1) * 100);
  return { price: market.priceQuote, movePct, at: market.fetchedAt, source: market.source };
}

/** A Bell's share of bear calls: stored by rings since bearPct exists, else counted from its calls. */
async function bearShare(bell: BellSummary): Promise<number> {
  return typeof bell.bearPct === "number" ? bell.bearPct : bearPct(await readCalls(bell));
}

/**
 * A Bell summary for the API: Chogs their holders hid left out of its showcases (lib/bell/showcase.ts), bearPct
 * filled in, plus `live` while it is open and `purse` once a settled live Bell has (or is about to get) its Oracle
 * Purse. A failed extra is left out, never failing the response.
 */
export async function withLive(stored: BellSummary): Promise<BellSummaryResponse> {
  const visibility = await loadVisibility();
  const bell = await visibleSummary(stored, visibility);
  const [live, bear, purse] = await Promise.all([
    liveMove(bell),
    bearShare(bell).catch(() => undefined),
    bellPurse(bell, { visibility }).catch((error) => {
      console.warn(`[animr] Bell: couldn't read the ${bell.day} Oracle Purse:`, (error as Error).message);
      return undefined;
    }),
  ]);
  return {
    ...bell,
    ...(bell.oracle && { oracle: { ...bell.oracle, label: tokenLabel(bell.oracle.tokenId) } }),
    ...(bell.mostRekt && { mostRekt: { ...bell.mostRekt, label: tokenLabel(bell.mostRekt.tokenId) } }),
    ...(bear !== undefined && { bearPct: bear }),
    ...(live && { live }),
    ...(purse && { purse: { ...purse, label: tokenLabel(purse.tokenId) } }),
  };
}

/** "CHOG #1075 · token 1583": a token id alone reads as a different NFT's marketplace name (lib/chog-id.ts). */
function tokenLabel(tokenId: number): string {
  return chogLabel(tokenId, { metadataName: getChog(tokenId)?.name });
}

const SORTS: Record<BellCallSort, (a: BellCall, b: BellCall) => number> = {
  bold: (a, b) => Math.abs(b.forecastPct) - Math.abs(a.forecastPct) || b.conviction - a.conviction || a.tokenId - b.tokenId,
  bull: (a, b) => b.forecastPct - a.forecastPct || b.conviction - a.conviction || a.tokenId - b.tokenId,
  bear: (a, b) => a.forecastPct - b.forecastPct || b.conviction - a.conviction || a.tokenId - b.tokenId,
  tokenId: (a, b) => a.tokenId - b.tokenId,
  points: (a, b) =>
    (b.points ?? -1) - (a.points ?? -1) || (a.errorPts ?? 0) - (b.errorPts ?? 0) || a.tokenId - b.tokenId,
};

export const CALL_SORTS = Object.keys(SORTS) as BellCallSort[];

/** One page of a Bell's calls (Chogs their holders hid left out); `next` is the cursor of the following page. */
export async function getBellCalls(
  day: string,
  { sort = "bold", cursor = 0, limit = 50 }: { sort?: BellCallSort; cursor?: number; limit?: number } = {},
): Promise<BellCallsResponse | null> {
  const summary = await readSummary(day);
  if (!summary) return null;
  const [all, visibility] = await Promise.all([readCalls(summary), loadVisibility()]);
  const calls = all.filter((call) => !visibility.isHidden(call.tokenId)).sort(SORTS[sort]);
  const end = cursor + limit;
  return { calls: calls.slice(cursor, end), ...(end < calls.length && { next: String(end) }) };
}

/** A Chog's call on the latest Bell and its season record. */
export async function getChogBell(tokenId: number): Promise<ChogBellResponse> {
  const [latest, record] = await Promise.all([getLatestBell(), readRecord(tokenId)]);
  const today = latest ? await readCall(latest, tokenId) : undefined;
  return { ...(today && { today }), record: publicRecord(record, tokenId) };
}

/** The season's best Chogs (most points; Chogs their holders hid left out) and fans. */
export async function getStandings(limit = 50): Promise<BellStandingsResponse> {
  await getLatestBell();
  const visibility = await loadVisibility();
  const ids = (await topChogIds(limit + visibility.hidden.size))
    .filter((tokenId) => !visibility.isHidden(tokenId))
    .slice(0, limit);
  const [records, fans] = await Promise.all([
    getKv().hmget<StoredRecord>(KEYS.records, ids.map(String)),
    topFans(limit),
  ]);
  return {
    chogs: ids.map((tokenId, i) => ({ ...publicRecord(records[i], tokenId), ...chogCard(tokenId), rank: i + 1 })),
    fans,
  };
}
