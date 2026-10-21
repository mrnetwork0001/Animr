import {
  type Address,
  type Hex,
  type PrivateKeyAccount,
  BaseError,
  InsufficientFundsError,
  createWalletClient,
  erc20Abi,
  formatUnits,
  http,
  isAddressEqual,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { publicClient } from "../clients";
import { appConfig } from "../config";
import {
  GUARD_VENUE,
  type OnboardingStep,
  animrTradeGuardAbi,
  animrTradeGuardAddress,
  decodeTradeReceipt,
  operatorHasDirectAccess,
  prepareTrade,
  readGuardOnboarding,
  readVaultBalances,
} from "../contracts/animr-trade-guard";
import type { BrainDecision } from "./brain";
import { getStore } from "./store";
import type { AgentRecord, MarketSnapshot, Portfolio, Trade } from "./types";

// Real trading for "onchain" agents. Server only: OPERATOR_PRIVATE_KEY never leaves this module and is never logged.
//
// The operator key can only call AnimrTradeGuard.trade(): the guard swaps CHOG <-> WMON inside the Chog's own
// ERC-6551 account, within the owner's limits, and can never withdraw. readVaultBalances -> prepareTrade (sizes,
// checks, quotes, simulates) -> the operator sends trade() with prepareTrade's gas -> receipt -> decodeTradeReceipt.
// On-chain the quote asset is WMON: Portfolio.quote is the vault's WMON.

/** CHOG and WMON both use 18 decimals. */
const DECIMALS = 18;
const BPS = BigInt(10_000);
/** Monad confirms in about a second; a trade still unconfirmed after this is reported and re-read next run. */
const RECEIPT_TIMEOUT_MS = 45_000;
/** One operator key signs for every agent: sends are serialized (nonces) across runs and instances. */
const OPERATOR_LOCK_KEY = "operator:send";
const OPERATOR_LOCK_TTL_MS = 75_000;
const OPERATOR_LOCK_WAIT_MS = 30_000;

/** A failed on-chain step; the message is safe to show to users. */
export class OnchainTradeError extends Error {
  name = "OnchainTradeError";
}

/** A trade the guard declined before anything was sent (its canTrade/simulation reason); recorded as a hold. */
export type TradeHold = { hold: true; reason: string };

/** Same shape as a paper fill: the trade, the vault's balances after it, and the share of the balance sold. */
export type OnchainFill = { trade: Trade; portfolio: Portfolio; filledBps: number };

type Operator = { account: PrivateKeyAccount; wallet: ReturnType<typeof createOperatorWallet> };
let operatorCache: Operator | null | undefined;

function createOperatorWallet(account: PrivateKeyAccount) {
  return createWalletClient({ account, chain: appConfig.chain, transport: http(appConfig.rpcUrl) });
}

/** The AI operator from OPERATOR_PRIVATE_KEY, or null when it is not set. */
function getOperator(): Operator | null {
  if (operatorCache !== undefined) return operatorCache;
  const raw = process.env.OPERATOR_PRIVATE_KEY?.trim();
  if (!raw) return (operatorCache = null);
  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  let account: PrivateKeyAccount;
  try {
    if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("bad format");
    account = privateKeyToAccount(key);
  } catch {
    throw new OnchainTradeError("OPERATOR_PRIVATE_KEY is not a valid private key.");
  }
  return (operatorCache = { account, wallet: createOperatorWallet(account) });
}

/** The operator's public address (guard.operator() must match it), or null when no key is configured. */
export function getOperatorAddress(): Address | null {
  try {
    return getOperator()?.account.address ?? null;
  } catch {
    return null;
  }
}

/** Both halves of on-chain mode are configured: the guard deployment and the operator key. */
export function isOnchainConfigured(): boolean {
  return Boolean(animrTradeGuardAddress && getOperatorAddress());
}

function toPortfolio(chog: bigint, wmon: bigint): Portfolio {
  return { chog: formatUnits(chog, DECIMALS), quote: formatUnits(wmon, DECIMALS) };
}

/** What the vault can trade, as a Portfolio (quote = WMON); `blockNumber` reads it as of that block. */
export async function readVaultPortfolio(tba: Address, blockNumber?: bigint): Promise<Portfolio> {
  const balanceOf = (token: Address) =>
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [tba], blockNumber });
  const [chog, wmon] = await Promise.all([balanceOf(GUARD_VENUE.chog), balanceOf(GUARD_VENUE.wmon)]);
  return toPortfolio(chog, wmon);
}

