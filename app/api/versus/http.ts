import { BellError } from "@/lib/bell/fans";
import { VersusError } from "@/lib/rewind/errors";

// Shared by the /api/versus/* routes. Errors are always JSON { error } and never cached.

/**
 * A bout is a pure function of its id (and the frozen past candles), so CDNs may keep it, but only for an hour: a
 * holder who hides their Chog ("Hide my Chog") takes its bouts down with it.
 */
export const CACHE_BOUT = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";
/** Running totals. */
export const CACHE_STATS = "public, max-age=0, s-maxage=30, stale-while-revalidate=120";
/** Fresh random bouts and anything tied to the fan cookie. */
export const NO_STORE = "private, no-store";

/** Requests per minute per network (lib/bell/http.ts rateLimit), roomy enough for a judging room behind one IP. */
export const LIMITS = { deal: 60, view: 120, pick: 30, picksPerDay: 1000, newPickersPerDay: 100, stats: 120 } as const;

export const NEW_PICKERS_MESSAGE =
  "Too many new Versus players from this network today. Try another network, or come back tomorrow.";

export function json(body: unknown, cacheControl: string): Response {
  return Response.json(body, { headers: { "Cache-Control": cacheControl } });
}

export function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export function versusErrorResponse(error: unknown, fallback: string): Response {
  if (error instanceof VersusError || error instanceof BellError) return jsonError(error.status, error.message);
  console.error("[animr] VERSUS:", error);
  return jsonError(500, fallback);
}

/** A Chog Genesis token id (1-1969) from a query param: null when absent, undefined when invalid. */
export function tokenIdParam(raw: string | null): number | null | undefined {
  const value = raw?.trim() ?? "";
  if (!value) return null;
  if (!/^\d{1,4}$/.test(value)) return undefined;
  const id = Number(value);
  return id >= 1 && id <= 1969 ? id : undefined;
}

export const BAD_TOKEN_ID = "Chog token ids run from 1 to 1969.";
