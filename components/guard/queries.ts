import { type Address, isAddressEqual, zeroAddress } from "viem";
import { publicClient } from "@/lib/clients";
import { appConfig } from "@/lib/config";
import { type GuardOnboarding, animrTradeGuardAbi, readGuardOnboarding } from "@/lib/contracts/animr-trade-guard";
import { computeTokenBoundAccount } from "@/lib/erc6551";

// Live reads for /guard: the guard's roles, kill switch and immutable wiring, the House Chog's vault, and whether the
// deployed source is publicly verified. Everything comes from the chain (or Sourcify) at request time, never from
// constants in this repo, so the page can't claim more than the contract does.

export const guardKeys = {
  all: ["guard"] as const,
  state: (guard: Address) => ["guard", "state", guard] as const,
  house: (guard: Address, tba: Address) => ["guard", "house", guard, tba] as const,
  source: (guard: Address) => ["guard", "source", guard] as const,
};

export type GuardState = {
  /** Can pause trading and rotate the operator; nothing else. */
  admin: Address;
  /** Named by transferAdmin(); becomes admin once it calls acceptAdmin(). Null when no transfer is pending. */
  pendingAdmin: Address | null;
  /** The AI's key: the only address that can call trade(). */
  operator: Address;
  /** The admin's global kill switch for trade(). */
  paused: boolean;
  /** Fixed at deployment (immutable). */
  wiring: {
    chog: Address;
    wmon: Address;
    pool: Address;
    router: Address;
    /** Pool fee in hundredths of a bip (10000 = 1%). */
    fee: number;
    chogNft: Address;
    registry: Address;
    accountImplementation: Address;
  };
  /** Hard ceilings an owner's limits can never exceed, and the TWAP window, in bps and seconds. */
  ceilings: { maxTradeBps: number; maxDailyBps: number; maxSlippageBps: number; twapWindow: number };
  blockNumber: bigint;
};

/** One multicall at one block: roles, pause flag, wiring and ceilings. */
export async function readGuardState(guard: Address): Promise<GuardState> {
  const blockNumber = await publicClient.getBlockNumber({ cacheTime: 0 });
  const c = { address: guard, abi: animrTradeGuardAbi } as const;
  const [
    admin,
    pendingAdmin,
    operator,
    paused,
    chog,
    wmon,
    pool,
    router,
    fee,
    chogNft,
    registry,
    accountImplementation,
    maxTradeBps,
    maxDailyBps,
    maxSlippageBps,
    twapWindow,
  ] = await publicClient.multicall({
    allowFailure: false,
    blockNumber,
    contracts: [
      { ...c, functionName: "admin" },
      { ...c, functionName: "pendingAdmin" },
      { ...c, functionName: "operator" },
      { ...c, functionName: "paused" },
      { ...c, functionName: "chog" },
      { ...c, functionName: "wmon" },
      { ...c, functionName: "pool" },
      { ...c, functionName: "router" },
      { ...c, functionName: "fee" },
      { ...c, functionName: "chogNft" },
      { ...c, functionName: "registry" },
      { ...c, functionName: "accountImplementation" },
      { ...c, functionName: "MAX_TRADE_BPS" },
      { ...c, functionName: "MAX_DAILY_BPS" },
      { ...c, functionName: "MAX_SLIPPAGE_BPS" },
      { ...c, functionName: "TWAP_WINDOW" },
    ],
  });
  return {
    admin,
    pendingAdmin: isAddressEqual(pendingAdmin, zeroAddress) ? null : pendingAdmin,
    operator,
    paused,
    wiring: { chog, wmon, pool, router, fee, chogNft, registry, accountImplementation },
    ceilings: { maxTradeBps, maxDailyBps, maxSlippageBps, twapWindow },
    blockNumber,
  };
}

/** A Chog's canonical Tokenbound wallet (the same address the guard accepts), or null without a collection. */
export function chogWalletAddress(tokenId: number): Address | null {
  const { accountImplementation, chogNft, chain, salt } = appConfig;
  if (!accountImplementation || !chogNft) return null;
  return computeTokenBoundAccount({
    implementation: accountImplementation,
    tokenContract: chogNft,
    tokenId: BigInt(tokenId),
    chainId: chain.id,
    salt,
  });
}

/** The House Chog's vault as the guard sees it: wallet status, grant, limits, buy-only and balances. */
export function readHouseVault(guard: Address, tba: Address): Promise<GuardOnboarding> {
  return readGuardOnboarding(publicClient, tba, guard);
}

export type SourceVerification = {
  /** Sourcify's verdict: "exact_match" (bytecode and metadata), "match" (bytecode), or null (not verified). */
  match: "exact_match" | "match" | null;
  /** Public page with the verified files. */
  url: string;
};

/** Whether the guard's source is verified on Sourcify (which Monadscan and MonadVision read too). */
export async function readSourceVerification(guard: Address): Promise<SourceVerification> {
  const chainId = appConfig.chain.id;
  const url = `https://repo.sourcify.dev/${chainId}/${guard}`;
  const res = await fetch(`https://sourcify.dev/server/v2/contract/${chainId}/${guard}`, { cache: "no-store" });
  if (res.status === 404) return { match: null, url };
  if (!res.ok) throw new Error(`Sourcify answered HTTP ${res.status}`);
  const body = (await res.json().catch(() => null)) as { match?: unknown } | null;
  const match = body?.match === "exact_match" || body?.match === "match" ? body.match : null;
  return { match, url };
}
