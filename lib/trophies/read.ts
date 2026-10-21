import type { Address, PublicClient } from "viem";
import { TROPHIES, type TrophyInfo, animrTrophiesAbi, trophiesAddress } from "./config";

export type HeldTrophy = TrophyInfo & { count: number };

/**
 * The trophies a Chog's wallet holds (count > 0 only), in one eth_call (balanceOfBatch over every kind). Works for
 * a counterfactual wallet too. Returns [] when the contract isn't configured; RPC errors are thrown.
 */
export async function readTrophies(client: PublicClient, account: Address): Promise<HeldTrophy[]> {
  if (!trophiesAddress) return [];
  const balances = await client.readContract({
    address: trophiesAddress,
    abi: animrTrophiesAbi,
    functionName: "balanceOfBatch",
    args: [TROPHIES.map(() => account), TROPHIES.map((trophy) => BigInt(trophy.kind))],
  });
  return TROPHIES.map((trophy, i) => ({ ...trophy, count: Number(balances[i] ?? BigInt(0)) })).filter(
    (trophy) => trophy.count > 0,
  );
}
