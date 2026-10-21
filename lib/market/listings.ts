import { cacheLife } from "next/cache";
import { appConfig } from "@/lib/config";

// Live Chog Genesis listings from OpenSea (API v2, chain "monad", collection "chog-genesis"). Server-only.
//
// Key: OPENSEA_API_KEY when set; otherwise a free agent key that OpenSea issues instantly (POST /api/v2/auth/keys,
// 600 reads/h, valid ~7 days), minted on first use and kept in memory until shortly before it expires. One refresh
// pages through every active listing (~7 requests for ~700 listings) and is cached for 5 minutes.
// Never throws: a failure comes back as { ok: false } (cached for a minute), and the page shows a quiet line.

const API = "https://api.opensea.io/api/v2";
const COLLECTION_SLUG = process.env.OPENSEA_COLLECTION_SLUG || "chog-genesis";
const PAGE_SIZE = 100;
/** Hard cap on pages per refresh (10,000 listings): the collection had ~700 in October 2026. */
const MAX_PAGES = 100;
const TIMEOUT_MS = 12_000;

/** One token's cheapest active listing. Plain JSON, so it can sit in the "use cache" store. */
export type Listing = {
  tokenId: number;
  /** Price in the currency's smallest unit, as a decimal string. */
  priceWei: string;
  /** Price in whole units (display and sorting; exact value in priceWei). */
  price: number;
  /** "MON", "WMON", ... as OpenSea reports it. */
  currency: string;
  decimals: number;
  /** Unix seconds the listing ends. */
  endTime: number;
  orderHash: string;
  seller: string;
};

export type ListingsResult =
  | { ok: true; listings: Listing[]; fetchedAt: string; source: "opensea" }
  | { ok: false; reason: "unconfigured" | "error"; fetchedAt: string };

type OpenSeaListing = {
  order_hash?: string;
  asset?: { identifier?: string; contract?: string };
  price?: { current?: { currency?: string; decimals?: number; value?: string } };
  remaining_quantity?: number;
  status?: string;
  protocol_data?: { parameters?: { offerer?: string; endTime?: string } };
};

// ---------------------------------------------------------------------------------------------------------------
// API key

type KeyState = { key: string; expiresAt: number };
const globalForMarket = globalThis as typeof globalThis & { __animrOpenSeaKey?: KeyState; __animrOpenSeaMint?: Promise<KeyState | null> };

/** Renew a minted key a day before OpenSea expires it. */
const KEY_MARGIN_MS = 24 * 3600_000;

