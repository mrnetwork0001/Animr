import { connection } from "next/server";
import { getChog } from "@/lib/dna/chogs";
import { chogGenome, chogName } from "@/lib/dna/population";
import type { ChogSnapshot, Genome } from "@/lib/dna/types";
import { BAD_ID, CACHE_GENOME, chogId, json, jsonError } from "../http";
import { shownChog, shownGenome } from "../shape";

/**
 * A Chog's snapshot and its trading genome (versioned; a pure function of its traits), with display-safe trait
 * values (../shape.ts), plus its persona name ("Rocket Ears"), which is computed from the raw traits.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/dna/[tokenId]">) {
  await connection();
  const id = chogId((await ctx.params).tokenId);
  if (id === null) return jsonError(400, BAD_ID);
  const chog = getChog(id);
  if (!chog) return jsonError(404, `Token ${id} is not in the Chog snapshot.`);
  try {
    const body = { chog: shownChog(chog), genome: shownGenome(chogGenome(chog)), personaName: chogName(chog) };
    return json(body satisfies { chog: ChogSnapshot; genome: Genome; personaName: string }, CACHE_GENOME);
  } catch (error) {
    console.error("[animr] /api/dna genome:", error);
    return jsonError(500, "Could not build this Chog's genome.");
  }
}
