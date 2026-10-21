import { connection } from "next/server";
import { cacheHeaders, errorResponse } from "@/lib/bell/http";
import { bellDays } from "@/lib/bell/store";
import type { BellDaysResponse } from "@/lib/bell/types";

/**
 * Every day with a Bell (rung live or replayed), oldest first: the pages read it before asking for a day's Bell,
 * so they never request a day without one (a 404 the browser would log).
 */
export async function GET() {
  await connection();
  try {
    const days = await bellDays();
    return Response.json({ days } satisfies BellDaysResponse, { headers: cacheHeaders(60) });
  } catch (error) {
    return errorResponse(error, "Couldn't list the Bells.");
  }
}
