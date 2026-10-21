import { cacheLife } from "next/cache";
import { oracleLine } from "@/components/bell/format";
import { DEFAULT_WINDOW } from "@/components/dna/shared";
import type { TradingStyle } from "@/lib/agent/types";
import { isFlaggedTokenId, traitSafety } from "@/lib/brand-safety";
import { visibleSummary } from "@/lib/bell/showcase";
import { bellDays, latestSummary, readCall, readCalls, readSummary } from "@/lib/bell/store";
import type { BellCall, BellSummary } from "@/lib/bell/types";
import { getChog } from "@/lib/dna/chogs";
import { chogGenome, chogName, getPopulation, getStanding } from "@/lib/dna/population";
import type { Gene, Genome, PopulationResponse } from "@/lib/dna/types";
import { type Visibility, hiddenOn } from "@/lib/visibility";
import { artExpected, chogArt } from "./art";
import { type Herd, herdOfBuckets, herdOfCalls } from "./herd";

// Data for the share cards, cached with `use cache` so a crawler storm costs one computation. Every
// loader is read-only (no Bell seeding, no agent runs) and never throws: a missing piece comes back as
// null, and the card still renders without it. Server-only.
//
// "Hide my Chog" (lib/visibility.ts): a card never shows a Chog its holder hid. The hidden list is read per
// request by the image route (loadVisibility) and passed in as `hidden` (sorted token ids), so it is part of each
// cached loader's key instead of being cached inside it.

/** The share-card form of the hidden list: sorted, so equal lists share one cache entry. */
export function hiddenKey(hidden: ReadonlySet<number>): number[] {
  return [...hidden].sort((a, b) => a - b);
}

/** `items` without the Chogs their holders hid. */
export function withoutHidden<T extends { tokenId: number }>(items: readonly T[], hidden: readonly number[]): T[] {
  return hidden.length ? items.filter((item) => !hidden.includes(item.tokenId)) : [...items];
}

function visibilityOf(hidden: readonly number[]): Visibility {
  const set: ReadonlySet<number> = new Set(hidden);
  return { hidden: set, isHidden: (tokenId, surface = "list") => hiddenOn(tokenId, surface, set) };
}

// --- Chog card -------------------------------------------------------------------------------------

export type CardGene = {
  key: string;
  /** "Signal", "Exit", ... */
  label: string;
  /** "Momentum chaser" */
  display: string;
  /** 0-100, for a bar. */
  value: number;
  /** The trait that set it, flagged values under their neutral names; null when none (or hidden). */
  trait: { type: string; value: string } | null;
};

export type ChogCardCore = {
  tokenId: number;
  /** The marketplace name, e.g. "CHOG #1468" (token 7) or "CHOG #53 — Blaze" for a 1:1; "" when unknown. */
  metadataName: string;
  /** Its persona name, e.g. "Patient Ears" (the one every page shows). */
  name: string;
  archetype: string;
  style: TradingStyle;
  /** Signal plus the two most telling genes its traits set. */
  genes: CardGene[];
  /** Its place in the league (simulated), or null when the league couldn't be computed. */
  league: { rank: number; total: number; edgePct: number; trades: number; windowLabel: string } | null;
  art: string | null;
};

/** After Signal: the genes its traits set, the most telling first... */
const TRAIT_GENE_ORDER = ["bias", "nerve", "exit", "size", "trigger", "tempo", "horizon"];
/** ...then default genes, the most concrete first (a "Neutral" bias or "Steady" nerve says little). */
const DEFAULT_GENE_ORDER = ["exit", "trigger", "size", "tempo", "horizon", "nerve", "bias"];

function cardGene(gene: Gene): CardGene {
  let trait: CardGene["trait"] = null;
  if (gene.trait) {
    // Never the raw value of a flagged trait (lib/brand-safety.ts).
    const verdict = traitSafety(gene.trait.type, gene.trait.value);
    if (verdict.action !== "hide") trait = { type: gene.trait.type, value: verdict.display };
  }
  const value = Number.isFinite(gene.value) ? Math.max(0, Math.min(100, gene.value)) : 0;
  return { key: gene.key, label: gene.label, display: noWagerWords(gene.display), value, trait };
}

/** Cards never use wagering words (the genome's labels already use trading words; this is a safety net). */
function noWagerWords(text: string): string {
  return text.replace(/\bbets\b/gi, "size").replace(/\bbet\b/gi, "call");
}

