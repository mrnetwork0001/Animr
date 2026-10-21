import { PAPER_FEE_BPS, type PaperFill, PaperTradeError, simulatePaperTrade, toAmount } from "../agent/paper";
import type { MarketSnapshot, Portfolio, TradingStyle } from "../agent/types";
import { type GenomeParams, type InstinctState, REPLAY, genomeParams, instinct, newInstinct, voice } from "./genome";
import { type Candle, HOUR, pctChange } from "./history";
import type { Genome, ReplayMoment, ReplayPoint, ReplayResult, ReplayTrade, ReplayWindow } from "./types";

// Pure, deterministic replay of a genome over real hourly candles: every hour the genome's instinct
// (lib/dna/genome.ts) decides, the paper venue fills it (lib/agent/paper.ts: 1% pool fee + price
// impact) and the portfolio is valued in $CHOG. Each decision happens at a candle's close, so every
// time in a result (trades, points, moments, the window) is a close time: candle t + 1h. "Just holding" stays at REPLAY.startChog, so the
// final value is the edge versus holding. Simulated: no real trades happen here.
// Guardrail-style limits apply as for a live agent: the genome's cooldown, its per-trade size and
// tier exposure cap, the confidence floor (instinct trades carry >= 0.6), no trading without a
// balance. One difference: a buyback fills in one trade here, while a live agent splits it into
// maxTradeBps-sized trades (same fees, as they are proportional to size).

export const REPLAY_WINDOWS = ["30d", "45d", "max"] as const;
export type WindowKey = (typeof REPLAY_WINDOWS)[number];
export const DEFAULT_WINDOW: WindowKey = "45d";

const WINDOW_DAYS: Record<WindowKey, number> = { "30d": 30, "45d": 45, max: Infinity };
/** Hours of history every replay needs before its first decision (the 24h change). */
const WARMUP = 24;
const MAX_POINTS = 480;
/** Same per-style price-impact limits as the rules brain. */
const SLIPPAGE_BPS: Record<TradingStyle, number> = { aggressive: 150, balanced: 100, cautious: 50 };

/** "45d" when absent, null when not a known window. */
export function parseWindow(raw: string | null | undefined): WindowKey | null {
  if (raw === null || raw === undefined || raw === "") return DEFAULT_WINDOW;
  return (REPLAY_WINDOWS as readonly string[]).includes(raw) ? (raw as WindowKey) : null;
}

/** Candles prepared once per (candles, window) and shared by every replay over them. */
export type ReplaySeries = {
  candles: readonly Candle[];
  close: Float64Array;
  /** % changes (NaN when unknown). */
  r1: Float64Array;
  r24: Float64Array;
  /** Inclusive candle indices of the window. */
  start: number;
  end: number;
  window: ReplayWindow;
};

const DAY = 86_400;
const dateLabel = (t: number) =>
  new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function prepareSeries(candles: readonly Candle[], window: WindowKey): ReplaySeries {
  const end = candles.length - 1;
  if (end < WARMUP + 24) throw new Error("Not enough candle history to replay");
  let start = WARMUP;
  const days = WINDOW_DAYS[window];
  if (Number.isFinite(days)) {
    // Windows start at a UTC midnight, so they move once a day.
    const fromT = Math.floor(candles[end].t / DAY) * DAY - days * DAY;
    const found = candles.findIndex((candle) => candle.t >= fromT);
    start = Math.max(WARMUP, found < 0 ? end : found);
  }
  const close = new Float64Array(candles.length);
  const r1 = new Float64Array(candles.length).fill(NaN);
  const r24 = new Float64Array(candles.length).fill(NaN);
  for (let i = 0; i <= end; i++) {
    close[i] = candles[i].close;
    if (i >= 1) r1[i] = pctChange(close[i], close[i - 1]);
    if (i >= 24) r24[i] = pctChange(close[i], close[i - 24]);
  }
  // Close times: the first and last decision of the window.
  const from = candles[start].t + HOUR;
  const to = candles[end].t + HOUR;
  return {
    candles,
    close,
    r1,
    r24,
    start,
    end,
    window: { from, to, candles: end - start + 1, label: `${dateLabel(from)} – ${dateLabel(to)} (hourly, real CHOG/WMON)` },
  };
}

/** The paper venue's view of a replay hour. "USD" fields are in WMON, so price impact uses the pool's WMON depth. */
function venueMarket(): MarketSnapshot {
  return {
    priceUsd: 0,
    priceQuote: 0,
    change1hPct: null,
    change24hPct: null,
    volume24hUsd: null,
    liquidityUsd: REPLAY.liquidityWmon,
    source: "replay",
    fetchedAt: "",
  };
}

