import { connection } from "next/server";
import { getBell, withLive } from "@/lib/bell/bell";
import { cacheHeaders, errorResponse } from "@/lib/bell/http";
import { parseDay } from "@/lib/bell/rules";
import type { BellSummaryResponse } from "@/lib/bell/types";

/** The Bell of one UTC day (YYYY-MM-DD), with `live` while it is open and its Oracle Purse once settled. */
export async function GET(_request: Request, ctx: RouteContext<"/api/bell/[day]">) {
  await connection();
  const day = parseDay((await ctx.params).day);
  if (!day) return Response.json({ error: "Use a UTC date like 2026-10-19." }, { status: 400 });
  try {
    const bell = await getBell(day);
    if (!bell) return Response.json({ error: `No Bell rang on ${day}.` }, { status: 404 });
    const response = await withLive(bell);
    // A settled Bell only changes when its purse lands: check back sooner while it is on its way.
    const seconds = bell.status !== "settled" ? 15 : response.purse?.status === "pending" ? 60 : 600;
    return Response.json(response satisfies BellSummaryResponse, { headers: cacheHeaders(seconds) });
  } catch (error) {
    return errorResponse(error, "Couldn't load that Bell.");
  }
}
