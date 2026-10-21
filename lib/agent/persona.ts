import { keccak256, stringToBytes } from "viem";
import { deriveGenome, describeGenome, genomeParams } from "../dna/genome";
import type { Genome } from "../dna/types";
import type { NftMetadata } from "../nft";
import type { Persona, TradingStyle } from "./types";

// A persona is the agent-facing summary of a Chog's genome (lib/dna/genome.ts): style, per-trade
// cap and description all come from its traits. Names keep the v1 scheme (the hash plus the v1
// trait-word style picks "<adjective> <noun>"), so every Chog keeps the name it already has.

const ADJECTIVES: Record<TradingStyle, readonly string[]> = {
  aggressive: ["Turbo", "Feral", "Rocket", "Blitz", "Laser", "Degen", "Thunder", "Wild"],
  balanced: ["Diamond", "Golden", "Clever", "Lucky", "Cosmic", "Silver", "Purple", "Sharp"],
  cautious: ["Zen", "Steady", "Sleepy", "Velvet", "Patient", "Quiet", "Cozy", "Iron"],
};

const NOUNS = ["Paws", "Whiskers", "Snout", "Tail", "Claws", "Ears", "Fangs", "Mane", "Purr", "Pounce"];

// v1 naming only: trait words that nudged the old style.
const AGGRESSIVE_WORDS = new Set([
  "fire", "flame", "flames", "laser", "lasers", "angry", "mad", "rage", "rocket", "lightning", "thunder",
  "devil", "demon", "punk", "wild", "crazy", "chaos", "sword", "storm", "viking", "ninja", "samurai", "degen",
]);
const CAUTIOUS_WORDS = new Set([
  "sleep", "sleepy", "zen", "calm", "cozy", "monk", "shy", "ice", "snow", "cloud", "chill", "tea", "book",
  "nerd", "glasses", "pajamas", "pillow", "ghost", "sad", "bored", "angel", "halo",
]);

function cleanText(value: string, max: number): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Sanitized trait map from a trait_type -> value list; metadata is untrusted input. */
function cleanTraits(pairs: Iterable<readonly [string, string]>): Record<string, string> {
  const traits = new Map<string, string>();
  for (const [type, value] of pairs) {
    const key = cleanText(type, 32);
    const val = cleanText(value, 48);
    if (key && val && !traits.has(key) && traits.size < 16) traits.set(key, val);
  }
  return Object.fromEntries(traits);
}

/** Sanitized trait map (trait_type -> value) from NFT metadata; metadata is untrusted input. */
export function personaTraits(metadata: NftMetadata | null | undefined): Record<string, string> {
  return cleanTraits((metadata?.attributes ?? []).map(({ trait_type, value }) => [trait_type, value] as const));
}

/** The same sanitizing for a trait map that is already parsed (e.g. data/chogs.json). */
export function sanitizeTraits(traits: Record<string, string>): Record<string, string> {
  return cleanTraits(Object.entries(traits));
}

/** v1 style rule, kept only so names stay stable. */
function legacyStyle(traits: Record<string, string>, seed: number): TradingStyle {
  let score = 0;
  for (const [key, value] of Object.entries(traits)) {
    for (const word of `${key} ${value}`.toLowerCase().split(/[^a-z0-9]+/)) {
      if (AGGRESSIVE_WORDS.has(word)) score++;
      if (CAUTIOUS_WORDS.has(word)) score--;
    }
  }
  if (score > 0) return "aggressive";
  if (score < 0) return "cautious";
  return (["aggressive", "balanced", "cautious"] as const)[seed % 3];
}

/** The Chog's stable display name, e.g. "Rocket Ears" (pass sanitized traits). */
export function personaName(tokenId: string, traits: Record<string, string>): string {
  const canonical = Object.entries(traits)
    .map(([key, value]) => `${key.toLowerCase()}=${value.toLowerCase()}`)
    .sort()
    .join(";");
  const hash = keccak256(stringToBytes(`animr:persona:v1|${tokenId}|${canonical}`), "bytes");
  const adjectives = ADJECTIVES[legacyStyle(traits, hash[0])];
  return `${adjectives[hash[1] % adjectives.length]} ${NOUNS[hash[2] % NOUNS.length]}`;
}

/** The Chog's genome from a persona (its traits, plus the metadata name a 1:1 Legendary keeps there). */
export function personaGenome(persona: Pick<Persona, "traits">): Genome {
  const traits = persona.traits ?? {};
  return deriveGenome(traits, traits.Name);
}

/** Deterministic trading persona for a Chog; works with no metadata at all. */
export function derivePersona(tokenId: string, metadata?: NftMetadata | null): Persona {
  const traits = personaTraits(metadata);
  const name = personaName(tokenId, traits);
  const genome = deriveGenome(traits, metadata?.name);
  // A 1:1's genome is read from its metadata name, so keep the name next to its traits for the brain.
  const legend = genome.genes.some((gene) => gene.trait?.type === "1:1");
  return {
    name,
    style: genome.style,
    maxTradeBps: genomeParams(genome).sizeBps,
    description: describeGenome(genome),
    traits: legend && metadata?.name ? { ...traits, Name: cleanText(metadata.name, 48) } : traits,
  };
}
