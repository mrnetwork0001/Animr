import type { Address, Hex } from "viem";

// Shared contract between the agent backend (lib/agent/*, app/api/*) and the UI.
// All token amounts are decimal strings in whole-token units (e.g. "1250.5").

export type AgentAction = "buy" | "sell" | "hold";

export type TradingStyle = "aggressive" | "balanced" | "cautious";

/** Trading personality derived deterministically from the Chog NFT's traits. */
export type Persona = {
  /** Display name, e.g. "Diamond Paws". */
  name: string;
  style: TradingStyle;
  /** Hard cap on a single trade, in basis points of the balance being sold. */
  maxTradeBps: number;
  /** One-liner shown in the UI and given to the LLM. */
  description: string;
  /** The NFT traits the persona was derived from. */
  traits: Record<string, string>;
};

export type MarketSnapshot = {
  /** USD price of 1 $CHOG. */
  priceUsd: number | null;
  /** Price of 1 $CHOG in the quote asset (MON). */
  priceQuote: number | null;
  change1hPct: number | null;
  change24hPct: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  /** Where the numbers came from, e.g. "dexscreener". */
  source: string;
  /** ISO timestamp. */
  fetchedAt: string;
};

export type Portfolio = {
  /** $CHOG held by the account. */
  chog: string;
  /** Quote asset (MON) held by the account. */
  quote: string;
};

export type Trade = {
  mode: "paper" | "onchain";
  /** buy = quote -> $CHOG, sell = $CHOG -> quote. */
  side: "buy" | "sell";
  amountIn: string;
  amountOut: string;
  tokenIn: string;
  tokenOut: string;
  /** Execution price in quote per $CHOG. */
  price: number;
  txHash?: Hex;
};

/** A decision's call on where $CHOG goes next, scored even when the agent holds (Daily Bell). */
export type Forecast = {
  /** Horizon in hours (the Bell uses 24). */
  horizonH: number;
  /** Expected % move of $CHOG vs WMON over the horizon. */
  pct: number;
};

/** From the 0G Router's x_0g_trace: who served an LLM call and what it cost. */
export type ZgReceipt = {
  requestId?: string;
  /** On-chain address of the 0G Compute provider that served the call. */
  provider?: string;
  /** The provider's TEE attestation was obtained and verified. */
  teeVerified?: boolean;
  /** Total cost in micro-USD (decimal string). */
  costUsdMicro?: string;
};

export type Decision = {
  id: string;
  /** NFT token id as a decimal string. */
  tokenId: string;
  /** ISO timestamp. */
  at: string;
  action: AgentAction;
  /** Fraction of the balance being sold, in basis points (after guardrails). */
  sizeBps: number;
  maxSlippageBps: number;
  /** 0..1 */
  confidence: number;
  /** Short reasoning shown in the UI. */
  thesis: string;
  /** "llm" when the model decided, "rules" for the deterministic fallback. */
  decidedBy: "llm" | "rules";
  /** The LLM that made the call (served by 0G Compute), e.g. "glm-5.3"; absent for rules. */
  model?: string;
  /** 0G Compute receipt for LLM decisions. */
  zg?: ZgReceipt;
  forecast?: Forecast;
  market: MarketSnapshot;
  portfolioBefore: Portfolio;
  portfolioAfter: Portfolio;
  trade?: Trade;
  error?: string;
};

export type AgentRecord = {
  tokenId: string;
  /** The Chog's ERC-6551 account. */
  account: Address;
  /** NFT owner who activated the agent. */
  owner: Address;
  /** ISO timestamp. */
  activatedAt: string;
  active: boolean;
  mode: "paper" | "onchain";
  persona: Persona;
  /** Current holdings (paper balances in paper mode, last on-chain read otherwise). */
  portfolio: Portfolio;
  /**
   * Where the starting paper $CHOG came from: the account's on-chain balance at activation ("wallet"),
   * or the demo bankroll because the account held none ("demo"; also assumed when missing).
   */
  bankroll?: "wallet" | "demo";
  /** Portfolio value at activation, in $CHOG-equivalent units. */
  startValueChog: number;
  /** Latest portfolio value, in $CHOG-equivalent units. */
  lastValueChog: number;
  /** (lastValueChog / startValueChog - 1) * 100 — the AI's edge over just holding $CHOG. */
  pnlPct: number;
  lastValueUsd: number | null;
  decisions: number;
  /** ISO timestamp of the last decision. */
  lastDecisionAt: string | null;
  image?: string;
  /** ISO timestamp of the owner's last mode switch; the PnL baseline was reset to the vault's value then. */
  modeChangedAt?: string;
  /** "Issued at" of the last mode-switch message the owner signed; that one and older ones are refused (replays). */
  modeSignedAt?: string;
};

