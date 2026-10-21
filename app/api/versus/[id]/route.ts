import { connection } from "next/server";
import { rateLimit } from "@/lib/bell/http";
import { getShownBout, previewOf } from "@/lib/rewind/bout";
import type { VersusBout, VersusBoutPreview } from "@/lib/rewind/types";
import { loadVisibility } from "@/lib/visibility";
import { CACHE_BOUT, LIMITS, json, versusErrorResponse } from "../http";

/**
 * A bout by id. Plain: the preview (fighters only, no spoilers) for a shared link. ?spectate=1: the whole bout
 * (frames, trades, moments, result, real dates) to watch without picking: no pick, no points.
 * Deterministic per id, so CDNs may cache it. A bout with a Chog its holder hid answers 404.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/versus/[id]">) {
  await connection();
  const limited = await rateLimit(request, "versus-view", LIMITS.view);
  if (limited) return limited;
  const spectate = new URL(request.url).searchParams.get("spectate");
  try {
    const bout = await getShownBout((await ctx.params).id, (await loadVisibility()).hidden);
    if (spectate !== null && spectate !== "0" && spectate !== "false") return json(bout satisfies VersusBout, CACHE_BOUT);
    return json(previewOf(bout) satisfies VersusBoutPreview, CACHE_BOUT);
  } catch (error) {
    return versusErrorResponse(error, "Couldn't load this bout. Try again.");
  }
}