async function mintFreeKey(): Promise<KeyState | null> {
  try {
    const res = await fetch(`${API}/auth/keys`, {
      method: "POST",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[animr] market: OpenSea free key request failed (HTTP ${res.status})`);
      return null;
    }
    const body = (await res.json()) as { api_key?: unknown; expires_at?: unknown };
    if (typeof body.api_key !== "string" || !body.api_key) return null;
    const expires = typeof body.expires_at === "string" ? Date.parse(body.expires_at) : NaN;
    return { key: body.api_key, expiresAt: Number.isFinite(expires) ? expires : Date.now() + 6 * 24 * 3600_000 };
  } catch (error) {
    console.warn("[animr] market: OpenSea free key request failed:", (error as Error).message);
    return null;
  }
}

async function apiKey(): Promise<string | null> {
  const configured = process.env.OPENSEA_API_KEY?.trim();
  if (configured) return configured;
  if (process.env.OPENSEA_AUTO_KEY === "0") return null;
  const held = globalForMarket.__animrOpenSeaKey;
  if (held && held.expiresAt - KEY_MARGIN_MS > Date.now()) return held.key;
  globalForMarket.__animrOpenSeaMint ??= mintFreeKey().finally(() => {
    globalForMarket.__animrOpenSeaMint = undefined;
  });
  const minted = await globalForMarket.__animrOpenSeaMint;
  if (minted) globalForMarket.__animrOpenSeaKey = minted;
  return minted?.key ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// Listings

function normalise(raw: OpenSeaListing, contract: string): Listing | null {
  const tokenId = Number(raw.asset?.identifier);
  const current = raw.price?.current;
  if (!Number.isSafeInteger(tokenId) || tokenId <= 0) return null;
  if (raw.asset?.contract && raw.asset.contract.toLowerCase() !== contract) return null;
  if (raw.status && raw.status !== "ACTIVE") return null;
  if (raw.remaining_quantity !== undefined && raw.remaining_quantity < 1) return null;
  if (!current?.value || !/^\d+$/.test(current.value)) return null;
  const decimals = Number.isInteger(current.decimals) ? (current.decimals as number) : 18;
  const price = Number(current.value) / 10 ** decimals;
  if (!(price > 0)) return null;
  return {
    tokenId,
    priceWei: current.value,
    price,
    currency: current.currency || "MON",
    decimals,
    endTime: Number(raw.protocol_data?.parameters?.endTime) || 0,
    orderHash: raw.order_hash ?? "",
    seller: raw.protocol_data?.parameters?.offerer ?? "",
  };
}

async function fetchAll(key: string, contract: string): Promise<Listing[]> {
  const best = new Map<number, Listing>();
  let next: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${API}/listings/collection/${COLLECTION_SLUG}/best`);
    url.searchParams.set("limit", String(PAGE_SIZE));
    if (next) url.searchParams.set("next", next);
    const res = await fetch(url, {
      headers: { accept: "application/json", "x-api-key": key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`OpenSea listings HTTP ${res.status}`);
    const body = (await res.json()) as { listings?: OpenSeaListing[]; next?: string | null };
    for (const raw of body.listings ?? []) {
      const listing = normalise(raw, contract);
      if (!listing) continue;
      // A token can carry several listings: keep its cheapest (same currency assumed; OpenSea reports MON here).
      const held = best.get(listing.tokenId);
      if (!held || listing.price < held.price) best.set(listing.tokenId, listing);
    }
    next = body.next ?? undefined;
    if (!next) break;
  }
  return [...best.values()].sort((a, b) => a.price - b.price || a.tokenId - b.tokenId);
}

/**
 * Every Chog Genesis token currently listed on OpenSea, one row per token (its cheapest listing), cheapest first.
 * Cached 5 minutes (a failure, 1 minute). Listings past their end time are still in here: filter with
 * `activeListings` at request time.
 */
export async function getListings(): Promise<ListingsResult> {
  "use cache";
  const contract = appConfig.chogNft?.toLowerCase();
  // `fetchedAt` is the refresh time of this cached entry, not a per-request clock.
  const fetchedAt = new Date().toISOString();
  if (!contract || appConfig.network !== "mainnet") {
    cacheLife("hours");
    return { ok: false, reason: "unconfigured", fetchedAt };
  }
  const key = await apiKey();
  if (!key) {
    cacheLife({ stale: 30, revalidate: 60, expire: 300 });
    return { ok: false, reason: "unconfigured", fetchedAt };
  }
  try {
    const listings = await fetchAll(key, contract);
    cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
    return { ok: true, listings, fetchedAt, source: "opensea" };
  } catch (error) {
    // A minted key that OpenSea stopped honouring is dropped, so the next refresh mints a fresh one.
    if (!process.env.OPENSEA_API_KEY && /HTTP 40[13]/.test((error as Error).message)) {
      globalForMarket.__animrOpenSeaKey = undefined;
    }
    console.warn("[animr] market: couldn't read OpenSea listings:", (error as Error).message);
    cacheLife({ stale: 30, revalidate: 60, expire: 300 });
    return { ok: false, reason: "error", fetchedAt };
  }
}

/** Listings still open at `nowSec` (unix seconds; read it at request time, after `connection()`). */
export function activeListings(listings: readonly Listing[], nowSec: number): Listing[] {
  return listings.filter((listing) => !listing.endTime || listing.endTime > nowSec);
}

/** The marketplace page for one token (appConfig.marketplaceUrlTemplate, OpenSea by default). */
export function itemUrl(tokenId: number): string {
  return appConfig.marketplaceUrlTemplate
    .replace("{contract}", appConfig.chogNft ?? "")
    .replace("{tokenId}", String(tokenId));
}

/** The collection's OpenSea page. */
export const COLLECTION_URL = `https://opensea.io/collection/${COLLECTION_SLUG}`;
