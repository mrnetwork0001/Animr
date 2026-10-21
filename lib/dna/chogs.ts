import data from "@/data/chogs.json";
import type { ChogSnapshot, ChogsFile } from "./types";

// Server-only: data/chogs.json is ~1 MB. Never import this module from a client component;
// pass the few Chogs a page needs down as props instead. Rebuild it with scripts/snapshot-chogs.mts.

const file = data as unknown as ChogsFile;

// Frozen so no caller can change the shared snapshot by accident.
const chogs: readonly ChogSnapshot[] = Object.freeze(
  file.chogs.map((chog) => Object.freeze({ ...chog, traits: Object.freeze({ ...chog.traits }) })),
);
const byId = new Map(chogs.map((chog) => [chog.id, chog]));

/** All 1,969 Chog Genesis tokens, sorted by id (a fresh array; the entries are frozen). */
export function allChogs(): ChogSnapshot[] {
  return chogs.slice();
}

/** One Chog by token id (1–1969), or undefined. */
export function getChog(id: number): ChogSnapshot | undefined {
  return byId.get(id);
}

let counts: Record<string, Record<string, number>> | undefined;

/**
 * trait_type -> value -> number of Chogs carrying it. Trait types are sorted by name and values
 * by count, most common first. A Chog without a trait type (no Aura, say) is not counted under it.
 */
export function traitCounts(): Record<string, Record<string, number>> {
  if (counts) return counts;
  const tally: Record<string, Record<string, number>> = {};
  for (const chog of chogs) {
    for (const [type, value] of Object.entries(chog.traits)) {
      tally[type] ??= {};
      tally[type][value] = (tally[type][value] ?? 0) + 1;
    }
  }
  counts = Object.freeze(
    Object.fromEntries(
      Object.keys(tally)
        .sort()
        .map((type) => [
          type,
          Object.freeze(
            Object.fromEntries(Object.entries(tally[type]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
          ),
        ]),
    ),
  );
  return counts;
}
