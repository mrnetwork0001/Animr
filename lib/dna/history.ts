import fallback from "@/data/chog-ohlcv-1h.json";
import type { MarketSnapshot } from "../agent/types";
import { appConfig, trading } from "../config";
import { getKv } from "../kv";

// Hourly CHOG/WMON candles of the CHOG/WMON 1% pool (where ~95% of $CHOG liquidity sits), from
// GeckoTerminal. Its public API only serves the last 180 days, so data/chog-ohlcv-1h.json keeps the
// older history and the live API tops it up.
//   GET https://api.geckoterminal.com/api/v2/networks/monad/pools/<pool>/ohlcv/hour
//       ?aggregate=1&limit=1000&currency=token&token=base[&before_timestamp=<unix s>]
// currency=token + token=base gives the base token's (CHOG's) price in the quote token (WMON).

/** One hour of trading. t = open time (unix seconds); prices in WMON per $CHOG; volume in WMON. */
export type Candle = { t: number; open: number; high: number; low: number; close: number; volume: number };

/** data/chog-ohlcv-1h.json: raw candles ([t, open, high, low, close, volume], ascending, traded hours only). */
export type CandleFile = {
  version: 1;
  pool: string;
  pair: string;
  unit: string;
  source: string;
  fetchedAt: string;
  candles: [number, number, number, number, number, number][];
};

export const HOUR = 3600;
const GECKO_POOLS = "https://api.geckoterminal.com/api/v2/networks/monad/pools";
const POOL = trading?.pool ?? "0x116e7D070f1888B81E1E0324F56d6746B2D7d8f1";
const WMON = trading?.wmon ?? "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A";
const CHOG = appConfig.chogToken ?? "0x350035555E10d9AfAF1566AaebfCeD5BA6C27777";
const PAGE_LIMIT = 1000;
/** Pages fetched per refresh at most (~30 requests/min on the public API). */
const MAX_LIVE_PAGES = 3;
const FETCH_TIMEOUT_MS = 8_000;
/** Every instance refreshes at most this often, and reuses a fresh copy another instance stored in the KV. */
const CACHE_TTL_MS = 10 * 60_000;
/** After a failed refresh, wait this long (doubling per failure up to BACKOFF_MAX_MS, or the API's Retry-After). */
const BACKOFF_MIN_MS = 60_000;
const BACKOFF_MAX_MS = 15 * 60_000;
/** The shared copy (lib/kv.ts) keeps only the candles after the committed file, plus this overlap. */
const SHARED_KEY = "animr:candles:recent";
const SHARED_OVERLAP_S = 48 * HOUR;
/** One instance refreshes at a time; the others keep their copy and look again this soon. */
const REFRESH_LOCK = "candles:refresh";
const REFRESH_LOCK_MS = 30_000;

type GeckoOhlcv = {
  data?: { attributes?: { ohlcv_list?: unknown } };
  meta?: { base?: { address?: string }; quote?: { address?: string } };
};

/** A failed GeckoTerminal request; `retryAfterMs` comes from a 429's Retry-After header. */
class CandleFetchError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

function toCandle(row: unknown): Candle | null {
  if (!Array.isArray(row) || row.length < 6) return null;
  const [t, open, high, low, close, volume] = row.map(Number);
  const prices = [open, high, low, close];
  if (!Number.isInteger(t) || t % HOUR !== 0 || prices.some((p) => !(p > 0 && Number.isFinite(p)))) return null;
  return { t, open, high, low, close, volume: Number.isFinite(volume) && volume > 0 ? volume : 0 };
}

