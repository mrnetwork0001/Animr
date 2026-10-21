import { isProductionRuntime } from "../runtime-env";
import { type Address, type Hex, BaseError, ContractFunctionRevertedError } from "viem";
import { getOperatorWallet, withOperatorLock } from "../agent/onchain";
import { publicClient } from "../clients";
import { type TrophyKind, animrTrophiesAbi, awardKey, trophiesAddress, trophyInfo } from "./config";

// Mints trophies with the AI operator key (OPERATOR_PRIVATE_KEY, the contract's minter). Server only.
// Every award is idempotent: the contract allows each (kind, context) key once, and this checks `awarded` before
// sending. awardTrophy never throws: a failure is logged and retried by the next hook call (after a cool-down).
// Monad charges the gas LIMIT, so the limit is the estimate + 10%, not a padded constant.

const RECEIPT_TIMEOUT_MS = 30_000;
const RETRY_AFTER_MS = 10 * 60_000;

export type AwardResult =
  | { status: "off" }
  | { status: "already" }
  | { status: "awarded"; txHash: Hex; account: Address }
  | { status: "failed"; reason: string };

const globalForTrophies = globalThis as typeof globalThis & {
  __animrTrophyDone?: Set<Hex>;
  __animrTrophyFailedAt?: Map<Hex, number>;
  __animrTrophyWarned?: boolean;
};
/** Keys known to be awarded on-chain (they never un-award), per server instance. */
const done = (globalForTrophies.__animrTrophyDone ??= new Set());
const failedAt = (globalForTrophies.__animrTrophyFailedAt ??= new Map());

function describe(error: unknown): string {
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError && revert.data?.errorName) return revert.data.errorName;
    return [error.name, error.shortMessage].filter(Boolean).join(" | ");
  }
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function isAwarded(key: Hex): Promise<boolean> {
  return publicClient.readContract({
    address: trophiesAddress!,
    abi: animrTrophiesAbi,
    functionName: "awarded",
    args: [key],
  });
}

/** Whether trophies can be minted here: the contract and the operator key are both configured. */
export function isTrophyMintingConfigured(): boolean {
  return Boolean(trophiesAddress && getOperatorWallet()) && isProductionRuntime();
}

/**
 * Mints one `kind` trophy into Chog `chogId`'s ERC-6551 wallet unless (kind, context) was already awarded.
 * `context` is the UTC day as YYYYMMDD (dayContext) for daily kinds, the Chog's id for once-per-Chog kinds.
 */
export async function awardTrophy(input: { chogId: number; kind: TrophyKind; context: bigint }): Promise<AwardResult> {
  const address = trophiesAddress;
  const wallet = getOperatorWallet();
  if (!address || !wallet) {
    if (address && !globalForTrophies.__animrTrophyWarned) {
      globalForTrophies.__animrTrophyWarned = true;
      console.warn("[animr] trophies: NEXT_PUBLIC_TROPHIES_ADDRESS is set but OPERATOR_PRIVATE_KEY isn't; not minting.");
    }
    return { status: "off" };
  }
  const { chogId, kind, context } = input;
  const key = awardKey(kind, context);
  const what = `${trophyInfo(kind)?.name ?? `kind ${kind}`} (${context}) for Chog token ${chogId}`;
  if (done.has(key)) return { status: "already" };
  if (Date.now() - (failedAt.get(key) ?? 0) < RETRY_AFTER_MS) return { status: "failed", reason: "cooling down" };

  try {
    if (await isAwarded(key)) {
      done.add(key);
      return { status: "already" };
    }
    return await withOperatorLock(async (): Promise<AwardResult> => {
      // Another instance may have minted it while this one waited for the lock.
      if (await isAwarded(key)) {
        done.add(key);
        return { status: "already" };
      }
      const call = {
        account: wallet.account,
        address,
        abi: animrTrophiesAbi,
        functionName: "award",
        args: [BigInt(chogId), BigInt(kind), context],
      } as const;
      const { request, result: account } = await publicClient.simulateContract(call);
      const estimate = await publicClient.estimateContractGas(call);
      const hash = await wallet.writeContract({ ...request, gas: (estimate * BigInt(11)) / BigInt(10) });
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
      if (receipt.status !== "success") throw new Error(`award tx ${hash} reverted`);
      done.add(key);
      failedAt.delete(key);
      console.info(`[animr] trophies: minted ${what} into ${account}, tx ${hash}`);
      return { status: "awarded", txHash: hash, account };
    });
  } catch (error) {
    const reason = describe(error);
    if (reason === "AlreadyAwarded") {
      done.add(key);
      return { status: "already" };
    }
    failedAt.set(key, Date.now());
    console.warn(`[animr] trophies: couldn't mint ${what}: ${reason}`);
    return { status: "failed", reason };
  }
}