/** A one-line description of an RPC/contract error for the server log (viem's full messages span dozens of lines). */
function describe(error: unknown): string {
  if (error instanceof BaseError) return [error.name, error.shortMessage, error.details].filter(Boolean).join(" | ");
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function chainRead<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof OnchainTradeError) throw error;
    console.error("[animr] on-chain read failed:", describe(error));
    throw new OnchainTradeError("Couldn't read the vault or the guard on-chain. Trying again next run.");
  }
}

async function withOperatorLock<T>(fn: () => Promise<T>): Promise<T> {
  const store = getStore();
  const deadline = Date.now() + OPERATOR_LOCK_WAIT_MS;
  let token = await store.acquireLock(OPERATOR_LOCK_KEY, OPERATOR_LOCK_TTL_MS);
  while (!token && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    token = await store.acquireLock(OPERATOR_LOCK_KEY, OPERATOR_LOCK_TTL_MS);
  }
  if (!token) throw new OnchainTradeError("Another on-chain trade is still confirming. Trying again next run.");
  try {
    return await fn();
  } finally {
    await store.releaseLock(OPERATOR_LOCK_KEY, token).catch(() => {});
  }
}

function sendFailure(error: unknown): OnchainTradeError {
  console.error("[animr] sending the guard trade failed:", describe(error));
  if (error instanceof BaseError && error.walk((e) => e instanceof InsufficientFundsError)) {
    return new OnchainTradeError("The AI operator wallet is out of MON for gas.");
  }
  return new OnchainTradeError("Sending the on-chain trade failed. Trying again next run.");
}

/**
 * Executes a buy/sell for an "onchain" agent through AnimrTradeGuard. sizeBps applies to the vault's CHOG (sell) or
 * WMON (buy); the guard may clamp it to the owner's limits. Returns a hold when the guard declines before anything
 * is sent; throws OnchainTradeError when a step fails (sent but reverted, unconfirmed, RPC down, misconfigured).
 */
export async function executeOnchainTrade(
  agent: AgentRecord,
  decision: Pick<BrainDecision, "action" | "sizeBps" | "maxSlippageBps">,
  market: MarketSnapshot,
): Promise<OnchainFill | TradeHold> {
  if (decision.action === "hold") throw new Error("A hold decision has nothing to execute");
  const guard = animrTradeGuardAddress;
  const operator = getOperator();
  if (!guard || !operator) {
    throw new OnchainTradeError("On-chain trading is not configured on this server yet.");
  }
  const tba = agent.account;
  const side = decision.action;
  const sell = side === "sell";

  // Tripwire: a key that can execute for the TBA directly bypasses every limit of the guard.
  if (await chainRead(() => operatorHasDirectAccess(publicClient, tba, operator.account.address))) {
    console.error(
      `[animr] ALERT: operator ${operator.account.address} can execute for Chog #${agent.tokenId}'s account ${tba} directly, bypassing AnimrTradeGuard. Refusing to trade.`,
    );
    throw new OnchainTradeError(
      "Refusing to trade: the AI operator has direct access to this vault, which would bypass AnimrTradeGuard. The owner must revoke it.",
    );
  }

  const before = await chainRead(() => readVaultBalances(publicClient, tba));
  const balanceIn = sell ? before.chog : before.wmon;
  const sizeBps = BigInt(Math.min(Math.max(Math.round(decision.sizeBps), 0), 10_000));
  const prepared = await chainRead(() =>
    prepareTrade(publicClient, {
      tba,
      side,
      amountIn: (balanceIn * sizeBps) / BPS,
      maxSlippageBps: decision.maxSlippageBps,
      operator: operator.account.address,
      guard,
    }),
  );
  if (!prepared.ok) return { hold: true, reason: prepared.reason || "the guard declined the trade" };

  const { hash, receipt } = await withOperatorLock(async () => {
    let hash: Hex;
    try {
      hash = await operator.wallet.writeContract(prepared.request);
    } catch (error) {
      throw sendFailure(error);
    }
    try {
      return { hash, receipt: await publicClient.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS }) };
    } catch (error) {
      console.error(`[animr] Chog #${agent.tokenId}: trade ${hash} unconfirmed:`, describe(error));
      throw new OnchainTradeError(`The trade was sent (tx ${hash}) but did not confirm in time; the next run reads the vault again.`);
    }
  });
  if (receipt.status !== "success") {
    throw new OnchainTradeError(`The on-chain trade reverted (tx ${hash}); nothing was swapped.`);
  }
  const traded = decodeTradeReceipt(receipt, guard);
  if (!traded) throw new OnchainTradeError(`The trade (tx ${hash}) emitted no Traded event.`);

  // The vault as of the trade's block; if the node can't serve that block yet, derive it from the event.
  const portfolio = await readVaultPortfolio(tba, receipt.blockNumber).catch(() =>
    toPortfolio(
      sell ? before.chog - traded.amountIn : before.chog + traded.amountOut,
      sell ? before.wmon + traded.amountOut : before.wmon - traded.amountIn,
    ),
  );
  const amountIn = formatUnits(traded.amountIn, DECIMALS);
  const amountOut = formatUnits(traded.amountOut, DECIMALS);
  const price = sell ? Number(amountOut) / Number(amountIn) : Number(amountIn) / Number(amountOut);
  const trade: Trade = {
    mode: "onchain",
    side,
    amountIn,
    amountOut,
    tokenIn: sell ? "CHOG" : "WMON",
    tokenOut: sell ? "WMON" : "CHOG",
    price: Number(price.toPrecision(8)),
    txHash: hash,
  };
  console.info(
    `[animr] Chog #${agent.tokenId}: on-chain ${side} ${amountIn} ${trade.tokenIn} -> ${amountOut} ${trade.tokenOut} ` +
      `at ${trade.price} WMON/$CHOG (feed ${market.priceQuote ?? "n/a"}), tx ${hash}`,
  );
  // Rounded to the nearest bp, like paper fills (a 10% cap on an odd balance is 999.99.. bps).
  const filledBps = balanceIn > BigInt(0) ? Number((traded.amountIn * BPS + balanceIn / BigInt(2)) / balanceIn) : 0;
  return { trade, portfolio, filledBps };
}

