import { traitSafety } from "@/lib/brand-safety";
import { allChogs } from "@/lib/dna/chogs";

// Server-only (reads data/chogs.json through lib/dna/chogs.ts). Client components import the type only.

/** Every Chog's traits and metadata number in a compact, serializable form, for the league's filters and search. */
export type LeagueIndex = {
  /** Trait types, alphabetical. */
  types: string[];
  /**
   * values[i]: the values of types[i] as shown, most common first (lib/brand-safety.ts: a renamed value under its
   * neutral name, two raw spellings with one name merged, a hidden value left out). Raw flagged values never reach
   * the browser or a filter URL.
   */
  values: string[][];
  /** codes[i][id - 1]: index into values[i] for token id, or -1 when the Chog lacks that trait (or it is hidden). */
  codes: number[][];
  /** metadataIds[id - 1]: the number in the Chog's metadata name ("CHOG #1462" -> 1462), or 0. */
  metadataIds: number[];
};

/** The value as shown, or null when it is never shown. */
function shownValue(type: string, raw: string): string | null {
  const verdict = traitSafety(type, raw);
  return verdict.action === "hide" ? null : verdict.display;
}

/** ~70 KB raw (13 trait types x 1,969 Chogs), a pure function of the frozen snapshot. */
export function buildLeagueIndex(): LeagueIndex {
  const chogs = allChogs();
  const maxId = chogs.reduce((max, chog) => Math.max(max, chog.id), 0);
  const tally = new Map<string, Map<string, number>>();
  for (const chog of chogs) {
    for (const [type, raw] of Object.entries(chog.traits)) {
      const value = shownValue(type, raw);
      if (value === null) continue;
      const counts = tally.get(type) ?? new Map<string, number>();
      counts.set(value, (counts.get(value) ?? 0) + 1);
      tally.set(type, counts);
    }
  }
  const types = [...tally.keys()].sort();
  const values = types.map((type) =>
    [...tally.get(type)!].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value]) => value),
  );
  const codes = types.map((type, i) => {
    const lookup = new Map(values[i].map((value, j) => [value, j]));
    const column = new Array<number>(maxId).fill(-1);
    for (const chog of chogs) {
      const raw = chog.traits[type];
      const value = raw === undefined ? null : shownValue(type, raw);
      if (value !== null) column[chog.id - 1] = lookup.get(value) ?? -1;
    }
    return column;
  });
  const metadataIds = new Array<number>(maxId).fill(0);
  for (const chog of chogs) metadataIds[chog.id - 1] = Number(/\d+/.exec(chog.metadataId)?.[0] ?? 0);
  return { types, values, codes, metadataIds };
}
