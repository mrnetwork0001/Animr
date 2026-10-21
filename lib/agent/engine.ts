import type { Address } from "viem";
import { appConfig } from "../config";
import { houseChogTokenId } from "../heist/config";
import { fetchNftMetadata } from "../nft";
import { decide, type BrainDecision } from "./brain";
import { getMarketSnapshot } from "./market";
import { OnchainTradeError, type TradeHold, executeOnchainTrade, readVaultPortfolio } from "./onchain";
import { derivePersona } from "./persona";
import {
  EMPTY_PORTFOLIO,
  type PaperFill,
  PaperTradeError,
  UNFUNDED_MESSAGE,
  isEmptyPortfolio,
  isUnfunded,
  portfolioValueChog,
  simulatePaperTrade,
} from "./paper";
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

/** An unfunded paper agent asked to run where a run without a trade is pointless (on demand, the hourly tick). */
export class UnfundedAgentError extends Error {
  name = "UnfundedAgentError";
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
    error instanceof ModeSwitchError ||
    error instanceof UnfundedAgentError
  ) {
    return error.message;
  }
  console.error("[animr]", error);
  return fallback;
}

/** The vault's real CHOG and WMON (quote); a failed read is a ChainReadError. */
function readVault(agent: Pick<AgentRecord, "tokenId" | "account">): Promise<Portfolio> {
  return readVaultPortfolio(agent.account).catch((error) => {
    console.error(`[animr] vault read failed for Chog #${agent.tokenId}:`, error);
    throw new ChainReadError(`Couldn't read Chog #${agent.tokenId}'s wallet on-chain. Try again in a moment.`);
  });
}

type PaperBook = Pick<
  AgentRecord,
  "portfolio" | "bankroll" | "fundedAt" | "startValueChog" | "lastValueChog" | "pnlPct" | "lastValueUsd"
>;

/**
 * A paper book on the wallet's REAL balances (its $CHOG and WMON, read on-chain now): paper trades are simulated,
 * the money they start from is not. An empty wallet gives an unfunded book (the agent doesn't trade). Null when the
 * wallet's WMON can't be valued (no $CHOG price right now).
 */
