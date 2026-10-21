import { safeTraits, scrubTraitText, traitSafety } from "@/lib/brand-safety";
import type { ChogSnapshot, Gene, Genome, TraitAlphaRow } from "@/lib/dna/types";

// Response shaping for /api/dna/*: every trait value a response carries is display-safe (lib/brand-safety.ts):
// flagged values under their neutral names, hidden ones left out. The engines keep reading the raw values on the
// server (genomes, trait seeds, persona names); nothing shaped here feeds back into them.

/** The snapshot with display-safe traits (its persona name must be computed from the raw ones: see chogName). */
export function shownChog(chog: ChogSnapshot): ChogSnapshot {
  return { ...chog, traits: safeTraits(chog.traits) };
}

function shownGene({ trait, ...gene }: Gene): Gene {
  // Genomes cached before an explanation change still read well: flagged values in them are renamed too.
  const explanation = scrubTraitText(gene.explanation);
  if (!trait) return { ...gene, explanation };
  const verdict = traitSafety(trait.type, trait.value);
  return verdict.action === "hide" ? { ...gene, explanation } : { ...gene, trait: { ...trait, value: verdict.display }, explanation };
}

/** The genome with display-safe gene traits and explanations (params and version untouched). */
export function shownGenome(genome: Genome): Genome {
  return { ...genome, genes: genome.genes.map(shownGene) };
}

/**
 * Trait Alpha rows under their shown names; hidden values are left out. Two raw spellings that share one neutral
 * name keep only the larger row, so names stay unique.
 */
export function shownTraitRows(rows: readonly TraitAlphaRow[]): TraitAlphaRow[] {
  const shown = rows.map((row) => {
    const verdict = traitSafety(row.traitType, row.value);
    return verdict.action === "hide" ? null : verdict.action === "ok" ? row : { ...row, value: verdict.display };
  });
  const best = new Map<string, number>();
  shown.forEach((row, i) => {
    if (!row) return;
    const key = `${row.traitType}\u0000${row.value.toLowerCase()}`;
    const prev = best.get(key);
    if (prev === undefined || row.count > (shown[prev]?.count ?? 0)) best.set(key, i);
  });
  const keep = new Set(best.values());
  // Same order as the input (its sort holds).
  return shown.filter((row, i): row is TraitAlphaRow => row !== null && keep.has(i));
}
