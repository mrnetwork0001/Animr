import { FLAGGED_TOKEN_IDS } from "../brand-safety";
import { chogLabel } from "../chog-id";
import { type ReplaySeries, prepareSeries, replay, replayStats } from "../dna/backtest";
import { allChogs, getChog } from "../dna/chogs";
import { GENOME_VERSION, genomeParams } from "../dna/genome";
import { type Candle, HOUR, getCandleSeries } from "../dna/history";
import { chogGenome, chogName } from "../dna/population";
import type { ChogSnapshot, Genome, ReplayResult } from "../dna/types";
import { resolveUri } from "../nft";
import { VersusError } from "./errors";
import { type BoutKey, decodeBoutId, encodeBoutId } from "./id";
import { VERSUS_WINDOW_LABEL } from "./rules";
import type {
  VersusBout,
  VersusBoutPreview,
  VersusFighter,
  VersusFrame,
  VersusMoment,
  VersusResult,
  VersusReveal,
  VersusTrade,
} from "./types";
import { type DramaWindow, WINDOW_HOURS, rankDramaWindows, revealLabel, windowBounds } from "./windows";

// The VERSUS engine. Two Chogs' genomes replay the same hidden 48 hours of real CHOG/WMON candles
// (lib/dna/backtest.ts: the same instinct, 1% pool fee and price impact as the league), from the same
// bankroll; whoever ends with more $CHOG wins. A bout is a pure function of (a, b, window) and the
// candles, so its id (lib/rewind/id.ts) re-serves it anywhere. Simulated: no real trades happen here.
// Server-only (data/chogs.json and the candles).

/** Bump whenever a change here (or in the genome's voice lines) changes what a bout id serves (the per-process cache is keyed by it). */
const ENGINE_REV = 4;
/** Bouts kept per instance (an id is recomputed in a few ms anyway). */
const MAX_CACHED_BOUTS = 500;
/** Random pairs tried before settling for the best bout found. */
const PAIR_ATTEMPTS = 6;
/** A lead counts once it is worth this share of the bankroll (0.2% = 2 $CHOG of 1,000). */
const LEAD_SHARE = 0.002;
const MIN_MOMENTS = 2;
const MAX_MOMENTS = 6;

type Side = "a" | "b";

type VersusContext = {
  /** ENGINE_REV + GENOME_VERSION + candle fingerprint: a new hour (or a revised close) rebuilds the context. */
  key: string;
  candles: readonly Candle[];
  /** Every candle prepared once; each bout replays a 48-candle slice of it. */
  series: ReplaySeries;
  /** Frame-0 candle indices a window may start at. */
  first: number;
  last: number;
  windows: DramaWindow[];
  bouts: Map<string, VersusBout>;
};

type PoolEntry = { id: number; mode: string; archetype: string };

// Shared by every route bundle in the process (like the DNA cache).
const globalForVersus = globalThis as typeof globalThis & {
  __animrVersus?: VersusContext;
  __animrVersusPool?: { version: string; entries: PoolEntry[] };
};

async function versusContext(): Promise<VersusContext> {
  const { candles, fingerprint } = await getCandleSeries();
  const key = `${ENGINE_REV}:${GENOME_VERSION}:${fingerprint}`;
  const hit = globalForVersus.__animrVersus;
  if (hit?.key === key) return hit;
  const windows = rankDramaWindows(candles);
  if (!windows.length) throw new VersusError(503, "VERSUS needs more $CHOG price history. Try again in an hour.");
  const context: VersusContext = { key, candles, series: prepareSeries(candles, "max"), ...windowBounds(candles), windows, bouts: new Map() };
  globalForVersus.__animrVersus = context;
  return context;
}

/** The drama-ranked windows bouts are dealt from (best first; rebuilt with every new candle). */
export async function getDramaWindows(): Promise<readonly DramaWindow[]> {
  return (await versusContext()).windows;
}

// --- Building a bout ------------------------------------------------------------------------------

const round = (value: number, digits: number) => Number(value.toFixed(digits));

function chogOrThrow(tokenId: number): ChogSnapshot {
  const chog = Number.isInteger(tokenId) ? getChog(tokenId) : undefined;
  if (!chog) throw new VersusError(404, `There's no Chog #${tokenId}: token ids run from 1 to 1969.`);
  return chog;
}