/** One page of hourly candles (newest first from the API, returned ascending). Throws on any problem. */
export async function fetchCandlePage(beforeTimestamp?: number): Promise<Candle[]> {
  const url =
    `${GECKO_POOLS}/${POOL}/ohlcv/hour?aggregate=1&limit=${PAGE_LIMIT}&currency=token&token=base` +
    (beforeTimestamp ? `&before_timestamp=${beforeTimestamp}` : "");
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const retryAfter = Number(res.headers.get("retry-after"));
    throw new CandleFetchError(
      `GeckoTerminal OHLCV responded ${res.status}`,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
    );
  }
  const body = (await res.json()) as GeckoOhlcv;
  // Prices must be CHOG (base) in WMON (quote), never the inverse.
  if (
    body.meta?.base?.address?.toLowerCase() !== CHOG.toLowerCase() ||
    body.meta?.quote?.address?.toLowerCase() !== WMON.toLowerCase()
  ) {
    throw new Error("GeckoTerminal OHLCV is not CHOG/WMON");
  }
  const rows = body.data?.attributes?.ohlcv_list;
  if (!Array.isArray(rows)) throw new Error("GeckoTerminal OHLCV has no ohlcv_list");
  return rows.flatMap((row) => toCandle(row) ?? []).sort((a, b) => a.t - b.t);
}

/** Newest candles first, paging back until `sinceT` is covered or `maxPages` pages were read. */
export async function fetchRecentCandles(sinceT = 0, maxPages = MAX_LIVE_PAGES): Promise<Candle[]> {
  const out = new Map<number, Candle>();
  let before: number | undefined;
  for (let page = 0; page < maxPages; page++) {
    const candles = await fetchCandlePage(before);
    for (const candle of candles) if (!out.has(candle.t)) out.set(candle.t, candle);
    const oldest = candles[0]?.t;
    if (oldest === undefined || candles.length < PAGE_LIMIT / 2 || oldest <= sinceT) break;
    before = oldest;
  }
  return [...out.values()].sort((a, b) => a.t - b.t);
}

const committedFile = fallback as CandleFile;

function committedCandles(): Candle[] {
  return committedFile.candles.flatMap((row) => toCandle(row) ?? []);
}

/**
 * Ascending hourly series with no holes: an hour without trades repeats the last close
 * (volume 0). With `untilT`, the series is carried forward to that hour as well.
 */
export function fillGaps(raw: Candle[], untilT?: number): Candle[] {
  const sorted = [...raw].sort((a, b) => a.t - b.t);
  const out: Candle[] = [];
  for (const candle of sorted) {
    const last = out[out.length - 1];
    if (last && candle.t <= last.t) continue;
    for (let t = last ? last.t + HOUR : candle.t; last && t < candle.t; t += HOUR) {
      const close = out[out.length - 1].close;
      out.push({ t, open: close, high: close, low: close, close, volume: 0 });
    }
    out.push(candle);
  }
  const last = out[out.length - 1];
  if (last && untilT !== undefined) {
    for (let t = last.t + HOUR; t <= untilT; t += HOUR) {
      out.push({ t, open: last.close, high: last.close, low: last.close, close: last.close, volume: 0 });
    }
  }
  return out;
}

/** The gap-filled hourly series plus what it is safe to conclude from it (the Daily Bell settles on it). */
export type CandleSeries = {
  /** Ascending, gap-filled (hours without trades repeat the last close, volume 0). Frozen. */
  candles: readonly Candle[];
  /** True when the data came from GeckoTerminal (now or via another instance's shared copy). */
  live: boolean;
  /**
   * When the data was fetched (ms): every trade before ~then is in it, so a missing hour before then
   * had no trades. The committed file's own fetch time when GeckoTerminal is unreachable.
   */
  fetchedAt: number;
  /** Open time (unix s) of the newest candle with trades, before gaps were carried forward. */
  lastRealT: number;
  /** Changes whenever the series does (length, last hour, or a revised recent close): keys derived caches. */
  fingerprint: string;
};

/** Open time of the last finished hour at `ms`. */
const lastClosedHour = (ms: number) => Math.floor(ms / 1000 / HOUR) * HOUR - HOUR;

