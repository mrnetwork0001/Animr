import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, StatRow } from "@/components/v2";
import { VersusArena, VersusArenaSkeleton } from "@/components/versus/arena";
import { PICK_POINTS } from "@/components/versus/shared";
import { allChogs } from "@/lib/dna/chogs";
import { REPLAY } from "@/lib/dna/genome";

export const metadata: Metadata = {
  title: "VERSUS",
  description:
    "Two Chogs, two trading genomes, the same hidden 48 hours of real $CHOG history. Pick the one that stacks more $CHOG, watch the race, then see the real dates. No wallet needed: points only.",
};

export const viewport: Viewport = { themeColor: "#0d0c11" };

/** VERSUS: two Chogs' genomes race the same hidden 48 hours of real $CHOG history; the visitor calls it first. */
export default function VersusPage() {
  // Each token's marketplace number ("CHOG #1462" is token #1): fighters show both, and the picker reads both.
  const metadataIds = allChogs().map((chog) => Number(chog.metadataId) || 0);
  return (
    <div className="v2-shell pb-20">
      <PageHeader
        kicker="Rewind · VERSUS · no wallet needed"
        title="Two Chogs. One chart. Who wins?"
        lead={
          <>
            Every Chog&apos;s 13 traits compile into a trading genome. Two of them get the same{" "}
            {REPLAY.startChog.toLocaleString("en-US")} $CHOG and the same 48 hours of real CHOG/WMON history, with the
            dates hidden. Call the one that stacks more, watch both trade it hour by hour, and see the real dates at the
            KO.{" "}
            <Link href="/league" className="v2-link whitespace-nowrap">
              All 1,969 traders
            </Link>
          </>
        }
        aside={
          <StatRow
            boxed
            inline
            stats={[
              { label: "Hidden hours", value: "48", key: "w" },
              { label: "$CHOG each", value: REPLAY.startChog.toLocaleString("en-US"), key: "s" },
              { label: "Points a call", value: `+${PICK_POINTS}`, key: "p" },
            ]}
          />
        }
      />

      <div className="v2-section">
        {/* The arena reads ?a=&b= (useSearchParams), so it streams in behind this boundary. */}
        <Suspense fallback={<VersusArenaSkeleton />}>
          <VersusArena metadataIds={metadataIds} />
        </Suspense>
      </div>

      <p className="v2-note mt-10 max-w-3xl">
        Every bout is simulated on real $CHOG history (1% fee + impact): the same rules replay the League runs, no real
        trades and no tokens move. Picks earn points only, never money, and points have no cash value. Not affiliated
        with Chog.
      </p>
    </div>
  );
}
