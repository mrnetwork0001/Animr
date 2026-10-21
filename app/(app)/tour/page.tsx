import type { Metadata, Viewport } from "next";
import { cacheLife } from "next/cache";
import { showcaseIds } from "@/components/landing/content";
import { guardLink, houseChog, randomChogPool, showcaseChog, signedPct } from "@/components/landing/showcase";
import { type TourAction, TOUR_STEP_COUNT } from "@/components/tour/steps";
import { type TourLive, TourGuide } from "@/components/tour/tour-guide";
import { PageHeader } from "@/components/v2";
import { DEFAULT_WINDOW } from "@/lib/dna/backtest";
import { leagueHeadline, windowLabel } from "@/lib/dna/headline";
import { getStanding } from "@/lib/dna/population";

export const metadata: Metadata = {
  title: "Judge tour",
  description:
    "A two-minute guided path through Animr: every Chog NFT is an AI trader with its own wallet. No Chog or wallet needed.",
};

export const viewport: Viewport = { themeColor: "#0d0c11" };

/** The showcase Chog's League edge vs holding (simulated), from the same cached League as /league; null if unknown. */
async function leagueEdge(tokenId: number): Promise<number | null> {
  "use cache";
  cacheLife("hours");
  try {
    return (await getStanding(tokenId, DEFAULT_WINDOW)).row.edgePct;
  } catch {
    return null;
  }
}

/**
 * The judge tour: nine stops, each opening the real page. The League lines come from the live League
 * (leagueHeadline(), "use cache" for hours: the same source as /league and the hero), the rest from committed data and
 * env (the showcase Chog, the House Chog, the deployed guard), so the page stays prerendered; any line whose data is
 * missing is left out.
 */
export default async function TourPage() {
  const star = showcaseChog(showcaseIds.hero);
  const [league, starEdge] = await Promise.all([leagueHeadline(), star ? leagueEdge(star.tokenId) : null]);
  const house = houseChog();
  const guard = guardLink();
  const pool = randomChogPool();

  const live: TourLive = {};
  if (league) {
    live.trader = `${league.total.toLocaleString("en-US")} Chogs, each with its own wallet address`;
    // Rounded like the hero and the League's field panel, so every page reads the same share.
    live.dna = `Simulated: ${Math.round(league.beatHoldPct)}% of Chogs beat holding (${windowLabel(league.from, league.to)})`;
  }
  if (star && starEdge !== null) {
    live.replay = `${star.name} · ${star.label}: ${signedPct(starEdge)} vs holding (simulated)`;
  }
  if (house) live.heist = `Defending: ${house.name} · ${house.label}`;
  if (guard) live.proof = `AnimrTradeGuard ${guard.short} on Monad mainnet`;

  const hrefs: Partial<Record<string, string>> = star ? { replay: `/replay/${star.tokenId}` } : {};
  const extras: Partial<Record<string, TourAction>> = house
    ? { proof: { label: `Open the House Chog, ${house.name}`, href: `/chog/${house.tokenId}` } }
    : {};

  return (
    <div className="v2-shell v2-shell--narrow pb-20">
      <PageHeader
        title="See Animr in two minutes"
        lead={`${TOUR_STEP_COUNT} short stops, no Chog or wallet needed. Each opens the real page; come back here for the next one.`}
      />
      <TourGuide live={live} pool={pool} fallbackId={showcaseIds.hero} hrefs={hrefs} extras={extras} />
    </div>
  );
}