type SimTrade = ReplayTrade & { i: number };

type Simulation = {
  endValueChog: number;
  trades: number;
  feesPaidChog: number;
  /** Detail only. */
  tradeLog: SimTrade[];
  points: ReplayPoint[];
  maxDrawdownPct: number;
  peak: { i: number; value: number };
  trough: { i: number; value: number };
  /** What the Chog said at the window's biggest 24h move. */
  bigMove?: { i: number; text: string };
};

function biggestMove(series: ReplaySeries): number {
  let best = series.start;
  for (let i = series.start; i <= series.end; i++) {
    if (Math.abs(series.r24[i]) > Math.abs(series.r24[best]) || Number.isNaN(series.r24[best])) best = i;
  }
  return best;
}

function simulate(genome: Genome, series: ReplaySeries, detail: boolean): Simulation {
  const p: GenomeParams = genomeParams(genome);
  const { candles, close, r1, r24, start, end } = series;
  const slippage = SLIPPAGE_BPS[genome.style];
  const bigIdx = detail ? biggestMove(series) : -1;
  let chog: number = REPLAY.startChog;
  let mon = 0;
  let portfolio: Portfolio = { chog: toAmount(chog), quote: "0" };
  const market = venueMarket();
  let lastTradeIdx = -Infinity;
  const state: InstinctState = {
    chog,
    mon,
    price: 0,
    change1hPct: null,
    change24hPct: null,
    sinceTradeH: Infinity,
    lastTradePrice: null,
    lastTradeSide: null,
    hour: 0,
  };
  const sim: Simulation = {
    endValueChog: chog,
    trades: 0,
    feesPaidChog: 0,
    tradeLog: [],
    points: [],
    maxDrawdownPct: 0,
    peak: { i: start, value: chog },
    trough: { i: start, value: chog },
  };
  const step = Math.max(1, Math.ceil((end - start + 1) / MAX_POINTS));
  let high = chog;
  const move = newInstinct();
  const decide = instinct; // one binding lookup per replay instead of one per hour

  for (let i = start; i <= end; i++) {
    const price = close[i];
    state.chog = chog;
    state.mon = mon;
    state.price = price;
    state.change1hPct = Number.isNaN(r1[i]) ? null : r1[i];
    state.change24hPct = Number.isNaN(r24[i]) ? null : r24[i];
    state.sinceTradeH = i - lastTradeIdx;
    state.hour = candles[i].t / HOUR;
    decide(p, state, move);

    let fill: PaperFill | undefined;
    if (move.action !== "hold") {
      try {
        market.priceUsd = price;
        market.priceQuote = price;
        fill = simulatePaperTrade({ side: move.action, sizeBps: move.sizeBps, maxSlippageBps: slippage, portfolio, market });
      } catch (error) {
        // A dust-sized order the venue refuses is a hold, exactly as for a live agent.
        if (!(error instanceof PaperTradeError)) throw error;
      }
    }
    if (fill && move.action !== "hold") {
      const amountIn = Number(fill.trade.amountIn);
      portfolio = fill.portfolio;
      chog = Number(portfolio.chog);
      mon = Number(portfolio.quote);
      sim.trades++;
      sim.feesPaidChog += ((move.action === "sell" ? amountIn : amountIn / price) * PAPER_FEE_BPS) / 10_000;
      if (detail) {
        sim.tradeLog.push({
          i,
          t: candles[i].t + HOUR,
          side: move.action,
          price: fill.trade.price,
          amountIn: round(amountIn, 6),
          amountOut: round(Number(fill.trade.amountOut), 6),
          reason: voice(genome, move, state),
        });
      }
      lastTradeIdx = i;
      // Like a live agent, the Chog remembers its last fill price (fees included).
      state.lastTradePrice = fill.trade.price;
      state.lastTradeSide = move.action;
    }

    if (detail) {
      const value = chog + mon / price;
      if (i === bigIdx) {
        const traded = fill ? sim.tradeLog[sim.tradeLog.length - 1].reason : voice(genome, move, state);
        sim.bigMove = { i, text: traded };
      }
      if (value > high) high = value;
      const drawdown = (value / high - 1) * 100;
      if (drawdown < sim.maxDrawdownPct) sim.maxDrawdownPct = drawdown;
      if (value > sim.peak.value) sim.peak = { i, value };
      if (value < sim.trough.value) sim.trough = { i, value };
      if ((i - start) % step === 0 || i === end) {
        sim.points.push({ t: candles[i].t + HOUR, price: Number(price.toPrecision(7)), value: round(value, 4) });
      }
    }
  }
  sim.endValueChog = chog + mon / close[end];
  return sim;
}

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