function fighter(chog: ChogSnapshot, genome: Genome): VersusFighter {
  return {
    tokenId: chog.id,
    name: chogName(chog),
    image: chog.image ? resolveUri(chog.image) : "",
    archetype: genome.archetype,
    style: genome.style,
    genomeVersion: genome.version,
  };
}

/** Index of the candle whose close is the window's frame 0, for a window starting at unix hour `hour`. */
function windowStart(context: VersusContext, hour: number): number {
  // The series is gap-filled, so candle k opens at candles[0].t + k hours (and closes an hour later).
  const start = hour - context.candles[0].t / HOUR - 1;
  if (!Number.isInteger(start) || start < context.first || start > context.last) {
    throw new VersusError(404, "This bout's 48 hours aren't in the price history this server has. Start a new bout.");
  }
  return start;
}

/** The 48 decisions after frame 0 (closes of candles start+1 ... start+48), warmed up by the history before. */
function windowSeries(context: VersusContext, start: number): ReplaySeries {
  const { candles } = context;
  return {
    ...context.series,
    start: start + 1,
    end: start + WINDOW_HOURS,
    window: { from: candles[start + 1].t + HOUR, to: candles[start + WINDOW_HOURS].t + HOUR, candles: WINDOW_HOURS, label: "" },
  };
}

/** Portfolio value at frames 0-48: the bankroll, then the replay's value at each close. */
function frameValues(run: ReplayResult, hour: number): number[] {
  const values = new Array<number>(WINDOW_HOURS + 1).fill(Number.NaN);
  values[0] = run.startChog;
  for (const point of run.points) {
    const i = point.t / HOUR - hour;
    if (i >= 1 && i <= WINDOW_HOURS) values[i] = point.value;
  }
  for (let i = 1; i <= WINDOW_HOURS; i++) if (Number.isNaN(values[i])) values[i] = values[i - 1];
  return values;
}

