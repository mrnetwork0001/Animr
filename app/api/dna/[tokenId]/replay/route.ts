import { connection } from "next/server";
import { getReplay } from "@/lib/dna/population";
import type { ReplayResult } from "@/lib/dna/types";
import { isHiddenChog } from "@/lib/visibility";
import { BAD_ID, BAD_WINDOW, CACHE_HOURLY, HIDDEN_CHOG, chogId, json, jsonError, windowParam } from "../../http";

/**
 * The Chog's genome replayed over real hourly $CHOG candles (simulated, 1% fee + impact). ?window=30d|45d|max
 * A Chog its holder hid ("Hide my Chog", lib/visibility.ts) has no public replay: 404.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/dna/[tokenId]/replay">) {
  await connection();
  const id = chogId((await ctx.params).tokenId);
  if (id === null) return jsonError(400, BAD_ID);
  const window = windowParam(request);
  if (!window) return jsonError(400, BAD_WINDOW);
  if (await isHiddenChog(id)) return jsonError(404, HIDDEN_CHOG);
  try {
    return json((await getReplay(id, window)) satisfies ReplayResult, CACHE_HOURLY);
  } catch (error) {
    if (error instanceof RangeError) return jsonError(404, error.message);
    console.error("[animr] /api/dna replay:", error);
    return jsonError(500, "Could not replay this Chog.");
  }
}
