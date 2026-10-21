import { cacheLife } from "next/cache";
import { DEFAULT_WINDOW } from "./backtest";
import { getPopulation } from "./population";

// The League's headline numbers for static pages (the landing hero): the same getPopulation(DEFAULT_WINDOW) that
// GET /api/dna/population and /league serve, cached for hours so the page stays prerendered and refreshes in the
// background. Simulated on real $CHOG candles (1% fee + impact).

export type LeagueHeadline = {
  /** Chogs in the League (the whole collection). */
  total: number;
  /** Share of the League whose genome ended ahead of just holding, in % (one decimal, like the API). */
  beatHoldPct: number;
  /** The replay window, unix seconds. */
  from: number;
  to: number;
};

/** Null when the League can't be built (candles unreadable): callers then leave the numbers out, never guess. */
export async function leagueHeadline(): Promise<LeagueHeadline | null> {
  "use cache";
  cacheLife("hours");
  try {
    const { rows, stats, window } = await getPopulation(DEFAULT_WINDOW);
    return { total: rows.length, beatHoldPct: stats.beatHoldPct, from: window.from, to: window.to };
  } catch (error) {
    console.warn("[animr] Couldn't build the League headline:", (error as Error).message);
    return null;
  }
}

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const YEAR = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "UTC" });

/** "Sep 4 – Oct 19, 2026" from unix seconds. */
export function windowLabel(from: number, to: number): string {
  const [a, b] = [from * 1000, to * 1000];
  const fromYear = YEAR.format(a) === YEAR.format(b) ? "" : `, ${YEAR.format(a)}`;
  return `${DAY.format(a)}${fromYear} – ${DAY.format(b)}, ${YEAR.format(b)}`;
}
