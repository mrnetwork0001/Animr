import { type WindowKey, parseWindow } from "@/lib/dna/backtest";

// Shared by the /api/dna/* routes. Every response is public data, so CDNs may cache it:
// league numbers change once an hour (a new candle), a genome only with a new GENOME_VERSION.

/** Replays, the league and Trait Alpha. */
export const CACHE_HOURLY = "public, max-age=60, s-maxage=300, stale-while-revalidate=3600";
/** Genomes (a pure function of frozen traits). */
export const CACHE_GENOME = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

export function json(body: unknown, cacheControl: string): Response {
  return Response.json(body, { headers: { "Cache-Control": cacheControl } });
}

export function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/** A Chog Genesis token id (1-1969) from a path segment, or null. */
export function chogId(raw: string): number | null {
  if (!/^\d{1,4}$/.test(raw)) return null;
  const id = Number(raw);
  return id >= 1 && id <= 1969 ? id : null;
}

/** ?window=30d|45d|max (default 45d), or null when unknown. */
export function windowParam(request: Request): WindowKey | null {
  return parseWindow(new URL(request.url).searchParams.get("window"));
}

export const BAD_ID = "Token id must be a Chog Genesis id from 1 to 1969.";
export const BAD_WINDOW = "window must be 30d, 45d or max.";
export const HIDDEN_CHOG = "This Chog's holder took it out of Animr's public pages, so its replay doesn't show.";
