import { safeTraits } from "../brand-safety";
import type { DisplayTrait } from "./types";

/**
 * The House Chog's traits as they may be shown and sent to the LLM: lib/brand-safety renames or drops every flagged
 * value. Derive the genome from the RAW traits; use this for any text.
 */
export function displayTraits(traits: Readonly<Record<string, string>>): DisplayTrait[] {
  return Object.entries(safeTraits(traits)).map(([type, value]) => ({ type, value }));
}
