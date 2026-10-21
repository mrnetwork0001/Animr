import type { Address } from "viem";
import type { TradingStyle } from "../agent/types";

// Contract between the DNA engine (lib/dna/*, app/api/dna/*) and its UI
// (components/dna/*, app/(app)/league, app/(app)/traits). Numbers are plain JS numbers.

/** One Chog Genesis token as snapshotted in data/chogs.json (metadata is frozen on IPFS). */
export type ChogSnapshot = {
  /** Token ID, 1–1969. */
  id: number;
  /** Metadata file number: token #1 -> "1462". */
  metadataId: string;
  /** Metadata name, e.g. "CHOG #1462". Always show "Chog #<id>" next to it. */
  name: string;
  /** ipfs:// image URI; resolve with resolveUri() from lib/nft.ts. */
  image: string;
  /** trait_type -> value (up to 13 trait types). */
  traits: Record<string, string>;
};

/** data/chogs.json */
export type ChogsFile = {
  version: 1;
  collection: Address;
  chainId: number;
  generatedAt: string;
  /** Sorted by id; ids with unreadable metadata are listed with empty traits. */
  chogs: ChogSnapshot[];
};

/** One gene of a trading genome, explained by the trait that set it. */
export type Gene = {
  key: string;
  /** e.g. "Signal", "Trigger", "Size". */
  label: string;
  /** 0–100, for a bar. */
  value: number;
  /** e.g. "Momentum chaser". */
  display: string;
  /** The trait that set this gene, when one did. */
  trait?: { type: string; value: string };
  /** One plain-language sentence. */
  explanation: string;
};

/** A Chog's trading DNA: a pure function of its 13 traits (versioned). */
export type Genome = {
  /** Hash of the gene table; shown in the UI so results are reproducible. */
  version: string;
  /** e.g. "Breakout Chaser", "Dip Sleeper". */
  archetype: string;
  style: TradingStyle;
  /** 5–8 genes in display order. */
  genes: Gene[];
  /** Engine parameters; opaque to the UI. */
  params: Record<string, number | string | boolean>;
};

export type ReplayWindow = {
  /** Unix seconds. */
  from: number;
  to: number;
  candles: number;
  /** e.g. "Sep 4 – Oct 19 (hourly, real CHOG/WMON)". */
  label: string;
};

export type ReplayPoint = {
  /** Unix seconds. */
  t: number;
  /** WMON per $CHOG. */
  price: number;
  /** Portfolio value in $CHOG (MON leg converted at price). */
  value: number;
};

export type ReplayTrade = {
  t: number;
  side: "buy" | "sell";
  price: number;
  amountIn: number;
  amountOut: number;
  /** Short reason in the Chog's voice. */
  reason: string;
};

/** A speech bubble at a key moment of a replay. */
export type ReplayMoment = { t: number; text: string };

export type ReplayResult = {
  tokenId: number;
  genomeVersion: string;
  window: ReplayWindow;
  /** Starting bankroll in $CHOG; "just holding" stays at this value. */
  startChog: number;
  endValueChog: number;
  /** (endValueChog / startChog - 1) * 100: the edge versus simply holding $CHOG. */
  edgePct: number;
  maxDrawdownPct: number;
  feesPaidChog: number;
  trades: ReplayTrade[];
  /** Downsampled to at most ~500 points. */
  points: ReplayPoint[];
  moments: ReplayMoment[];
  /** e.g. "Napped to +9% vs holding". */
  verdict: string;
};

export type PopulationRow = {
  tokenId: number;
  name: string;
  image: string;
  archetype: string;
  style: TradingStyle;
  edgePct: number;
  trades: number;
  /** 1 = best. */
  rank: number;
  /** An owner activated this Chog's live agent. */
  claimed: boolean;
  /**
   * Its awake agent trades the real $CHOG in its wallet through AnimrTradeGuard (on-chain mode): the Real-wallet
   * division. Absent otherwise; a claimed Chog without it is in the Claimed division, an unclaimed one is Wild.
   */
  onchain?: boolean;
};

export type PopulationResponse = {
  genomeVersion: string;
  window: ReplayWindow;
  computedAt: string;
  /** Sorted by edgePct, best first; all 1,969 Chogs. */
  rows: PopulationRow[];
  stats: { beatHoldPct: number; medianEdgePct: number; bestEdgePct: number; worstEdgePct: number };
};

export type TraitAlphaRow = {
  traitType: string;
  value: string;
  count: number;
  medianEdgePct: number;
  beatHoldPct: number;
};

/** The genome's instinct replayed from a moment (e.g. an agent's activation) to the last candle. */
export type InstinctSince = {
  /** Unix seconds of the first and last candle replayed. */
  from: number;
  to: number;
  /** Hourly decisions replayed (0 when no candle has closed since). */
  hours: number;
  /** Edge vs simply holding $CHOG over those hours (simulated, 1% fee + impact). */
  edgePct: number;
  trades: number;
};

/** One Chog's place in the league: its row without the whole ~0.5 MB population. */
export type ChogStanding = {
  genomeVersion: string;
  window: ReplayWindow;
  /** Chogs ranked (all 1,969). */
  total: number;
  row: PopulationRow;
  stats: PopulationResponse["stats"];
  /** Only with ?since=: its instinct over the same hours as its live agent ("Brain vs Instinct"). */
  since?: InstinctSince;
};

// HTTP contract (app/api/dna/*), all GET, all cacheable, no wallet needed:
//   /api/dna/[tokenId]               -> { chog: ChogSnapshot; genome: Genome }
//   /api/dna/[tokenId]/replay?window=30d|45d|max -> ReplayResult
//   /api/dna/[tokenId]/standing?window=...[&since=<ISO time>] -> ChogStanding
//   /api/dna/population?window=...   -> PopulationResponse
//   /api/dna/traits?window=...       -> { genomeVersion: string; window: ReplayWindow; rows: TraitAlphaRow[] }
