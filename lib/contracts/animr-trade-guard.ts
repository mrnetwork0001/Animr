import {
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  BaseError,
  ContractFunctionRevertedError,
  erc20Abi,
  getAddress,
  hexToBigInt,
  isAddressEqual,
  parseEventLogs,
  zeroAddress,
} from "viem";
import { appConfig } from "../config";

// AnimrTradeGuard: the on-chain bounds on what the AI operator can do with a Chog's vault (its ERC-6551 TBA).
//
// The NFT owner grants Tokenbound's executor permission to the guard (never to the AI's key) and sets limits on it.
// The operator key can then only call guard.trade(), which swaps CHOG <-> WMON on the Capricorn CL pool with the
// output always going back to the same TBA, within the owner's limits and above a TWAP-based floor.
// "The AI can trade your Chog's vault but can never withdraw from it."
//
// Owner onboarding (readGuardOnboarding().nextStep tells you which step is next):
//   1. create + initialize the TBA if needed (createAndInitializeAccountRequest in lib/erc6551.ts),
//   2. grantGuardRequest: TBA.setPermissions([guard], [true]), sent by the NFT owner directly,
//   3. configureGuardRequest: guard.configure(tba, limits),
//   4. deposit CHOG and/or WMON (WMON, not native MON: the guard only trades the two ERC-20s).
// Optional, at any time: setBuyOnlyRequest(tba, true). The AI can then still buy CHOG with the vault's WMON but never
// sells CHOG, so a buy-only vault needs WMON to trade at all: without WMON, nextStep is "fund" (deposit WMON).
// A sale of the NFT makes the grant, the limits and buy-only mode dormant; the buyer repeats steps 2 and 3 to
// re-enable the AI.
//
// Operator (server): prepareTrade() -> walletClient.writeContract(prepared.request) -> waitForTransactionReceipt ->
// decodeTradeReceipt(). Never give the operator key a Tokenbound permission itself (operatorHasDirectAccess).
//
// Source and fork tests: contracts/ (Foundry). animrTradeGuardAbi at the bottom of this file is generated with
// `forge inspect AnimrTradeGuard abi`; regenerate it whenever the contract changes.

/** AnimrTradeGuard on Monad mainnet (deployed 2026-10-19, buy-only capable, source verified on Sourcify and Monadscan). */
export const MAINNET_TRADE_GUARD: Address = "0x92D3d4Af4B3b0F29Ec020e407803e135af61987b";

// A literal process.env.NEXT_PUBLIC_* read, so Next inlines it at build time.
const guardEnv = process.env.NEXT_PUBLIC_TRADE_GUARD_ADDRESS;

/**
 * The deployed guard: NEXT_PUBLIC_TRADE_GUARD_ADDRESS, else (unset, on mainnet) the live deployment above, so a deploy
 * built without the variable still shows and uses the real guard. Set it to an empty value for paper trading only.
 * A new deployment: run contracts/script/DeployAnimrTradeGuard.s.sol and set the variable to the address it prints.
 */
export const animrTradeGuardAddress: Address | undefined = guardEnv
  ? getAddress(guardEnv)
  : guardEnv === undefined && appConfig.network === "mainnet"
    ? MAINNET_TRADE_GUARD
    : undefined;

function requireGuardAddress(): Address {
  if (!animrTradeGuardAddress) throw new Error("NEXT_PUBLIC_TRADE_GUARD_ADDRESS is not set");
  return animrTradeGuardAddress;
}

/** The venue the guard is deployed with on Monad mainnet (see contracts/script/DeployAnimrTradeGuard.s.sol). */
export const GUARD_VENUE = {
  chog: "0x350035555E10d9AfAF1566AaebfCeD5BA6C27777",
  wmon: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A",
  fee: 10_000,
  quoterV2: "0xB430EDD2b54cdB3B25703fb3342ca3a88663A04D",
} as const;

/** Limits an NFT owner sets for their Chog's vault with configure(). Keyed by (TBA, owner): a sale resets them. */
export type GuardLimits = {
  enabled: boolean;
  /** Max amountIn per trade, in bps of the vault's current balance of the token being sold (1-5000). */
  maxTradeBps: number;
  /**
   * Max value traded per 24h, buys and sells together, in bps of the vault's value (CHOG + WMON, priced in WMON at
   * the 30-minute TWAP) (1-10000). The budget frees up continuously over 24h.
   */
  maxDailyBps: number;
  /** Min seconds between two trades. */
  minInterval: number;
  /**
   * Max output shortfall vs the reference TWAP quote (after the 1% pool fee), in bps (1-200). Also how far the spot
   * price may be on the vault's unfavourable side of that reference, in ticks (1 tick is about 1 bp of price).
   */
  maxSlippageBps: number;
};