const VERBS: Record<GenomeParams["mode"], string> = {
  momentum: "Chased",
  contrarian: "Faded",
  sleeper: "Napped",
  panic: "Panicked",
  trend: "Rode the trend",
  steady: "Swung",
  dip: "Dip-bought",
  chaos: "Vibed",
};

function verdict(p: GenomeParams, edgePct: number, trades: number): string {
  if (trades === 0) return "Held tight: never saw a move big enough to trade (+0.0% vs holding)";
  return `${VERBS[p.mode]} to ${signed(edgePct)} vs holding in ${trades} trade${trades === 1 ? "" : "s"}`;
}

/** 3-6 speech bubbles: first trade, the biggest move, the best and worst moments, the last trade, the end. */
function pickMoments(sim: Simulation, series: ReplaySeries, edgePct: number, line: string): ReplayMoment[] {
  const { candles, start, end } = series;
  const bankroll = REPLAY.startChog;
  const first = sim.tradeLog[0];
  const last = sim.tradeLog[sim.tradeLog.length - 1];
  const mid = start + ((end - start) >> 1);
  const edgeAt = (value: number) => signed((value / bankroll - 1) * 100);
  // Lower priority number = more important.
  const candidates: { i: number; text: string; priority: number }[] = [
    { i: end, text: `${line}.${edgePct > 0 ? " Beat holding." : edgePct < 0 ? " Holding would have won." : ""}`, priority: 0 },
    ...(sim.bigMove ? [{ i: sim.bigMove.i, text: sim.bigMove.text, priority: 1 }] : []),
    first
      ? { i: first.i, text: first.reason, priority: 2 }
      : { i: start, text: `Window opens: ${bankroll.toLocaleString("en-US")} $CHOG, same as just holding.`, priority: 2 },
    ...(sim.peak.value > bankroll * 1.02 ? [{ i: sim.peak.i, text: `Peak: ${edgeAt(sim.peak.value)} ahead of just holding.`, priority: 3 }] : []),
    ...(sim.trough.value < bankroll * 0.98 ? [{ i: sim.trough.i, text: `Low point: ${edgeAt(sim.trough.value)} vs just holding.`, priority: 3 }] : []),
    ...(last && last !== first ? [{ i: last.i, text: last.reason, priority: 4 }] : []),
    ...sim.tradeLog.slice(1, -1).map((trade) => ({ i: trade.i, text: trade.reason, priority: 5 })),
    { i: start, text: `Window opens: ${bankroll.toLocaleString("en-US")} $CHOG, same as just holding.`, priority: 6 },
    { i: mid, text: "Halfway there, sticking to its genome.", priority: 7 },
  ];
  // Keep the most important bubble when two land close together; loosen the spacing if that leaves too few.
  const ordered = candidates.sort((a, b) => a.priority - b.priority);
  let kept: typeof candidates = [];
  for (const gap of [12, 3, 1]) {
    kept = [];
    for (const candidate of ordered) {
      if (kept.length >= 6) break;
      if (kept.some((other) => Math.abs(other.i - candidate.i) < gap || other.text === candidate.text)) continue;
      kept.push(candidate);
    }
    if (kept.length >= 3) break;
  }
  return kept.sort((a, b) => a.i - b.i).map(({ i, text }) => ({ t: candles[i].t + HOUR, text }));
}

/** Edge and trade count only: the fast path for the 1,969-Chog population. */
export function replayStats(genome: Genome, series: ReplaySeries): { edgePct: number; trades: number } {
  const sim = simulate(genome, series, false);
  return { edgePct: (sim.endValueChog / REPLAY.startChog - 1) * 100, trades: sim.trades };
}

/** Full replay of one genome: points, trades in its voice, moments and a verdict. Pure and deterministic. */
export function replay(genome: Genome, series: ReplaySeries, tokenId: number): ReplayResult {
  const sim = simulate(genome, series, true);
  const edgePct = (sim.endValueChog / REPLAY.startChog - 1) * 100;
  const line = verdict(genomeParams(genome), edgePct, sim.trades);
  return {
    tokenId,
    genomeVersion: genome.version,
    window: series.window,
    startChog: REPLAY.startChog,
    endValueChog: round(sim.endValueChog, 4),
    edgePct: round(edgePct, 2),
    maxDrawdownPct: round(sim.maxDrawdownPct, 2),
    feesPaidChog: round(sim.feesPaidChog, 4),
    trades: sim.tradeLog.map(({ t, side, price, amountIn, amountOut, reason }) => ({ t, side, price, amountIn, amountOut, reason })),
    points: sim.points,
    moments: pickMoments(sim, series, edgePct, line),
    verdict: line,
  };
}
