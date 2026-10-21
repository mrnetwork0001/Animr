import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/v2";
import { VersusArena, VersusArenaSkeleton } from "@/components/versus/arena";
import { allChogs } from "@/lib/dna/chogs";
import { REPLAY } from "@/lib/dna/genome";

export const metadata: Metadata = {
  title: "Versus",
  description:
    "Two Chogs, two trading DNAs, the same hidden 48 hours of real $CHOG history. Pick the one that stacks more $CHOG, watch the race, then see the real dates. No wallet needed: points only.",
};

export const viewport: Viewport = { themeColor: "#0d0c11" };

/** Versus: two Chogs' trading DNA race the same hidden 48 hours of real $CHOG history; the visitor calls it first. */
export default function VersusPage() {
  // Each token's marketplace number ("CHOG #1462" is token 1): fighters show it, and the picker reads both.
  const metadataIds = allChogs().map((chog) => Number(chog.metadataId) || 0);
  return (
    <div className="v2-shell pb-20">
      <PageHeader
        title="Two Chogs. One chart. Who wins?"
        lead={
          <>
            Two Chogs get {REPLAY.startChog.toLocaleString("en-US")} $CHOG each and the same 48 hours of real $CHOG
            history, dates hidden. Pick the one that ends with more, watch them trade, then see when it really happened.
          </>
        }
      />

      <div className="v2-section">
        {/* The arena reads ?a=&b= (useSearchParams), so it streams in behind this boundary. */}
        <Suspense fallback={<VersusArenaSkeleton />}>
          <VersusArena metadataIds={metadataIds} />
        </Suspense>
      </div>
    </div>
  );
}