function paperBook(vault: Portfolio, market: MarketSnapshot): PaperBook | null {
  if (isEmptyPortfolio(vault)) {
    return {
      portfolio: EMPTY_PORTFOLIO,
      bankroll: "unfunded",
      fundedAt: undefined,
      startValueChog: 0,
      lastValueChog: 0,
      pnlPct: 0,
      lastValueUsd: null,
    };
  }
  const value = portfolioValueChog(vault, market.priceQuote);
  if (value === null) return null;
  return {
    portfolio: vault,
    bankroll: "wallet",
    fundedAt: new Date().toISOString(),
    startValueChog: round(value),
    lastValueChog: round(value),
    pnlPct: 0,
    lastValueUsd: market.priceUsd === null ? null : round(value * market.priceUsd),
  };
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

/** "+4.2%" / "−3.1%" for a rule's reason. */
function signedChange(pct: number): string {
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(1)}%`;
}

/**
 * The House Chog's code rule (HOUSE_CHOG_TOKEN_ID, on-chain mode only): its mandate is to buy dips, never to sell
 * real $CHOG into one. A sell decision while $CHOG is down over the last hour or day (or while the trend can't be
 * read) becomes a hold, whatever the LLM said. Its reason in words, or undefined when the decision may go ahead.
 */
export function houseDipRule(agent: Pick<AgentRecord, "tokenId" | "mode">, action: BrainDecision["action"], market: MarketSnapshot) {
  if (action !== "sell" || agent.mode !== "onchain") return undefined;
  const house = houseChogTokenId();
  if (house === null || Number(agent.tokenId) !== house) return undefined;
  const { change1hPct: hour, change24hPct: day } = market;
  if (hour === null || day === null) return "House rule: no real-money sell while the $CHOG trend can't be read";
  if (hour < 0 || day < 0) {
    return `House rule: no real-money sells into a dip ($CHOG ${signedChange(hour)} in 1h, ${signedChange(day)} in 24h)`;
  }
  return undefined;
}

export type RunOptions = {
  /**
   * Wall-clock time (ms) after which the run sends no on-chain trade (it records a hold instead): set by
   * callers that stop waiting for the run then, like the Daily Bell.
   */
  deadline?: number;
  /**
   * An unfunded paper agent (its wallet held no $CHOG or WMON) throws UnfundedAgentError instead of thinking: for
   * "Think now" and the hourly tick. Without it (the Daily Bell) it still makes its call, but never trades.
   */
  skipUnfunded?: boolean;
};

/**
 * One decision cycle: snapshot -> decide -> execute -> revalue -> persist. An unfunded paper agent first re-reads
 * its wallet: once it holds real $CHOG or WMON, the paper book starts from those balances (a new PnL baseline).
 */
export function runAgentOnce(agent: AgentRecord, options: RunOptions = {}): Promise<Decision> {
  return withAgentLock(agent.tokenId, 0, async () => {
    const store = getStore();
    const stored = (await store.getAgent(agent.tokenId)) ?? agent;
    const onchain = stored.mode === "onchain";
    const [market, history, vault] = await Promise.all([
      getMarketSnapshot(appConfig.chogToken),
      store.listDecisions(stored.tokenId, MAX_DECISIONS_PER_AGENT),
      onchain
        ? readVault(stored)
        : isUnfunded(stored)
          ? // An unreadable wallet keeps the book unfunded for this run.
            readVault(stored).catch(() => undefined)
          : undefined,
    ]);
    let current = stored;
    if (onchain && vault) current = syncVault(stored, vault, market.priceQuote);
    else if (vault) {
      const book = paperBook(vault, market);
      if (book?.bankroll === "wallet") {
        current = { ...stored, ...book };
        console.info(`[animr] Chog #${stored.tokenId}: wallet funded, paper book starts at ${book.startValueChog} $CHOG-eq`);
      }
    }
    const unfunded = isUnfunded(current);
    if (unfunded && options.skipUnfunded) {
      throw new UnfundedAgentError(
        `${UNFUNDED_MESSAGE}: its AI paper-trades the real $CHOG and WMON in its wallet, and the wallet holds none.`,
      );
    }
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
    const ruled = houseDipRule(current, brain.action, market);
    // Unfunded: the call stands (the Daily Bell scores it), but there is nothing real to simulate a trade on.
    const idle = unfunded && brain.action !== "hold";
    if (ruled || idle) {
      // The House Chog's mandate: no real-money sell into a dip. Nothing is sent; recorded as a hold.
    } else if (brain.action !== "hold" && current.mode === "onchain" && options.deadline !== undefined && Date.now() > options.deadline) {
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
      action: held || late || ruled || idle ? "hold" : brain.action,
      sizeBps: held || late || ruled || idle ? 0 : (execution?.filledBps ?? brain.sizeBps),
      maxSlippageBps: brain.maxSlippageBps,
      confidence: brain.confidence,
      thesis: ruled
        ? `${brain.thesis} (${ruled}: no transaction sent, holding.)`
        : idle
        ? `${brain.thesis} (Its wallet holds no $CHOG or WMON, so no paper trade: ${UNFUNDED_MESSAGE.toLowerCase()}.)`
        : held
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
    const decision = await runAgentOnce(agent, { skipUnfunded: true });
    return {
      tokenId: agent.tokenId,
      action: decision.action,
      thesis: decision.thesis,
      ...(decision.error && { error: decision.error }),
    };
  } catch (error) {
    if (error instanceof UnfundedAgentError) {
      return { tokenId: agent.tokenId, action: "error", error: `Skipped: ${UNFUNDED_MESSAGE.toLowerCase()}` };
    }
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
 * real value now (its CHOG and WMON; paper with an empty vault: an unfunded book that doesn't trade). The
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
    const book = paperBook(vault, market);
    if (book === null) {
      throw new ModeSwitchError("There's no $CHOG price right now to value the wallet's WMON. Try again in a minute.", 503);
    }
    const next: AgentRecord = {
      ...agent,
      ...book,
      // On-chain the book is the vault itself; fundedAt only marks a paper book's start.
      ...(mode === "onchain" && { bankroll: "wallet" as const, fundedAt: undefined }),
      owner,
      mode,
      modeChangedAt: new Date().toISOString(),
      modeSignedAt: signedAt,
    };
    await store.saveAgent(next);
    console.info(`[animr] Chog #${tokenId}: switched to ${mode} trading, baseline ${next.startValueChog} $CHOG-eq`);
    return next;
  });
}

/**
 * Creates the paper agent for a verified owner, its paper book on the wallet's real $CHOG and WMON (unfunded, so
 * not trading, while the wallet holds neither), or re-activates an existing one (new owner after a sale, same
 * portfolio and history).
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
      // Starts from the wallet's real balances; with WMON but no price to value it, unfunded until the next run.
      const book = paperBook(await readVault({ tokenId, account }), market) ?? paperBook(EMPTY_PORTFOLIO, market)!;
      agent = {
        tokenId,
        account,
        owner,
        activatedAt: new Date().toISOString(),
        active: true,
        mode: "paper",
        persona: derivePersona(tokenId, metadata),
        ...book,
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

/** All agents, best PnL first (ties: larger portfolio, then lower token id); unfunded paper agents last. */
export async function getLeaderboard(): Promise<LeaderboardResponse> {
  const agents = await getStore().listAgents();
  agents.sort(
    (a, b) =>
      Number(isUnfunded(a)) - Number(isUnfunded(b)) ||
      b.pnlPct - a.pnlPct ||
      b.lastValueChog - a.lastValueChog ||
      a.tokenId.length - b.tokenId.length ||
      a.tokenId.localeCompare(b.tokenId),
  );
  return { agents, updatedAt: new Date().toISOString() };
}
