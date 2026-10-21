import { type Candle, HOUR } from "../dna/history";
import { VERSUS_HOURS } from "./rules";

// Drama-ranked VERSUS windows: every 48 hours of real CHOG/WMON history scored for swings that mix
// pumps and dumps, best first. Pure (the caller caches the list per candle series; see lib/rewind/bout.ts).
// Pumps and dumps are scored symmetrically (log moves), so bull and bear drama rank alike.

/** Length of every bout, in hourly steps: frame 0 is a close, frames 1-48 are the 48 closes after it. */
export const WINDOW_HOURS = VERSUS_HOURS;
/** Hours of history a window needs before frame 0 (the replay's 24h change). */
export const WINDOW_WARMUP = 24;
/** Windows end at least this many hours before the newest candle (recent closes can still be revised). */
export const SETTLE_HOURS = 6;
/** Size of the drama list. */
export const DRAMA_WINDOWS = 40;
/** Windows in the list start at least this far apart, so no two share more than a third of their hours. */
const MIN_GAP_HOURS = 32;
/** A move must reverse by this much (%) to count as a direction change. */
const SWING_PCT = 5;
/** Wicks are clipped this far (share) past the candle body: one stray fill on a thin pool isn't drama. */
const WICK_CLIP = 0.08;
/** At most this many hours of a window may pass without a trade. */
const MAX_FLAT_HOURS = 8;
/** Both a pump and a dump of at least this much (%) for a window to qualify. */
const MIN_LEG_PCT = 4;

export type DramaWindow = {
  /** Index (in the gap-filled series) of the candle whose close is frame 0. */
  start: number;
  /** Unix hour of frame 0: the start of the 48 hours (what a bout id encodes). */
  hour: number;
  score: number;
  /** High/low range across the window (wicks clipped), %. */
  rangePct: number;
  /** Biggest rise from a running low and biggest drop from a running high (both positive), % of closes. */
  pumpPct: number;
  dumpPct: number;
  /** Direction changes of at least SWING_PCT. */
  swings: number;
};

/** First and last frame-0 indices a full window (with its warmup and settling margin) can start at. */
export function windowBounds(candles: readonly Candle[]): { first: number; last: number } {
  return { first: WINDOW_WARMUP, last: candles.length - 1 - SETTLE_HOURS - WINDOW_HOURS };
}

/** Direction changes of at least SWING_PCT along the closes (a zigzag; the first leg isn't a change). */
function countSwings(candles: readonly Candle[], start: number): number {
  // Log-symmetric: a +5% turn up and the matching turn down (−4.8%) count alike.
  const up = 1 + SWING_PCT / 100;
  const down = 1 / up;
  let dir = 0;
  let high = candles[start].close;
  let low = high;
  let swings = 0;
  for (let k = start + 1; k <= start + WINDOW_HOURS; k++) {
    const price = candles[k].close;
    if (dir === 0) {
      high = Math.max(high, price);
      low = Math.min(low, price);
      if (price <= high * down) [dir, low] = [-1, price];
      else if (price >= low * up) [dir, high] = [1, price];
    } else if (dir > 0) {
      if (price > high) high = price;
      else if (price <= high * down) [dir, low, swings] = [-1, price, swings + 1];
    } else if (price < low) {
      low = price;
    } else if (price >= low * up) {
      [dir, high, swings] = [1, price, swings + 1];
    }
  }
  return swings;
}

/** The window starting at candle `start` scored, or null when it doesn't qualify. */
export function scoreWindow(candles: readonly Candle[], start: number): DramaWindow | null {
  const end = start + WINDOW_HOURS;
  if (start < WINDOW_WARMUP || end >= candles.length) return null;
  const open = candles[start].close;
  let flat = 0;
  let high = open;
  let low = open;
  let runLow = open;
  let runHigh = open;
  let pump = 0;
  let dump = 0;
  for (let k = start + 1; k <= end; k++) {
    const candle = candles[k];
    if (!(candle.volume > 0)) flat++;
    const top = Math.max(candle.open, candle.close);
    const bottom = Math.min(candle.open, candle.close);
    high = Math.max(high, Math.min(candle.high, top * (1 + WICK_CLIP)));
    low = Math.min(low, Math.max(candle.low, bottom / (1 + WICK_CLIP)));
    const price = candle.close;
    if (price < runLow) runLow = price;
    if (price > runHigh) runHigh = price;
    pump = Math.max(pump, Math.log(price / runLow));
    dump = Math.max(dump, Math.log(runHigh / price));
  }
  if (flat > MAX_FLAT_HOURS) return null;
  const minLeg = Math.log(1 + MIN_LEG_PCT / 100);
  if (pump < minLeg || dump < minLeg) return null;
  const swings = countSwings(candles, start);
  const range = Math.log(high / low);
  // Both directions (geometric mean), more turns, then the raw range.
  const score = Math.sqrt(pump * dump) * (1 + 0.15 * Math.min(swings, 6)) + 0.25 * range;
  const pct = (logMove: number) => Math.round((Math.exp(logMove) - 1) * 1000) / 10;
  return {
    start,
    hour: (candles[start].t + HOUR) / HOUR,
    score: Math.round(score * 1e4) / 1e4,
    rangePct: pct(range),
    pumpPct: pct(pump),
    dumpPct: Math.round((1 - Math.exp(-dump)) * 1000) / 10,
    swings,
  };
}

