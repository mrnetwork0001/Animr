import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { publicErrorMessage, runAllAgents } from "@/lib/agent/engine";
import type { TickResponse } from "@/lib/agent/types";

// 60s works on every Vercel plan. With Fluid compute (the default for new projects)
// it can go up to 300 (Hobby) / 800 (Pro) to fit more agents into each run.
export const maxDuration = 60;

// Stop starting new agents early enough for the last run to finish (LLM timeout 20s).
const RUN_BUDGET_MS = (maxDuration - 25) * 1000;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Without a secret the endpoint is open only in `next dev`.
  if (!secret) return process.env.NODE_ENV === "development";
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Cron entry point (vercel.json): one decision for every active agent. */
export async function GET(request: Request) {
  await connection();
  if (!isAuthorized(request)) {
    const error = process.env.CRON_SECRET ? "Unauthorized." : "Set CRON_SECRET to enable this endpoint.";
    return Response.json({ error }, { status: 401 });
  }
  try {
    const result: TickResponse = await runAllAgents({ deadline: Date.now() + RUN_BUDGET_MS });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: publicErrorMessage(error, "The agent tick failed.") }, { status: 500 });
  }
}
