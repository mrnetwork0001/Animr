import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { LeaderboardSkeleton, LeaderboardStats, LeaderboardTable } from "@/components/leaderboard-table";
import { Badge, PageHeader, PillLink, StatRow } from "@/components/v2";

export const metadata: Metadata = {
  title: "Live agents",
  description:
    "Claimed Chog NFTs whose AI on 0G Compute manages the $CHOG in their own wallet, ranked by how much it beats simply holding $CHOG.",
};

export const viewport: Viewport = { themeColor: "#0d0c11" };

const STATS_FALLBACK = [
  { key: "awake", label: "Agents awake", value: "…" },
  { key: "managed", label: "Managed", hint: "$CHOG-eq", value: "…" },
  { key: "best", label: "Best edge", value: "…" },
];

/** Claimed Chogs' live agents (URL kept as /leaderboard); every Chog's genome is ranked in the League. */
export default function LeaderboardPage() {
  return (
    <div className="v2-shell flex-1 pb-20 sm:pb-28">
      <PageHeader
        kicker={
          <>
            Live agents · AI on 0G Compute
            <Badge tone="teal" live className="ml-1">
              Live
            </Badge>
          </>
        }
        title="The AIs trading right now"
        lead={
          <>
            These Chogs were claimed by their holders: an AI on 0G Compute manages the $CHOG in each one&apos;s own
            ERC-6551 wallet, with paper fills at live prices or, where the holder opted in, real trades through
            AnimrTradeGuard. They&apos;re ranked by the AI&apos;s edge over simply holding $CHOG. Like a trader? Buy the
            Chog: the AI and its portfolio come with it.
          </>
        }
        // Two rankings: this one (live agents) and the League (every Chog's trait genome, simulated).
        actions={
          <PillLink href="/league" variant="glass" arrow>
            The League · all 1,969 Chogs
          </PillLink>
        }
        aside={
          // Client data (react-query) renders behind a boundary so it never blocks the static shell.
          <Suspense fallback={<StatRow boxed size="sm" stats={STATS_FALLBACK} />}>
            <LeaderboardStats />
          </Suspense>
        }
      />

      <div className="v2-section">
        <Suspense fallback={<LeaderboardSkeleton />}>
          <LeaderboardTable />
        </Suspense>
      </div>
    </div>
  );
}
