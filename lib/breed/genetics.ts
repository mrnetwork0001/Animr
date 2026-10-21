import { keccak256, stringToBytes } from "viem";

// Breeding two Chogs: which parent passes each trait, and the child's name. Pure and deterministic, so the same pair
// always makes the same child, whichever order it's typed in (everything keys on the lower token id first). No trait
// tables here: the child's Trading DNA comes from the real genome compiler (lib/dna/genome.ts) over these traits.

/** The 13 Chog Genesis trait types, in the order the metadata lists them. */
export const TRAIT_TYPES = [
  "Background",
  "Base",
  "Skin",
  "Side",
  "Body",
  "Mouth",
  "Eyes",
  "Head",
  "Accessory",
  "Form",
  "Tier",
  "Naked",
  "Aura",
] as const;

/** Bump to reshuffle every child (it changes which parent passes each trait). */
const BREED_SALT = "animr:breed:v1";

export type Parent = { tokenId: number; traits: Readonly<Record<string, string>> };

/** One inherited trait, raw (the server shows it through lib/brand-safety.ts). `value` is null when that parent has none. */
export type Inherited = { type: string; value: string | null; from: number };

function byte(text: string, index = 0): number {
  return keccak256(stringToBytes(text), "bytes")[index];
}

/**
 * Which parent passes `traitType`: a hash of (lower id, higher id, trait type), so it's order-independent. Returns
 * the token id of that parent.
 */
export function donorOf(a: number, b: number, traitType: string): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return byte(`${BREED_SALT}|${lo}|${hi}|${traitType}`) & 1 ? hi : lo;
}

/**
 * The child's 13 traits, each taken whole from one parent. A parent without that trait type (no Aura, say) passes the
 * absence: the child has none either, exactly as it would trade.
 */
export function inherit(a: Parent, b: Parent): Inherited[] {
  return TRAIT_TYPES.map((type) => {
    const from = donorOf(a.tokenId, b.tokenId, type);
    const donor = from === a.tokenId ? a : b;
    return { type, value: donor.traits[type] ?? null, from };
  });
}

/** The child's trait map (raw values), ready for deriveGenome. */
export function childTraits(inherited: readonly Inherited[]): Record<string, string> {
  return Object.fromEntries(inherited.flatMap(({ type, value }) => (value === null ? [] : [[type, value]])));
}

/**
 * The child's persona-style name from its parents' ("Rocket Ears" + "Zen Paws" -> "Rocket Paws"): one parent gives
 * the first word, the other the last, picked by the pair's hash. When that only repeats a parent's name, it's "Jr.".
 */
export function childName(a: { tokenId: number; name: string }, b: { tokenId: number; name: string }): string {
  const [lo, hi] = a.tokenId <= b.tokenId ? [a, b] : [b, a];
  const [first, last] = byte(`${BREED_SALT}|${lo.tokenId}|${hi.tokenId}|name`) & 1 ? [hi, lo] : [lo, hi];
  const head = first.name.trim().split(/\s+/)[0] ?? "";
  const tail = last.name.trim().split(/\s+/).slice(1).join(" ") || last.name.trim();
  const name = `${head} ${tail}`.trim();
  return name === a.name.trim() || name === b.name.trim() ? `${name} Jr.` : name;
}
