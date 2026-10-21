import { connection } from "next/server";
import { getStandings } from "@/lib/bell/bell";
import { cacheHeaders, errorResponse } from "@/lib/bell/http";
import type { BellStandingsResponse } from "@/lib/bell/types";

/** The season's top Chog oracles and top fans (points only, never money). */
export async function GET() {
  await connection();
  try {
    return Response.json((await getStandings()) satisfies BellStandingsResponse, { headers: cacheHeaders(30) });
  } catch (error) {
    return errorResponse(error, "Couldn't load the standings.");
  }
}