// HTTP contract (app/api/*):
//   GET  /api/agents/[tokenId]          -> AgentDetailResponse
//   POST /api/agents/[tokenId]/activate  body ActivateRequest -> AgentDetailResponse
//   POST /api/agents/[tokenId]/tick      -> AgentDetailResponse (runs one decision now; 429 + Retry-After
//                                           until MANUAL_RUN_INTERVAL_MS after the agent's last decision)
//   GET  /api/leaderboard               -> LeaderboardResponse
//   GET  /api/agent/tick                -> TickResponse (cron; Authorization: Bearer $CRON_SECRET)

/** Anyone can run an agent on demand, at most this often: it bounds LLM spend per agent. */
export const MANUAL_RUN_INTERVAL_MS = 15 * 60_000;

export type AgentDetailResponse = {
  agent: AgentRecord | null;
  /** Newest first. */
  decisions: Decision[];
};

export type LeaderboardResponse = {
  /** Sorted by pnlPct, best first. */
  agents: AgentRecord[];
  updatedAt: string;
};

export type ActivateRequest = {
  owner: Address;
  /** The exact message the owner signed (see activationMessage in lib/agent/auth.ts). */
  message: string;
  signature: Hex;
};

export type TickResponse = {
  ran: number;
  results: { tokenId: string; action: AgentAction | "error"; thesis?: string; error?: string }[];
};

// --- Trading mode (paper / on-chain through AnimrTradeGuard) ---
//   POST /api/agents/[tokenId]/mode  body ModeSwitchRequest -> AgentDetailResponse. Owner-signed. Switching resets
//        the PnL baseline to the vault's value now. "onchain" needs the guard and the operator configured and
//        readGuardOnboarding(...).nextStep === "ready"; otherwise 409/503 with { error, step?: OnboardingStep }.
//        On-chain, the quote asset is WMON: portfolio.quote is the vault's WMON and trades say tokenIn/out "WMON".

export type AgentMode = AgentRecord["mode"];

export type ModeSwitchFields = {
  tokenId: string;
  mode: AgentMode;
  /** The Chog's ERC-6551 account. */
  account: Address;
  owner: Address;
  /** ISO timestamp; the API accepts it for ACTIVATION_MAX_AGE_MS (lib/agent/auth.ts). */
  issuedAt: string;
};

export type ModeSwitchRequest = {
  mode: AgentMode;
  owner: Address;
  /** The exact message the owner signed: modeSwitchMessage(...). */
  message: string;
  signature: Hex;
};

const MODE_SWITCH_HEADLINES: Record<AgentMode, string> = {
  onchain:
    "Animr: switch my Chog's AI agent to on-chain trading. It may trade the $CHOG and WMON in my Chog's wallet only through AnimrTradeGuard, within the limits I set, and can never withdraw.",
  paper: "Animr: switch my Chog's AI agent to paper trading. Its trades are simulated and no tokens move.",
};

/** The exact message an NFT owner signs to switch their agent's trading mode (pass checksummed addresses). */
export function modeSwitchMessage(fields: ModeSwitchFields): string {
  return [
    MODE_SWITCH_HEADLINES[fields.mode],
    `Chog: #${fields.tokenId}`,
    `Mode: ${fields.mode}`,
    `Account: ${fields.account}`,
    `Owner: ${fields.owner}`,
    `Issued at: ${fields.issuedAt}`,
  ].join("\n");
}

/** Inverse of modeSwitchMessage; null unless `message` is exactly what it builds. */
export function parseModeSwitchMessage(message: string): ModeSwitchFields | null {
  const match =
    /\nChog: #(\d+)\nMode: (onchain|paper)\nAccount: (0x[0-9a-fA-F]{40})\nOwner: (0x[0-9a-fA-F]{40})\nIssued at: (\S+)$/.exec(
      message,
    );
  if (!match) return null;
  const [, tokenId, mode, account, owner, issuedAt] = match;
  if (Number.isNaN(Date.parse(issuedAt))) return null;
  const fields: ModeSwitchFields = {
    tokenId,
    mode: mode as AgentMode,
    account: account as Address,
    owner: owner as Address,
    issuedAt,
  };
  return modeSwitchMessage(fields) === message ? fields : null;
}
