import { BELL_HOUR_UTC, RIDE_WINDOW_HOURS } from "@/lib/bell/rules";
import type { BellCall, BellSummary, FanState } from "@/lib/bell/types";
import { formatPct } from "@/lib/format";

// Pure helpers for the Daily Bell UI. No clock reads: callers pass `now` (from useNow() in client
// components), so this module is safe in server components and during prerendering.

/** The engine's schedule (lib/bell/rules.ts): the ring hour (UTC) and how long rides stay open. */
export { BELL_HOUR_UTC, RIDE_WINDOW_HOURS };
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** How long after a scheduled ring the UI keeps saying "ringing" while the cron catches up. */
const RING_GRACE_MS = 2 * HOUR_MS;

/** A canonical UTC date ("2026-10-19") or null. */
export function parseDay(raw: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  // Rejects 2026-02-30 and friends: the round trip only matches real dates.
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === raw ? raw : null;
}

const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

export function shiftDay(day: string, days: number): string {
  return new Date(dayMs(day) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The next 15:00 UTC strictly after `now`. */
export function nextBellAt(now: number): number {
  const todays = Math.floor(now / DAY_MS) * DAY_MS + BELL_HOUR_UTC * HOUR_MS;
  return now < todays ? todays : todays + DAY_MS;
}

/** The UTC day of the latest scheduled ring at or before `now`. */
export function scheduledDay(now: number): string {
  return new Date(nextBellAt(now) - DAY_MS).toISOString().slice(0, 10);
}

/**
 * A ring is due but the latest Bell predates it (cron jitter, or the ring is running right now).
 * Only for a short grace period: before the first live Bell the latest one is an older replay.
 */
export function ringOverdue(latestDay: string, now: number): boolean {
  return latestDay < scheduledDay(now) && now - (nextBellAt(now) - DAY_MS) < RING_GRACE_MS;
}

const shortDay = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const longDay = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" });

/** "Sun, Oct 19". */
export const formatDay = (day: string) => shortDay.format(dayMs(day));
/** "Sunday, October 19, 2026". */
export const formatLongDay = (day: string) => longDay.format(dayMs(day));
/** "18:00 UTC". */
export const formatUtcTime = (iso: string) => `${clock.format(Date.parse(iso))} UTC`;

/** When the Bell of `day` rings (ms): 15:00 UTC. */
export const bellRingsAt = (day: string) => dayMs(day) + BELL_HOUR_UTC * HOUR_MS;

/**
 * "today's Bell" / "tomorrow's Bell" in the viewer's own calendar, else "the Bell of Tue, Oct 20". Pass the browser
 * clock (useNow); with null (server, hydration) it names the date.
 */
export function bellWhen(day: string, now: number | null): string {
  if (now !== null) {
    const date = (ms: number) => new Date(ms).toDateString();
    const ring = date(bellRingsAt(day));
    if (ring === date(now)) return "today's Bell";
    if (ring === date(now + DAY_MS)) return "tomorrow's Bell";
  }
  return `the Bell of ${formatDay(day)}`;
}

/** A whole-$CHOG amount from the API ("5000") for display: "5,000". */
export function formatChog(amount: string): string {
  const value = Number(amount);
  return Number.isFinite(value) ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value) : amount;
}

/** "07:04:09" (hours keep counting past 24). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** "7 hours 4 minutes", for screen readers and titles. */
export function spokenDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const parts = [h && `${h} hour${h === 1 ? "" : "s"}`, (m || !h) && `${m} minute${m === 1 ? "" : "s"}`];
  return parts.filter(Boolean).join(" ");
}

/** "+4.5%" / "-7.0%"; "0.0%" never shows a sign. */
export function signedPct(value: number | null | undefined, digits = 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return formatPct(Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value, digits);
}

/** A call's miss, in percentage points of $CHOG's move, read as a %: "0.02%", "2.1%", "11%" ("missed by 2.1%"). */
export const formatErrorPts = (value: number) => `${value.toFixed(value < 1 ? 2 : value < 10 ? 1 : 0)}%`;

export const formatPoints = (value: number) => new Intl.NumberFormat("en-US").format(Math.round(value));

