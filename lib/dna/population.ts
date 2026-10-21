import { personaName, sanitizeTraits } from "../agent/persona";
import { getStore } from "../agent/store";
import { resolveUri } from "../nft";
import { type ReplaySeries, type WindowKey, parseWindow, prepareSeries, replay, replayStats } from "./backtest";
import { allChogs, getChog } from "./chogs";
import { GENOME_VERSION, deriveGenome } from "./genome";
import { HOUR, getCandleSeries } from "./history";
import type {
  ChogSnapshot,
  ChogStanding,
  Genome,
  InstinctSince,
  PopulationResponse,
  PopulationRow,
  ReplayResult,
  ReplayWindow,
  TraitAlphaRow,
} from "./types";

// The league: every one of the 1,969 Chogs replayed with its genome over the same real candles.
// Results are cached per (genome version, window, last candle), so they recompute once an hour.
// Every number here is simulated on real $CHOG candles (1% fee + impact), not real trading.

/** Trait values carried by fewer Chogs are left out of Trait Alpha (their median is noise). */
export const TRAIT_ALPHA_MIN_COUNT = 10;
const CLAIMED_TTL_MS = 30_000;
const MAX_CACHED_REPLAYS = 400;

type League = {
  key: string;
  window: ReplayWindow;
  computedAt: string;
  /** Best first; claimed is filled per request. */
  rows: PopulationRow[];
  stats: PopulationResponse["stats"];
  edges: Map<number, number>;
  traits?: TraitAlphaRow[];
};

type DnaCache = {
  version: string;
  genomes: Map<number, Genome>;
  names: Map<number, string>;
  series: Map<WindowKey, { fingerprint: string; series: ReplaySeries }>;
  leagues: Map<WindowKey, League>;
  pending: Map<string, Promise<League>>;
  replays: Map<string, ReplayResult>;
  claimed?: { expires: number; ids: AgentDivisions };
};

/** Chogs with an awake agent, and those whose agent trades real $CHOG through AnimrTradeGuard (on-chain mode). */
type AgentDivisions = { claimed: Set<number>; onchain: Set<number> };

// Shared by every route bundle in the process (like the agent store).
const globalForDna = globalThis as typeof globalThis & { __animrDna?: DnaCache };

/**
 * Bump when display text derived from a genome changes without the genome itself (GENOME_VERSION hashes the rules,
 * not their wording, e.g. SIZE_DISPLAY), so a long-running server drops genomes cached with the old words.
 */
const DISPLAY_REV = 2;
const CACHE_KEY = `${GENOME_VERSION}:display-${DISPLAY_REV}`;

function cache(): DnaCache {
  if (globalForDna.__animrDna?.version !== CACHE_KEY) {
    globalForDna.__animrDna = {
      version: CACHE_KEY,
      genomes: new Map(),
      names: new Map(),
      series: new Map(),
      leagues: new Map(),
      pending: new Map(),
      replays: new Map(),
    };
  }
  return globalForDna.__animrDna;
}

function windowKey(window: string): WindowKey {
  const key = parseWindow(window);
  if (!key) throw new RangeError(`Unknown window "${window}": use 30d, 45d or max`);
  return key;
}

/** A Chog's genome (cached). Passes the metadata name, which the ten 1:1 Legendaries need. */
export function chogGenome(chog: ChogSnapshot): Genome {
  const genomes = cache().genomes;
  let genome = genomes.get(chog.id);
  if (!genome) genomes.set(chog.id, (genome = deriveGenome(chog.traits, chog.name)));
  return genome;
}

/** The Chog's persona name, e.g. "Rocket Ears" (the same name its agent gets). */
export function chogName(chog: ChogSnapshot): string {
  const names = cache().names;
  let name = names.get(chog.id);
  if (!name) names.set(chog.id, (name = personaName(String(chog.id), sanitizeTraits(chog.traits))));
  return name;
}

