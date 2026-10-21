import { type Hash, type Hex, toFunctionSelector } from "viem";
import { walletErrorMessage } from "@/lib/wagmi";

// Turns wallet / revert errors from the owner's setup transactions into one sentence. Errors are matched by name
// (not instanceof) so the checks hold across viem / @wagmi/core copies, like lib/wagmi.ts.

/** Custom errors the Chog's Tokenbound wallet (AccountV3) and AnimrTradeGuard revert with, in owner words. */
const REVERT_TEXT: Record<string, string> = {
  // Tokenbound AccountV3
  NotAuthorized:
    "The Chog's wallet refused: only the wallet that holds this Chog can do this, and it has to send the transaction itself (not through a relayer, batch or another account).",
  AccountLocked:
    "The Chog's wallet is locked (Tokenbound lock): it can't change permissions or execute until the lock expires.",
  InvalidInput: "The Chog's wallet rejected the input.",
  AlreadyInitialized: "The Chog's wallet is already set up. Refresh to continue.",
  // AnimrTradeGuard
  NotAccountOwner: "The guard refused: only the current holder of this Chog can change its settings.",
  NotChogAccount: "The guard refused: this address isn't the canonical Tokenbound wallet of a Chog.",
  NestedAccount:
    "The guard refused: this Chog is held by another token-bound account. Move it to a regular wallet first.",
  InvalidLimits: "The guard refused these limits: per trade 0.01-50%, daily 0.01-100%, slippage 0.01-2%.",
  NotOperator: "Only the AI operator can trade through the guard.",
  Reentrancy: "The guard is busy with another call. Try again.",
};

/** Plain revert strings (e.g. Multicall3 when the create-and-initialize batch fails). */
const REASON_TEXT: Record<string, string> = {
  "Multicall3: call failed":
    "Setting up the wallet failed: it may already exist or be initialized. Refresh and try again.",
};

/** Selectors of the errors above, for reverts the ABI at hand could not decode (e.g. bubbled up from a nested call). */
const SELECTOR_TEXT: Record<string, string> = Object.fromEntries(
  Object.entries(REVERT_TEXT).map(([name, text]) => [toFunctionSelector(`${name}()`), text]),
);

/** A setup transaction was mined but reverted. */
export class TxRevertedError extends Error {
  hash: Hash;
  constructor(hash: Hash) {
    super("The transaction was mined but reverted. Nothing changed (the gas is spent).");
    this.name = "TxRevertedError";
    this.hash = hash;
  }
}

/** The transaction succeeded but a fresh on-chain read does not show the expected state. */
export class OutcomeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutcomeError";
  }
}

/** A failed call to one of Animr's APIs, with its HTTP status. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type ErrorLike = {
  name?: unknown;
  cause?: unknown;
  reason?: unknown;
  signature?: unknown;
  data?: { errorName?: unknown; args?: unknown };
};

function findByName(error: unknown, name: string): ErrorLike | undefined {
  let current = error;
  for (let depth = 0; depth < 10 && current && typeof current === "object"; depth++) {
    if ((current as ErrorLike).name === name) return current as ErrorLike;
    current = (current as ErrorLike).cause;
  }
  return undefined;
}

/** The decoded custom error name of a revert (e.g. "NotAuthorized"), if any. */
export function revertErrorName(error: unknown): string | undefined {
  const revert = findByName(error, "ContractFunctionRevertedError");
  const name = revert?.data?.errorName;
  return typeof name === "string" ? name : undefined;
}

/** One short sentence for a failed setup step: decoded reverts first, then lib/wagmi's wallet / RPC wording. */
export function describeTxError(error: unknown): string {
  if (error instanceof TxRevertedError || error instanceof OutcomeError || error instanceof ApiError) {
    return error.message;
  }
  const revert = findByName(error, "ContractFunctionRevertedError");
  if (revert) {
    const name = revertErrorName(error);
    if (name === "TradeRejected") {
      const args = revert.data?.args;
      const reason = Array.isArray(args) && typeof args[0] === "string" ? args[0] : "";
      return reason ? `The guard refused: ${reason}.` : "The guard refused this trade.";
    }
    // viem names Solidity's built-in Error(string) / Panic(uint256) "Error" / "Panic", with the text in `reason`.
    if (name && name !== "Error" && name !== "Panic") return REVERT_TEXT[name] ?? `The contract reverted with ${name}.`;
    if (typeof revert.reason === "string" && revert.reason) {
      return REASON_TEXT[revert.reason] ?? `The contract reverted: ${revert.reason}`;
    }
    if (typeof revert.signature === "string" && SELECTOR_TEXT[revert.signature as Hex]) {
      return SELECTOR_TEXT[revert.signature as Hex];
    }
    return "The contract reverted this call. Nothing was sent.";
  }
  return walletErrorMessage(error);
}
