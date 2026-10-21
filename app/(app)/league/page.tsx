import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LeagueBoard, LeagueSkeleton } from "@/components/dna/league-board";
import { buildLeagueIndex } from "@/components/dna/league-index";

export const metadata: Metadata = {
  title: "League",
  description:
    "All 1,969 Chog NFTs are traders: each one's traits compile into a trading genome, replayed on real $CHOG candles and ranked against just holding. No wallet needed.",
};

/** Every Chog ranked by its genome's simulated edge. Static: the trait/name index comes from the frozen snapshot. */
export default function LeaguePage() {
  const index = buildLeagueIndex();
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 pt-12 pb-20 sm:px-6 sm:pt-16">
      <header className="mb-8">
        <p className="eyebrow">Every Chog is a trader · no wallet needed</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">The League</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-pretty text-muted">
          Each Chog&apos;s 13 traits compile into a trading genome. All 1,969 run over the same real $CHOG chart and are
          ranked by how they did against simply holding. Find yours, filter by trait, or press Random.{" "}
          <Link href="/traits" className="font-medium whitespace-nowrap text-accent-strong hover:underline">
            Which traits win? →
          </Link>
        </p>
      </header>

      {/* Two rankings: every Chog's trait genome (simulated) and the claimed Chogs' live agents. */}
      <nav aria-label="Rankings" className="mb-6 flex flex-wrap items-center gap-2">
        <span aria-current="page" className="rounded-lg bg-accent/15 px-3 py-1.5 text-sm font-medium text-foreground">
          The League · all 1,969 Chogs
        </span>
        <Link
          href="/leaderboard"
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
        >
          Live agents
        </Link>
      </nav>

      {/* LeagueBoard reads its filters from the URL (useSearchParams), so it renders behind a boundary. */}
      <Suspense fallback={<LeagueSkeleton />}>
        <LeagueBoard index={index} />
      </Suspense>
    </div>
  );
}
