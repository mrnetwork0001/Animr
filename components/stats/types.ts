// Contract between the stats aggregator (components/stats/data.ts, server-only), GET /api/stats and the /stats page.
// Counts only: no fan ids, no IPs, no wallet addresses. Days are UTC dates (YYYY-MM-DD); "since" is the first day a
// number was counted (null while it is still 0).

/** One UTC day of a per-day series (oldest first, missing days filled with 0). */
export type DayCount = { day: string; value: number };

/** One Bell on the calendar strip. */
export type BellDayStat = {
  day: string;
  /** "live": rung on schedule at 15:00 UTC; "replay": rebuilt from real past candles. */
  kind: "live" | "replay";
  /** Settled by the real CHOG/WMON price 24h after the ring. */
  settled: boolean;
  rides: number;
};

/** Sections whose source couldn't be read just now: the page says so instead of showing zeros. */
export type StatsSection = "bell" | "fans" | "versus" | "heist" | "agents" | "optout";

export type StatsResponse = {
  /** When these numbers were computed (ISO); they are cached for about a minute. */
  computedAt: string;
  /** The next Daily Bell ring (ISO); in the past while today's ring is due but hasn't landed yet. */
  nextBellAt: string;
  unavailable: StatsSection[];
  bell: {
    /** Bells rung live (on schedule) and how many of them the market has settled. */
    live: number;
    settled: number;
    /** Bells rebuilt from past candles (genome calls only) so the history is never empty. */
    replayed: number;
    firstLiveDay: string | null;
    /** While the latest live Bell takes rides: when its ride window closes (ISO). Otherwise rides book the next Bell. */
    ridesOpenUntil: string | null;
    /** The most recent Bells, oldest first (at most 21). */
    recent: BellDayStat[];
  };
  rides: {
    total: number;
    /** Distinct fans who rode at least once. */
    riders: number;
    /** Rides per day they were taken (rides booked ahead for the next Bell included). */
    perDay: DayCount[];
    since: string | null;
  };
  retention: {
    /**
     * Day-1 return: of the fans who rode a Bell, the share who rode the next day's Bell too (pairs of consecutive
     * live Bells whose second ride window has closed). Null until there is such a pair with riders.
     */
    d1Pct: number | null;
    returned: number;
    eligible: number;
    /** Fans who rode two consecutive days' Bells at least once. */
    backToBack: number;
    /** Most consecutive live Bells ridden by one fan. */
    longestStreak: number;
    since: string | null;
  };
  fans: {
    /** Visitors who rode a Chog, picked a nickname or scored points (a cookie; no wallet). */
    total: number;
    nicknamed: number;
    /** Points fans scored (a game score with no cash value). */
    points: number;
    /** New fans per day (from daily snapshots of the total). */
    perDay: DayCount[];
    since: string | null;
  };
  versus: {
    bouts: number;
    picks: number;
    /** Bouts per day (from daily snapshots of the counter). */
    perDay: DayCount[];
    since: string | null;
  };
  /** Time Machine replays served, only when a counter exists. */
  replays: { served: number; since: string | null } | null;
  heist: {
    /** Messages sent to the House Chog. */
    attempts: number;
    /** Times its AI agreed to send $CHOG. */
    caves: number;
    /** Live mainnet simulations where the wallet refused the AI's key. */
    refusals: number;
    /** Always 0: the heist only simulates, nothing is ever broadcast. */
    stolenChog: 0;
    /** AI replies that made the Hall of Fame wall. */
    wall: number;
    perDay: DayCount[];
    since: string | null;
  };
  agents: {
    /** Claimed Chogs whose AI agent is awake. */
    claimed: number;
    /** Every Chog ever claimed (awake or paused). */
    claimedEver: number;
    /** Every decision ever made by claimed agents. */
    decisions: number;
    /** Decisions still stored (the newest 200 per agent): the numbers below are counted from these. */
    stored: number;
    /** Stored decisions made by an LLM on 0G Compute. */
    llm: number;
    /** Stored LLM decisions whose provider's TEE attestation was verified. */
    teeVerified: number;
    paperTrades: number;
    onchainTrades: number;
    /** Stored decisions per day. */
    perDay: DayCount[];
    since: string | null;
  };
  /** 0G Compute spend in USD: the agents' stored decision receipts plus the heist's booked replies. */
  zg: { agentsUsd: number; heistUsd: number; totalUsd: number };
  optout: { hidden: number; since: string | null };
};
