import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LeagueBoard, LeagueField, LeagueFieldSkeleton, LeagueSkeleton } from "@/components/dna/league-board";
import { buildLeagueIndex } from "@/components/dna/league-index";
import { RankingsNav } from "@/components/dna/rankings-nav";
import { PageHeader } from "@/components/v2/primitives";

export const metadata: Metadata = {
  title: "League",
  description:
    "All 1,969 Chog NFTs are traders: each one's traits compile into a trading genome, replayed on real $CHOG candles and ranked against just holding. No wallet needed.",
};

export const viewport: Viewport = { themeColor: "#0d0c11" };

/** Every Chog ranked by its genome's simulated edge. Static: the trait/name index comes from the frozen snapshot. */
export default function LeaguePage() {
  const index = buildLeagueIndex();
  return (
    <div className="v2-shell pb-20 sm:pb-28">
      <PageHeader
        kicker="Meet · 1,969 AI traders"
        title="The League"
        lead={
          <>
            Each Chog&apos;s 13 traits compile into a trading genome. All 1,969 run over the same real $CHOG chart and are
            ranked by how they did against simply holding. Find yours, filter by trait, or press Random.{" "}
            <Link href="/traits" className="v2-link whitespace-nowrap">
              Which traits win?
            </Link>
          </>
        }
        actions={<RankingsNav active="league" />}
        // The field and the board read the window from the URL (useSearchParams), so both render behind a boundary.
        aside={
          <Suspense fallback={<LeagueFieldSkeleton />}>
            <LeagueField />
          </Suspense>
        }
      />

      <Suspense fallback={<LeagueSkeleton />}>
        <LeagueBoard index={index} />
      </Suspense>
    </div>
  );
}
