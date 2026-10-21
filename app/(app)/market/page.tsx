import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { MarketBoard } from "@/components/market/market-board";
import { RankingsNav } from "@/components/dna/rankings-nav";
import { PageHeader, Skeleton } from "@/components/v2/primitives";
import { getMarketBoard } from "@/lib/market/board";
import { COLLECTION_URL } from "@/lib/market/listings";

export const metadata: Metadata = {
  title: "Best traders for sale",
  description:
    "Chog Genesis NFTs listed on OpenSea right now, ranked by how their trading DNA did against just holding $CHOG (simulated on real candles).",
};

export const viewport: Viewport = { themeColor: "#0d0c11" };

/** Live listings ranked by Trading DNA. The header is static; the listings stream in at request time. */
export default function MarketPage() {
  return (
    <div className="v2-shell pb-20 sm:pb-28">
      <PageHeader
        title="Best traders for sale"
        lead="Chogs listed on OpenSea right now, ranked by how their trading DNA did against just holding $CHOG."
        actions={<RankingsNav active="market" />}
      />
      {/* At least the skeleton's height, whatever streams in (the board, or a one-line note when OpenSea is quiet), so
          the footer never jumps while the listings load. */}
      <div className="min-h-[600px]">
        <Suspense fallback={<MarketSkeleton />}>
          <MarketSection />
        </Suspense>
      </div>
    </div>
  );
}

async function MarketSection() {
  // Listing end times and the "Hide my Chog" list are request data.
  await connection();
  const board = await getMarketBoard();

  if (board.status === "unavailable") {
    return (
      <p className="v2-muted mt-8 text-[15px]">
        Live listings appear here once OpenSea answers.{" "}
        <a href={COLLECTION_URL} target="_blank" rel="noopener noreferrer" className="v2-link whitespace-nowrap">
          Browse on OpenSea ↗
        </a>
      </p>
    );
  }
  if (board.rows.length === 0) {
    return (
      <p className="v2-muted mt-8 text-[15px]">
        No Chogs are listed right now. New listings show up here within 5 minutes.
      </p>
    );
  }
  return (
    <>
      <MarketBoard rows={board.rows} />
      <p className="v2-faint mt-5 text-[13.5px]">
        Rankings are simulated on past candles ({board.window.label.replace(/\s*\(.*\)$/, "")}); not financial advice.
        Prices from OpenSea, refreshed every 5 minutes.
      </p>
    </>
  );
}

function MarketSkeleton() {
  return (
    <div role="status" className="mt-8 sm:mt-10">
      <span className="v2-sr">Loading listings…</span>
      <div aria-hidden className="flex flex-wrap gap-3">
        <Skeleton className="h-11 w-36" />
        <Skeleton className="h-11 w-72" />
        <Skeleton className="h-11 w-40" />
      </div>
      <div aria-hidden className="v2-table-wrap mt-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex h-[60px] items-center gap-3 border-b border-[var(--v2-line-soft)] px-4">
            <Skeleton className="size-10 rounded-[10px]" />
            <Skeleton variant="text" className="w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}
