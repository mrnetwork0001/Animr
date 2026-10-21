import type { TradingStyle } from "../agent/types";

// Contract between the Versus engine (lib/rewind/*, app/api/versus/*) and its UI
// (components/versus/*, app/(app)/versus/*). Two Chogs' genomes race on the same hidden
// 48 hours of real CHOG/WMON history (simulated: 1% fee + impact); the viewer picks a
// winner first, then the real dates are revealed. Exhibition only: points, never money.

export type VersusFighter = {
  tokenId: number;
  name: string;
  image: string;
  archetype: string;
  style: TradingStyle;
  genomeVersion: string;
};

/** One step of the race. Prices are an index (100 at the start) until the reveal. */
export type VersusFrame = {
  /** Step number, 0-based (hourly candles). */
  i: number;
  priceIndex: number;
  /** Each fighter's value in $CHOG; both start at the same bankroll. */
  a: number;
  b: number;
};

export type VersusTrade = {
  fighter: "a" | "b";
  i: number;
  side: "buy" | "sell";
  /** Short line in that Chog's voice. */
  reason: string;
};

export type VersusResult = {
  winner: "a" | "b" | "draw";
  /** Edge vs simply holding $CHOG, in percent. */
  aEdgePct: number;
  bEdgePct: number;
  aFeesChog: number;
  bFeesChog: number;
};

export type VersusReveal = {
  /** ISO times of the real window. */
  from: string;
  to: string;
  /** e.g. "Sep 30 – Oct 2, 2026: +31% then −24%". */
  label: string;
  /** Real WMON-per-CHOG prices at the start and end. */
  priceStart: number;
  priceEnd: number;
};

/** A bout as served before the pick: no result, no reveal. */
export type VersusBoutPreview = {
  id: string;
  a: VersusFighter;
  b: VersusFighter;
  /** Always "48 hours of real $CHOG history" before the reveal. */
  windowLabel: string;
  startChog: number;
};

export type VersusBout = VersusBoutPreview & {
  frames: VersusFrame[];
  trades: VersusTrade[];
  moments: { i: number; fighter: "a" | "b"; text: string }[];
  result: VersusResult;
  reveal: VersusReveal;
};

// HTTP contract:
//   GET  /api/versus/random              -> VersusBoutPreview (random pair, random drama-ranked window)
//   GET  /api/versus/new?a=&b=           -> VersusBoutPreview (chosen pair; ids 1-1969)
//   POST /api/versus/[id]/pick           body { fighter: "a" | "b" } -> { bout: VersusBout; correct: boolean | null; fan: FanState }
//                                          (records the pick for the cookie fan, +10 points when correct; a second pick on the
//                                           same bout returns the bout with correct: null)
//   GET  /api/versus/[id]?spectate=1     -> VersusBout (watch without picking; no points)
// The bout id encodes (a, b, window) so any bout can be re-served and shared deterministically.

// --- Appended by the VERSUS engine: names for the shapes above plus a few extra fields (the contract above
// is unchanged; every response still satisfies it).

/** One speech bubble of a bout, in that fighter's voice. */
export type VersusMoment = VersusBout["moments"][number];

/** The cookie fan's VERSUS record (points also land on their FanState). */
export type VersusRecord = {
  picks: number;
  correct: number;
  /** All VERSUS points earned (no cash value). */
  points: number;
  /** VERSUS points earned on the current UTC day, and the daily cap. */
  pointsToday: number;
  dailyCap: number;
  /** Points waiting for this cookie's first fan card (a first Daily Bell ride or nickname); 0 once it has one. */
  pending?: number;
};

/**
 * POST /api/versus/[id]/pick. `fan` is the Bell's FanResponse (FanState plus rank). `awarded`: points this pick
 * added (10 when correct, 0 when wrong, a repeat, a draw, or past the daily cap); `pick`: the side this fan picked
 * first (on a repeat, the original pick, which `correct: null` doesn't reveal).
 */
export type VersusPickResponse = {
  bout: VersusBout;
  correct: boolean | null;
  fan: import("../bell/types").FanState;
  awarded: number;
  pick: "a" | "b";
  record: VersusRecord;
};

/** GET /api/versus/stats: totals across all servers. */
export type VersusStats = {
  /** Fresh bouts dealt by /random and /new. */
  bouts: number;
  /** First picks recorded. */
  picks: number;
};

// HTTP additions:
//   GET  /api/versus/[id]                -> VersusBoutPreview (a shared link before the pick: no spoilers)
//   GET  /api/versus/new?a=              -> VersusBoutPreview (chosen Chog vs a random rival; ?b= alone works too)
//   GET  /api/versus/stats               -> VersusStats
//   GET  /api/versus/me                  -> VersusRecord (the cookie fan's; zeros before a first pick)
// Errors are JSON { error } with 400 (bad input), 404 (unknown bout or Chog), 409 (fan card busy), 415 (not JSON),
// 429 (rate limit, Retry-After), 500, or 503 (not enough price history yet).
