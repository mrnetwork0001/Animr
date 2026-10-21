import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BellStrip } from "@/components/bell/bell-strip";
import { ChogLookup, ChogLookupSkeleton, type LookupHeader } from "@/components/chog-lookup";
import { YourChogs } from "@/components/your-chogs";
import { allChogs } from "@/lib/dna/chogs";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Look up any Chog: its trading DNA and League rank, its Daily Bell call, its ERC-6551 wallet and its AI trader. Owners create the wallet, deposit $CHOG and wake the AI.",
};

export const viewport: Viewport = { themeColor: "#0d0c11", colorScheme: "dark" };

/** The page's title block; ChogLookup renders it around the search box (its aside). */
const HEADER: LookupHeader = {
  kicker: "Explore any Chog · no wallet needed",
  // The nav calls this page "Dashboard"; the heading says what to do here.
  title: <>Find any Chog&apos;s DNA, wallet and AI</>,
  lead: (
    <>
      Every Chog is already a trader: its traits compile into a trading genome that trades the real $CHOG chart in the{" "}
      <Link href="/league" className="v2-link">
        League
      </Link>
      . It also owns an ERC-6551 wallet: claim it and an AI on 0G Compute manages the $CHOG inside, with paper fills at
      live prices or, once its holder opts in, real trades through AnimrTradeGuard.{" "}
      <Link href="/" className="v2-link whitespace-nowrap">
        New here? Read how Animr works →
      </Link>
    </>
  ),
};

/**
 * The dashboard: the lookup (any Chog's DNA, wallet and AI; its owner creates, funds and activates the wallet here),
 * today's Bell, and the connected holder's own Chogs.
 */
export default function DashboardPage() {
  // Each token's marketplace number ("CHOG #1462" is token #1), so the lookup can point from one to the other.
  const metadataIds = allChogs().map((chog) => Number(chog.metadataId) || 0);
  return (
    <div className="v2-shell">
      {/* The header with its search box, then the result. ChogLookup reads ?id= (useSearchParams), so it streams in
          behind this boundary; the fallback carries the same h1. */}
      <Suspense fallback={<ChogLookupSkeleton header={HEADER} />}>
        <ChogLookup metadataIds={metadataIds} header={HEADER} />
      </Suspense>

      {/* Today's Bell: rides-open or next-Bell countdown and the last Oracle, linking to /bell. */}
      <BellStrip className="mt-10" />

      {/* The connected wallet's Chogs as trader cards (#your-chogs); an invitation to connect otherwise. */}
      <YourChogs className="v2-section" />
    </div>
  );
}