/** The window's replay series, rebuilt whenever the candles change (a new hour or a revised close). */
async function seriesFor(window: WindowKey): Promise<{ fingerprint: string; series: ReplaySeries }> {
  const { candles, fingerprint } = await getCandleSeries();
  const series = cache().series;
  const hit = series.get(window);
  if (hit?.fingerprint === fingerprint) return hit;
  const fresh = { fingerprint, series: prepareSeries(candles, window) };
  series.set(window, fresh);
  return fresh;
}

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function league(window: WindowKey): Promise<League> {
  const { fingerprint, series } = await seriesFor(window);
  const key = `${window}:${fingerprint}`;
  const { leagues, pending } = cache();
  const hit = leagues.get(window);
  if (hit?.key === key) return hit;
  let run = pending.get(key);
  if (!run) {
    run = Promise.resolve()
      .then(() => computeLeague(series, key))
      .then((result) => {
        leagues.set(window, result);
        return result;
      })
      .finally(() => pending.delete(key));
    pending.set(key, run);
  }
  return run;
}

function computeLeague(series: ReplaySeries, key: string): League {
  const edges = new Map<number, number>();
  const rows: PopulationRow[] = allChogs().map((chog) => {
    const genome = chogGenome(chog);
    const { edgePct, trades } = replayStats(genome, series);
    edges.set(chog.id, round(edgePct));
    return {
      tokenId: chog.id,
      name: chogName(chog),
      image: chog.image ? resolveUri(chog.image) : "",
      archetype: genome.archetype,
      style: genome.style,
      edgePct: round(edgePct),
      trades,
      rank: 0,
      claimed: false,
    };
  });
  rows.sort((a, b) => b.edgePct - a.edgePct || a.tokenId - b.tokenId);
  // Ties share a rank (1, 2, 2, 4), so Chogs that never traded are level.
  rows.forEach((row, i) => (row.rank = i > 0 && row.edgePct === rows[i - 1].edgePct ? rows[i - 1].rank : i + 1));
  const sorted = rows.map((row) => row.edgePct).sort((a, b) => a - b);
  const result: League = {
    key,
    window: series.window,
    computedAt: new Date().toISOString(),
    rows,
    stats: {
      beatHoldPct: round((sorted.filter((edge) => edge > 0).length / Math.max(1, sorted.length)) * 100, 1),
      medianEdgePct: round(median(sorted)),
      bestEdgePct: sorted[sorted.length - 1] ?? 0,
      worstEdgePct: sorted[0] ?? 0,
    },
    edges,
  };
  return result;
}

/** Token ids of activated agents, and of those trading on-chain (cached ~30s; never throws). */
async function claimedIds(): Promise<AgentDivisions> {
  const dna = cache();
  // (The shape check skips a copy cached by an older build of this module across a dev hot reload.)
  if (dna.claimed && dna.claimed.expires > Date.now() && dna.claimed.ids.onchain instanceof Set) return dna.claimed.ids;
  const ids: AgentDivisions = { claimed: new Set(), onchain: new Set() };
  try {
    for (const agent of await getStore().listAgents()) {
      if (!agent.active) continue;
      const tokenId = Number(agent.tokenId);
      ids.claimed.add(tokenId);
      if (agent.mode === "onchain") ids.onchain.add(tokenId);
    }
  } catch (error) {
    console.warn("[animr] Couldn't read claimed Chogs for the league:", (error as Error).message);
  }
  dna.claimed = { expires: Date.now() + CLAIMED_TTL_MS, ids };
  return ids;
}

/** All 1,969 Chogs ranked by their genome's simulated edge over holding $CHOG. Window: "30d" | "45d" | "max". */
export async function getPopulation(window: string): Promise<PopulationResponse> {
  const [result, claimed] = await Promise.all([league(windowKey(window)), claimedIds()]);
  return {
    genomeVersion: GENOME_VERSION,
    window: result.window,
    computedAt: result.computedAt,
    // Divisions: Wild (no agent), Claimed (an awake AI on 0G) and Real-wallet (that AI trades on-chain).
    rows: result.rows.map((row) =>
      claimed.claimed.has(row.tokenId)
        ? { ...row, claimed: true, ...(claimed.onchain.has(row.tokenId) && { onchain: true }) }
        : row,
    ),
    stats: result.stats,
  };
}

