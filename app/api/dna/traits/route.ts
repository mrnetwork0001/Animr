import { connection } from "next/server";
import { getTraitAlpha } from "@/lib/dna/population";
import { BAD_WINDOW, CACHE_HOURLY, json, jsonError, windowParam } from "../http";
import { shownTraitRows } from "../shape";

/**
 * Trait Alpha: median simulated edge and beat-hold share per trait value, under display-safe names (flagged values
 * under their neutral names, hidden ones left out). ?window=30d|45d|max
 */
export async function GET(request: Request) {
  await connection();
  const window = windowParam(request);
  if (!window) return jsonError(400, BAD_WINDOW);
  try {
    const alpha = await getTraitAlpha(window);
    return json({ ...alpha, rows: shownTraitRows(alpha.rows) }, CACHE_HOURLY);
  } catch (error) {
    console.error("[animr] /api/dna/traits:", error);
    return jsonError(500, "Could not build Trait Alpha.");
  }
}
