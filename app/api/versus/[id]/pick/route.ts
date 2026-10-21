import { after } from "next/server";
import { fanIdentity, jsonBody, rateLimit } from "@/lib/bell/http";
import { DAY_MS } from "@/lib/bell/rules";
import { getShownBout } from "@/lib/rewind/bout";
import { countVersus } from "@/lib/rewind/counters";
import { VersusError } from "@/lib/rewind/errors";
import { isBoutId } from "@/lib/rewind/id";
import { getVersusRecord, recordPick } from "@/lib/rewind/picks";
import type { VersusPickResponse } from "@/lib/rewind/types";
import { loadVisibility } from "@/lib/visibility";
import { LIMITS, NEW_PICKERS_MESSAGE, NO_STORE, json, versusErrorResponse } from "../../http";

/**
 * Body { fighter: "a" | "b" }: the cookie fan's pick (the first visit sets the animr_fan cookie; no wallet).
 * Answers the whole bout. The first pick per bout counts (+10 points when correct, up to 100 a day); a repeat
 * answers correct: null. Points only: no cash value.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/versus/[id]/pick">) {
  const limited =
    (await rateLimit(request, "versus-pick", LIMITS.pick)) ?? (await rateLimit(request, "versus-pick-day", LIMITS.picksPerDay, DAY_MS));
  if (limited) return limited;
  try {
    const { id } = await ctx.params;
    if (!isBoutId(id)) throw new VersusError(404, "That isn't a VERSUS bout id.");
    const body = await jsonBody(request);
    const fighter = body.fighter;
    if (fighter !== "a" && fighter !== "b") throw new VersusError(400, 'Pick a side: { "fighter": "a" } or { "fighter": "b" }.');
    const bout = await getShownBout(id, (await loadVisibility()).hidden);
    const fanId = await fanIdentity();
    // A cookie's first VERSUS record is capped per network and day (roomy for a judging room behind one IP), so a
    // script that drops its cookie can't mint records without limit. Cookies with a record pick as usual.
    if ((await getVersusRecord(fanId)).picks === 0) {
      const capped = await rateLimit(request, "versus-new-fan", LIMITS.newPickersPerDay, DAY_MS, NEW_PICKERS_MESSAGE);
      if (capped) return capped;
    }
    const { first, response } = await recordPick(fanId, bout, fighter);
    if (first) after(() => countVersus("picks"));
    return json(response satisfies VersusPickResponse, NO_STORE);
  } catch (error) {
    return versusErrorResponse(error, "Couldn't record your pick. Try again.");
  }
}
