import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { LeaderboardSkeleton, LeaderboardStats, LeaderboardTable } from "@/components/leaderboard-table";
import { PageHeader, PillLink } from "@/components/v2";
import { allChogs } from "@/lib/dna/chogs";

export const metadata: Metadata = {
  title: "Claimed AIs",
  description:
    "Chogs whose holders claimed their AI on 0G Compute. Each trades the $CHOG in its own wallet, ranked against simply holding $CHOG.",
};

export const viewport: Viewport = { themeColor: "#0d0c11" };

/** Claimed Chogs' AIs (URL kept as /leaderboard); every Chog's trading DNA is ranked in the League. */
export default function LeaderboardPage() {
  // Each token's marketplace number ("CHOG #1462" is token 1), so a row can show the name marketplaces use.
  const nameNumbers = allChogs().map((chog) => Number(chog.metadataId) || 0);
  return (
    <div className="v2-shell flex-1 pb-20 sm:pb-28">
      <PageHeader
        title="Claimed AIs"
        lead={
          <>
            Chogs whose holders claimed their AI. Each trades the $CHOG in its own wallet, on paper or through
            AnimrTradeGuard, ranked vs holding.
          </>
        }
        // Two rankings: this one (claimed AIs) and the League (every Chog's trading DNA, simulated).
        actions={
          <PillLink href="/league" variant="glass" arrow>
            All 1,969 in the League
          </PillLink>
        }
        // Client data (react-query) renders behind a boundary so it never blocks the static shell; no numbers until
        // there is at least one claimed AI.
        aside={
          <Suspense fallback={null}>
            <LeaderboardStats />
          </Suspense>
        }
      />

      <div className="v2-section">
        <Suspense fallback={<LeaderboardSkeleton />}>
          <LeaderboardTable nameNumbers={nameNumbers} />
        </Suspense>
      </div>
    </div>
  );
}