function topGenes(genome: Genome, count = 3): CardGene[] {
  const genes = genome.genes.map(cardGene);
  const order = (gene: CardGene) => {
    const list = gene.trait ? TRAIT_GENE_ORDER : DEFAULT_GENE_ORDER;
    return (gene.trait ? 0 : 100) + (list.includes(gene.key) ? list.indexOf(gene.key) : list.length);
  };
  const rest = genes.filter((gene) => gene.key !== "signal").sort((a, b) => order(a) - order(b));
  return [...genes.filter((gene) => gene.key === "signal"), ...rest].slice(0, count);
}

/** "Sep 4 – Oct 19" from the window label "Sep 4 – Oct 19 (hourly, real CHOG/WMON)". */
const shortWindow = (label: string) => label.replace(/\s*\(.*\)\s*$/, "");

/** A Chog's identity, top genes, league standing and art (the hourly part of its card). Null for unknown ids. */
export async function loadChogCore(tokenId: number): Promise<ChogCardCore | null> {
  "use cache";
  const chog = getChog(tokenId);
  if (!chog) {
    cacheLife("max");
    return null;
  }
  const genome = chogGenome(chog);
  const [standing, art] = await Promise.all([getStanding(tokenId, DEFAULT_WINDOW).catch(() => null), chogArt(tokenId)]);
  // The league moves with each hourly candle; a card missing a piece is retried within minutes.
  if (standing && (art || !artExpected(tokenId))) cacheLife("hours");
  else cacheLife("minutes");
  return {
    tokenId,
    metadataName: chog.name,
    name: chogName(chog),
    archetype: genome.archetype,
    style: genome.style,
    genes: topGenes(genome),
    league: standing
      ? {
          rank: standing.row.rank,
          total: standing.total,
          edgePct: standing.row.edgePct,
          trades: standing.row.trades,
          windowLabel: shortWindow(standing.window.label),
        }
      : null,
    art,
  };
}

export type ChogBellBrief = {
  day: string;
  status: BellSummary["status"];
  kind: BellSummary["kind"];
  horizonAt: string;
  forecastPct: number;
  conviction: number;
  source: BellCall["source"];
  /** Once settled. */
  actualPct: number | null;
  points: number | null;
  hit: boolean | null;
};

/** The Chog's call at the latest Bell (changes at every 15:00 UTC ring and at settlement), or null. */
export async function loadChogBell(tokenId: number): Promise<ChogBellBrief | null> {
  "use cache";
  cacheLife("minutes");
  try {
    const latest = await latestSummary();
    const call = latest ? await readCall(latest, tokenId) : undefined;
    if (!latest || !call) return null;
    return {
      day: latest.day,
      status: latest.status,
      kind: latest.kind,
      horizonAt: latest.horizonAt,
      forecastPct: call.forecastPct,
      conviction: call.conviction,
      source: call.source,
      actualPct: latest.actualPct,
      points: call.points ?? null,
      hit: call.hit ?? null,
    };
  } catch (error) {
    console.warn(`[animr] Share card: no Bell call for Chog #${tokenId}:`, (error as Error).message);
    return null;
  }
}

// --- Bell card ------------------------------------------------------------------------------------

/** A Chog in the spotlight of a Bell card. */
export type BellSpot = {
  tokenId: number;
  name: string;
  forecastPct: number;
  conviction: number;
  source: BellCall["source"];
  art: string | null;
};

export type BellOracle = BellSpot & {
  /** The Bell it won (on /bell, the last settled one, which may be older than the card's Bell). */
  day: string;
  kind: BellSummary["kind"];
  actualPct: number;
  errorPts: number | null;
  points: number | null;
  /** Its gloat, the same line the Bell page shows. */
  line: string;
  /** The furthest call of the same Bell (the AI that got roasted), when there is one. */
  rekt: (BellSpot & { errorPts: number | null }) | null;
};

export type BellSide = {
  day: string;
  status: BellSummary["status"];
  kind: BellSummary["kind"];
  horizonAt: string;
  calls: number;
  /**
   * Calls above, at and below 0%: counted from the calls, else from bullPct/bearPct. `exact` is false only
   * for an old summary without bearPct read without its calls (then `bear` holds the flat calls too).
   */
  split: { bull: number; flat: number; bear: number; exact: boolean };
  /** The herd, symmetric around 0 (lib/og/herd.ts): 5 bear buckets, the flat calls, 5 bull buckets. */
  herd: Herd;
  actualPct: number | null;
};

