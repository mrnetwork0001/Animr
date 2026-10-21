import { type Address, erc20Abi, formatUnits } from "viem";
import { publicClient } from "../clients";
import { appConfig } from "../config";
import { fetchNftMetadata } from "../nft";
import { decide, type BrainDecision } from "./brain";
import { getMarketSnapshot } from "./market";
import { OnchainTradeError, type TradeHold, executeOnchainTrade, readVaultPortfolio } from "./onchain";
import { derivePersona } from "./persona";
import { type PaperFill, PaperTradeError, paperStartPortfolio, portfolioValueChog, simulatePaperTrade } from "./paper";
import { MAX_DECISIONS_PER_AGENT, getStore } from "./store";
import type {
  AgentDetailResponse,
  AgentMode,
  AgentRecord,
  Decision,
  LeaderboardResponse,
  MarketSnapshot,
  Portfolio,
  TickResponse,
} from "./types";

export class NotImplementedError extends Error {
  name = "NotImplementedError";
}

/** Another run (cron, "think now" or activation) holds this agent's lock. */
export class AgentBusyError extends Error {
  name = "AgentBusyError";
}

/** A required on-chain read failed; the message is safe to show and the client can retry. */
export class ChainReadError extends Error {
  name = "ChainReadError";
}

/** A mode switch the API refuses; the message is safe to show and `status` is the HTTP status. */
export class ModeSwitchError extends Error {
  name = "ModeSwitchError";
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Max time one run may hold an agent's lock (it expires on its own if the function dies). Above the
 * worst on-chain run: market <= 16s, LLM <= 20s, RPC reads, operator lock <= 30s, receipt <= 45s.
 */
const RUN_LOCK_TTL_MS = 180_000;

async function withAgentLock<T>(tokenId: string, waitMs: number, fn: () => Promise<T>): Promise<T> {
  const store = getStore();
  const key = `run:${tokenId}`;
  const deadline = Date.now() + waitMs;
  let token = await store.acquireLock(key, RUN_LOCK_TTL_MS);
  while (!token && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    token = await store.acquireLock(key, RUN_LOCK_TTL_MS);
  }
  if (!token) throw new AgentBusyError(`Chog #${tokenId} is busy thinking. Try again in a moment.`);
  try {
    return await fn();
  } finally {
    await store.releaseLock(key, token).catch(() => {});
  }
}

export type Execution = PaperFill;
/** The venue declined the trade before anything moved (on-chain: AnimrTradeGuard's reason); recorded as a hold. */
export type ExecutionHold = TradeHold;

/**
 * Executes a buy/sell decision for the agent's account.
 *
 * "onchain" agents trade ONLY through AnimrTradeGuard (executeOnchainTrade in ./onchain): readVaultBalances ->
 * prepareTrade -> the operator key (OPERATOR_PRIVATE_KEY) sends the guard's trade() -> decodeTradeReceipt.
 * Never give the operator key Tokenbound permission or wrap swaps in the account's execute(): that makes the AI an
 * unrestricted executor and bypasses every limit. The on-chain quote asset is WMON, not native MON.
 */
export async function executeTrade(
  agent: AgentRecord,
  decision: BrainDecision,
  market: MarketSnapshot,
): Promise<Execution | ExecutionHold> {
  if (decision.action === "hold") throw new Error("A hold decision has nothing to execute");
  switch (agent.mode) {
    case "paper":
      return simulatePaperTrade({
        side: decision.action,
        sizeBps: decision.sizeBps,
        maxSlippageBps: decision.maxSlippageBps,
        portfolio: agent.portfolio,
        market,
      });
    case "onchain":
      return executeOnchainTrade(agent, decision, market);
  }
}

function round(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

/** Messages that are safe to show to clients; anything unexpected is logged and replaced. */
export function publicErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (
    error instanceof NotImplementedError ||
    error instanceof PaperTradeError ||
    error instanceof AgentBusyError ||
    error instanceof ChainReadError ||
    error instanceof OnchainTradeError ||
    error instanceof ModeSwitchError
  ) {
    return error.message;
  }
  console.error("[animr]", error);
  return fallback;
}

/** The vault's real CHOG and WMON (quote); a failed read is a ChainReadError. */
function readVault(agent: AgentRecord): Promise<Portfolio> {
  return readVaultPortfolio(agent.account).catch((error) => {
    console.error(`[animr] vault read failed for Chog #${agent.tokenId}:`, error);
    throw new ChainReadError(`Couldn't read Chog #${agent.tokenId}'s wallet on-chain. Try again in a moment.`);
  });
}

/**
 * On-chain agents decide from the vault's real balances. A change since the last run that our trades didn't make
 * (the owner deposited or withdrew) rescales the PnL baseline, so pnlPct stays the agent's own return: the value
 * per baseline unit before the flow, at today's price, is kept.
 */
function syncVault(agent: AgentRecord, vault: Portfolio, priceQuote: number | null): AgentRecord {
  const before = portfolioValueChog(agent.portfolio, priceQuote);
  const now = portfolioValueChog(vault, priceQuote);
  if (before === null || now === null || now === before) return { ...agent, portfolio: vault };
  const growth = before > 0 && agent.startValueChog > 0 ? before / agent.startValueChog : 1 + agent.pnlPct / 100;
  console.info(`[animr] Chog #${agent.tokenId}: vault moved outside trading (${before} -> ${now} $CHOG-eq), rebasing PnL`);
  return { ...agent, portfolio: vault, startValueChog: growth > 0 ? now / growth : now };
}

export type RunOptions = {
  /**
   * Wall-clock time (ms) after which the run sends no on-chain trade (it records a hold instead): set by
   * callers that stop waiting for the run then, like the Daily Bell.
   */
  deadline?: number;
};

/** One decision cycle: snapshot -> decide -> execute -> revalue -> persist. */
export function runAgentOnce(agent: AgentRecord, options: RunOptions = {}): Promise<Decision> {
  return withAgentLock(agent.tokenId, 0, async () => {
    const store = getStore();
    const stored = (await store.getAgent(agent.tokenId)) ?? agent;
    const [market, history, vault] = await Promise.all([
      getMarketSnapshot(appConfig.chogToken),
      store.listDecisions(stored.tokenId, MAX_DECISIONS_PER_AGENT),
      stored.mode === "onchain" ? readVault(stored) : undefined,
    ]);
    const current = vault ? syncVault(stored, vault, market.priceQuote) : stored;
    const brain = await decide({
      tokenId: current.tokenId,
      persona: current.persona,
      portfolio: current.portfolio,
      market,
      pnlPct: current.pnlPct,
      recent: history.slice(0, 5),
      lastTrade: history.find((decision) => decision.trade),
    });

    let execution: Execution | undefined;
    let held: string | undefined;
    let error: string | undefined;
    let late = false;
    if (brain.action !== "hold" && current.mode === "onchain" && options.deadline !== undefined && Date.now() > options.deadline) {
      late = true;
    } else if (brain.action !== "hold") {
      try {
        const result = await executeTrade(current, brain, market);
        if ("hold" in result) held = result.reason;
        else execution = result;
      } catch (cause) {
        error = publicErrorMessage(cause, "Trade execution failed");
      }
    }

    const at = new Date().toISOString();
    const portfolio = execution?.portfolio ?? current.portfolio;
    const decision: Decision = {
      id: crypto.randomUUID(),
      tokenId: current.tokenId,
      at,
      action: held || late ? "hold" : brain.action,
      sizeBps: held || late ? 0 : (execution?.filledBps ?? brain.sizeBps),
      maxSlippageBps: brain.maxSlippageBps,
      confidence: brain.confidence,
      thesis: held
        ? `${brain.thesis} (AnimrTradeGuard: ${held}, holding.)`
        : late
          ? `${brain.thesis} (Out of time for this run: no transaction sent, holding.)`
          : brain.thesis,
      decidedBy: brain.decidedBy,
      ...(brain.model && { model: brain.model }),
      ...(brain.zg && { zg: brain.zg }),
      ...(brain.forecast && { forecast: brain.forecast }),
      market,
      portfolioBefore: current.portfolio,
      portfolioAfter: portfolio,
      ...(execution && { trade: execution.trade }),
      ...(error && { error }),
    };

    // Without a price the MON leg can't be valued, so keep the last known values.
    const value = portfolioValueChog(portfolio, market.priceQuote);
    const lastValueChog = value ?? current.lastValueChog;
    await store.addDecision(decision);
    await store.saveAgent({
      ...current,
      portfolio,
      lastValueChog: round(lastValueChog),
      // An emptied on-chain vault has no baseline: keep the last return until it is funded again.
      pnlPct: current.startValueChog > 0 ? round((lastValueChog / current.startValueChog - 1) * 100, 4) : current.pnlPct,
      lastValueUsd:
        value !== null && market.priceUsd !== null ? round(value * market.priceUsd) : current.lastValueUsd,
      decisions: current.decisions + 1,
      lastDecisionAt: at,
    });
    return decision;
  });
}

/** How many agents runAllAgents runs at once. */
export const RUN_CONCURRENCY = 6;

async function runListedAgent(agent: AgentRecord, deadline?: number): Promise<TickResponse["results"][number]> {
  if (deadline !== undefined && Date.now() > deadline) {
    return { tokenId: agent.tokenId, action: "error", error: "Skipped: out of time for this run" };
  }
  try {
    const decision = await runAgentOnce(agent);
    return {
      tokenId: agent.tokenId,
      action: decision.action,
      thesis: decision.thesis,
      ...(decision.error && { error: decision.error }),
    };
  } catch (error) {
    return { tokenId: agent.tokenId, action: "error", error: publicErrorMessage(error, "Agent run failed") };
  }
}

/**
 * Runs every active agent once, oldest-first, up to `concurrency` at a time; one agent's failure never stops the
 * rest. Agents not started by `deadline` are reported as skipped. Results keep the oldest-first order.
 */
export async function runAllAgents(options: { deadline?: number; concurrency?: number } = {}): Promise<TickResponse> {
  const agents = (await getStore().listAgents())
    .filter((agent) => agent.active)
    .sort((a, b) => (a.lastDecisionAt ?? "").localeCompare(b.lastDecisionAt ?? ""));
  const results: TickResponse["results"] = new Array(agents.length);
  let next = 0;
  const worker = async () => {
    for (let index = next++; index < agents.length; index = next++) {
      results[index] = await runListedAgent(agents[index], options.deadline);
    }
  };
  const workers = Math.min(Math.max(1, options.concurrency ?? RUN_CONCURRENCY), agents.length);
  await Promise.all(Array.from({ length: workers }, worker));
  return { ran: results.filter((result) => result.action !== "error").length, results };
}

/**
 * Switches a verified owner's agent between paper and on-chain trading and resets the PnL baseline to the vault's
 * real value now (on-chain: its CHOG and WMON; paper: the same, or the demo bankroll if the vault is empty). The
 * caller has verified the owner's signature and, for "onchain", checkOnchainReady(). Same mode: no change.
 */
export function switchAgentMode(params: {
  tokenId: string;
  mode: AgentMode;
  owner: Address;
  /** "Issued at" of the signed message: it must be newer than the last accepted one. */
  signedAt: string;
}): Promise<AgentRecord> {
  const { tokenId, mode, owner, signedAt } = params;
  return withAgentLock(tokenId, 30_000, async () => {
    const store = getStore();
    const agent = await store.getAgent(tokenId);
    if (!agent) throw new ModeSwitchError(`Chog #${tokenId} has no agent yet. Activate it first.`, 404);
    if (agent.modeSignedAt && Date.parse(signedAt) <= Date.parse(agent.modeSignedAt)) {
      throw new ModeSwitchError("This signature was already used. Sign a fresh message.", 409);
    }
    if (agent.mode === mode) return agent;

    const [market, vault] = await Promise.all([getMarketSnapshot(appConfig.chogToken), readVault(agent)]);
    const empty = !(Number(vault.chog) > 0) && !(Number(vault.quote) > 0);
    const portfolio = mode === "paper" && empty ? paperStartPortfolio() : vault;
    const value = portfolioValueChog(portfolio, market.priceQuote);
    if (value === null) {
      throw new ModeSwitchError("There's no $CHOG price right now to value the wallet's WMON. Try again in a minute.", 503);
    }
    const next: AgentRecord = {
      ...agent,
      owner,
      mode,
      portfolio,
      bankroll: mode === "paper" && empty ? "demo" : "wallet",
      startValueChog: round(value),
      lastValueChog: round(value),
      pnlPct: 0,
      lastValueUsd: market.priceUsd === null ? null : round(value * market.priceUsd),
      modeChangedAt: new Date().toISOString(),
      modeSignedAt: signedAt,
    };
    await store.saveAgent(next);
    console.info(`[animr] Chog #${tokenId}: switched to ${mode} trading, baseline ${next.startValueChog} $CHOG-eq`);
    return next;
  });
}

/**
 * A new agent's paper portfolio: the $CHOG its account holds on-chain, or the demo
 * bankroll (ANIMR_PAPER_START_CHOG) when the account holds none.
 */
async function startingPortfolio(account: Address): Promise<{ portfolio: Portfolio; bankroll: "wallet" | "demo" }> {
  const token = appConfig.chogToken;
  if (token) {
    let raw: bigint;
    let decimals: number;
    try {
      [raw, decimals] = await Promise.all([
        publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
        publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
      ]);
    } catch (error) {
      console.error("[animr] $CHOG balance read failed:", error);
      throw new ChainReadError("Couldn't read the $CHOG in this Chog's wallet. Try again in a moment.");
    }
    if (raw > BigInt(0)) return { portfolio: { chog: formatUnits(raw, decimals), quote: "0" }, bankroll: "wallet" };
  }
  return { portfolio: paperStartPortfolio(), bankroll: "demo" };
}

/**
 * Creates the paper agent for a verified owner, or re-activates an existing one
 * (new owner after a sale, same portfolio and history).
 */
export function activateAgent(params: { tokenId: string; account: Address; owner: Address }): Promise<AgentRecord> {
  const { tokenId, account, owner } = params;
  return withAgentLock(tokenId, 30_000, async () => {
    const store = getStore();
    const [existing, metadata, market] = await Promise.all([
      store.getAgent(tokenId),
      appConfig.chogNft ? fetchNftMetadata(appConfig.chogNft, BigInt(tokenId)) : Promise.resolve(null),
      getMarketSnapshot(appConfig.chogToken),
    ]);

    let agent: AgentRecord;
    if (existing) {
      agent = {
        ...existing,
        account,
        owner,
        active: true,
        // A failed metadata fetch must not reset the persona to the trait-less default.
        persona: metadata ? derivePersona(tokenId, metadata) : existing.persona,
        image: metadata?.image ?? existing.image,
      };
    } else {
      const { portfolio, bankroll } = await startingPortfolio(account);
      const startValueChog = Number(portfolio.chog);
      agent = {
        tokenId,
        account,
        owner,
        activatedAt: new Date().toISOString(),
        active: true,
        mode: "paper",
        persona: derivePersona(tokenId, metadata),
        portfolio,
        bankroll,
        startValueChog,
        lastValueChog: startValueChog,
        pnlPct: 0,
        lastValueUsd: market.priceUsd === null ? null : round(startValueChog * market.priceUsd),
        decisions: 0,
        lastDecisionAt: null,
        ...(metadata?.image && { image: metadata.image }),
      };
    }
    await store.saveAgent(agent);
    return agent;
  });
}

export async function getAgentDetail(tokenId: string, limit = 50): Promise<AgentDetailResponse> {
  const store = getStore();
  const [agent, decisions] = await Promise.all([store.getAgent(tokenId), store.listDecisions(tokenId, limit)]);
  return { agent, decisions };
}

/** All agents, best PnL first (ties: larger portfolio, then lower token id). */
export async function getLeaderboard(): Promise<LeaderboardResponse> {
  const agents = await getStore().listAgents();
  agents.sort(
    (a, b) =>
      b.pnlPct - a.pnlPct ||
      b.lastValueChog - a.lastValueChog ||
      a.tokenId.length - b.tokenId.length ||
      a.tokenId.localeCompare(b.tokenId),
  );
  return { agents, updatedAt: new Date().toISOString() };
}
