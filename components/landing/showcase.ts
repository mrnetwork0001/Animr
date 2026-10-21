import { personaName, sanitizeTraits } from "@/lib/agent/persona";
import type { TradingStyle } from "@/lib/agent/types";
import { FLAGGED_TOKEN_IDS, displayTraitValue, scrubTraitText, traitSafety } from "@/lib/brand-safety";
import { nameNumberOf } from "@/lib/chog-id";
import { appConfig } from "@/lib/config";
import { animrTradeGuardAddress } from "@/lib/contracts/animr-trade-guard";
import { allChogs, getChog } from "@/lib/dna/chogs";
import { deriveGenome, genomeParams } from "@/lib/dna/genome";
import type { ChogSnapshot, Genome } from "@/lib/dna/types";
import { computeTokenBoundAccount } from "@/lib/erc6551";
import { explorerAddressUrl, shortAddress } from "@/lib/format";
import { houseChogTokenId } from "@/lib/heist/config";
import { resolveUri } from "@/lib/nft";
import { FALLBACK_IMAGE_IDS } from "./content";

// Server only (it reads the ~1 MB Chog snapshot): everything the landing page shows about a Chog,
// computed with the app's own code from data/chogs.json. Pure functions of committed data (no RPC, no
// clock, no network), so the page still prerenders as static HTML.

// ---------------------------------------------------------------- one Chog

export type ShowcaseTrait = { type: string; value: string };

/** A gene that one of the Chog's traits set, with landing-page wording. */
export type ShowcaseGene = {
  key: string;
  /** "Signal", "Size", … */
  label: string;
  /** What it does: "Contrarian", "40% a trade", "Hourly chart", … */
  display: string;
  /** The trait that set it (brand-safe value). */
  trait: ShowcaseTrait;
};

export type ShowcaseChog = {
  tokenId: number;
  /** Its marketplace name, "CHOG #1312" (the token id only on the profile, the wallet card and lookups). */
  label: string;
  /** Its persona name (lib/agent/persona.ts), the same name its agent and League row carry. */
  name: string;
  archetype: string;
  style: TradingStyle;
  /** The metadata image through the IPFS gateway, plus the self-hosted copy for when the gateway fails. */
  image: { src: string; fallbackSrc?: string };
  /** Every visible trait in metadata order (renamed values replaced, hidden ones dropped); `sets` = it set a gene. */
  traits: (ShowcaseTrait & { sets: boolean })[];
  /** Genes set by a trait, in genome order. */
  genes: ShowcaseGene[];
  /** Each trait that set a gene, once (dead eyes set both the signal and the pace). */
  setters: ShowcaseTrait[];
  /** The signal gene in one sentence: "It fades the crowd, selling pumps and buying dips." */
  signal: string;
  stats: { signal: string; trigger: string; size: string; tempo: string };
  genomeVersion: string;
};

const showcases = new Map<number, ShowcaseChog | null>();

/** A Chog for a featured slot, or null when it's unknown or its art carries flagged words. */
export function showcaseChog(tokenId: number): ShowcaseChog | null {
  if (!showcases.has(tokenId)) showcases.set(tokenId, buildShowcase(tokenId));
  return showcases.get(tokenId) ?? null;
}

/** The showcase Chogs that exist and are brand-safe, in the given order. */
export function showcaseChogs(tokenIds: readonly number[]): ShowcaseChog[] {
  return tokenIds.flatMap((tokenId) => showcaseChog(tokenId) ?? []);
}

/** "CHOG #1312" (or a 1:1's own title) from the metadata name; "token 1820" only when the name carries no number. */
function marketName(tokenId: number, metadataName: string | undefined): string {
  const title = metadataName?.trim();
  return title && nameNumberOf(title) !== null ? title : `token ${tokenId}`;
}

/** The persona name every Chog keeps (same inputs as the League's chogName). */
function nameOf(chog: ChogSnapshot): string {
  return personaName(String(chog.id), sanitizeTraits(chog.traits));
}

function genomeOf(chog: ChogSnapshot): Genome {
  return deriveGenome(chog.traits, chog.name);
}