export type BellCardData =
  | { state: "none"; day: string | null; upcoming: boolean; showcase: ShowcaseChog[] }
  | {
      state: "bell";
      bell: BellSide;
      /** The verdict next to it: this Bell's once settled, else (on /bell) the last settled Bell's. */
      verdict: BellOracle | null;
      /** For an open Bell without a verdict to show: its boldest bull and boldest bear. */
      bold: { bull: BellSpot | null; bear: BellSpot | null } | null;
    };

function splitOf(summary: BellSummary, calls: readonly BellCall[]): BellSide["split"] {
  if (calls.length === 0) {
    const total = summary.calls;
    const bull = Math.round((summary.bullPct / 100) * total);
    if (typeof summary.bearPct !== "number") return { bull, flat: 0, bear: Math.max(0, total - bull), exact: false };
    const bear = Math.min(Math.max(0, total - bull), Math.round((summary.bearPct / 100) * total));
    return { bull, flat: total - bull - bear, bear, exact: true };
  }
  let bull = 0;
  let bear = 0;
  for (const call of calls) {
    if (call.forecastPct > 0) bull++;
    else if (call.forecastPct < 0) bear++;
  }
  return { bull, flat: calls.length - bull - bear, bear, exact: true };
}

/** The boldest call in one direction (1 bull, -1 bear), never a flagged or hidden Chog. */
function boldestCall(calls: readonly BellCall[], direction: 1 | -1, visibility: Visibility): BellCall | null {
  let best: BellCall | null = null;
  for (const call of calls) {
    if (Math.sign(call.forecastPct) !== direction || visibility.isHidden(call.tokenId, "featured")) continue;
    const better =
      !best ||
      direction * call.forecastPct > direction * best.forecastPct ||
      (call.forecastPct === best.forecastPct &&
        (call.conviction > best.conviction || (call.conviction === best.conviction && call.tokenId < best.tokenId)));
    if (better) best = call;
  }
  return best;
}

async function spot(call: BellCall): Promise<BellSpot> {
  const chog = getChog(call.tokenId);
  return {
    tokenId: call.tokenId,
    name: chog ? chogName(chog) : call.name,
    forecastPct: call.forecastPct,
    conviction: call.conviction,
    source: call.source,
    art: await chogArt(call.tokenId),
  };
}

