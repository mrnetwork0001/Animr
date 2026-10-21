import type { PopulationRow } from "@/lib/dna/types";
import type { LeagueIndex } from "./league-index";

// Trait families: related values of one trait type that the community talks about as one thing
// ("laser eyes" = Purple, fire, Green and cyan laser). Used by the Trait Alpha page and the league filter.

export type TraitFamily = {
  key: string;
  label: string;
  /** For headlines: "laser-eyed Chogs". */
  noun: string;
  type: string;
  match: RegExp;
};

export const TRAIT_FAMILIES: readonly TraitFamily[] = [
  { key: "laser-eyes", label: "Laser eyes", noun: "laser-eyed Chogs", type: "Eyes", match: /laser/i },
  { key: "side-eye", label: "Side Eye", noun: "side-eyed Chogs", type: "Eyes", match: /side eye/i },
  { key: "crying-eyes", label: "Crying & teary eyes", noun: "crying Chogs", type: "Eyes", match: /cry|tear/i },
  { key: "sleepy-eyes", label: "Dead & tired eyes", noun: "dead-tired Chogs", type: "Eyes", match: /dead|tired/i },
  { key: "visors", label: "Visors & VR", noun: "visor Chogs", type: "Eyes", match: /visor|\bvr\b/i },
  { key: "glasses", label: "Glasses", noun: "Chogs in glasses", type: "Eyes", match: /glass/i },
  { key: "coin-mouths", label: "Coin mouths", noun: "coin-mouthed Chogs", type: "Mouth", match: /coin/i },
  { key: "fiery-auras", label: "Fiery auras", noun: "fiery-aura Chogs", type: "Aura", match: /burning|fiery|^fire$/i },
  { key: "cool-auras", label: "Cool auras", noun: "cool-aura Chogs", type: "Aura", match: /cool|aqua|clean/i },
  { key: "candles", label: "Candles", noun: "candle-holding Chogs", type: "Accessory", match: /candle/i },
  { key: "skull-bases", label: "Skull & Radioactive", noun: "skull Chogs", type: "Base", match: /skull|radioactive/i },
];

/** members[id - 1] is true when Chog #id carries a value of the family. */
export function familyMembers(index: LeagueIndex, family: TraitFamily): boolean[] {
  const type = index.types.indexOf(family.type);
  if (type < 0) return [];
  const hits = index.values[type].map((value) => family.match.test(value));
  return index.codes[type].map((code) => code >= 0 && hits[code]);
}

export type FamilyStats = TraitFamily & { values: string[]; count: number; medianEdgePct: number; beatHoldPct: number };

/** Exact stats per family from every Chog's edge (families with no members are left out). */
export function familyStats(index: LeagueIndex, rows: PopulationRow[]): FamilyStats[] {
  return TRAIT_FAMILIES.flatMap((family) => {
    const members = familyMembers(index, family);
    const edges = rows
      .filter((row) => members[row.tokenId - 1])
      .map((row) => row.edgePct)
      .sort((a, b) => a - b);
    if (edges.length === 0) return [];
    const mid = edges.length >> 1;
    const type = index.types.indexOf(family.type);
    return [
      {
        ...family,
        values: index.values[type].filter((value) => family.match.test(value)),
        count: edges.length,
        medianEdgePct: edges.length % 2 ? edges[mid] : (edges[mid - 1] + edges[mid]) / 2,
        beatHoldPct: (edges.filter((edge) => edge > 0).length / edges.length) * 100,
      },
    ];
  });
}
