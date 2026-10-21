import { connection } from "next/server";
import { getListingFor } from "@/lib/market/board";
import { formatListingPrice } from "./format";

/**
 * "Listed for 5,664 MON on OpenSea ↗" when the Chog has a live listing; nothing otherwise (or when OpenSea can't be
 * read). Server component: render it inside a <Suspense fallback={null}> on the Chog's page.
 */
export async function ListedFor({ tokenId, className = "" }: { tokenId: number | string; className?: string }) {
  await connection();
  const listing = await getListingFor(Number(tokenId));
  if (!listing) return null;
  return (
    <p className={`v2-muted text-[13.5px] ${className}`}>
      Listed for{" "}
      <span className="v2-num text-[var(--v2-ink)]">
        {formatListingPrice(listing.price)} {listing.currency}
      </span>{" "}
      <a href={listing.buyUrl} target="_blank" rel="noopener noreferrer" className="v2-link whitespace-nowrap">
        on OpenSea ↗
      </a>
    </p>
  );
}
