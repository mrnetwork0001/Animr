import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BellStrip } from "@/components/bell/bell-strip";
import { ChogLookup, ChogLookupSkeleton } from "@/components/chog-lookup";
import { allChogs } from "@/lib/dna/chogs";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Look up any Chog: its trading DNA and League rank, its Daily Bell call, its ERC-6551 wallet and its AI trader. Owners create the wallet, deposit $CHOG and wake the AI.",
};

/** The dashboard: any Chog's wallet at a glance; its owner creates, funds and activates it here. */
export default function DashboardPage() {
  // Each token's marketplace number ("CHOG #1462" is token #1), so the lookup can point from one to the other.
  const metadataIds = allChogs().map((chog) => Number(chog.metadataId) || 0);
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-12 pb-20 sm:px-6 sm:pt-16">
      <header className="mb-8">
        <p className="eyebrow">Explore any Chog · no wallet needed</p>
        {/* The nav calls this page "Dashboard"; the heading says what to do here. */}
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Find any Chog&apos;s DNA, wallet and AI
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-pretty text-muted">
          Every Chog is already a trader: its traits compile into a trading genome that trades the real $CHOG chart in
          the{" "}
          <Link href="/league" className="font-medium text-accent-strong hover:underline">
            League
          </Link>
          . It also owns an ERC-6551 wallet: claim it and an AI on 0G Compute manages the $CHOG inside, with paper
          fills at live prices or, once its holder opts in, real trades through AnimrTradeGuard.{" "}
          <Link href="/" className="font-medium whitespace-nowrap text-accent-strong hover:underline">
            New here? Read how Animr works →
          </Link>
        </p>
      </header>

      {/* Today's Bell: rides-open or next-Bell countdown and the last Oracle, linking to /bell. */}
      <BellStrip className="mb-6" />

      {/* #lookup is a link target (e.g. /app?id=7#lookup from a Chog's profile). The offset clears the
          sticky header: two rows (about 103px) below md, one from md. */}
      <section id="lookup" aria-label="Chog lookup" className="scroll-mt-28 md:scroll-mt-24">
        {/* ChogLookup reads ?id= (useSearchParams), so it streams in behind this boundary. */}
        <Suspense fallback={<ChogLookupSkeleton />}>
          <ChogLookup metadataIds={metadataIds} />
        </Suspense>
      </section>
    </div>
  );
}
