import type { TradingStyle } from "@/lib/agent/types";
import { FLAGGED_TOKEN_IDS } from "@/lib/brand-safety";
import { getChog } from "@/lib/dna/chogs";
import { getPopulation } from "@/lib/dna/population";
import type { ReplayWindow } from "@/lib/dna/types";
import { loadVisibility } from "@/lib/visibility";
import { DEFAULT_WINDOW } from "@/components/dna/shared";
import { activeListings, getListings, itemUrl } from "./listings";

// "Best traders for sale": live listings joined with the League (simulated vs holding, rank, style, persona name).
// Server-only and request-time (the opt-out list and the listing end times are read per request): call it after
// `await connection()`. `nowSec` defaults to the request's clock.

export type MarketRow = {
  tokenId: number;
  /** Persona name, e.g. "Rocket Ears". */
  name: string;
  /** The number in its metadata name ("CHOG #1462" -> 1462), or 0. */
  nameNumber: number;
  image: string;
  archetype: string;
  style: TradingStyle;
  /** Simulated vs holding over the League window, in percent. */
  edgePct: number;
  /** League rank among all 1,969 (1 = best). */
  rank: number;
  price: number;
  priceWei: string;
  currency: string;
  buyUrl: string;
  /** May carry the "Best value" mark (brand-safety flagged art never gets a featured mark). */
  featurable: boolean;
};

export type MarketBoard =
  | { status: "ok"; rows: MarketRow[]; total: number; window: ReplayWindow; fetchedAt: string }
  | { status: "unavailable"; reason: "unconfigured" | "error" };

export async function getMarketBoard(nowSec = Math.floor(Date.now() / 1000)): Promise<MarketBoard> {
  const [listings, population, visibility] = await Promise.all([
    getListings(),
    getPopulation(DEFAULT_WINDOW),
    loadVisibility(),
  ]);
  if (!listings.ok) return { status: "unavailable", reason: listings.reason };
  const byId = new Map(population.rows.map((row) => [row.tokenId, row]));
  const rows: MarketRow[] = [];
  for (const listing of activeListings(listings.listings, nowSec)) {
    if (visibility.isHidden(listing.tokenId, "list")) continue;
    const row = byId.get(listing.tokenId);
    if (!row) continue;
    rows.push({
      tokenId: row.tokenId,
      name: row.name,
      nameNumber: Number(getChog(row.tokenId)?.metadataId) || 0,
      image: row.image,
      archetype: row.archetype,
      style: row.style,
      edgePct: row.edgePct,
      rank: row.rank,
      price: listing.price,
      priceWei: listing.priceWei,
      currency: listing.currency,
      buyUrl: itemUrl(row.tokenId),
      featurable: !FLAGGED_TOKEN_IDS.has(row.tokenId),
    });
  }
  rows.sort((a, b) => b.edgePct - a.edgePct || a.price - b.price);
  return { status: "ok", rows, total: population.rows.length, window: population.window, fetchedAt: listings.fetchedAt };
}

/** One Chog's live listing (cheapest, still open), or null: for a "Listed for X MON" line on its profile. */
export async function getListingFor(tokenId: number, nowSec = Math.floor(Date.now() / 1000)) {
  const listings = await getListings();
  if (!listings.ok) return null;
  const listing = activeListings(listings.listings, nowSec).find((item) => item.tokenId === tokenId);
  return listing ? { ...listing, buyUrl: itemUrl(tokenId) } : null;
}
