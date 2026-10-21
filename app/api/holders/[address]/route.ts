import { connection } from "next/server";
import { isAddress } from "viem";
import { rateLimit } from "@/lib/bell/http";
import { HoldingsError, type HoldingsResponse, holdingsOf } from "@/lib/holdings";

/** Requests per minute per network (lib/bell/http.ts rateLimit): a page polls about every 2 minutes. */
const LIMIT_PER_MINUTE = 60;

/** Per-address data that changes when its holder acts (a buy, a sale, a woken AI): the browser keeps it briefly. */
const CACHE_CONTROL = "private, max-age=10";

function jsonError(status: number, error: string, headers: HeadersInit = {}): Response {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/**
 * "Your Chogs": every Chog Genesis token `address` holds, each with its art, both numbers ("CHOG #1462 · token 1"),
 * its genome, its League place (simulated on real $CHOG candles), its call on the latest Daily Bell and its AI.
 * Best League rank first; Chogs their holder hid come last, marked `hidden`, without League place or Bell call.
 * Ownership is read from Monad through a shared owner map (lib/holdings.ts). -> HoldingsResponse
 */
export async function GET(request: Request, ctx: RouteContext<"/api/holders/[address]">) {
  await connection();
  const address = (await ctx.params).address.trim();
  if (!isAddress(address, { strict: false })) {
    return jsonError(400, "That isn't a wallet address: 0x followed by 40 hex characters.");
  }
  const limited = await rateLimit(request, "holders", LIMIT_PER_MINUTE).catch(() => null);
  if (limited) return limited;
  try {
    const holdings = await holdingsOf(address);
    return Response.json(holdings satisfies HoldingsResponse, { headers: { "Cache-Control": CACHE_CONTROL } });
  } catch (error) {
    if (error instanceof HoldingsError) {
      return jsonError(error.status, error.message, error.status === 503 ? { "Retry-After": "30" } : {});
    }
    console.error("[animr] /api/holders:", error);
    return jsonError(500, "Couldn't load this wallet's Chogs. Try again in a minute.");
  }
}