function buildSeries(real: Candle[], fetchedAt: number, live: boolean): CandleSeries {
  // A live fetch reaches the last finished hour at fetch time (no trades since = the last close).
  const candles = Object.freeze(fillGaps(real, live ? lastClosedHour(fetchedAt) : undefined));
  const lastRealT = real.reduce((max, candle) => Math.max(max, candle.t), 0);
  const tail = candles.slice(-3).map((candle) => candle.close).join(",");
  const fingerprint = `${candles.length}:${candles[candles.length - 1]?.t ?? 0}:${lastRealT}:${tail}`;
  return { candles, live, fetchedAt, lastRealT, fingerprint };
}

function mergeCandles(...lists: (readonly Candle[] | undefined)[]): Candle[] {
  const merged = new Map<number, Candle>();
  for (const list of lists) for (const candle of list ?? []) merged.set(candle.t, candle);
  return [...merged.values()].sort((a, b) => a.t - b.t);
}

type SharedCandles = { fetchedAt: number; rows: [number, number, number, number, number, number][] };

async function readShared(): Promise<{ fetchedAt: number; candles: Candle[] } | null> {
  try {
    const shared = await getKv().get<SharedCandles>(SHARED_KEY);
    if (!shared || !Number.isFinite(shared.fetchedAt) || !Array.isArray(shared.rows)) return null;
    return { fetchedAt: shared.fetchedAt, candles: shared.rows.flatMap((row) => toCandle(row) ?? []) };
  } catch (error) {
    console.warn("[animr] Couldn't read the shared hourly candles:", (error as Error).message);
    return null;
  }
}

async function writeShared(fetchedAt: number, candles: Candle[], sinceT: number): Promise<void> {
  const rows = candles
    .filter((candle) => candle.t >= sinceT)
    .map((c): SharedCandles["rows"][number] => [c.t, c.open, c.high, c.low, c.close, c.volume]);
  await getKv()
    .set(SHARED_KEY, { fetchedAt, rows } satisfies SharedCandles)
    .catch((error) => console.warn("[animr] Couldn't store the shared hourly candles:", (error as Error).message));
}

type SeriesCache = { expires: number; series: CandleSeries };
const globalForCandles = globalThis as typeof globalThis & {
  __animrCandleSeries?: SeriesCache;
  __animrCandleInflight?: Promise<CandleSeries>;
  __animrCandleBackoff?: { until: number; failures: number };
};

/** Loads the series accepting data fetched at or after `minFetchedAt` (ms); never throws. */
async function loadSeries(now: number, minFetchedAt: number): Promise<SeriesCache> {
  const committed = committedCandles();
  const committedAt = Date.parse(committedFile.fetchedAt) || 0;
  const lastCommitted = committed[committed.length - 1]?.t ?? 0;
  const shared = await readShared();
  const known = mergeCandles(committed, shared?.candles);
  // Another instance refreshed recently enough: no GeckoTerminal request.
  if (shared && shared.fetchedAt >= minFetchedAt) {
    return { expires: shared.fetchedAt + CACHE_TTL_MS, series: buildSeries(known, shared.fetchedAt, true) };
  }
  const offline = (until: number): SeriesCache => ({
    expires: until,
    series: shared ? buildSeries(known, shared.fetchedAt, true) : buildSeries(committed, committedAt, false),
  });
  const backoff = globalForCandles.__animrCandleBackoff;
  if (backoff && backoff.until > now) return offline(backoff.until);
  const kv = getKv();
  const lock = await kv.acquireLock(REFRESH_LOCK, REFRESH_LOCK_MS).catch(() => "");
  if (lock === null) return offline(now + REFRESH_LOCK_MS);
  try {
    const lastKnown = known[known.length - 1]?.t ?? 0;
    // One page (1,000 hours) covers any gap a day-old deploy has; more only for an old committed file.
    const pages = lastClosedHour(now) - lastKnown < (PAGE_LIMIT - 24) * HOUR ? 1 : MAX_LIVE_PAGES;
    const recent = (await fetchRecentCandles(lastKnown, pages)).filter((candle) => candle.t <= lastClosedHour(now));
    if (recent.length === 0) throw new Error("GeckoTerminal returned no candles");
    const fetchedAt = Date.now();
    const merged = mergeCandles(known, recent);
    globalForCandles.__animrCandleBackoff = undefined;
    await writeShared(fetchedAt, merged, lastCommitted - SHARED_OVERLAP_S);
    return { expires: fetchedAt + CACHE_TTL_MS, series: buildSeries(merged, fetchedAt, true) };
  } catch (error) {
    const failures = (backoff?.failures ?? 0) + 1;
    const wait = Math.max(
      Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** (failures - 1)),
      Math.min(2 * BACKOFF_MAX_MS, (error as CandleFetchError).retryAfterMs ?? 0),
    );
    globalForCandles.__animrCandleBackoff = { until: now + wait, failures };
    console.warn(
      `[animr] Hourly candles unavailable (retry in ${Math.round(wait / 1000)}s), using ${shared ? "the shared copy" : "data/chog-ohlcv-1h.json"}:`,
      (error as Error).message,
    );
    return offline(now + wait);
  } finally {
    if (lock) await kv.releaseLock(REFRESH_LOCK, lock).catch(() => {});
  }
}

