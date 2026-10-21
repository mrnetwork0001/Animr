import { type NextRequest, connection } from "next/server";
import { CALL_SORTS, getBellCalls } from "@/lib/bell/bell";
import { cacheHeaders, errorResponse } from "@/lib/bell/http";
import { parseDay } from "@/lib/bell/rules";
import type { BellCallSort, BellCallsResponse } from "@/lib/bell/types";

const MAX_LIMIT = 200;

/** ?cursor=&sort=bold|bull|bear|tokenId|points&limit= -> one page of a Bell's 1,969 calls. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/bell/[day]/calls">) {
  await connection();
  const day = parseDay((await ctx.params).day);
  if (!day) return Response.json({ error: "Use a UTC date like 2026-10-19." }, { status: 400 });
  const params = request.nextUrl.searchParams;
  const sort = (params.get("sort") || "bold") as BellCallSort;
  if (!CALL_SORTS.includes(sort)) {
    return Response.json({ error: `sort must be one of ${CALL_SORTS.join(", ")}.` }, { status: 400 });
  }
  const cursor = Number(params.get("cursor") || 0);
  const limit = Number(params.get("limit") || 50);
  if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return Response.json({ error: `cursor must be a non-negative integer and limit 1-${MAX_LIMIT}.` }, { status: 400 });
  }
  try {
    const page = await getBellCalls(day, { sort, cursor, limit });
    if (!page) return Response.json({ error: `No Bell rang on ${day}.` }, { status: 404 });
    return Response.json(page satisfies BellCallsResponse, { headers: cacheHeaders(30) });
  } catch (error) {
    return errorResponse(error, "Couldn't load the calls.");
  }
}