/**
 * The `limit` most dramatic 48h windows of the series, best first, at least MIN_GAP_HOURS apart.
 * Ties break toward the older window, so the list is a pure function of the candles.
 */
export function rankDramaWindows(candles: readonly Candle[], limit = DRAMA_WINDOWS): DramaWindow[] {
  const { first, last } = windowBounds(candles);
  const scored: DramaWindow[] = [];
  for (let start = first; start <= last; start++) {
    const window = scoreWindow(candles, start);
    if (window) scored.push(window);
  }
  scored.sort((x, y) => y.score - x.score || x.start - y.start);
  const picked: DramaWindow[] = [];
  for (const window of scored) {
    if (picked.length >= limit) break;
    if (picked.some((other) => Math.abs(other.start - window.start) < MIN_GAP_HOURS)) continue;
    picked.push(window);
  }
  return picked;
}

// --- The reveal label ---------------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sep 30 – Oct 2, 2026" (UTC); both years when they differ. */
export function dateRangeLabel(fromSec: number, toSec: number): string {
  const from = new Date(fromSec * 1000);
  const to = new Date(toSec * 1000);
  const day = (date: Date) => `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
  const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
  return `${day(from)}${sameYear ? "" : `, ${from.getUTCFullYear()}`} – ${day(to)}, ${to.getUTCFullYear()}`;
}

/** "+31%", "−24%" (a real minus sign), "0%". */
export function signedWholePct(value: number): string {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}%` : rounded < 0 ? `−${-rounded}%` : "0%";
}

/**
 * Turning points of the closes: a zigzag that ignores reversals smaller than `thresholdLog` (a log move,
 * so up and down are alike), first and last close included.
 */
function pivots(closes: readonly number[], thresholdLog: number): number[] {
  const up = Math.exp(thresholdLog);
  const down = Math.exp(-thresholdLog);
  const out = [0];
  let dir = 0;
  let high = 0;
  let low = 0;
  for (let j = 1; j < closes.length; j++) {
    const price = closes[j];
    if (dir >= 0 && price > closes[high]) high = j;
    if (dir <= 0 && price < closes[low]) low = j;
    if (dir >= 0 && price <= closes[high] * down) {
      if (high > out[out.length - 1]) out.push(high);
      [dir, low] = [-1, j];
    } else if (dir <= 0 && price >= closes[low] * up) {
      if (low > out[out.length - 1]) out.push(low);
      [dir, high] = [1, j];
    }
  }
  const extreme = dir > 0 ? high : dir < 0 ? low : 0;
  if (extreme > out[out.length - 1]) out.push(extreme);
  if (closes.length - 1 > out[out.length - 1]) out.push(closes.length - 1);
  return out;
}

/**
 * The window's story in two legs (%): the two consecutive swings of its closes that moved the most
 * together (log scale, so a pump and a dump weigh alike), e.g. [31, -24]; [x, 0] for a one-way window.
 * Swings count from a reversal of a third of the window's range (5-25%), so a brief dip inside a big
 * pump doesn't split it in two.
 */
export function windowLegs(closes: readonly number[]): [number, number] {
  const range = Math.log(Math.max(...closes) / Math.min(...closes));
  const turns = pivots(closes, Math.min(Math.log(1.25), Math.max(Math.log(1.05), range / 3)));
  const legs = turns.slice(1).map((to, k) => closes[to] / closes[turns[k]]);
  if (legs.length === 0) return [0, 0];
  if (legs.length === 1) return [(legs[0] - 1) * 100, 0];
  let best = 0;
  let bestSize = -1;
  for (let k = 0; k + 1 < legs.length; k++) {
    const size = Math.abs(Math.log(legs[k])) + Math.abs(Math.log(legs[k + 1]));
    if (size > bestSize) [best, bestSize] = [k, size];
  }
  return [(legs[best] - 1) * 100, (legs[best + 1] - 1) * 100];
}

/**
 * "Sep 30 – Oct 2, 2026: +31% then −24% · −2% overall" for the closes of frames 0-48 starting at `fromSec`. The two
 * legs are the window's biggest back-to-back swings, not all of it, so the net move from the first close to the last
 * is always added: the headline never contradicts the price line under it.
 */
export function revealLabel(fromSec: number, toSec: number, closes: readonly number[]): string {
  const [first, second] = windowLegs(closes);
  const dates = dateRangeLabel(fromSec, toSec);
  const net = closes.length > 1 && closes[0] > 0 ? (closes[closes.length - 1] / closes[0] - 1) * 100 : 0;
  const overall = ` · ${signedWholePct(net)} overall`;
  if (Math.round(first) === 0 && Math.round(second) === 0) return `${dates}: flat${Math.round(net) === 0 ? "" : overall}`;
  if (Math.round(second) === 0) return `${dates}: ${signedWholePct(first)}${Math.round(net) === Math.round(first) ? "" : overall}`;
  return `${dates}: ${signedWholePct(first)} then ${signedWholePct(second)}${overall}`;
}
