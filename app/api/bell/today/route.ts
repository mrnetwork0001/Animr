import { after, connection } from "next/server";
import { getLatestBell, maintainBellsIfDue, withLive } from "@/lib/bell/bell";
import { cacheHeaders, errorResponse } from "@/lib/bell/http";
import type { BellSummaryResponse } from "@/lib/bell/types";

// A due ring or settlement may run after the response (a backstop for the once-a-day cron).
export const maxDuration = 300;

/**
 * The latest rung Bell: today's once it has rung, else the newest one (replayed before the first
 * live Bell), with `live` (the provisional move since the ring) while it is open.
 */
export async function GET() {
  await connection();
  after(maintainBellsIfDue);
  try {
    const bell = await getLatestBell();
    if (!bell) return Response.json({ error: "The first Bell hasn't rung yet." }, { status: 404 });
    return Response.json((await withLive(bell)) satisfies BellSummaryResponse, { headers: cacheHeaders(15) });
  } catch (error) {
    return errorResponse(error, "Couldn't load the Bell.");
  }
}
