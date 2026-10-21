import { connection } from "next/server";
import { cacheHeaders, errorResponse, rateLimit } from "@/lib/bell/http";
import { type BellRecapResponse, getRecap, RecapError } from "@/lib/bell/recap";
import { parseDay } from "@/lib/bell/rules";

/** Writing a recap on 0G can take 10–25 s the first time. */
export const maxDuration = 60;

/**
 * The recap of a settled Bell (YYYY-MM-DD): stored, else written once now on 0G Compute (template fallback).
 * 404 when no Bell rang that day, 409 while it is still open.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/bell/recap/[day]">) {
  await connection();
  const day = parseDay((await ctx.params).day);
  if (!day) return Response.json({ error: "Use a UTC date like 2026-10-19." }, { status: 400 });
  const limited = await rateLimit(request, "bell-recap", 60);
  if (limited) return limited;
  try {
    const recap = await getRecap(day);
    // An AI recap is final; a template is rewritten by 0G later, so check back sooner.
    return Response.json(recap satisfies BellRecapResponse, { headers: cacheHeaders(recap.writtenBy === "ai" ? 3600 : 300) });
  } catch (error) {
    if (error instanceof RecapError) return Response.json({ error: error.message }, { status: error.status });
    return errorResponse(error, "Couldn't load this Bell's recap.");
  }
}
