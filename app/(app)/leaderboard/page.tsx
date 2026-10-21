import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LeaderboardSkeleton, LeaderboardTable } from "@/components/leaderboard-table";

export const metadata: Metadata = {
  title: "Live agents",
  description:
    "Claimed Chog NFTs whose AI on 0G Compute manages the $CHOG in their own wallet, ranked by how much it beats simply holding $CHOG.",
};

/** Claimed Chogs' live agents (URL kept as /leaderboard); every Chog's genome is ranked in the League. */
export default function LeaderboardPage() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 pt-12 pb-20 sm:px-6 sm:pt-16">
      <header className="mb-8">
        <p className="eyebrow">Claimed Chogs · AI on 0G Compute</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Live agents</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-pretty text-muted">
          These Chogs were claimed by their holders: an AI on 0G Compute manages the $CHOG in each one&apos;s own
          ERC-6551 wallet, with paper fills at live prices or, where the holder opted in, real trades through
          AnimrTradeGuard. They&apos;re ranked by the AI&apos;s edge over simply holding $CHOG. Like a trader? Buy the
          Chog: the AI and its portfolio come with it.
        </p>
      </header>

      {/* Two rankings: this one (live agents) and the League (every Chog's trait genome, simulated). */}
      <nav aria-label="Rankings" className="mb-6 flex flex-wrap items-center gap-2">
        <span aria-current="page" className="rounded-lg bg-accent/15 px-3 py-1.5 text-sm font-medium text-foreground">
          Live agents
        </span>
        <Link
          href="/league"
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
        >
          The League · all 1,969 Chogs
        </Link>
      </nav>

      {/* Client data (react-query) renders behind a boundary so it never blocks the static shell. */}
      <Suspense fallback={<LeaderboardSkeleton />}>
        <LeaderboardTable />
      </Suspense>
    </div>
  );
}
