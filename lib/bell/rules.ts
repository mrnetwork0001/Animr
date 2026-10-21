import type { BellCall } from "./types";

// Pure Daily Bell rules (no server imports, safe for client components): the schedule, scoring and
// the stats a Bell summary shows. Points are a game score, never money.

/** The Bell rings every day at 15:00 UTC... */
export const BELL_HOUR_UTC = 15;
/** ...and each call is settled by the real $CHOG/WMON price this many hours later. */
export const HORIZON_HOURS = 24;
/**
 * Fans can pick one Chog to ride for this long after the ring. A ride counts from the first hourly
 * close after it is taken (RIDE_COPY), so a late ride can't profit from the move it already saw.
 */
export const RIDE_WINDOW_HOURS = 12;
/** Past Bells replayed from real candles (genome calls only) so the history is never empty. */
export const REPLAY_DAYS = 14;
/** Forecasts are clamped to ±this many percent. */
export const MAX_FORECAST_PCT = 50;
/** Streak bonus per consecutive Bell ridden (after the first), capped. */
export const STREAK_BONUS_PER_DAY = 5;
export const STREAK_BONUS_MAX = 25;
/** Lower bounds of the forecast histogram buckets (the outer buckets catch everything beyond). */
export const HISTOGRAM_BUCKETS = [-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10] as const;

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/** Labels for Bell numbers, so every page says the same honest thing. */
export const BELL_COPY = {
  points: "Points only: a game score, never money.",
  settle: "Every call is settled by the real CHOG/WMON price 24h after the Bell.",
  replay: "Replayed Bell: calls rebuilt from real past $CHOG candles.",
  genome: "Called by its Trading DNA.",
  llm: "Called by its AI agent on 0G Compute.",
  live: "Provisional until the hourly close at the Bell's settlement.",
  scoring: "Points = max(0, 100 − 4 × miss in % points) + 20 for the right direction.",
  ride: "Your ride counts from the first hourly close after you pick, and scores when the call settles.",
} as const;

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor || 0;
}

/** UTC date, YYYY-MM-DD. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** A valid YYYY-MM-DD day, or null. */
export function parseDay(raw: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const ms = Date.parse(`${raw}T00:00:00Z`);
  return Number.isFinite(ms) && utcDay(ms) === raw ? raw : null;
}

export function addDays(day: string, days: number): string {
  return utcDay(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS);
}

/** When the Bell of `day` rings (ms). */
export function bellTime(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) + BELL_HOUR_UTC * HOUR_MS;
}

/** The next ring at or after `now` (ms). */
export function nextBellTime(now: number): number {
  const today = bellTime(utcDay(now));
  return now <= today ? today : today + DAY_MS;
}

/** points = max(0, 100 − 4 × |forecast − actual|) + 20 when the direction is right (hit). */
export function scoreCall(forecastPct: number, actualPct: number): { points: number; errorPts: number; hit: boolean } {
  const errorPts = round(Math.abs(forecastPct - actualPct));
  const hit = Math.sign(round(forecastPct)) === Math.sign(round(actualPct));
  return { points: Math.round(Math.max(0, 100 - 4 * errorPts) + (hit ? 20 : 0)), errorPts, hit };
}

/** Bonus points for a ride that extends a streak of `streak` consecutive Bells (this one included). */
export function streakBonus(streak: number): number {
  return Math.min(STREAK_BONUS_MAX, STREAK_BONUS_PER_DAY * Math.max(0, streak - 1));
}

export function clampForecast(pct: number): number {
  return round(Math.min(MAX_FORECAST_PCT, Math.max(-MAX_FORECAST_PCT, Number.isFinite(pct) ? pct : 0)));
}

