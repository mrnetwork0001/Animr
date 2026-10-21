import { connection } from "next/server";
import { getInstinctSince, getStanding } from "@/lib/dna/population";
import type { ChogStanding } from "@/lib/dna/types";
import { isHiddenChog } from "@/lib/visibility";
import { BAD_ID, BAD_WINDOW, CACHE_HOURLY, HIDDEN_CHOG, chogId, json, jsonError, windowParam } from "../../http";

/** Earliest `since` accepted: the committed candle history starts in March 2026. */
const MIN_SINCE_MS = Date.UTC(2026, 0, 1);

/**
 * One Chog's league standing (rank, edge, archetype) without the whole population. A hidden Chog answers 404.
 * ?window=30d|45d|max; ?since=<ISO time> adds its instinct replayed over the same hours as its live agent.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/dna/[tokenId]/standing">) {
  await connection();
  const id = chogId((await ctx.params).tokenId);
  if (id === null) return jsonError(400, BAD_ID);
  const window = windowParam(request);
  if (!window) return jsonError(400, BAD_WINDOW);
  const rawSince = new URL(request.url).searchParams.get("since");
  const sinceMs = rawSince ? Date.parse(rawSince) : Number.NaN;
  if (rawSince && !(sinceMs >= MIN_SINCE_MS)) return jsonError(400, "since must be an ISO time after 2026-01-01.");
  // A Chog its holder hid ("Hide my Chog", lib/visibility.ts) has no public standing, like its replay.
  if (await isHiddenChog(id)) return jsonError(404, HIDDEN_CHOG);
  try {
    const standing = await getStanding(id, window);
    const since = rawSince ? await getInstinctSince(id, Math.floor(sinceMs / 1000)) : undefined;
    return json({ ...standing, ...(since && { since }) } satisfies ChogStanding, CACHE_HOURLY);
  } catch (error) {
    if (error instanceof RangeError) return jsonError(404, error.message);
    console.error("[animr] /api/dna standing:", error);
    return jsonError(500, "Could not read this Chog's standing.");
  }
}