/** Hard ceilings enforced by configure(). */
export const GUARD_LIMIT_CEILINGS = { maxTradeBps: 5_000, maxDailyBps: 10_000, maxSlippageBps: 200 } as const;

/** A sensible starting point for the owner UI: 10% per trade, 30% of the vault per day, 10 minutes apart, 2%. */
export const DEFAULT_GUARD_LIMITS: GuardLimits = {
  enabled: true,
  maxTradeBps: 1_000,
  maxDailyBps: 3_000,
  minInterval: 600,
  maxSlippageBps: 200,
};

/** Same checks as configure(), so the UI can explain a bad value before the transaction reverts. */
export function validateGuardLimits(limits: GuardLimits): string | undefined {
  const inRange = (value: number, max: number) => Number.isInteger(value) && value >= 1 && value <= max;
  if (!inRange(limits.maxTradeBps, GUARD_LIMIT_CEILINGS.maxTradeBps)) return "Per-trade limit must be 0.01%-50%";
  if (!inRange(limits.maxDailyBps, GUARD_LIMIT_CEILINGS.maxDailyBps)) return "Daily limit must be 0.01%-100%";
  if (!inRange(limits.maxSlippageBps, GUARD_LIMIT_CEILINGS.maxSlippageBps)) return "Slippage must be 0.01%-2%";
  if (!Number.isInteger(limits.minInterval) || limits.minInterval < 0 || limits.minInterval > 0xffffffff) {
    return "Min interval must be a whole number of seconds";
  }
  return undefined;
}

/** Reasons canTrade() returns and trade() reverts with, as TradeRejected(reason). */
export const GUARD_REJECT_REASONS = [
  "paused",
  "trading not enabled",
  // A sale (CHOG -> WMON) while the owner has buy-only mode on (setBuyOnlyRequest).
  "buy-only vault",
  "zero amount",
  "no balance",
  "exceeds per-trade cap",
  "min interval not elapsed",
  "TWAP unavailable",
  "exceeds daily cap",
  "spot price deviates from TWAP",
  "amount too small",
  "amount too large",
  // canTrade() only: trade() reverts with Tokenbound's NotAuthorized() / AccountLocked() instead.
  "guard not authorized on TBA",
  "TBA locked",
  // trade() only.
  "deadline passed",
] as const;
export type GuardRejectReason = (typeof GUARD_REJECT_REASONS)[number];

/**
 * Fallback gas limit for trade(). Monad charges the gas limit, not the gas used. Smallest limits that succeed on
 * Monad mainnet (eth_simulateV1): ~416k for a first sell, ~383k for a buy, ~390k for a later sell; ~455k for a
 * first sell once the pool oracle is grown to 1801 slots and busy. prepareTrade() estimates instead and uses this
 * only if the estimate fails.
 */
export const TRADE_GAS_LIMIT = BigInt(600_000);
const TRADE_GAS_MIN = BigInt(500_000);
const TRADE_GAS_MAX = BigInt(800_000);

/** How long a prepared trade stays valid on-chain (trade()'s deadline), in seconds. */
export const TRADE_DEADLINE_SECONDS = 120;

/**
 * The Tokenbound AccountV3 (v0.3.1) functions the guard setup needs, plus the errors a TBA can bubble up
 * through trade(). tradeRequest() already includes the errors, so reverts decode by name.
 */
