import { BaseError, ContractFunctionRevertedError, ContractFunctionZeroDataError } from "viem";
import type { ProofStep } from "./types";

// Telling a contract's revert from an RPC failure. viem files some node failures under ContractFunctionRevertedError
// as well (a JSON-RPC -32603 "internal error" with any message and no data becomes "reverted"), so a revert only
// counts here when the node answered "execution reverted" (code 3: Monad, anvil, geth; viem's multicall uses it too)
// or returned revert data.

export type Outcome = Pick<ProofStep, "reverted" | "error" | "errorName">;

const REVERT_DATA = /^0x(?:[0-9a-f]{2}){4,}$/i;

/** The decoded revert behind `error`, or null when it isn't a contract revert (RPC, network, timeout, ...). */
export function revertOutcome(error: unknown): Outcome | null {
  if (!(error instanceof BaseError)) return null;
  const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
  if (!(revert instanceof ContractFunctionRevertedError)) return null;
  const hasData = typeof revert.raw === "string" && REVERT_DATA.test(revert.raw);
  if (!hasData && !saysExecutionReverted(error)) return null;
  return decodedRevert(revert);
}

/** The call ran and returned no data at all (not a revert): e.g. a function the contract doesn't have, no fallback. */
export function isZeroData(error: unknown): boolean {
  return error instanceof BaseError && Boolean(error.walk((e) => e instanceof ContractFunctionZeroDataError));
}

/**
 * JSON-RPC code 3 ("execution reverted") anywhere in the cause chain: the HTTP transport keeps it on RpcRequestError,
 * other transports wrap it in UnknownRpcError (code -1) with the node's error as the cause.
 */
function saysExecutionReverted(error: BaseError): boolean {
  return Boolean(error.walk((e) => (e as { code?: unknown } | null)?.code === 3));
}

function decodedRevert(revert: ContractFunctionRevertedError): Outcome {
  const name = revert.data?.errorName;
  if (name) {
    const args = (revert.data?.args ?? []).map((arg) => (typeof arg === "string" ? JSON.stringify(arg) : String(arg)));
    // viem reports require/revert strings as Error(string).
    if (name === "Error" && typeof revert.data?.args?.[0] === "string") {
      return { reverted: true, error: `Error(${args[0]})`, errorName: "Error" };
    }
    return { reverted: true, error: `${name}(${args.join(", ")})`, errorName: name };
  }
  if (revert.signature) return { reverted: true, error: `unknown error ${revert.signature}`, errorName: null };
  if (revert.reason && revert.reason !== "execution reverted") {
    return { reverted: true, error: `Error(${JSON.stringify(revert.reason)})`, errorName: "Error" };
  }
  return { reverted: true, error: "reverted without a reason", errorName: null };
}
