import { shownGenome } from "@/app/api/dna/shape";
import { hasBlockedTerm, traitSafety } from "@/lib/brand-safety";
import type { TradingStyle } from "@/lib/agent/types";
import { nameNumberOf } from "@/lib/chog-id";
import { DEFAULT_WINDOW, type ReplaySeries, prepareSeries, replay } from "@/lib/dna/backtest";
import { getChog } from "@/lib/dna/chogs";
import { deriveGenome } from "@/lib/dna/genome";
import { getCandleSeries } from "@/lib/dna/history";
import { chogGenome, chogName } from "@/lib/dna/population";
import type { ChogSnapshot, Gene, ReplayWindow } from "@/lib/dna/types";
import { childName, childTraits, inherit } from "./genetics";

// "Breed two Chogs": the child's traits come half from each parent (lib/breed/genetics.ts), its Trading DNA from the
// same genome compiler every Chog uses, and all three replay the same real hourly $CHOG candles with the same engine
// as the Time Machine and the League (lib/dna/backtest.ts). Simulated: nothing trades. Server-only (data/chogs.json).

export type BreedParent = {
  tokenId: number;
  /** Persona name, e.g. "Rocket Ears". */
  name: string;
  /** Marketplace name, "CHOG #1462" (a 1:1 keeps its title), or "token 7" without one. */
  label: string;
  image: string;
  archetype: string;
  style: TradingStyle;
  edgePct: number;
  trades: number;
};

export type BreedChild = {
  name: string;
  archetype: string;
  style: TradingStyle;
  /** Display-safe values; `from` is "a" or "b" (the URL's order), `value` null when that parent had none. */
  traits: { type: string; value: string | null; from: "a" | "b" }[];
  genes: Gene[];
  edgePct: number;
  trades: number;
};

export type BreedVerdict = { kind: "beat-both" | "between" | "worse-than-both"; text: string };

export type BreedResult = {
  genomeVersion: string;
  window: ReplayWindow;
  startChog: number;
  a: BreedParent;
  b: BreedParent;
  child: BreedChild;
  /** Same close times for all three: [t, price, child edge %, A edge %, B edge %]. Downsampled (~480 points). */
  points: [number, number, number, number, number][];
  verdict: BreedVerdict;
};

/** Edges this close count as level (rounding noise). */
const TIE = 0.05;
const MAX_CACHED = 200;

type BreedCache = { fingerprint: string; series: ReplaySeries; results: Map<string, BreedResult> };
const globalForBreed = globalThis as typeof globalThis & { __animrBreed?: BreedCache };

async function seriesNow(): Promise<BreedCache> {
  const { candles, fingerprint } = await getCandleSeries();
  const hit = globalForBreed.__animrBreed;
  if (hit?.fingerprint === fingerprint) return hit;
  const fresh: BreedCache = { fingerprint, series: prepareSeries(candles, DEFAULT_WINDOW), results: new Map() };
  globalForBreed.__animrBreed = fresh;
  return fresh;
}

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

function labelOf(chog: ChogSnapshot): string {
  return nameNumberOf(chog.name) !== null ? chog.name.trim() : `token ${chog.id}`;
}

function verdictOf(child: number, a: BreedParent, b: BreedParent): BreedVerdict {
  if (child > Math.max(a.edgePct, b.edgePct) + TIE) return { kind: "beat-both", text: "The child beat both parents" };
  if (child < Math.min(a.edgePct, b.edgePct) - TIE) return { kind: "worse-than-both", text: "Worse than both parents" };
  const closer = Math.abs(child - a.edgePct) <= Math.abs(child - b.edgePct) ? a : b;
  return { kind: "between", text: `Takes after ${closer.name}` };
}

/**
 * The child of Chogs `aId` and `bId` (token ids, different, 1-1969) and the three replays over the default window.
 * Same pair, either order -> the same child. Throws RangeError for unknown or equal ids. Reads the clock (candle
 * cache), so call it from a route handler or after connection().
 */
export async function breed(aId: number, bId: number): Promise<BreedResult> {
  const chogA = getChog(aId);
  const chogB = getChog(bId);
  if (!chogA || !chogB) throw new RangeError("Both parents must be Chogs (token ids 1-1969).");
  if (aId === bId) throw new RangeError("A Chog can't breed with itself.");

  const cache = await seriesNow();
  const key = `${aId}:${bId}`;
  const hit = cache.results.get(key);
  if (hit) return hit;

  const inherited = inherit({ tokenId: aId, traits: chogA.traits }, { tokenId: bId, traits: chogB.traits });
  // The child is a new trader: no token id (0) and no metadata name, so no 1:1 legend genome.
  const genomeChild = deriveGenome(childTraits(inherited));
  const genomeA = chogGenome(chogA);
  const genomeB = chogGenome(chogB);
  const runChild = replay(genomeChild, cache.series, 0);
  const runA = replay(genomeA, cache.series, aId);
  const runB = replay(genomeB, cache.series, bId);

  const parent = (chog: ChogSnapshot, archetype: string, style: TradingStyle, run: typeof runA): BreedParent => ({
    tokenId: chog.id,
    name: chogName(chog),
    label: labelOf(chog),
    image: chog.image,
    archetype,
    style,
    edgePct: run.edgePct,
    trades: run.trades.length,
  });
  const a = parent(chogA, genomeA.archetype, genomeA.style, runA);
  const b = parent(chogB, genomeB.archetype, genomeB.style, runB);

  const bred = childName(a, b);
  const shown = shownGenome(genomeChild);
  const edge = (value: number) => round((value / runChild.startChog - 1) * 100, 3);

  const result: BreedResult = {
    genomeVersion: genomeChild.version,
    window: runChild.window,
    startChog: runChild.startChog,
    a,
    b,
    child: {
      name: hasBlockedTerm(bred) ? "Chog Jr." : bred,
      archetype: shown.archetype,
      style: shown.style,
      traits: inherited.map(({ type, value, from }) => ({
        type,
        value: value === null ? null : traitSafety(type, value).display,
        from: from === aId ? "a" : "b",
      })),
      genes: shown.genes,
      edgePct: runChild.edgePct,
      trades: runChild.trades.length,
    },
    // One series, one downsampling step: the three point lists line up index by index.
    points: runChild.points.map((p, i) => [p.t, p.price, edge(p.value), edge(runA.points[i]?.value ?? p.value), edge(runB.points[i]?.value ?? p.value)]),
    verdict: verdictOf(runChild.edgePct, a, b),
  };
  if (cache.results.size >= MAX_CACHED) cache.results.delete(cache.results.keys().next().value!);
  cache.results.set(key, result);
  return result;
}
