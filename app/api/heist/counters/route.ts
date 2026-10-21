import { connection } from "next/server";
import { countersOf, readStats } from "@/lib/heist/store";
import type { HeistCounters } from "@/lib/heist/types";

/**
 * Today's heist counters only (no House wallet read, no Hall of Fame): the header's "Rob this Chog" badge asks for
 * this on every page, so it stays one KV read and is shared through the CDN for a few seconds. -> HeistCounters
 */
export async function GET() {
  await connection();
  try {
    const now = Date.now();
    return Response.json(countersOf(await readStats(now), now) satisfies HeistCounters, {
      headers: { "Cache-Control": "public, max-age=15, s-maxage=30, stale-while-revalidate=60" },
    });
  } catch (error) {
    console.error("[animr] /api/heist/counters:", error);
    return Response.json({ error: "Couldn't read today's heist counters." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
