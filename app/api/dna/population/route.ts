import { connection } from "next/server";
import { getPopulation } from "@/lib/dna/population";
import type { PopulationResponse } from "@/lib/dna/types";
import { loadVisibility } from "@/lib/visibility";
import { BAD_WINDOW, CACHE_HOURLY, json, jsonError, windowParam } from "../http";

/**
 * All 1,969 Chogs ranked by their genome's simulated edge over holding $CHOG. ?window=30d|45d|max
 * Chogs whose holders hid them ("Hide my Chog", lib/visibility.ts) are left out of the rows; every other row keeps
 * its rank among all 1,969 and the stats stay the whole collection's.
 */
export async function GET(request: Request) {
  await connection();
  const window = windowParam(request);
  if (!window) return jsonError(400, BAD_WINDOW);
  try {
    const [population, visibility] = await Promise.all([getPopulation(window), loadVisibility()]);
    const rows = visibility.hidden.size
      ? population.rows.filter((row) => !visibility.isHidden(row.tokenId, "list"))
      : population.rows;
    return json({ ...population, rows } satisfies PopulationResponse, CACHE_HOURLY);
  } catch (error) {
    console.error("[animr] /api/dna/population:", error);
    return jsonError(500, "Could not build the league.");
  }
}