const ONBOARDING_HINTS: Record<Exclude<OnboardingStep, "ready">, string> = {
  "create-account": "Create this Chog's wallet first (one transaction that anyone can send).",
  "not-a-chog-account": "This address is not the Chog's canonical Tokenbound wallet.",
  "unsupported-owner":
    "This Chog is held by another token-bound account. On-chain trading needs the Chog in a regular wallet.",
  "grant-guard": "Let AnimrTradeGuard trade for this Chog's wallet first (setPermissions, sent by the owner).",
  configure: "Set the AI's trading limits on AnimrTradeGuard first.",
  fund: "Deposit $CHOG or WMON into this Chog's wallet first.",
};

export type OnchainReadiness =
  | { ok: true }
  | { ok: false; status: number; error: string; step?: Exclude<OnboardingStep, "ready"> };

/**
 * Whether an agent can switch to on-chain mode: guard + operator configured, the operator key is the guard's
 * operator and has no direct access to the vault, and the owner finished onboarding (nextStep "ready").
 */
export async function checkOnchainReady(tba: Address): Promise<OnchainReadiness> {
  const guard = animrTradeGuardAddress;
  if (!guard) {
    return { ok: false, status: 503, error: "On-chain trading isn't available yet: AnimrTradeGuard is not configured." };
  }
  let operator: Operator | null;
  try {
    operator = getOperator();
  } catch (error) {
    return { ok: false, status: 503, error: (error as Error).message };
  }
  if (!operator) {
    return { ok: false, status: 503, error: "On-chain trading isn't available yet: the AI operator is not configured." };
  }
  try {
    const [onboarding, guardOperator, direct] = await Promise.all([
      readGuardOnboarding(publicClient, tba, guard),
      publicClient.readContract({ address: guard, abi: animrTradeGuardAbi, functionName: "operator" }),
      operatorHasDirectAccess(publicClient, tba, operator.account.address),
    ]);
    if (!isAddressEqual(guardOperator, operator.account.address)) {
      console.error(`[animr] OPERATOR_PRIVATE_KEY is ${operator.account.address} but the guard's operator is ${guardOperator}`);
      return { ok: false, status: 503, error: "On-chain trading is misconfigured: this server's AI operator is not the guard's operator." };
    }
    if (direct) {
      return {
        ok: false,
        status: 409,
        error: "The AI operator has direct access to this Chog's wallet, which would bypass the guard. Revoke it first.",
      };
    }
    if (onboarding.nextStep !== "ready") {
      return { ok: false, status: 409, error: ONBOARDING_HINTS[onboarding.nextStep], step: onboarding.nextStep };
    }
    return { ok: true };
  } catch (error) {
    console.error("[animr] guard onboarding read failed:", describe(error));
    return { ok: false, status: 502, error: "Couldn't read the vault's guard setup on-chain. Try again in a moment." };
  }
}