function buildShowcase(tokenId: number): ShowcaseChog | null {
  const chog = getChog(tokenId);
  // Flagged art still shows the words the trait filter hides: never feature it.
  if (!chog || FLAGGED_TOKEN_IDS.has(tokenId)) return null;
  const genome = genomeOf(chog);
  const sizePct = genomeParams(genome).sizeBps / 100;
  const display = (key: string, fallback: string) => (key === "size" ? `${sizePct}% a trade` : fallback);

  const genes: ShowcaseGene[] = genome.genes.flatMap((gene) =>
    gene.trait
      ? [
          {
            key: gene.key,
            label: gene.label,
            display: display(gene.key, gene.display),
            trait: { type: gene.trait.type, value: displayTraitValue(gene.trait.type, gene.trait.value) },
          },
        ]
      : [],
  );
  const setters: ShowcaseTrait[] = [];
  for (const { trait } of genes) {
    if (!setters.some((seen) => seen.type === trait.type && seen.value === trait.value)) setters.push(trait);
  }
  const rawSetters = genome.genes.flatMap((gene) => (gene.trait ? [gene.trait] : []));
  const traits = Object.entries(chog.traits).flatMap(([type, value]) => {
    const verdict = traitSafety(type, value);
    if (verdict.action === "hide") return [];
    const sets = rawSetters.some((trait) => trait.type === type && trait.value === value);
    return [{ type, value: verdict.display, sets }];
  });

  const gene = (key: string) => genome.genes.find((g) => g.key === key);
  const signalGene = gene("signal");
  return {
    tokenId,
    label: marketName(tokenId, chog.name),
    name: nameOf(chog),
    archetype: genome.archetype,
    style: genome.style,
    image: {
      src: resolveUri(chog.image),
      fallbackSrc: FALLBACK_IMAGE_IDS.has(tokenId) ? `/landing/chogs/${tokenId}.webp` : undefined,
    },
    traits,
    genes,
    setters,
    signal: signalGene ? sentence(signalGene.explanation) : "",
    stats: {
      signal: gene("signal")?.display ?? "—",
      trigger: gene("trigger")?.display ?? "—",
      size: display("size", ""),
      tempo: gene("tempo")?.display ?? "—",
    },
    genomeVersion: genome.version,
  };
}

/** "Side Eye eyes: it fades the crowd…" -> "It fades the crowd…" (the trait is shown next to it). */
function sentence(explanation: string): string {
  const cut = explanation.indexOf(": ");
  const rest = cut > 0 && cut < 48 ? explanation.slice(cut + 2) : explanation;
  return scrubTraitText(rest.charAt(0).toUpperCase() + rest.slice(1));
}

// ---------------------------------------------------------------- its wallet

export type ChogWallet = { address: string; short: string; href?: string };

/** The Chog's ERC-6551 wallet address, computed locally exactly like the app does. */
export function chogWallet(tokenId: number): ChogWallet | null {
  const { chogNft, accountImplementation, chain, salt } = appConfig;
  if (!chogNft || !accountImplementation) return null;
  try {
    const address = computeTokenBoundAccount({
      implementation: accountImplementation,
      tokenContract: chogNft,
      tokenId: BigInt(tokenId),
      chainId: chain.id,
      salt,
    });
    return { address, short: shortAddress(address), href: explorerAddressUrl(address) };
  } catch {
    // A malformed NEXT_PUBLIC_TBA_SALT must not take the landing page down.
    return null;
  }
}

// ---------------------------------------------------------------- numbers

/** "+9.1%" / "−9.4%" with a real minus sign, for display numbers. */
export function signedPct(pct: number, digits = 1): string {
  if (!Number.isFinite(pct)) return "—";
  const rounded = Math.abs(pct) < 0.5 * 10 ** -digits ? 0 : pct;
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded).toFixed(digits)}%`;
}

// ---------------------------------------------------------------- Random Chog

/** What the Random Chog button may land on: every token id except flagged art and Chogs without traits. */
export function randomChogPool(): { min: number; max: number; exclude: number[] } {
  const chogs = allChogs();
  const exclude = chogs
    .filter((chog) => FLAGGED_TOKEN_IDS.has(chog.id) || Object.keys(chog.traits).length === 0)
    .map((chog) => chog.id);
  return { min: chogs[0]?.id ?? 1, max: chogs[chogs.length - 1]?.id ?? 1969, exclude };
}

// ---------------------------------------------------------------- the guard and the House Chog

export type GuardLink = { address: string; short: string; href?: string };

/** The deployed guard: NEXT_PUBLIC_TRADE_GUARD_ADDRESS, else the mainnet deployment (lib/contracts/animr-trade-guard.ts). */
export function guardLink(): GuardLink | null {
  const address = animrTradeGuardAddress;
  return address ? { address, short: shortAddress(address), href: explorerAddressUrl(address) } : null;
}

/** `archetype` is what its genome makes it ("Paper Paws" for token 1399); `name` is its persona name. */
export type HouseShowcase = { tokenId: number; label: string; name: string; archetype: string };

/**
 * HOUSE_CHOG_TOKEN_ID with both its numbers and its persona name, or null while the team is still picking it. Being
 * picked isn't being open: whether its wallet is ready and funded is read live (GET /api/heist, house-status.tsx).
 */
export function houseChog(): HouseShowcase | null {
  const tokenId = houseChogTokenId();
  const chog = tokenId === null ? undefined : getChog(tokenId);
  return tokenId !== null && chog
    ? { tokenId, label: marketName(tokenId, chog.name), name: nameOf(chog), archetype: genomeOf(chog).archetype }
    : null;
}