export const tokenboundAccountGuardAbi = [
  {
    type: "function",
    name: "setPermissions",
    stateMutability: "nonpayable",
    inputs: [
      { name: "callers", type: "address[]" },
      { name: "_permissions", type: "bool[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "permissions",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "caller", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "isValidSigner",
    stateMutability: "view",
    inputs: [
      { name: "signer", type: "address" },
      { name: "context", type: "bytes" },
    ],
    outputs: [{ name: "magicValue", type: "bytes4" }],
  },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  {
    type: "function",
    name: "token",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "chainId", type: "uint256" },
      { name: "tokenContract", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "isLocked",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  /** The caller (here: the guard) has no permission from the current owner. */
  { type: "error", name: "NotAuthorized", inputs: [] },
  /** The owner locked the TBA (lock(uint256)). */
  { type: "error", name: "AccountLocked", inputs: [] },
] as const;

/** isValidSigner's magic value: the address is the owner, or was granted by the owner (Tokenbound's executor rule). */
const VALID_SIGNER: Hex = "0x523e3260";
const ERC1967_IMPLEMENTATION_SLOT: Hex = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

const quoterV2Abi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

// ------------------------------------------------------------------------------------------------ owner requests

/**
 * Owner step 2 (Tokenbound): let the guard execute for the TBA. The NFT owner must send it directly (not via a
 * forwarder or multicall); the permission is keyed by that owner, so it lapses when the NFT is sold. Only send it
 * once readGuardOnboarding() reports the account "ready": on an undeployed or uninitialized TBA the call succeeds
 * and does nothing. Confirm afterwards with readGuardOnboarding() (guardAuthorized), not the receipt.
 */
export function grantGuardRequest(tba: Address, guard: Address = requireGuardAddress()) {
  return {
    address: tba,
    abi: tokenboundAccountGuardAbi,
    functionName: "setPermissions",
    args: [[guard], [true]],
  } as const;
}

/** Revokes the guard on the TBA (also stops the AI). */
export function revokeGuardRequest(tba: Address, guard: Address = requireGuardAddress()) {
  return {
    address: tba,
    abi: tokenboundAccountGuardAbi,
    functionName: "setPermissions",
    args: [[guard], [false]],
  } as const;
}

/** Owner step 3: opt the vault in, or update its limits. */
export function configureGuardRequest(tba: Address, limits: GuardLimits, guard: Address = requireGuardAddress()) {
  return { address: guard, abi: animrTradeGuardAbi, functionName: "configure", args: [tba, limits] } as const;
}

/** Owner: stop the AI trading this vault. */
export function disableGuardRequest(tba: Address, guard: Address = requireGuardAddress()) {
  return { address: guard, abi: animrTradeGuardAbi, functionName: "disable", args: [tba] } as const;
}

/**
 * Owner: turn buy-only mode on or off. While it is on, the AI can still buy CHOG with the vault's WMON but never sells
 * CHOG: canTrade() and trade() refuse sales with "buy-only vault", and maxAmountIn(tba, true) is 0. Same checks as
 * configure() (the current NFT owner, on the canonical Chog TBA). Kept per owner like the limits, so a sale of the NFT
 * leaves the buyer without it; configure() and disable() leave it as it is. Emits BuyOnlySet(tba, owner, on).
 */
export function setBuyOnlyRequest(tba: Address, on: boolean, guard: Address = requireGuardAddress()) {
  return { address: guard, abi: animrTradeGuardAbi, functionName: "setBuyOnly", args: [tba, on] } as const;
}

// ------------------------------------------------------------------------------------------------ reads

export type VaultBalances = { chog: bigint; wmon: bigint; mon: bigint };

/**
 * What the vault holds. The guard trades CHOG and WMON (sells deliver WMON, buys spend WMON); native MON in the TBA
 * is not traded, so show WMON as the quote balance (e.g. "MON (wrapped)").
 */
export async function readVaultBalances(client: PublicClient, tba: Address): Promise<VaultBalances> {
  const [chog, wmon, mon] = await Promise.all([
    client.readContract({ address: GUARD_VENUE.chog, abi: erc20Abi, functionName: "balanceOf", args: [tba] }),
    client.readContract({ address: GUARD_VENUE.wmon, abi: erc20Abi, functionName: "balanceOf", args: [tba] }),
    client.getBalance({ address: tba }),
  ]);
  return { chog, wmon, mon };
}

export type GuardStatus = {
  /** Limits for the TBA's current owner (all zero / disabled if they never opted in). */
  limits: GuardLimits;
  paused: boolean;
  /**
   * Largest CHOG sale the size limits and the daily budget allow now; 0 in buy-only mode (timing and price: see
   * canTrade).
   */
  maxSellChog: bigint;
  /** Largest WMON spend the size limits and the daily budget allow now. */
  maxBuyWithWmon: bigint;
  /**
   * Buy-only mode for the current owner (setBuyOnlyRequest): the AI may buy CHOG but never sell it. Undefined if the
   * guard at this address predates buy-only mode.
   */
  buyOnly?: boolean;
};

/** Reads what the guard currently allows for a vault. */
export async function readGuardStatus(
  client: PublicClient,
  tba: Address,
  guard: Address = requireGuardAddress(),
): Promise<GuardStatus> {
  const contract = { address: guard, abi: animrTradeGuardAbi } as const;
  const [limits, paused, maxSellChog, maxBuyWithWmon, buyOnly] = await Promise.all([
    client.readContract({ ...contract, functionName: "limitsOf", args: [tba] }),
    client.readContract({ ...contract, functionName: "paused" }),
    client.readContract({ ...contract, functionName: "maxAmountIn", args: [tba, true] }),
    client.readContract({ ...contract, functionName: "maxAmountIn", args: [tba, false] }),
    readBuyOnlyIfSupported(client, tba, guard),
  ]);
  return { limits, paused, maxSellChog, maxBuyWithWmon, buyOnly };
}

/** guard.isBuyOnly(tba): whether buy-only mode is on for the TBA's current owner (see setBuyOnlyRequest). */
export function readBuyOnly(
  client: PublicClient,
  tba: Address,
  guard: Address = requireGuardAddress(),
): Promise<boolean> {
  return client.readContract({ address: guard, abi: animrTradeGuardAbi, functionName: "isBuyOnly", args: [tba] });
}

/**
 * readBuyOnly(), or undefined if the guard at `guard` predates buy-only mode (it has no isBuyOnly, so the call
 * reverts without data), which keeps readGuardStatus() and readGuardOnboarding() working against such a deployment.
 * Any other error is thrown, like the reads next to it: an RPC failure (viem also files a JSON-RPC -32603 internal
 * error under ContractFunctionRevertedError) or a revert that carries data (the function exists).
 */
async function readBuyOnlyIfSupported(
  client: PublicClient,
  tba: Address,
  guard: Address,
): Promise<boolean | undefined> {
  try {
    return await readBuyOnly(client, tba, guard);
  } catch (error) {
    if (isEmptyRevert(error)) return undefined;
    throw error;
  }
}

/**
 * The node's "execution reverted" with no revert data: how a contract without the called function (and no fallback)
 * answers. JSON-RPC code 3 anywhere in the cause chain (Monad, anvil, geth with data; viem's multicall
 * RawContractError; non-HTTP transports wrap it in UnknownRpcError), or geth's -32000 for an empty revert.
 */
function isEmptyRevert(error: unknown): boolean {
  if (!(error instanceof BaseError)) return false;
  const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
  if (revert instanceof ContractFunctionRevertedError && revert.raw && revert.raw !== "0x") return false;
  const code = (e: unknown) => (e as { code?: unknown } | null)?.code;
  if (error.walk((e) => code(e) === 3)) return true;
  const geth = error.walk((e) => code(e) === -32000) as BaseError | null;
  return geth !== null && /execution reverted/i.test(`${geth.details ?? ""} ${geth.shortMessage ?? ""}`);
}

export type OnboardingStep =
  | "create-account" // the TBA is not deployed or not initialized: createAndInitializeAccountRequest (lib/erc6551.ts)
  | "not-a-chog-account" // not the canonical Chog TBA (Tokenbound AccountProxy, salt 0): check NEXT_PUBLIC_TBA_*
  | "unsupported-owner" // the Chog is held by another ERC-6551 account; the guard refuses nested ownership
  | "grant-guard" // grantGuardRequest, from the NFT owner
  | "configure" // configureGuardRequest, from the NFT owner
  | "fund" // the vault holds nothing the AI may trade: no CHOG or WMON (a buy-only vault: no WMON)
  | "ready";

export type GuardOnboarding = {
  account: "none" | "uninitialized" | "ready";
  /** guard.isChogAccount(tba): deployed, initialized, and the canonical TBA of a Chog. */
  canonical: boolean;
  owner: Address | null;
  /** The guard may execute for the TBA under Tokenbound's rule (granted by the current owner). */
  guardAuthorized: boolean;
  limits: GuardLimits | null;
  balances: VaultBalances;
  nextStep: OnboardingStep;
  /**
   * Buy-only mode for the current owner (setBuyOnlyRequest). Read once the account is the canonical Chog TBA:
   * undefined before that, or if the guard at this address predates buy-only mode. When true, a vault without WMON
   * is at nextStep "fund": it never sells its CHOG, so it has nothing to trade.
   */
  buyOnly?: boolean;
};

/** Where a vault stands in the owner's onboarding, and what to ask the owner to do next. */
export async function readGuardOnboarding(
  client: PublicClient,
  tba: Address,
  guard: Address = requireGuardAddress(),
): Promise<GuardOnboarding> {
  const [code, implementation, balances] = await Promise.all([
    client.getCode({ address: tba }),
    client.getStorageAt({ address: tba, slot: ERC1967_IMPLEMENTATION_SLOT }),
    readVaultBalances(client, tba),
  ]);
  const account =
    code === undefined || code === "0x"
      ? "none"
      : implementation && hexToBigInt(implementation) !== BigInt(0)
        ? "ready"
        : "uninitialized";
  const base = { account, balances, canonical: false, owner: null, guardAuthorized: false, limits: null } as const;
  if (account !== "ready") return { ...base, nextStep: "create-account" };

  const canonical = await client.readContract({
    address: guard,
    abi: animrTradeGuardAbi,
    functionName: "isChogAccount",
    args: [tba],
  });
  if (!canonical) return { ...base, nextStep: "not-a-chog-account" };

  const [owner, signer, limits, buyOnly] = await Promise.all([
    client.readContract({ address: tba, abi: tokenboundAccountGuardAbi, functionName: "owner" }),
    client.readContract({
      address: tba,
      abi: tokenboundAccountGuardAbi,
      functionName: "isValidSigner",
      args: [guard, "0x"],
    }),
    client.readContract({ address: guard, abi: animrTradeGuardAbi, functionName: "limitsOf", args: [tba] }),
    readBuyOnlyIfSupported(client, tba, guard),
  ]);
  const guardAuthorized = signer === VALID_SIGNER;
  const state = { ...base, canonical, owner, guardAuthorized, limits, buyOnly };
  if (await isErc6551Account(client, owner)) return { ...state, nextStep: "unsupported-owner" };
  if (!guardAuthorized) return { ...state, nextStep: "grant-guard" };
  if (!limits.enabled) return { ...state, nextStep: "configure" };
  if (balances.chog === BigInt(0) && balances.wmon === BigInt(0)) return { ...state, nextStep: "fund" };
  // A buy-only vault only ever spends WMON (sales are refused), so without WMON the AI can't trade at all.
  if (buyOnly === true && balances.wmon === BigInt(0)) return { ...state, nextStep: "fund" };
  return { ...state, nextStep: "ready" };
}

async function isErc6551Account(client: PublicClient, address: Address): Promise<boolean> {
  const code = await client.getCode({ address });
  if (code === undefined || code === "0x") return false;
  try {
    const [, tokenContract] = await client.readContract({
      address,
      abi: tokenboundAccountGuardAbi,
      functionName: "token",
    });
    return !isAddressEqual(tokenContract, zeroAddress);
  } catch {
    return false;
  }
}

/**
 * Tripwire for the engine: true if the operator key can execute for the TBA directly (it was granted with
 * setPermissions, or owns the NFT). That bypasses every limit of the guard; refuse to trade and alert if so.
 */
export async function operatorHasDirectAccess(client: PublicClient, tba: Address, operator: Address): Promise<boolean> {
  const code = await client.getCode({ address: tba });
  if (code === undefined || code === "0x") return false;
  const signer = await client.readContract({
    address: tba,
    abi: tokenboundAccountGuardAbi,
    functionName: "isValidSigner",
    args: [operator, "0x"],
  });
  return signer === VALID_SIGNER;
}

/** Whether trade() would pass all guard and TBA checks now; `reason` is empty when ok. Ignores price impact. */
export async function canTrade(
  client: PublicClient,
  params: { tba: Address; side: "buy" | "sell"; amountIn: bigint; guard?: Address },
): Promise<{ ok: boolean; reason: string }> {
  const [ok, reason] = await client.readContract({
    address: params.guard ?? requireGuardAddress(),
    abi: animrTradeGuardAbi,
    functionName: "canTrade",
    args: [params.tba, params.side === "sell", params.amountIn],
  });
  return { ok, reason };
}

/** The TWAP-based minimum output trade() would enforce for this amount (with the owner's slippage). */
export function readQuoteFloor(
  client: PublicClient,
  params: { tba: Address; side: "buy" | "sell"; amountIn: bigint; guard?: Address },
): Promise<bigint> {
  return client.readContract({
    address: params.guard ?? requireGuardAddress(),
    abi: animrTradeGuardAbi,
    functionName: "quoteFloor",
    args: [params.tba, params.side === "sell", params.amountIn],
  });
}

// ------------------------------------------------------------------------------------------------ operator

/**
 * Operator: swap inside the vault. "sell" = CHOG -> WMON, "buy" = WMON -> CHOG. The swap requires
 * max(minAmountOut, TWAP floor); set minAmountOut from a fresh quote (prepareTrade does), because the on-chain floor
 * only knows the TWAPs, not a move that happened seconds ago. Send it from the operator key.
 */
export function tradeRequest(params: {
  tba: Address;
  side: "buy" | "sell";
  amountIn: bigint;
  minAmountOut: bigint;
  /** Unix seconds; the trade reverts with TradeRejected("deadline passed") after it. */
  deadline: bigint;
  guard?: Address;
  gas?: bigint;
}) {
  return {
    address: params.guard ?? requireGuardAddress(),
    abi: [...animrTradeGuardAbi, ...tokenboundAccountGuardAbi] as const,
    functionName: "trade",
    args: [params.tba, params.side === "sell", params.amountIn, params.minAmountOut, params.deadline],
    gas: params.gas ?? TRADE_GAS_LIMIT,
  } as const;
}

export type PreparedTrade =
  | {
      ok: true;
      /** Pass to walletClient.writeContract({ ...request, account: operatorAccount, chain }). */
      request: ReturnType<typeof tradeRequest>;
      amountIn: bigint;
      /** What the pool pays for amountIn right now (QuoterV2). */
      quote: bigint;
      /** The guard's own minimum (quoteFloor). */
      floor: bigint;
      minAmountOut: bigint;
      deadline: bigint;
    }
  | { ok: false; reason: string; amountIn: bigint };

/**
 * Sizes, checks, quotes and simulates a trade for the operator. Never sends anything.
 *  - amountIn is clamped to what the guard allows now (per-trade cap and daily budget: maxAmountIn; a sale from a
 *    buy-only vault comes back as { ok: false, reason: "buy-only vault" }),
 *  - canTrade() must pass, and the pool's quote must clear the guard's floor (otherwise the router would revert
 *    with "Too little received", and Monad charges the full gas limit for a revert),
 *  - minAmountOut = quote minus maxSlippageBps (the brain's tolerance), deadline = latest block + 120 s,
 *  - the trade is simulated from the operator and its gas estimated (x1.25, kept within 500k-800k).
 */
export async function prepareTrade(
  client: PublicClient,
  params: {
    tba: Address;
    side: "buy" | "sell";
    /** Desired amount of the token being sold (CHOG for "sell", WMON for "buy"), in wei. */
    amountIn: bigint;
    /** Tolerance below the fresh quote, in bps. */
    maxSlippageBps: number;
    /** The operator's address (the key that will send the transaction). */
    operator: Address;
    guard?: Address;
  },
): Promise<PreparedTrade> {
  const guard = params.guard ?? requireGuardAddress();
  const sell = params.side === "sell";
  const contract = { address: guard, abi: animrTradeGuardAbi } as const;

  const allowed = await client.readContract({ ...contract, functionName: "maxAmountIn", args: [params.tba, sell] });
  const amountIn = params.amountIn < allowed ? params.amountIn : allowed;
  // With nothing allowed, ask the guard why for the amount that was wanted.
  const checked = amountIn === BigInt(0) ? params.amountIn : amountIn;
  const check = await canTrade(client, { tba: params.tba, side: params.side, amountIn: checked, guard });
  if (!check.ok) return { ok: false, reason: check.reason, amountIn };
  if (amountIn === BigInt(0)) return { ok: false, reason: "nothing to trade", amountIn };

  let quote: bigint, floor: bigint, now: bigint;
  try {
    const [quoted, guardFloor, block] = await Promise.all([
      client.simulateContract({
        address: GUARD_VENUE.quoterV2,
        abi: quoterV2Abi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn: sell ? GUARD_VENUE.chog : GUARD_VENUE.wmon,
            tokenOut: sell ? GUARD_VENUE.wmon : GUARD_VENUE.chog,
            amountIn,
            fee: GUARD_VENUE.fee,
            sqrtPriceLimitX96: BigInt(0),
          },
        ],
      }),
      readQuoteFloor(client, { tba: params.tba, side: params.side, amountIn, guard }),
      client.getBlock(),
    ]);
    quote = quoted.result[0];
    floor = guardFloor;
    now = block.timestamp;
  } catch (error) {
    return { ok: false, reason: guardRevertReason(error), amountIn };
  }
  if (quote < floor) return { ok: false, reason: "price impact exceeds the slippage bound", amountIn };

  const slippageBps = BigInt(Math.min(Math.max(Math.round(params.maxSlippageBps), 0), 10_000));
  const minAmountOut = (quote * (BigInt(10_000) - slippageBps)) / BigInt(10_000);
  const deadline = now + BigInt(TRADE_DEADLINE_SECONDS);
  const request = tradeRequest({ tba: params.tba, side: params.side, amountIn, minAmountOut, deadline, guard });
  const call = {
    address: request.address,
    abi: request.abi,
    functionName: request.functionName,
    args: request.args,
    account: params.operator,
  } as const;
  try {
    await client.simulateContract(call);
  } catch (error) {
    return { ok: false, reason: guardRevertReason(error), amountIn };
  }
  let gas = TRADE_GAS_LIMIT;
  try {
    const estimate = ((await client.estimateContractGas(call)) * BigInt(5)) / BigInt(4);
    gas = estimate < TRADE_GAS_MIN ? TRADE_GAS_MIN : estimate > TRADE_GAS_MAX ? TRADE_GAS_MAX : estimate;
  } catch {
    // keep the fallback limit
  }
  return { ok: true, request: { ...request, gas }, amountIn, quote, floor, minAmountOut, deadline };
}

/** A readable reason for a failed guard call: the TradeRejected reason, an error name, or the revert string. */
export function guardRevertReason(error: unknown): string {
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      if (revert.data?.errorName === "TradeRejected") return String(revert.data.args?.[0] ?? "");
      if (revert.data?.errorName) return revert.data.errorName;
      if (revert.reason) return revert.reason;
    }
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : String(error);
}

