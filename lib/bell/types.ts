// Contract between the Daily Bell engine (lib/bell/*, app/api/bell/*, app/api/fan) and its UI
// (components/bell/*, app/(app)/bell). Once a day at the Bell (15:00 UTC) every Chog publishes a
// 24h forecast for $CHOG; 24h later the real market settles it. Points only, never money.

/** One Chog's call at a Bell. */
export type BellCall = {
  tokenId: number;
  name: string;
  image: string;
  /** Expected % move of $CHOG (vs WMON) over the next 24h, e.g. 4.5 or -7. */
  forecastPct: number;
  /** 0–1. */
  conviction: number;
  /** One line in the Chog's voice. */
  thesis: string;
  /** "llm" for claimed agents (0G Compute), "genome" for every other Chog (its trait DNA). */
  source: "llm" | "genome";
  claimed: boolean;
  /** Filled at settlement. */
  points?: number;
  errorPts?: number;
  hit?: boolean;
};

export type BellSummary = {
  /** UTC date of the ring, YYYY-MM-DD. */
  day: string;
  rungAt: string;
  horizonAt: string;
  /** Fans can ride a Chog until this time. */
  rideWindowClosesAt: string;
  status: "open" | "settled";
  /** "live" Bells were rung on schedule; "replay" Bells were reconstructed from past candles. */
  kind: "live" | "replay";
  /** WMON per $CHOG at the ring and at the horizon. */
  entryPrice: number | null;
  settlePrice: number | null;
  actualPct: number | null;
  calls: number;
  /** Share of calls above 0, in percent. */
  bullPct: number;
  /**
   * Share of calls below 0, in percent (the rest called it flat). Rung Bells store it; the API fills it in for
   * Bells stored before it existed. Show it next to bullPct, never 100 − bullPct (a flat call is neither).
   */
  bearPct?: number;
  /** Count of calls per forecast bucket (bucketPct = lower bound, e.g. -10, -8, ... 10). */
  histogram: { bucketPct: number; count: number }[];
  /** Largest |forecastPct| calls. */
  boldest: BellCall[];
  /** Claimed Chogs and the season's top oracles. */
  featured: BellCall[];
  /** Closest call once settled. */
  oracle?: BellCall;
  /** Furthest call once settled. */
  mostRekt?: BellCall;
};

export type ChogBellRecord = {
  tokenId: number;
  calls: number;
  hits: number;
  oracleWins: number;
  avgErrorPts: number;
  totalPoints: number;
};

/** A visitor identified by an httpOnly cookie; a wallet is optional. */
export type FanState = {
  fanId: string;
  nickname?: string;
  points: number;
  /** Consecutive days with a ride. */
  streak: number;
  ride?: { day: string; tokenId: number };
  /**
   * A ride booked on the next Bell: taken after the latest Bell's ride window closed (or before the first live
   * Bell), it rides the next ring and counts from it. Becomes `ride` once that Bell rings.
   */
  next?: { day: string; tokenId: number };
  history: { day: string; tokenId: number; points?: number }[];
};

// HTTP contract:
//   GET  /api/bell/today                 -> BellSummary (the latest rung Bell)
//   GET  /api/bell/[day]                 -> BellSummary
//   GET  /api/bell/[day]/calls?cursor=&sort=bold|bull|bear|tokenId -> { calls: BellCall[]; next?: string }
//   GET  /api/bell/chog/[tokenId]        -> { today?: BellCall; record: ChogBellRecord }
//   GET  /api/bell/standings             -> { chogs: ChogBellRecord[]; fans: Pick<FanState, "fanId" | "nickname" | "points" | "streak">[] }
//   GET  /api/fan                        -> FanState (sets the cookie on first visit)
//   POST /api/fan                        body { nickname } -> FanState
//   POST /api/bell/ride                  body { tokenId } -> FanState (one ride per Bell: the open Bell inside its ride
//                                        window, else the next Bell, booked as FanState.next)
//   GET  /api/bell/cron                  -> { settled?: string; rung?: string } (Authorization: Bearer $CRON_SECRET)

// --- Appended by the Bell engine: names for the shapes above plus a few extra fields (the contract
// above is unchanged; every response still satisfies it).

export type BellCallSort = "bold" | "bull" | "bear" | "tokenId" | "points";

/** GET /api/bell/[day]/calls?cursor=&sort=&limit= (limit 1-200, default 50; "points" ranks settled calls). */
export type BellCallsResponse = { calls: BellCall[]; next?: string };

/** GET /api/bell/chog/[tokenId]: `today` is the Chog's call on the latest Bell (the one /api/bell/today returns). */
export type ChogBellResponse = { today?: BellCall; record: ChogBellRecord };

/** A "chogs" row of GET /api/bell/standings (most season points first). */
export type ChogBellStanding = ChogBellRecord & { name: string; image: string; rank: number };

/** A "fans" row of GET /api/bell/standings (most points first). */
export type FanStanding = Pick<FanState, "fanId" | "nickname" | "points" | "streak"> & { rank: number };

export type BellStandingsResponse = { chogs: ChogBellStanding[]; fans: FanStanding[] };

/** GET/POST /api/fan and POST /api/bell/ride: the fan plus their rank among fans who have ridden. */
export type FanResponse = FanState & { rank?: number; fans: number };

/** GET /api/bell/cron; `settled` lists days comma-separated, `replayed` counts Bells rebuilt from candles. */
export type BellCronResponse = { settled?: string; rung?: string; replayed?: number };

/** Where $CHOG trades now against an open Bell's entry: provisional (settlement uses the hourly closes). */
export type BellLive = { price: number; movePct: number; at: string; source: string };

/**
 * The Oracle Purse of a settled live Bell: real $CHOG the team sends from its House key into the winning Chog's own
 * ERC-6551 wallet (scripts/send-oracle-purse.mts), so the purse belongs to the NFT. The winner is the Oracle of the
 * Day, or the runner-up when the Oracle is the House Chog (the House never pays itself).
 *   "sent":    the transfer is confirmed on-chain: tba and txHash are set.
 *   "pending": on its way: not sent yet, or sent and not confirmed yet.
 */
export type BellPurse = {
  status: "sent" | "pending";
  /** The Chog whose wallet gets the purse. */
  tokenId: number;
  /** Whole $CHOG, as a decimal string ("5000"). */
  amount: string;
  /** The Chog's ERC-6551 wallet (once sent). */
  tba?: string;
  /** The ERC-20 transfer (once sent). */
  txHash?: string;
};

/**
 * GET /api/bell/today and /api/bell/[day]: the summary (bearPct always set), plus `live` while the Bell is open and
 * `purse` once a settled live Bell has (or is about to get) its Oracle Purse.
 */
export type BellSummaryResponse = BellSummary & { live?: BellLive; purse?: BellPurse };
