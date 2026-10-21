import { connection } from "next/server";
import { STATS_CACHE_SECONDS, getStats } from "@/components/stats/data";
import type { StatsResponse } from "@/components/stats/types";

/**
 * GET /api/stats -> StatsResponse (components/stats/types.ts): the numbers on /stats as JSON. Counts only (no fan
 * ids, IPs or addresses), recomputed at most once a minute per instance and CDN-cached as long.
 */
export async function GET() {
  await connection();
  try {
    return Response.json((await getStats()) satisfies StatsResponse, {
      headers: {
        "Cache-Control": `public, max-age=0, s-maxage=${STATS_CACHE_SECONDS}, stale-while-revalidate=${STATS_CACHE_SECONDS * 4}`,
      },
    });
  } catch (error) {
    console.error("[animr] /api/stats:", error);
    return Response.json(
      { error: "Couldn't count right now. Try again in a minute." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
