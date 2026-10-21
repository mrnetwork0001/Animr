import candleFile from "@/data/chog-ohlcv-1h.json";
import { personaName, sanitizeTraits } from "@/lib/agent/persona";
import type { TradingStyle } from "@/lib/agent/types";
import { FLAGGED_TOKEN_IDS, displayTraitValue, scrubTraitText, traitSafety } from "@/lib/brand-safety";
import { chogLabel } from "@/lib/chog-id";
import { appConfig } from "@/lib/config";
import { animrTradeGuardAddress } from "@/lib/contracts/animr-trade-guard";
import { DEFAULT_WINDOW, type ReplaySeries, prepareSeries, replay, replayStats } from "@/lib/dna/backtest";
import { allChogs, getChog } from "@/lib/dna/chogs";
import { GENOME_VERSION, deriveGenome, genomeParams } from "@/lib/dna/genome";
import { type Candle, type CandleFile, HOUR, fillGaps } from "@/lib/dna/history";
import type { ChogSnapshot, Genome } from "@/lib/dna/types";
import { computeTokenBoundAccount } from "@/lib/erc6551";
import { explorerAddressUrl, shortAddress } from "@/lib/format";
import { houseChogTokenId } from "@/lib/heist/config";
import { resolveUri } from "@/lib/nft";
import { FALLBACK_IMAGE_IDS } from "./content";

// Server only (it reads the ~1 MB Chog snapshot and the committed candles): everything the landing
// page shows about a Chog or the League, computed with the app's own code from data/chogs.json and
// data/chog-ohlcv-1h.json. Pure functions of committed data (no RPC, no clock, no network), so the
// page still prerenders as static HTML and these numbers are fixed when the page is built; each one
// is shown with its genome version and candle window.

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
  /** Both numbers, the marketplace name first: "CHOG #1312 · token 1820" (lib/chog-id.ts). */
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
    label: chogLabel(tokenId, { metadataName: chog.name }),
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

// ---------------------------------------------------------------- the League, replayed at build time

export type LeagueSnapshot = {
  genomeVersion: string;
  /** "Sep 4 – Oct 19, 2026": the first and last decision of the window (UTC). */
  window: string;
  total: number;
  beatHoldPct: number;
  medianEdgePct: number;
  bestEdgePct: number;
  worstEdgePct: number;
  /** Rank (1 = best; ties share a rank) and edge vs holding, per token id. */
  standings: ReadonlyMap<number, { rank: number; edgePct: number }>;
};

/** One call a Chog made in its replay, in its genome's voice (rules, not the LLM). */
export type ReplayCall = { t: number; side: "buy" | "sell"; text: string };

let series: ReplaySeries | null | undefined;
let league: LeagueSnapshot | null | undefined;
const calls = new Map<number, ReplayCall | null>();

/** A committed candle row ([t, open, high, low, close, volume]) as a Candle, or null when malformed. */
function toCandle(row: unknown): Candle | null {
  if (!Array.isArray(row) || row.length < 6) return null;
  const [t, open, high, low, close, volume] = row.map(Number);
  if (!Number.isInteger(t) || t % HOUR !== 0 || ![open, high, low, close].every((p) => p > 0 && Number.isFinite(p))) return null;
  return { t, open, high, low, close, volume: Number.isFinite(volume) && volume > 0 ? volume : 0 };
}

/**
 * The League's default window over the committed hourly candles: what lib/dna/history.ts serves when
 * GeckoTerminal is unreachable, so it matches the League until newer candles arrive.
 */
function committedSeries(): ReplaySeries | null {
  if (series !== undefined) return series;
  try {
    const rows = (candleFile as unknown as CandleFile).candles;
    series = prepareSeries(fillGaps(rows.flatMap((row) => toCandle(row) ?? [])), DEFAULT_WINDOW);
  } catch (error) {
    console.warn("[animr] Landing: couldn't replay the committed candles:", (error as Error).message);
    series = null;
  }
  return series;
}

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const YEAR = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "UTC" });

