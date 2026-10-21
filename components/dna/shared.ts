import type { TradingStyle } from "@/lib/agent/types";
import { isFlaggedTokenId } from "@/lib/brand-safety";

// Shared by the DNA UI (genome card, Time Machine, league, Trait Alpha). Safe on server and client.

/** Every replay and league number carries this label: it is a simulation, not a track record. */
export const SIM_LABEL = "Simulated on real $CHOG candles (1% fee + impact)";

/** Next to league-wide results: the gene table was tuned on the same candles it is scored on. */
export const IN_SAMPLE_NOTE = "The gene rules were designed on this same history; past simulated results don't predict future ones.";

/** Chog Genesis token ids run 1–1969; the DNA engine covers exactly these. */
export const CHOG_COUNT = 1969;

/**
 * A Chog's marketplace name, "CHOG #1312" (the number in its metadata name; `nameNumbers[id - 1]`). Never its
 * token id dressed as a name: without a name number it falls back to "token 1820".
 */
export function chogNumberLabel(tokenId: number, nameNumbers?: readonly number[] | null): string {
  const n = nameNumbers?.[tokenId - 1];
  return n ? `CHOG #${n}` : `token ${tokenId}`;
}

/** "Sep 6 – Oct 21" for a replay window (unix seconds). */
export function windowDates(window: { from: number; to: number }): string {
  return `${formatDay(window.from)} – ${formatDay(window.to)}`;
}

export const WINDOWS = ["30d", "45d", "max"] as const;
export type WindowKey = (typeof WINDOWS)[number];
export const DEFAULT_WINDOW: WindowKey = "45d";
export const WINDOW_LABEL: Record<WindowKey, string> = { "30d": "30 days", "45d": "45 days", max: "All" };

export function parseWindow(raw: string | null | undefined): WindowKey {
  return (WINDOWS as readonly string[]).includes(raw ?? "") ? (raw as WindowKey) : DEFAULT_WINDOW;
}

/** A trading style's v2 badge tone (components/v2): violet runs hot, teal runs cool, balanced stays neutral. */
export const STYLE_TONE: Record<TradingStyle, string> = {
  aggressive: "v2-badge--violet",
  balanced: "",
  cautious: "v2-badge--teal",
};

/** Canonical token id (1–1969) from a route param or user input ("7", "#7", "007"), else null. */
export function parseChogId(raw: string | number | null | undefined): number | null {
  const text = String(raw ?? "").trim().replace(/^#/, "");
  if (!/^\d{1,5}$/.test(text)) return null;
  const id = Number(text);
  return id >= 1 && id <= CHOG_COUNT ? id : null;
}

/**
 * A random token id, different from `exclude`, never a Chog whose art carries flagged words
 * (lib/brand-safety.ts) nor one in `hidden` (its holder hid it: components/hidden-chogs.ts). Event handlers only:
 * never call it while rendering.
 */
export function randomChogId(exclude?: number, hidden?: ReadonlySet<number>): number {
  const ok = (id: number) => id !== exclude && !isFlaggedTokenId(id) && !hidden?.has(id);
  for (let tries = 0; tries < 256; tries++) {
    const id = 1 + Math.floor(Math.random() * CHOG_COUNT);
    if (ok(id)) return id;
  }
  // Practically never reached: a scan from a random start, so it always ends.
  const start = Math.floor(Math.random() * CHOG_COUNT);
  for (let i = 0; i < CHOG_COUNT; i++) {
    const id = 1 + ((start + i) % CHOG_COUNT);
    if (ok(id)) return id;
  }
  return exclude === 1 ? 2 : 1;
}

/** Text color for an edge vs holding: green above, red below, muted at ~0. */
export function edgeTone(pct: number | null | undefined): string {
  if (typeof pct !== "number" || !Number.isFinite(pct) || Math.abs(pct) < 0.005) return "text-muted";
  return pct > 0 ? "text-success" : "text-danger";
}

/** "+9.1%" with a real minus sign, for big display numbers. */
export function signedPct(pct: number, digits = 1): string {
  if (!Number.isFinite(pct)) return "—";
  const rounded = Math.abs(pct) < 0.5 * 10 ** -digits ? 0 : pct;
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded).toFixed(digits)}%`;
}

const DAY_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const HOUR_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

/** "Sep 16" (UTC) from unix seconds. */
export function formatDay(t: number): string {
  return DAY_FMT.format(t * 1000);
}

/** "Sep 16, 14:00 UTC" from unix seconds. */
export function formatHour(t: number): string {
  return `${HOUR_FMT.format(t * 1000)} UTC`;
}

/** Prices are tiny fractions of a MON: show significant digits. */
export function formatPrice(value: number): string {
  return Number.isFinite(value) ? new Intl.NumberFormat("en-US", { maximumSignificantDigits: 4 }).format(value) : "—";
}

/** Thousands separators, no decimals by default: "1,969". */
export function formatInt(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}