/**
 * Real hourly CHOG/WMON candles from the committed history up to the last finished hour, with the
 * metadata the Daily Bell needs to settle safely. Cached ~10 min per instance and shared between
 * instances through lib/kv.ts; after a failure GeckoTerminal is retried with backoff (falls back to
 * the shared copy, else data/chog-ohlcv-1h.json; never throws). `minFetchedAt` (ms) asks for data
 * fetched at or after that time (refetched unless GeckoTerminal is backing off).
 * Uses the clock, so call it from route handlers or after connection(), not during a prerender.
 */
export async function getCandleSeries(options: { minFetchedAt?: number } = {}): Promise<CandleSeries> {
  const now = Date.now();
  const hit = globalForCandles.__animrCandleSeries;
  const backingOff = (globalForCandles.__animrCandleBackoff?.until ?? 0) > now;
  const tooOld = options.minFetchedAt !== undefined && (hit?.series.fetchedAt ?? 0) < options.minFetchedAt && !backingOff;
  if (hit && hit.expires > now && !tooOld) return hit.series;
  const inflight = globalForCandles.__animrCandleInflight;
  if (inflight) return inflight;
  const minFetchedAt = Math.min(now, options.minFetchedAt ?? now - CACHE_TTL_MS);
  const run = loadSeries(now, minFetchedAt)
    .then((cache) => {
      globalForCandles.__animrCandleSeries = cache;
      return cache.series;
    })
    .finally(() => {
      globalForCandles.__animrCandleInflight = undefined;
    });
  globalForCandles.__animrCandleInflight = run;
  return run;
}

/**
 * Real hourly CHOG/WMON candles from the committed history up to the last finished hour
 * (gap-filled; see getCandleSeries). Never throws.
 */
export async function getHourlyCandles(): Promise<Candle[]> {
  return (await getCandleSeries()).candles as Candle[];
}

/** Percent change from `from` to `to`, rounded to 4 decimals (the precision every replay uses). */
export function pctChange(to: number, from: number): number {
  return Math.round((to / from - 1) * 1e6) / 1e4;
}

/**
 * The market as it looked at the close of candle `index`, in the agent's MarketSnapshot shape
 * (source "replay"; USD fields are null; fetchedAt is the candle's time, t).
 */
export function snapshotAt(candles: readonly Candle[], index: number): MarketSnapshot {
  const candle = candles[index];
  if (!candle) throw new RangeError(`No candle at index ${index}`);
  return {
    priceUsd: null,
    priceQuote: candle.close,
    change1hPct: index >= 1 ? pctChange(candle.close, candles[index - 1].close) : null,
    change24hPct: index >= 24 ? pctChange(candle.close, candles[index - 24].close) : null,
    volume24hUsd: null,
    liquidityUsd: null,
    source: "replay",
    fetchedAt: new Date(candle.t * 1000).toISOString(),
  };
}