async function oracleOf(summary: BellSummary): Promise<BellOracle | null> {
  const { oracle, mostRekt, actualPct } = summary;
  if (summary.status !== "settled" || !oracle || actualPct === null) return null;
  const rektShown = mostRekt && mostRekt.tokenId !== oracle.tokenId && !isFlaggedTokenId(mostRekt.tokenId);
  const [best, worst] = await Promise.all([spot(oracle), rektShown ? spot(mostRekt) : null]);
  return {
    ...best,
    day: summary.day,
    kind: summary.kind,
    actualPct,
    errorPts: oracle.errorPts ?? null,
    points: oracle.points ?? null,
    // With real minus signs, like every other number on the card.
    line: oracleLine(oracle, actualPct, summary.day).replace(/(^|[\s(])-(?=\d)/g, "$1−"),
    rekt: worst && mostRekt ? { ...worst, errorPts: mostRekt.errorPts ?? null } : null,
  };
}

/** The newest settled Bell before `day` (a few reads at most: Bells settle a day after they ring), as shown. */
async function lastSettledBefore(day: string, visibility: Visibility): Promise<BellSummary | null> {
  const earlier = (await bellDays()).filter((d) => d < day).slice(-3).reverse();
  for (const d of earlier) {
    const stored = await readSummary(d);
    const summary = stored && (await visibleSummary(stored, visibility));
    if (summary?.status === "settled" && summary.oracle && summary.actualPct !== null) return summary;
  }
  return null;
}

/**
 * A Bell card: the Bell of `day`, or the latest Bell when `day` is null (/bell). Next to an open Bell,
 * /bell shows the last settled Bell's verdict and Oracle; /bell/[day] shows the open Bell's boldest
 * bull and boldest bear. A day without a Bell comes back as state "none" (upcoming when it is after
 * the latest Bell). Chogs in `hidden` (sorted, hiddenKey) hand their spots to the next call in line.
 */
export async function loadBellCard(day: string | null, hidden: readonly number[] = []): Promise<BellCardData> {
  "use cache";
  const visibility = visibilityOf(hidden);
  try {
    const stored = day ? await readSummary(day) : await latestSummary();
    const summary = stored && (await visibleSummary(stored, visibility));
    if (!summary) {
      const [latest, showcase] = await Promise.all([day ? latestSummary() : null, loadShowcase().then((s) => withoutHidden(s, hidden))]);
      cacheLife("minutes");
      // With no Bell at all yet (a fresh store) a day can't be placed: the neutral card.
      if (!day || !latest) return { state: "none", day: null, upcoming: false, showcase };
      return { state: "none", day, upcoming: day > latest.day, showcase };
    }
    const calls = await readCalls(summary).catch(() => [] as BellCall[]);
    const verdictBell =
      summary.status === "settled" ? summary : day === null ? await lastSettledBefore(summary.day, visibility) : null;
    const verdict = verdictBell ? await oracleOf(verdictBell) : null;
    let bold: { bull: BellSpot | null; bear: BellSpot | null } | null = null;
    if (!verdict && summary.status === "open") {
      const [bull, bear] = await Promise.all(
        ([1, -1] as const).map((direction) => {
          const call = boldestCall(calls, direction, visibility);
          return call ? spot(call) : null;
        }),
      );
      bold = { bull, bear };
    }
    const shown = [verdict, verdict?.rekt, bold?.bull, bold?.bear].filter((s): s is BellSpot => Boolean(s));
    const complete = calls.length > 0 && shown.every((s) => s.art || !artExpected(s.tokenId));
    // A settled Bell is final (until a new genome rebuilds the replays); the latest one turns over daily.
    if (complete && day !== null && summary.status === "settled") cacheLife("days");
    else cacheLife("minutes");
    return {
      state: "bell",
      bell: {
        day: summary.day,
        status: summary.status,
        kind: summary.kind,
        horizonAt: summary.horizonAt,
        calls: summary.calls,
        split: splitOf(summary, calls),
        herd: calls.length
          ? herdOfCalls(
              calls.map((call) => call.forecastPct),
              summary.status === "settled" ? summary.actualPct : null,
            )
          : herdOfBuckets(summary.histogram),
        actualPct: summary.actualPct,
      },
      verdict,
      bold,
    };
  } catch (error) {
    console.warn(`[animr] Share card: Bell ${day ?? "latest"} unavailable:`, (error as Error).message);
    cacheLife("minutes");
    return { state: "none", day, upcoming: false, showcase: withoutHidden(await loadShowcase().catch(() => []), hidden) };
  }
}

// --- Showcase -------------------------------------------------------------------------------------

/** The landing page's lineup (components/landing/content.ts showcaseIds.lineup): curated, never flagged. */
const SHOWCASE_IDS = [241, 1342, 1820, 255, 45];

export type ShowcaseChog = { tokenId: number; art: string };

/** The art of five curated Chogs, for cards without a Chog of their own (only the ones with art). */
export async function loadShowcase(): Promise<ShowcaseChog[]> {
  "use cache";
  const ids = SHOWCASE_IDS.filter((id) => getChog(id) && !isFlaggedTokenId(id));
  const arts = await Promise.all(ids.map((id) => chogArt(id)));
  if (arts.every(Boolean)) cacheLife("max");
  else cacheLife("minutes");
  return ids.flatMap((tokenId, i) => (arts[i] ? [{ tokenId, art: arts[i] }] : []));
}

// --- League card ----------------------------------------------------------------------------------

export type LeaguePodiumRow = {
  rank: number;
  tokenId: number;
  name: string;
  archetype: string;
  edgePct: number;
  trades: number;
  art: string | null;
};

export type LeagueCardData = {
  total: number;
  windowLabel: string;
  stats: PopulationResponse["stats"];
  podium: LeaguePodiumRow[];
};

/**
 * The league's top 3 and stats (the league is recomputed with each hourly candle), or null. Chogs in `hidden`
 * (sorted, hiddenKey) are left off the podium; every row keeps its rank and the stats stay the whole collection's.
 */
export async function loadLeagueCard(hidden: readonly number[] = []): Promise<LeagueCardData | null> {
  "use cache";
  const population = await getPopulation(DEFAULT_WINDOW).catch(() => null);
  if (!population || population.rows.length === 0) {
    cacheLife("minutes");
    return null;
  }
  const top = withoutHidden(population.rows, hidden).slice(0, 3);
  const arts = await Promise.all(top.map((row) => chogArt(row.tokenId)));
  if (top.every((row, i) => arts[i] || !artExpected(row.tokenId))) cacheLife("hours");
  else cacheLife("minutes");
  return {
    total: population.rows.length,
    windowLabel: shortWindow(population.window.label),
    stats: population.stats,
    podium: top.map((row, i) => ({
      rank: row.rank,
      tokenId: row.tokenId,
      name: row.name,
      archetype: row.archetype,
      edgePct: row.edgePct,
      trades: row.trades,
      art: arts[i],
    })),
  };
}
