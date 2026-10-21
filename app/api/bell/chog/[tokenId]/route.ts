import { connection } from "next/server";
import { getChogBell } from "@/lib/bell/bell";
import { cacheHeaders, errorResponse } from "@/lib/bell/http";
import type { ChogBellResponse } from "@/lib/bell/types";
import { getChog } from "@/lib/dna/chogs";
import { isHiddenChog } from "@/lib/visibility";

/** A Chog's call on the latest Bell and its season record (404 for a Chog its holder hid). */
export async function GET(_request: Request, ctx: RouteContext<"/api/bell/chog/[tokenId]">) {
  await connection();
  const raw = (await ctx.params).tokenId;
  const tokenId = /^\d{1,5}$/.test(raw) ? Number(raw) : NaN;
  if (!getChog(tokenId)) return Response.json({ error: "Chog token ids run from 1 to 1969." }, { status: 404 });
  // A Chog its holder hid ("Hide my Chog") has no public Bell call or record.
  if (await isHiddenChog(tokenId)) {
    return Response.json(
      { error: "This Chog's holder took it out of Animr's public pages, so its Bell calls don't show." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    return Response.json((await getChogBell(tokenId)) satisfies ChogBellResponse, { headers: cacheHeaders(30) });
  } catch (error) {
    return errorResponse(error, "Couldn't load this Chog's Bell record.");
  }
}
