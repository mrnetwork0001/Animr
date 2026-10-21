import { connection } from "next/server";
import { RING_LAG_MS, maintainBells } from "@/lib/bell/bell";
import { PRIVATE_HEADERS, errorResponse, isCronAuthorized } from "@/lib/bell/http";
import { bellTime, utcDay } from "@/lib/bell/rules";
import type { BellCronResponse } from "@/lib/bell/types";

// Ringing runs every claimed agent's 0G brain once (LLM timeout 20s each, 4 at a time). 300s needs
// Fluid compute (the default for new Vercel projects); a ring cut short is finished by the next trigger.
export const maxDuration = 300;

// Stop starting new agent runs early enough for the last ones (75s timeout each) and the writes to finish.
const RUN_BUDGET_MS = (maxDuration - 100) * 1000;

/**
 * Daily cron (vercel.json): at 15:00 UTC it rings today's Bell; at 16:00 UTC it settles yesterday's (settlement
 * waits 10 minutes past the horizon for the candles). An external hourly pulse (cron-job.org, GET with
 * `Authorization: Bearer $CRON_SECRET`, next to /api/agent/tick; see .env.example) backs up a missed or late Vercel
 * run, and so does the Bell read routes' after() hook. Each run does whatever is due. Idempotent: a run that finds
 * another one busy answers 409.
 */
export async function GET(request: Request) {
  await connection();
  if (!isCronAuthorized(request)) {
    const error = process.env.CRON_SECRET ? "Unauthorized." : "Set CRON_SECRET to enable this endpoint.";
    return Response.json({ error }, { status: 401 });
  }
  try {
    const started = Date.now();
    // A cron that fires right at 15:00 waits out the ring lag (the 15:00 candle must be in the data).
    const lag = bellTime(utcDay(started)) + RING_LAG_MS - started;
    if (lag > 0 && lag <= RING_LAG_MS) await new Promise((resolve) => setTimeout(resolve, lag + 1_000));
    const result = await maintainBells({ deadline: started + RUN_BUDGET_MS });
    return Response.json(result satisfies BellCronResponse, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return errorResponse(error, "The Bell cron failed.");
  }
}
