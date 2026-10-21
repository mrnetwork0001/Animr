import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { VersusArena, VersusArenaSkeleton } from "@/components/versus/arena";
import { allChogs } from "@/lib/dna/chogs";
import { REPLAY } from "@/lib/dna/genome";

export const metadata: Metadata = {
  title: "VERSUS",
  description:
    "Two Chogs, two trading genomes, the same hidden 48 hours of real $CHOG history. Pick the one that stacks more $CHOG, watch the race, then see the real dates. No wallet needed: points only.",
};

/** VERSUS: two Chogs' genomes race the same hidden 48 hours of real $CHOG history; the visitor calls it first. */
export default function VersusPage() {
  // Each token's marketplace number ("CHOG #1462" is token #1): fighters show both, and the picker reads both.
  const metadataIds = allChogs().map((chog) => Number(chog.metadataId) || 0);
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 pt-10 pb-20 sm:px-6 sm:pt-14">
      <header className="mb-6 sm:mb-8">
        <p className="eyebrow">VERSUS · no wallet needed · points only</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Two Chogs. 48 hidden hours. Who stacks more $CHOG?
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-pretty text-muted">
          Every Chog&apos;s 13 traits compile into a trading genome. Two of them get the same{" "}
          {REPLAY.startChog.toLocaleString("en-US")} $CHOG and the same 48 hours of real CHOG/WMON history, with the dates
          hidden. Call the one that ends with more $CHOG than its rival,
          then watch both genomes trade it hour by hour. The real dates are revealed at the KO.{" "}
          <Link href="/league" className="font-medium whitespace-nowrap text-accent-strong hover:underline">
            All 1,969 traders →
          </Link>
        </p>
      </header>

      {/* The arena reads ?a=&b= (useSearchParams), so it streams in behind this boundary. */}
      <Suspense fallback={<VersusArenaSkeleton />}>
        <VersusArena metadataIds={metadataIds} />
      </Suspense>

      <p className="mt-10 text-xs text-pretty text-subtle">
        Every bout is simulated on real $CHOG history (1% fee + impact): the same rules replay the League runs, no real
        trades and no tokens move. Picks earn points only, never money, and points have no cash value. Not affiliated
        with Chog.
      </p>
    </div>
  );
}