/** Typography only: "-4.9% this hour" -> "−4.9% this hour" (a real minus sign, like every other VERSUS number). */
const minusSigns = (text: string) => text.replace(/(^|[\s(])-(?=\d)/g, "$1−");

function tradesOf(run: ReplayResult, side: Side, hour: number): VersusTrade[] {
  return run.trades.map((trade) => ({ fighter: side, i: trade.t / HOUR - hour, side: trade.side, reason: minusSigns(trade.reason) }));
}

/** Higher edge wins; the same edge goes to the Chog that paid less in fees, else it's a draw (as displayed: 2 decimals). */
function boutResult(runA: ReplayResult, runB: ReplayResult): VersusResult {
  const aEdgePct = round(runA.edgePct, 2);
  const bEdgePct = round(runB.edgePct, 2);
  const aFeesChog = round(runA.feesPaidChog, 2);
  const bFeesChog = round(runB.feesPaidChog, 2);
  const winner: VersusResult["winner"] =
    aEdgePct !== bEdgePct ? (aEdgePct > bEdgePct ? "a" : "b") : aFeesChog !== bFeesChog ? (aFeesChog < bFeesChog ? "a" : "b") : "draw";
  return { winner, aEdgePct, bEdgePct, aFeesChog, bFeesChog };
}

function boutReveal(context: VersusContext, start: number, hour: number): VersusReveal {
  const fromSec = hour * HOUR;
  const toSec = fromSec + WINDOW_HOURS * HOUR;
  const closes = Array.from({ length: WINDOW_HOURS + 1 }, (_, i) => context.series.close[start + i]);
  return {
    from: new Date(fromSec * 1000).toISOString(),
    to: new Date(toSec * 1000).toISOString(),
    label: revealLabel(fromSec, toSec, closes),
    priceStart: Number(closes[0].toPrecision(6)),
    priceEnd: Number(closes[WINDOW_HOURS].toPrecision(6)),
  };
}

// --- Moments: 2-6 lines in the fighters' voices (they roast their own genome, never a holder) ---------

const LINES = {
  finish: [
    "Done: {vs}, {margin} $CHOG ahead of {rival}.",
    "48 hours, {vs}. Beat {rival} by {margin} $CHOG.",
    "That's the race: {vs}, {margin} $CHOG clear of {rival}.",
  ],
  finishBehindHold: [
    "Won the race, not the market: {edge} vs just holding, {margin} $CHOG ahead of {rival}.",
    "Holding beat us both, but I finish {margin} $CHOG ahead of {rival} at {edge}.",
  ],
  draw: ["Dead heat: {vs} for both of us."],
  lead: [
    "Ahead of {rival} now: {vs}.",
    "Taking the lead from {rival}, {vs}.",
    "In front of {rival}: {vs}.",
  ],
  low: [
    "{edge} vs just holding. My genome walked me into that one.",
    "{edge} vs just holding. Not my genome's finest hour.",
    "Down to {edge} vs just holding. Recalculating.",
  ],
  comeback: ["{deficit} $CHOG behind {rival}. Not done yet.", "Trailing {rival} by {deficit} $CHOG. Trusting my genome."],
  opener: ["Same {bankroll} $CHOG as just holding. Genome loaded.", "{bankroll} $CHOG each. Let's see whose genome stacks more."],
} as const;

/** A line without its numbers, so two "Selling 25% NOW" trades count as the same line. */
const template = (text: string) => text.replace(/[+\-−]?\d[\d,]*(?:\.\d+)?%?/g, "#").toLowerCase();

/** One line per (bout, moment), stable across servers: the same bout always says the same thing. */
function pickLine(lines: readonly string[], seed: string): string {
  let h = 2166136261;
  for (let k = 0; k < seed.length; k++) h = Math.imul(h ^ seed.charCodeAt(k), 16777619);
  return lines[(h >>> 0) % lines.length];
}

/** "+3.4%", "−2.1%" (a real minus sign), "0.0%". */
function signedPct(value: number): string {
  const fixed = Math.abs(value).toFixed(1);
  return fixed === "0.0" ? "0.0%" : `${value > 0 ? "+" : "−"}${fixed}%`;
}

type Candidate = VersusMoment & { priority: number };

function boutMoments(
  id: string,
  frames: VersusFrame[],
  trades: VersusTrade[],
  result: VersusResult,
  names: Record<Side, string>,
): VersusMoment[] {
  const bankroll = frames[0].a;
  const last = frames[frames.length - 1];
  const edge = (value: number) => signedPct((value / bankroll - 1) * 100);
  /** "+2.7% vs just holding", or "level with just holding" when flat. */
  const vs = (value: number) => (edge(value) === "0.0%" ? "level with just holding" : `${edge(value)} vs just holding`);
  const chog = (amount: number) => amount.toLocaleString("en-US", { maximumFractionDigits: 1 });
  const say = (kind: keyof typeof LINES, side: Side, i: number, fill: Record<string, string>) =>
    pickLine(LINES[kind], `${id}:${kind}:${side}:${i}`).replace(
      /\{(\w+)\}/g,
      (_, name: string) => (name === "rival" ? names[side === "a" ? "b" : "a"] : fill[name]) ?? "",
    );
  // Lower priority = more important.
  const candidates: Candidate[] = [];
  const add = (i: number, fighter: Side, text: string, priority: number) => candidates.push({ i, fighter, text, priority });

  if (result.winner === "draw") {
    add(last.i, "a", say("draw", "a", last.i, { vs: vs(last.a) }), 0);
  } else {
    const winner = result.winner;
    const loser: Side = winner === "a" ? "b" : "a";
    const fill = { vs: vs(last[winner]), edge: edge(last[winner]), margin: chog(Math.abs(last.a - last.b)) };
    add(last.i, winner, say(fill.edge.startsWith("−") ? "finishBehindHold" : "finish", winner, last.i, fill), 0);

    // The loser's low point and the winner's comeback (if it ever trailed by 2% of the bankroll).
    const low = frames.reduce((min, frame) => (frame[loser] < min[loser] ? frame : min), frames[0]);
    if (low.i > 0 && low[loser] <= bankroll * 0.97) add(low.i, loser, say("low", loser, low.i, { edge: edge(low[loser]) }), 3);
    const behind = frames.reduce((worst, frame) => (frame[winner] - frame[loser] < worst[winner] - worst[loser] ? frame : worst), frames[0]);
    const deficit = behind[loser] - behind[winner];
    if (deficit >= bankroll * 0.02) add(behind.i, winner, say("comeback", winner, behind.i, { deficit: chog(deficit) }), 3);
  }

  // Lead changes; the last one to the eventual winner matters most when the lead changed hands.
  const margin = bankroll * LEAD_SHARE;
  const changes: { i: number; side: Side }[] = [];
  let leader: Side | null = null;
  for (const frame of frames) {
    const now: Side | null = frame.a - frame.b > margin ? "a" : frame.b - frame.a > margin ? "b" : null;
    if (now && now !== leader) changes.push({ i: frame.i, side: (leader = now) });
  }
  const decisive = changes.length > 1 ? [...changes].reverse().find((change) => change.side === result.winner) : undefined;
  for (const change of changes) {
    const text = say("lead", change.side, change.i, { vs: vs(frames[change.i][change.side]) });
    add(change.i, change.side, text, change === decisive ? 1 : 4);
  }

  // Trades, in the Chog's own voice: each fighter's first trade first.
  for (const side of ["a", "b"] as const) {
    const first = trades.find((trade) => trade.fighter === side);
    if (first) add(first.i, side, first.reason, 2);
  }
  for (const trade of trades) add(trade.i, trade.fighter, trade.reason, 5);
  for (const side of ["a", "b"] as const) add(0, side, say("opener", side, 0, { bankroll: chog(bankroll) }), 6);

  const ordered = candidates.map((candidate, n) => ({ candidate, n })).sort((x, y) => x.candidate.priority - y.candidate.priority || x.n - y.n);
  let kept: Candidate[] = [];
  // Space the bubbles out; loosen the spacing when that leaves too few.
  for (const gap of [4, 2, 1]) {
    kept = [];
    const clashes = (c: Candidate, spacing: number) =>
      kept.some((k) => Math.abs(k.i - c.i) < spacing || (k.fighter === c.fighter && template(k.text) === template(c.text)));
    for (const { candidate } of ordered) {
      if (kept.length >= MAX_MOMENTS) break;
      if (!clashes(candidate, gap)) kept.push(candidate);
    }
    // Both Chogs get a word in when they can (making room drops the least important line of a Chog with several).
    for (const side of ["a", "b"] as const) {
      if (kept.some((k) => k.fighter === side)) continue;
      const extra = ordered.find(({ candidate }) => candidate.fighter === side && !clashes(candidate, 1))?.candidate;
      if (!extra) continue;
      if (kept.length >= MAX_MOMENTS) {
        const spare = kept.findLastIndex((k) => kept.filter((other) => other.fighter === k.fighter).length > 1);
        if (spare < 0) continue;
        kept.splice(spare, 1);
      }
      kept.push(extra);
    }
    if (kept.length >= MIN_MOMENTS) break;
  }
  return kept.sort((x, y) => x.i - y.i || x.priority - y.priority).map(({ i, fighter, text }) => ({ i, fighter, text }));
}

function computeBout(context: VersusContext, key: BoutKey, id: string): VersusBout {
  const start = windowStart(context, key.hour);
  const chogA = chogOrThrow(key.a);
  const chogB = chogOrThrow(key.b);
  const genomeA = chogGenome(chogA);
  const genomeB = chogGenome(chogB);
  const series = windowSeries(context, start);
  const runA = replay(genomeA, series, chogA.id);
  const runB = replay(genomeB, series, chogB.id);
  const valuesA = frameValues(runA, key.hour);
  const valuesB = frameValues(runB, key.hour);
  const { close } = context.series;
  const frames: VersusFrame[] = valuesA.map((value, i) => ({
    i,
    priceIndex: round((close[start + i] / close[start]) * 100, 2),
    a: round(value, 2),
    b: round(valuesB[i], 2),
  }));
  const trades = [...tradesOf(runA, "a", key.hour), ...tradesOf(runB, "b", key.hour)].sort(
    (x, y) => x.i - y.i || (x.fighter < y.fighter ? -1 : x.fighter > y.fighter ? 1 : 0),
  );
  const result = boutResult(runA, runB);
  const a = fighter(chogA, genomeA);
  const b = fighter(chogB, genomeB);
  return {
    id,
    a,
    b,
    windowLabel: VERSUS_WINDOW_LABEL,
    startChog: runA.startChog,
    frames,
    trades,
    // Persona names can repeat across the collection: then the moments say "Chog #id".
    moments: boutMoments(id, frames, trades, result, a.name === b.name ? { a: `Chog #${a.tokenId}`, b: `Chog #${b.tokenId}` } : { a: a.name, b: b.name }),
    result,
    reveal: boutReveal(context, start, key.hour),
  };
}

function boutFor(context: VersusContext, key: BoutKey): VersusBout {
  const id = encodeBoutId(key);
  const hit = context.bouts.get(id);
  if (hit) return hit;
  const bout = computeBout(context, key, id);
  if (context.bouts.size >= MAX_CACHED_BOUTS) context.bouts.delete(context.bouts.keys().next().value as string);
  context.bouts.set(id, bout);
  return bout;
}

/** The bout as served before the pick: fighters only, no frames, result or dates. */
export function previewOf(bout: VersusBout): VersusBoutPreview {
  const { id, a, b, windowLabel, startChog } = bout;
  return { id, a, b, windowLabel, startChog };
}

/** The full bout behind an id (frames, trades, moments, result, reveal). Deterministic; throws VersusError 404 for unknown ids. */
export async function getBout(id: string): Promise<VersusBout> {
  const key = decodeBoutId(id);
  if (!key) throw new VersusError(404, "That isn't a VERSUS bout id.");
  return boutFor(await versusContext(), key);
}

export async function getBoutPreview(id: string): Promise<VersusBoutPreview> {
  return previewOf(await getBout(id));
}

/** Why a Chog its holder hid ("Hide my Chog", lib/visibility.ts) can't fight: shown to the visitor as is. */
function sittingOut(tokenId: number): VersusError {
  const name = chogLabel(tokenId, { metadataName: getChog(tokenId)?.name });
  return new VersusError(404, `${name} is sitting this one out: its holder hid it from Animr's public pages. Pick another Chog.`);
}

/**
 * getBout for a public route: refuses (404) a bout with a Chog whose holder hid it. `hidden` comes from the
 * request (lib/visibility.ts loadVisibility), so getBout itself stays a pure function of the id for cached callers.
 */
export async function getShownBout(id: string, hidden: ReadonlySet<number>): Promise<VersusBout> {
  const key = decodeBoutId(id);
  const out = key ? [key.a, key.b].find((tokenId) => hidden.has(tokenId)) : undefined;
  if (out !== undefined) throw sittingOut(out);
  return getBout(id);
}

// --- Dealing bouts --------------------------------------------------------------------------------------

/** Chogs random bouts draw from: never a flagged one (their art still shows the words). Hidden ones are skipped per draw. */
function fighterPool(): PoolEntry[] {
  const hit = globalForVersus.__animrVersusPool;
  if (hit?.version === GENOME_VERSION) return hit.entries;
  const entries = allChogs()
    .filter((chog) => !FLAGGED_TOKEN_IDS.has(chog.id) && chog.image)
    .map((chog) => {
      const genome = chogGenome(chog);
      return { id: chog.id, mode: String(genomeParams(genome).mode), archetype: genome.archetype };
    });
  globalForVersus.__animrVersusPool = { version: GENOME_VERSION, entries };
  return entries;
}

/** A random rival for `against`: a different signal (so the bout looks different), else a different archetype. */
function randomOpponent(against: number, rand: () => number, hidden: ReadonlySet<number>): number {
  const entries = shownPool(hidden);
  const genome = chogGenome(chogOrThrow(against));
  const mode = String(genomeParams(genome).mode);
  const filters: ((entry: PoolEntry) => boolean)[] = [
    (entry) => entry.mode !== mode,
    (entry) => entry.archetype !== genome.archetype,
    () => true,
  ];
  for (const ok of filters) {
    for (let tries = 0; tries < 64; tries++) {
      const entry = entries[Math.floor(rand() * entries.length)];
      if (entry && entry.id !== against && ok(entry)) return entry.id;
    }
  }
  const rival = entries.find((entry) => entry.id !== against);
  if (!rival) throw new VersusError(503, "No other Chog is free to race right now. Try again in a moment.");
  return rival.id;
}

/** The pool without the Chogs their holders hid (the same array when nobody is hidden). */
function shownPool(hidden: ReadonlySet<number>): PoolEntry[] {
  const entries = fighterPool();
  return hidden.size ? entries.filter((entry) => !hidden.has(entry.id)) : entries;
}

/**
 * How watchable a window is for this pair, from the fast replay path: 2 = both trade and the result is
 * clear (0.1%+ apart), 1 = decided, 0 = a dead heat or nobody trades.
 */
function watchability(context: VersusContext, genomeA: Genome, genomeB: Genome, window: DramaWindow): number {
  const series = windowSeries(context, window.start);
  const a = replayStats(genomeA, series);
  const b = replayStats(genomeB, series);
  const gap = Math.abs(round(a.edgePct, 2) - round(b.edgePct, 2));
  if (gap === 0 || a.trades + b.trades === 0) return 0;
  return a.trades > 0 && b.trades > 0 && gap >= 0.1 ? 2 : 1;
}

/** A random drama window for the pair, preferring ones where both Chogs trade and the race is decided. */
function chooseWindow(context: VersusContext, a: number, b: number, rand: () => number): { window: DramaWindow; quality: number } {
  const genomeA = chogGenome(chogOrThrow(a));
  const genomeB = chogGenome(chogOrThrow(b));
  const order = context.windows.slice();
  for (let k = order.length - 1; k > 0; k--) {
    const j = Math.floor(rand() * (k + 1));
    [order[k], order[j]] = [order[j], order[k]];
  }
  let best = { window: order[0], quality: -1 };
  for (const window of order) {
    const quality = watchability(context, genomeA, genomeB, window);
    if (quality > best.quality) best = { window, quality };
    if (quality === 2) break;
  }
  return best;
}

/**
 * A fresh bout: two random Chogs with different signals on a random drama-ranked window. Never a flagged Chog, nor
 * one in `hidden` (the Chogs their holders hid, from the request's lib/visibility.ts loadVisibility).
 */
export async function randomBoutPreview(
  rand: () => number = Math.random,
  hidden: ReadonlySet<number> = new Set(),
): Promise<VersusBoutPreview> {
  const context = await versusContext();
  const entries = shownPool(hidden);
  if (entries.length < 2) throw new VersusError(503, "Not enough Chogs are free to race right now. Try again in a moment.");
  let best: { key: BoutKey; quality: number } | undefined;
  for (let attempt = 0; attempt < PAIR_ATTEMPTS && best?.quality !== 2; attempt++) {
    const a = entries[Math.floor(rand() * entries.length)].id;
    const b = randomOpponent(a, rand, hidden);
    const { window, quality } = chooseWindow(context, a, b, rand);
    if (!best || quality > best.quality) best = { key: { a, b, hour: window.hour }, quality };
  }
  return previewOf(boutFor(context, best!.key));
}

/**
 * A fresh bout for a chosen pair on a random drama-ranked window (one where both trade, when there is one).
 * Leave `a` or `b` null for a random rival (different signal, never a flagged or hidden Chog). A named Chog in
 * `hidden` (its holder hid it) is refused with a 404.
 */
export async function newBoutPreview(
  a: number | null,
  b: number | null,
  rand: () => number = Math.random,
  hidden: ReadonlySet<number> = new Set(),
): Promise<VersusBoutPreview> {
  if (a === null && b === null) throw new VersusError(400, "Name at least one Chog: /api/versus/new?a=<id>&b=<id> (ids 1-1969).");
  if (a !== null) chogOrThrow(a);
  if (b !== null) chogOrThrow(b);
  if (a !== null && a === b) throw new VersusError(400, "A Chog can't race itself: pick two different Chogs.");
  for (const named of [a, b]) if (named !== null && hidden.has(named)) throw sittingOut(named);
  const context = await versusContext();
  const left = a ?? randomOpponent(b!, rand, hidden);
  const right = b ?? randomOpponent(left, rand, hidden);
  const { window } = chooseWindow(context, left, right, rand);
  return previewOf(boutFor(context, { a: left, b: right, hour: window.hour }));
}
