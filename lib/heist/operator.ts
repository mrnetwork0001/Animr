import { type Address, type Hex, type PublicClient, getAddress, isAddress, isAddressEqual, zeroAddress } from "viem";
import { privateKeyToAddress } from "viem/accounts";
import { animrTradeGuardAbi } from "../contracts/animr-trade-guard";
import { STAND_IN_OPERATOR } from "./config";
import { isZeroData, revertOutcome } from "./reverts";
import type { OperatorSource } from "./types";

// Who the heist proof simulates from: the AI operator's PUBLIC address. Server only. The private key, when that is
// all there is, is only turned into its address (no signing, no wallet client) and is never logged or returned.

export type OperatorIdentity = { address: Address; source: OperatorSource };

let fromEnv: OperatorIdentity | null | undefined;

/** OPERATOR_ADDRESS, else the address of OPERATOR_PRIVATE_KEY, else null. */
export function operatorFromEnv(): OperatorIdentity | null {
  if (fromEnv !== undefined) return fromEnv;
  const address = process.env.OPERATOR_ADDRESS?.trim();
  if (address && isAddress(address, { strict: false })) {
    return (fromEnv = { address: getAddress(address), source: "env-address" });
  }
  const raw = process.env.OPERATOR_PRIVATE_KEY?.trim();
  if (raw) {
    const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
    if (/^0x[0-9a-fA-F]{64}$/.test(key)) {
      try {
        return (fromEnv = { address: privateKeyToAddress(key), source: "env-key" });
      } catch {
        // An invalid key (e.g. zero): fall through without echoing it.
      }
    }
  }
  return (fromEnv = null);
}

/**
 * The operator for a proof at `blockNumber`: the deployed guard's own operator() at that block (the only key the guard
 * accepts, so a rotated key or a stale OPERATOR_ADDRESS can't skew the proof), else the environment's, else the
 * labelled stand-in. Pass `guard` only when it has code at that block. An RPC failure is thrown (the proof then makes
 * no claim); a contract there without operator() is skipped.
 */
export async function resolveOperator(
  client: PublicClient,
  guard: Address | null,
  blockNumber: bigint,
): Promise<OperatorIdentity> {
  if (guard) {
    try {
      const address = await client.readContract({
        address: guard,
        abi: animrTradeGuardAbi,
        functionName: "operator",
        blockNumber,
      });
      if (!isAddressEqual(address, zeroAddress)) return { address: getAddress(address), source: "guard" };
    } catch (error) {
      if (!revertOutcome(error) && !isZeroData(error)) throw error;
      // Not an AnimrTradeGuard (no operator()): fall back to the configured key.
    }
  }
  return operatorFromEnv() ?? { address: STAND_IN_OPERATOR, source: "stand-in" };
}

/** Public label for where the simulated sender came from. */
export function operatorLabel(source: OperatorSource): string {
  switch (source) {
    case "env-address":
    case "env-key":
      return "the House Chog's AI key";
    case "guard":
      return "the AI key the guard accepts";
    case "stand-in":
      return "a stand-in AI key (no operator is configured yet)";
  }
}
