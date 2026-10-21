import type { Metadata, Viewport } from "next";
import { showcaseIds } from "@/components/landing/content";
import {
  guardLink,
  houseChog,
  leagueSnapshot,
  plainPct,
  randomChogPool,
  showcaseChog,
  signedPct,
} from "@/components/landing/showcase";
import { type TourAction, TOUR_STEP_COUNT } from "@/components/tour/steps";
import { type TourLive, TourGuide } from "@/components/tour/tour-guide";
import { PageHeader } from "@/components/v2";

export const metadata: Metadata = {
  title: "Judge tour",
  description:
    "A two-minute guided path through Animr: every Chog NFT is an AI trader with its own wallet. No Chog or wallet needed.",
};

export const viewport: Viewport = { themeColor: "#0d0c11" };

/**
 * The judge tour: nine stops, each opening the real page. The live lines are pure functions of committed data and env
 * (the League replayed on the committed candles, the showcase Chog, the House Chog, the deployed guard), so the page
 * prerenders; any line whose data is missing is left out.
 */
export default function TourPage() {
  const league = leagueSnapshot();
  const star = showcaseChog(showcaseIds.hero);
  const starEdge = star ? league?.standings.get(star.tokenId)?.edgePct : undefined;
  const house = houseChog();
  const guard = guardLink();
  const pool = randomChogPool();

  const live: TourLive = {};
  if (league) {
    live.trader = `${league.total.toLocaleString("en-US")} Chogs, each with its own wallet address`;
    live.dna = `Simulated: ${plainPct(league.beatHoldPct)} of Chogs beat holding (${league.window})`;
  }
  if (star && starEdge !== undefined) {
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