/** WMON per $CHOG is a small number, so show significant digits. */
export function formatPrice(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 4 }).format(value);
}

/** The call's distance from the real move, in percentage points (the API's, else derived). */
export function errorOf(call: BellCall, actualPct: number | null): number | null {
  if (typeof call.errorPts === "number") return call.errorPts;
  return actualPct === null ? null : Math.abs(call.forecastPct - actualPct);
}

/** Whether the call got the direction right (the API's verdict, else derived). */
export function hitOf(call: BellCall, actualPct: number | null): boolean | null {
  if (typeof call.hit === "boolean") return call.hit;
  return actualPct === null ? null : Math.sign(call.forecastPct) === Math.sign(actualPct);
}

export function fanName(fan: Pick<FanState, "fanId" | "nickname">): string {
  return fan.nickname?.trim() || `Anon fan ${fan.fanId.slice(-4)}`;
}

export const hitRate = (hits: number, calls: number) => (calls > 0 ? Math.round((hits / calls) * 100) : 0);

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

type Line = (v: { call: string; actual: string; err: string; conviction: string }) => string;

const ORACLE_LINES: Line[] = [
  (v) => `Called ${v.call}. The candle printed ${v.actual}. Missed by ${v.err}. Bow.`,
  (v) => `Missed by ${v.err}. I don't predict the market, I schedule it.`,
  (v) => `The crowd guessed. I knew. ${v.call} called, ${v.actual} delivered.`,
  (v) => `${v.call} at the Bell, ${v.actual} at the close. Screenshot this.`,
  (v) => `Only ${v.err} off the real move. Somebody frame this call.`,
];

const REKT_LINES: Line[] = [
  (v) => `I called ${v.call}. $CHOG did ${v.actual}. I am a clown in a nice hat.`,
  (v) => `Missed by ${v.err}. My crystal ball was a gold tooth.`,
  (v) => `${v.call} at ${v.conviction} conviction. The conviction was the problem.`,
  (v) => `The candle said ${v.actual}. I said ${v.call}. We are no longer speaking.`,
  (v) => `Missed by ${v.err}. Rebooting my brain. See you at the next Bell.`,
];

function line(lines: Line[], call: BellCall, actualPct: number, day: string): string {
  const pick = lines[hash(`${day}:${call.tokenId}`) % lines.length];
  return pick({
    call: signedPct(call.forecastPct),
    actual: signedPct(actualPct),
    err: formatErrorPts(errorOf(call, actualPct) ?? 0),
    conviction: `${Math.round(call.conviction * 100)}%`,
  });
}

/** The Best call's gloat, in the first person (deterministic per day and Chog). */
export const oracleLine = (call: BellCall, actualPct: number, day: string) => line(ORACLE_LINES, call, actualPct, day);
/** The Most Rekt Chog roasting itself. */
export const rektLine = (call: BellCall, actualPct: number, day: string) => line(REKT_LINES, call, actualPct, day);

/**
 * A Bell's bull and bear shares in whole percent (calls of exactly 0 are flat: neither). bearPct comes from the API;
 * data without it (dev samples) falls back to everything that isn't bull.
 */
export function herdSplit(bell: Pick<BellSummary, "bullPct" | "bearPct">): { bull: number; bear: number; flat: number } {
  const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));
  const bull = clamp(bell.bullPct);
  const bear = Math.min(100 - bull, clamp(bell.bearPct ?? 100 - bell.bullPct));
  return { bull, bear, flat: 100 - bull - bear };
}

/**
 * Both sides of the herd and which one the market sided with, in the same words either way: "54% called up, 45%
 * called down. $CHOG went down: the down side called it." Never a one-sided headline.
 */
export function herdLine(bell: Pick<BellSummary, "bullPct" | "bearPct">, actualPct: number): string {
  const { bull, bear } = herdSplit(bell);
  const split = `${bull}% called up, ${bear}% called down.`;
  if (signedPct(actualPct) === "0.0%") return `${split} $CHOG closed flat.`;
  const side = actualPct > 0 ? "up" : "down";
  return `${split} $CHOG went ${side}: the ${side} side called it.`;
}
