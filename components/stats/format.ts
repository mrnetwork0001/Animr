// Pure formatting for the /stats page (no clock reads): safe in server and client components.

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const DAY_LONG = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const CLOCK = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const INT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** "Oct 19" (UTC) from a YYYY-MM-DD day. */
export const formatDay = (day: string) => DAY.format(dayMs(day));

/** "Mon, Oct 19" (UTC). */
export const formatLongDay = (day: string) => DAY_LONG.format(dayMs(day));

/** "15:00 UTC" from an ISO time. */
export const formatClock = (iso: string) => `${CLOCK.format(Date.parse(iso))} UTC`;

/** "since Oct 19", or null before a number started counting. */
export const sinceLabel = (day: string | null) => (day ? `since ${formatDay(day)}` : null);

/** 1,284 / 12.9K / 1.2M: separators below 10,000, compact above. */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Math.abs(value) < 10_000 ? INT.format(value) : COMPACT.format(value);
}

/** "1 ride" / "3 rides". */
export const plural = (n: number, one: string, many = `${one}s`) => `${formatCount(n)} ${n === 1 ? one : many}`;

/** Small USD amounts keep their cents' fractions: $0, $0.0042, $0.31, $12.40. */
export function formatUsd(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "$0";
  if (usd < 0.0001) return "<$0.0001";
  const digits = usd < 0.01 ? 4 : usd < 1 ? 3 : 2;
  return `$${usd.toFixed(digits)}`;
}

/** "42%", "42.5%". */
export const formatPct = (pct: number) => `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
