import { connection } from "next/server";
import { rateLimit } from "@/lib/bell/http";
import { getVersusCounts } from "@/lib/rewind/counters";
import type { VersusStats } from "@/lib/rewind/types";
import { CACHE_STATS, LIMITS, json, versusErrorResponse } from "../http";

/** VERSUS totals for /stats: fresh bouts dealt and first picks recorded, across every server. */
export async function GET(request: Request) {
  await connection();
  const limited = await rateLimit(request, "versus-stats", LIMITS.stats);
  if (limited) return limited;
  try {
    return json((await getVersusCounts()) satisfies VersusStats, CACHE_STATS);
  } catch (error) {
    return versusErrorResponse(error, "Couldn't load the VERSUS totals.");
  }
}
