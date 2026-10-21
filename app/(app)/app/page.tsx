import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BellStrip } from "@/components/bell/bell-strip";
import { ChogLookup, ChogLookupSkeleton, type LookupHeader } from "@/components/chog-lookup";
import { YourChogs } from "@/components/your-chogs";
import { allChogs } from "@/lib/dna/chogs";

export const metadata: Metadata = {
  title: "Find a Chog",
  description:
    "Look up any Chog: its trading DNA and League rank, its Daily Bell call, its ERC-6551 wallet and its AI trader. Holders create the wallet, deposit $CHOG and claim the AI.",
};

export const viewport: Viewport = {
  themeColor: "#0d0c11",
  colorScheme: "dark",
};

/** The page's title block; ChogLookup renders it around the search box (its aside). */
const HEADER: LookupHeader = {
  title: "Find a Chog",
  lead: (
    <>
      Every Chog Genesis NFT is already a trader. Look one up to see its trading DNA, League rank, Daily Bell call and
      its own wallet.{" "}
      <Link href="/" className="v2-link whitespace-nowrap">
        New here? How Animr works →
      </Link>
    </>
  ),
};

/**
 * Your Chogs (/app): the lookup (any Chog's DNA, wallet and AI; its owner creates, funds and activates the wallet here),
 * today's Bell, and the connected holder's own Chogs.
 */
export default function FindChogPage() {
  // Each token's marketplace number ("CHOG #1462" is token #1), so the lookup can point from one to the other.
  const metadataIds = allChogs().map((chog) => Number(chog.metadataId) || 0);
  return (
    <div className="v2-shell">
      {/* The header with its search box, then the result. ChogLookup reads ?id= (useSearchParams), so it streams in
          behind this boundary; the fallback carries the same h1. */}
      <Suspense fallback={<ChogLookupSkeleton header={HEADER} />}>
        <ChogLookup metadataIds={metadataIds} header={HEADER} />
      </Suspense>

      {/* Today's Bell: rides-open or next-Bell countdown and yesterday's best call, linking to /bell. */}
      <BellStrip className="mt-10" />

      {/* The connected wallet's Chogs as trader cards (#your-chogs); an invitation to connect otherwise. */}
      <YourChogs className="v2-section" />
    </div>
  );
}