export function histogram(calls: Pick<BellCall, "forecastPct">[]): { bucketPct: number; count: number }[] {
  const counts = new Map<number, number>(HISTOGRAM_BUCKETS.map((bucket) => [bucket, 0]));
  const [lowest] = HISTOGRAM_BUCKETS;
  const highest = HISTOGRAM_BUCKETS[HISTOGRAM_BUCKETS.length - 1];
  for (const { forecastPct } of calls) {
    const bucket = Math.min(highest, Math.max(lowest, Math.floor(forecastPct / 2) * 2));
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return HISTOGRAM_BUCKETS.map((bucketPct) => ({ bucketPct, count: counts.get(bucketPct) ?? 0 }));
}

/** Share of calls above 0, in percent. */
export function bullPct(calls: Pick<BellCall, "forecastPct">[]): number {
  return calls.length ? round((100 * calls.filter((call) => call.forecastPct > 0).length) / calls.length, 1) : 0;
}

/** Share of calls below 0, in percent. A call of exactly 0 is flat: neither bull nor bear. */
export function bearPct(calls: Pick<BellCall, "forecastPct">[]): number {
  return calls.length ? round((100 * calls.filter((call) => call.forecastPct < 0).length) / calls.length, 1) : 0;
}

/**
 * The Bell a ride books when no Bell is open for rides (the latest live Bell's window has closed, or there's no live
 * Bell yet), so a late ride never hits a closed door: today's Bell while it hasn't rung (rings at 15:00 UTC, or
 * any minute when the ring is running late), else tomorrow's. Its rides count from its ring.
 */
export function nextRideDay(now: number, latestLiveDay: string | null | undefined): string {
  const today = utcDay(now);
  return latestLiveDay === today ? addDays(today, 1) : today;
}

/** Stable per-Bell coin flip that breaks ties between identical calls (so #1 doesn't win every tie). */
export function tieBreak(day: string, tokenId: number): number {
  let h = 2166136261;
  for (const char of `${day}:${tokenId}`) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}

/** A thesis without its numbers, so "+2.1%" and "-3.4%" versions of one line count as the same line. */
export function thesisTemplate(thesis: string): string {
  return thesis.replace(/[+\-−]?\d+(?:[.,]\d+)?%?/g, "#").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Showcase picks: at most `perTemplate` calls with the same line (numbers aside), skipping `skip`ped Chogs. */
export function varied(calls: BellCall[], limit: number, { perTemplate = 2, skip }: { perTemplate?: number; skip?: (tokenId: number) => boolean } = {}): BellCall[] {
  const counts = new Map<string, number>();
  const picked: BellCall[] = [];
  for (const call of calls) {
    if (picked.length >= limit) break;
    if (skip?.(call.tokenId)) continue;
    const template = thesisTemplate(call.thesis);
    const seen = counts.get(template) ?? 0;
    if (seen >= perTemplate) continue;
    counts.set(template, seen + 1);
    picked.push(call);
  }
  return picked;
}

/** The boldest calls: largest |forecast|, then conviction (at most 2 per line, `skip`ped Chogs left out). */
export function boldest(calls: BellCall[], day: string, limit = 8, skip?: (tokenId: number) => boolean): BellCall[] {
  const sorted = [...calls].sort(
    (a, b) =>
      Math.abs(b.forecastPct) - Math.abs(a.forecastPct) ||
      b.conviction - a.conviction ||
      tieBreak(day, a.tokenId) - tieBreak(day, b.tokenId),
  );
  return varied(sorted, limit, { skip });
}

/**
 * Best call (closest) and Most Rekt (furthest; the more confident, the more rekt), among
 * the Chogs `skip` doesn't leave out (everyone when that leaves nobody).
 */
export function extremes(calls: BellCall[], day: string, skip?: (tokenId: number) => boolean): { oracle?: BellCall; mostRekt?: BellCall } {
  const scored = calls.filter((call) => call.errorPts !== undefined);
  const eligible = skip ? scored.filter((call) => !skip(call.tokenId)) : scored;
  const pool = eligible.length ? eligible : scored;
  const flip = (a: BellCall, b: BellCall) => tieBreak(day, a.tokenId) - tieBreak(day, b.tokenId);
  const oracle = [...pool].sort((a, b) => a.errorPts! - b.errorPts! || b.conviction - a.conviction || flip(a, b))[0];
  const mostRekt = [...pool].sort((a, b) => b.errorPts! - a.errorPts! || b.conviction - a.conviction || flip(a, b))[0];
  return { ...(oracle && { oracle }), ...(mostRekt && { mostRekt }) };
}