/** One Chog's league row, the league's size and stats (the league is cached). Throws RangeError for unknown ids. */
export async function getStanding(tokenId: number, window: string): Promise<ChogStanding> {
  const population = await getPopulation(window);
  const row = population.rows.find((r) => r.tokenId === tokenId);
  if (!row) throw new RangeError(`Unknown Chog #${tokenId}`);
  const { genomeVersion, window: span, rows, stats } = population;
  return { genomeVersion, window: span, total: rows.length, row, stats };
}

/**
 * The Chog's genome instinct replayed hour by hour from `sinceSec` (unix seconds, e.g. its agent's
 * activation) to the last candle: what its DNA alone would have done over the same hours as its live
 * agent. Simulated on real candles (1% fee + impact). Throws RangeError for unknown ids.
 */
export async function getInstinctSince(tokenId: number, sinceSec: number): Promise<InstinctSince> {
  const chog = Number.isInteger(tokenId) ? getChog(tokenId) : undefined;
  if (!chog) throw new RangeError(`Unknown Chog #${tokenId}`);
  const { series } = await seriesFor("max");
  const { candles, end } = series;
  // Decisions happen at candle closes (t + 1h): the first close at or after the moment.
  const first = candles.findIndex((candle) => candle.t + HOUR >= sinceSec);
  const lastClose = candles[end].t + HOUR;
  if (first < 0) return { from: lastClose, to: lastClose, hours: 0, edgePct: 0, trades: 0 };
  const start = Math.max(series.start, first);
  const { edgePct, trades } = replayStats(chogGenome(chog), { ...series, start });
  return { from: candles[start].t + HOUR, to: lastClose, hours: end - start + 1, edgePct: round(edgePct), trades };
}

/** One Chog's full replay (points, trades in its voice, moments, verdict). Throws RangeError for unknown ids. */
export async function getReplay(tokenId: number, window: string): Promise<ReplayResult> {
  const key = windowKey(window);
  const chog = Number.isInteger(tokenId) ? getChog(tokenId) : undefined;
  if (!chog) throw new RangeError(`Unknown Chog #${tokenId}`);
  const { fingerprint, series } = await seriesFor(key);
  const replays = cache().replays;
  const cacheKey = `${tokenId}:${key}:${fingerprint}`;
  const hit = replays.get(cacheKey);
  if (hit) return hit;
  const result = replay(chogGenome(chog), series, tokenId);
  if (replays.size >= MAX_CACHED_REPLAYS) replays.delete(replays.keys().next().value!);
  replays.set(cacheKey, result);
  return result;
}

/** Trait Alpha: for every trait value carried by >= TRAIT_ALPHA_MIN_COUNT Chogs, the median edge and beat-hold share. */
export async function getTraitAlpha(window: string): Promise<{ genomeVersion: string; window: ReplayWindow; rows: TraitAlphaRow[] }> {
  const result = await league(windowKey(window));
  if (!result.traits) {
    const groups = new Map<string, { traitType: string; value: string; edges: number[] }>();
    for (const chog of allChogs()) {
      const edge = result.edges.get(chog.id) ?? 0;
      for (const [traitType, value] of Object.entries(chog.traits)) {
        const id = `${traitType}\u0000${value}`;
        let group = groups.get(id);
        if (!group) groups.set(id, (group = { traitType, value, edges: [] }));
        group.edges.push(edge);
      }
    }
    result.traits = [...groups.values()]
      .filter((group) => group.edges.length >= TRAIT_ALPHA_MIN_COUNT)
      .map(({ traitType, value, edges }) => {
        const sorted = edges.sort((a, b) => a - b);
        return {
          traitType,
          value,
          count: sorted.length,
          medianEdgePct: round(median(sorted)),
          beatHoldPct: round((sorted.filter((edge) => edge > 0).length / sorted.length) * 100, 1),
        };
      })
      .sort((a, b) => b.medianEdgePct - a.medianEdgePct || b.beatHoldPct - a.beatHoldPct || b.count - a.count);
  }
  return { genomeVersion: GENOME_VERSION, window: result.window, rows: result.traits };
}
