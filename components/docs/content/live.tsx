import { DEFAULT_WINDOW } from "@/lib/dna/backtest";
import { leagueHeadline, windowLabel } from "@/lib/dna/headline";

const WINDOW_DAYS: Record<string, string> = { "30d": "30-day", "45d": "45-day", max: "full-history" };

/**
 * The League's current headline, from the same cached source as /league and the landing hero (lib/dna/headline.ts,
 * "use cache" for hours), so the docs never hard-code a share that moves every hour. Left out when it can't be built.
 */
export async function LeagueNow() {
  const league = await leagueHeadline();
  if (!league) return null;
  return (
    <p>
      <strong>Right now:</strong> over the {WINDOW_DAYS[DEFAULT_WINDOW] ?? DEFAULT_WINDOW} window (
      {windowLabel(league.from, league.to)}), {league.beatHoldPct}% of the {league.total.toLocaleString("en-US")} Chogs end
      ahead of just holding. Simulated on real $CHOG candles (1% fee + impact); it moves as the window rolls.
    </p>
  );
}