/** "Sep 4 – Oct 19, 2026" from unix seconds. */
function windowLabel(from: number, to: number): string {
  const [a, b] = [from * 1000, to * 1000];
  const fromYear = YEAR.format(a) === YEAR.format(b) ? "" : `, ${YEAR.format(a)}`;
  return `${DAY.format(a)}${fromYear} – ${DAY.format(b)}, ${YEAR.format(b)}`;
}

/**
 * All 1,969 genomes replayed over the League's default window, ranked like lib/dna/population.ts
 * (edges rounded to 0.01%, ties share a rank). ~150 ms, once per server process. Null if the
 * committed candles can't be replayed: the page then leaves the numbers out.
 */
export function leagueSnapshot(): LeagueSnapshot | null {
  if (league !== undefined) return league;
  const window = committedSeries();
  if (!window) return (league = null);
  try {
    const rows = allChogs().map((chog) => ({ tokenId: chog.id, edgePct: round(replayStats(genomeOf(chog), window).edgePct) }));
    rows.sort((a, b) => b.edgePct - a.edgePct || a.tokenId - b.tokenId);
    const standings = new Map<number, { rank: number; edgePct: number }>();
    let rank = 0;
    rows.forEach((row, i) => {
      if (i === 0 || row.edgePct !== rows[i - 1].edgePct) rank = i + 1;
      standings.set(row.tokenId, { rank, edgePct: row.edgePct });
    });
    const sorted = rows.map((row) => row.edgePct).sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    league = {
      genomeVersion: GENOME_VERSION,
      window: windowLabel(window.window.from, window.window.to),
      total: rows.length,
      beatHoldPct: round((sorted.filter((edge) => edge > 0).length / Math.max(1, sorted.length)) * 100, 1),
      medianEdgePct: round(median),
      bestEdgePct: sorted[sorted.length - 1] ?? 0,
      worstEdgePct: sorted[0] ?? 0,
      standings,
    };
  } catch (error) {
    console.warn("[animr] Landing: couldn't compute the League:", (error as Error).message);
    league = null;
  }
  return league;
}

/** The Chog's first sell in its replay (else its first trade), in its genome's own words. */
export function replayCall(tokenId: number): ReplayCall | null {
  if (calls.has(tokenId)) return calls.get(tokenId) ?? null;
  let call: ReplayCall | null = null;
  const chog = getChog(tokenId);
  const window = committedSeries();
  if (chog && window) {
    try {
      const { trades } = replay(genomeOf(chog), window, tokenId);
      const pick = trades.find((trade) => trade.side === "sell") ?? trades[0];
      if (pick) call = { t: pick.t, side: pick.side, text: scrubTraitText(pick.reason) };
    } catch (error) {
      console.warn(`[animr] Landing: couldn't replay Chog #${tokenId}:`, (error as Error).message);
    }
  }
  calls.set(tokenId, call);
  return call;
}

const CALL_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

/** "Sep 4, 03:00 UTC" from unix seconds. */
export function formatCallTime(t: number): string {
  return `${CALL_TIME.format(t * 1000)} UTC`;
}

/** "+9.1%" / "−9.4%" with a real minus sign, for display numbers. */
export function signedPct(pct: number, digits = 1): string {
  if (!Number.isFinite(pct)) return "—";
  const rounded = Math.abs(pct) < 0.5 * 10 ** -digits ? 0 : pct;
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : ""}${Math.abs(rounded).toFixed(digits)}%`;
}

/** "39%" or "38.6%": one decimal only when it says something. */
export function plainPct(pct: number): string {
  const text = pct.toFixed(1);
  return `${text.endsWith(".0") ? text.slice(0, -2) : text}%`;
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
    ? { tokenId, label: chogLabel(tokenId, { metadataName: chog.name }), name: nameOf(chog), archetype: genomeOf(chog).archetype }
    : null;
}
