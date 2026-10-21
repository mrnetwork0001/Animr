import { cookies } from "next/headers";
import { connection } from "next/server";
import { FAN_COOKIE, fanIdFromToken } from "@/lib/bell/fans";
import { rateLimit } from "@/lib/bell/http";
import { getShownBout, previewOf } from "@/lib/rewind/bout";
import { markWatched } from "@/lib/rewind/picks";
import type { VersusBout, VersusBoutPreview } from "@/lib/rewind/types";
import { loadVisibility } from "@/lib/visibility";
import { CACHE_BOUT, LIMITS, NO_STORE, json, versusErrorResponse } from "../http";

/**
 * A bout by id. Plain: the preview (fighters only, no spoilers) for a shared link, CDN-cacheable. ?spectate=1: the
 * whole bout (frames, trades, moments, result, real dates) to watch without picking: no pick, no points. A spectator
 * with a fan cookie has this bout's pick slot taken ("watched"), so a later pick on it earns nothing; that answer is
 * never cached, so every spectate reaches this handler. A bout with a Chog its holder hid answers 404.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/versus/[id]">) {
  await connection();
  const limited = await rateLimit(request, "versus-view", LIMITS.view);
  if (limited) return limited;
  const spectate = new URL(request.url).searchParams.get("spectate");
  try {
    const bout = await getShownBout((await ctx.params).id, (await loadVisibility()).hidden);
    if (spectate !== null && spectate !== "0" && spectate !== "false") {
      const fanId = fanIdFromToken((await cookies()).get(FAN_COOKIE)?.value);
      if (fanId) await markWatched(fanId, bout.id);
      return json(bout satisfies VersusBout, NO_STORE);
    }
    return json(previewOf(bout) satisfies VersusBoutPreview, CACHE_BOUT);
  } catch (error) {
    return versusErrorResponse(error, "Couldn't load this bout. Try again.");
  }
}
