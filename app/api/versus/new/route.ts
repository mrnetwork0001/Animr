import { after, connection } from "next/server";
import { rateLimit } from "@/lib/bell/http";
import { newBoutPreview } from "@/lib/rewind/bout";
import { countVersus } from "@/lib/rewind/counters";
import type { VersusBoutPreview } from "@/lib/rewind/types";
import { loadVisibility } from "@/lib/visibility";
import { BAD_TOKEN_ID, LIMITS, NO_STORE, json, jsonError, tokenIdParam, versusErrorResponse } from "../http";

/**
 * ?a=<id>&b=<id>: a fresh bout for a chosen pair (token ids 1-1969) on a random drama-ranked window.
 * Name just one (?a= or ?b=) for a random rival. Each call deals a new window. A Chog its holder hid answers 404.
 */
export async function GET(request: Request) {
  await connection();
  const limited = await rateLimit(request, "versus-deal", LIMITS.deal);
  if (limited) return limited;
  const params = new URL(request.url).searchParams;
  const a = tokenIdParam(params.get("a"));
  const b = tokenIdParam(params.get("b"));
  if (a === undefined || b === undefined) return jsonError(400, BAD_TOKEN_ID);
  try {
    const preview = await newBoutPreview(a, b, Math.random, (await loadVisibility()).hidden);
    after(() => countVersus("bouts"));
    return json(preview satisfies VersusBoutPreview, NO_STORE);
  } catch (error) {
    return versusErrorResponse(error, "Couldn't set up that bout. Try again.");
  }
}
