import { connection } from "next/server";
import { rateLimit } from "@/lib/bell/http";
import { randomBoutPreview } from "@/lib/rewind/bout";
import type { VersusBoutPreview } from "@/lib/rewind/types";
import { loadVisibility } from "@/lib/visibility";
import { LIMITS, NO_STORE, json, versusErrorResponse } from "../http";

/**
 * A fresh bout: two random Chogs (never a flagged or hidden one, different signals) on a random drama-ranked 48h window.
 * Fighters only: the race, result and real dates come with the pick (or ?spectate=1).
 */
export async function GET(request: Request) {
  await connection();
  const limited = await rateLimit(request, "versus-deal", LIMITS.deal);
  if (limited) return limited;
  try {
    const preview = await randomBoutPreview(Math.random, (await loadVisibility()).hidden);
    return json(preview satisfies VersusBoutPreview, NO_STORE);
  } catch (error) {
    return versusErrorResponse(error, "Couldn't set up a bout. Try again.");
  }
}