export type TradedEvent = { tba: Address; owner: Address; sellChog: boolean; amountIn: bigint; amountOut: bigint };

/**
 * The guard's Traded event from a trade() receipt (amountIn / amountOut are exact, measured from the TBA's balances).
 * Read it from the receipt: the public Monad RPC keeps little log history (eth_getLogs spans at most 100 blocks).
 */
export function decodeTradeReceipt(
  receipt: Pick<TransactionReceipt, "logs">,
  guard: Address = requireGuardAddress(),
): TradedEvent | undefined {
  const [traded] = parseEventLogs({ abi: animrTradeGuardAbi, eventName: "Traded", logs: receipt.logs }).filter(
    (log) => isAddressEqual(log.address, guard),
  );
  return traded?.args;
}

/**
 * AnimrTradeGuard ABI, generated from contracts/out (`forge inspect AnimrTradeGuard abi`); do not edit by hand.
 * The deployment it belongs to is read from NEXT_PUBLIC_TRADE_GUARD_ADDRESS (animrTradeGuardAddress above).
 */
export const animrTradeGuardAbi = [
  {
    type: "constructor",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address", name: "operator_" },
      { type: "address", name: "chog_" },
      { type: "address", name: "wmon_" },
      { type: "address", name: "router_" },
      { type: "address", name: "pool_" },
      { type: "uint24", name: "fee_" },
      { type: "address", name: "chogNft_" },
      { type: "address", name: "registry_" },
      { type: "address", name: "accountImplementation_" },
    ],
  },
  {
    type: "function",
    name: "BPS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256", name: "" }],
  },
  {
    type: "function",
    name: "DAILY_WINDOW",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256", name: "" }],
  },
  {
    type: "function",
    name: "MAX_DAILY_BPS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint16", name: "" }],
  },
  {
    type: "function",
    name: "MAX_SLIPPAGE_BPS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint16", name: "" }],
  },
  {
    type: "function",
    name: "MAX_TRADE_BPS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint16", name: "" }],
  },
  {
    type: "function",
    name: "RECENT_WINDOW",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint32", name: "" }],
  },
  {
    type: "function",
    name: "TWAP_WINDOW",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint32", name: "" }],
  },
  { type: "function", name: "acceptAdmin", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    type: "function",
    name: "accountImplementation",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address", name: "" }],
  },
  {
    type: "function",
    name: "admin",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address", name: "" }],
  },
  {
    type: "function",
    name: "canTrade",
    stateMutability: "view",
    inputs: [
      { type: "address", name: "tba" },
      { type: "bool", name: "sellChog" },
      { type: "uint256", name: "amountIn" },
    ],
    outputs: [{ type: "bool", name: "ok" }, { type: "string", name: "reason" }],
  },
  {
    type: "function",
    name: "chog",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address", name: "" }],
  },
  {
    type: "function",
    name: "chogNft",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address", name: "" }],
  },
  {
    type: "function",
    name: "configure",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address", name: "tba" },
      {
        type: "tuple",
        name: "limits",
        components: [
          { type: "bool", name: "enabled" },
          { type: "uint16", name: "maxTradeBps" },
          { type: "uint16", name: "maxDailyBps" },
          { type: "uint32", name: "minInterval" },
          { type: "uint16", name: "maxSlippageBps" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "disable",
    stateMutability: "nonpayable",
    inputs: [{ type: "address", name: "tba" }],
    outputs: [],
  },
  {
    type: "function",
    name: "fee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint24", name: "" }],
  },
  {
    type: "function",
    name: "isBuyOnly",
    stateMutability: "view",
    inputs: [{ type: "address", name: "tba" }],
    outputs: [{ type: "bool", name: "" }],
  },
  {
    type: "function",
    name: "isChogAccount",
    stateMutability: "view",
    inputs: [{ type: "address", name: "tba" }],
    outputs: [{ type: "bool", name: "" }],
  },
  {
    type: "function",
    name: "limitsOf",
    stateMutability: "view",
    inputs: [{ type: "address", name: "tba" }],
    outputs: [
      {
        type: "tuple",
        name: "",
        components: [
          { type: "bool", name: "enabled" },
          { type: "uint16", name: "maxTradeBps" },
          { type: "uint16", name: "maxDailyBps" },
          { type: "uint32", name: "minInterval" },
          { type: "uint16", name: "maxSlippageBps" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "maxAmountIn",
    stateMutability: "view",
    inputs: [{ type: "address", name: "tba" }, { type: "bool", name: "sellChog" }],
    outputs: [{ type: "uint256", name: "" }],
  },
  {
    type: "function",
    name: "operator",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address", name: "" }],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool", name: "" }],
  },
  {
    type: "function",
    name: "pendingAdmin",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address", name: "" }],
  },
  {
    type: "function",
    name: "pool",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address", name: "" }],
  },
  {
    type: "function",
    name: "quoteFloor",
    stateMutability: "view",
    inputs: [
      { type: "address", name: "tba" },
      { type: "bool", name: "sellChog" },
      { type: "uint256", name: "amountIn" },
    ],
    outputs: [{ type: "uint256", name: "floor" }],
  },
  {
    type: "function",
    name: "registry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address", name: "" }],
  },
  {
    type: "function",
    name: "router",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address", name: "" }],
  },
  {
    type: "function",
    name: "setBuyOnly",
    stateMutability: "nonpayable",
    inputs: [{ type: "address", name: "tba" }, { type: "bool", name: "on" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setOperator",
    stateMutability: "nonpayable",
    inputs: [{ type: "address", name: "newOperator" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setPaused",
    stateMutability: "nonpayable",
    inputs: [{ type: "bool", name: "paused_" }],
    outputs: [],
  },
  {
    type: "function",
    name: "trade",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address", name: "tba" },
      { type: "bool", name: "sellChog" },
      { type: "uint256", name: "amountIn" },
      { type: "uint256", name: "minAmountOut" },
      { type: "uint256", name: "deadline" },
    ],
    outputs: [{ type: "uint256", name: "amountOut" }],
  },
  {
    type: "function",
    name: "transferAdmin",
    stateMutability: "nonpayable",
    inputs: [{ type: "address", name: "newAdmin" }],
    outputs: [],
  },
  {
    type: "function",
    name: "vaultOf",
    stateMutability: "view",
    inputs: [{ type: "address", name: "tba" }, { type: "address", name: "owner_" }],
    outputs: [
      {
        type: "tuple",
        name: "",
        components: [
          {
            type: "tuple",
            name: "limits",
            components: [
              { type: "bool", name: "enabled" },
              { type: "uint16", name: "maxTradeBps" },
              { type: "uint16", name: "maxDailyBps" },
              { type: "uint32", name: "minInterval" },
              { type: "uint16", name: "maxSlippageBps" },
            ],
          },
          { type: "uint64", name: "lastTradeAt" },
          { type: "uint64", name: "budgetUpdatedAt" },
          { type: "uint128", name: "budgetUsed" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "wmon",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address", name: "" }],
  },
  {
    type: "event",
    name: "AdminTransferStarted",
    anonymous: false,
    inputs: [
      { type: "address", name: "admin", indexed: true },
      { type: "address", name: "pendingAdmin", indexed: true },
    ],
  },
  {
    type: "event",
    name: "AdminTransferred",
    anonymous: false,
    inputs: [
      { type: "address", name: "previousAdmin", indexed: true },
      { type: "address", name: "newAdmin", indexed: true },
    ],
  },
  {
    type: "event",
    name: "BuyOnlySet",
    anonymous: false,
    inputs: [
      { type: "address", name: "tba", indexed: true },
      { type: "address", name: "owner", indexed: true },
      { type: "bool", name: "on", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Configured",
    anonymous: false,
    inputs: [
      { type: "address", name: "tba", indexed: true },
      { type: "address", name: "owner", indexed: true },
      {
        type: "tuple",
        name: "limits",
        indexed: false,
        components: [
          { type: "bool", name: "enabled" },
          { type: "uint16", name: "maxTradeBps" },
          { type: "uint16", name: "maxDailyBps" },
          { type: "uint32", name: "minInterval" },
          { type: "uint16", name: "maxSlippageBps" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "Disabled",
    anonymous: false,
    inputs: [{ type: "address", name: "tba", indexed: true }, { type: "address", name: "owner", indexed: true }],
  },
  {
    type: "event",
    name: "OperatorChanged",
    anonymous: false,
    inputs: [
      { type: "address", name: "previousOperator", indexed: true },
      { type: "address", name: "newOperator", indexed: true },
    ],
  },
  {
    type: "event",
    name: "PausedSet",
    anonymous: false,
    inputs: [{ type: "bool", name: "paused", indexed: false }],
  },
  {
    type: "event",
    name: "Traded",
    anonymous: false,
    inputs: [
      { type: "address", name: "tba", indexed: true },
      { type: "address", name: "owner", indexed: true },
      { type: "bool", name: "sellChog", indexed: false },
      { type: "uint256", name: "amountIn", indexed: false },
      { type: "uint256", name: "amountOut", indexed: false },
    ],
  },
  { type: "error", name: "InvalidLimits", inputs: [] },
  { type: "error", name: "InvalidOperator", inputs: [] },
  { type: "error", name: "InvalidVenue", inputs: [] },
  { type: "error", name: "NestedAccount", inputs: [] },
  { type: "error", name: "NotAccountOwner", inputs: [] },
  { type: "error", name: "NotAdmin", inputs: [] },
  { type: "error", name: "NotChogAccount", inputs: [] },
  { type: "error", name: "NotOperator", inputs: [] },
  { type: "error", name: "NotPendingAdmin", inputs: [] },
  { type: "error", name: "Reentrancy", inputs: [] },
  { type: "error", name: "SettlementMismatch", inputs: [] },
  { type: "error", name: "T", inputs: [] },
  {
    type: "error",
    name: "TradeRejected",
    inputs: [{ type: "string", name: "reason" }],
  },
] as const;
