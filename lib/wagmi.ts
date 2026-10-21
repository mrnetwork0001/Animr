import { type Transport, createConfig, createStorage, http, injected, noopStorage } from "wagmi";
import { appConfig } from "./config";
import { privyEnabled } from "./privy";

// appConfig.chain is typed as the union of both Monad networks, so the computed
// key needs a cast to satisfy the per-chain transports record.
const transports = { [appConfig.chain.id]: http(appConfig.rpcUrl) } as Record<
  typeof appConfig.chain.id,
  Transport
>;

/**
 * Only the configured Monad network.
 *
 * Without Privy: `injected()` covers any browser wallet; with EIP-6963 discovery (on by default) MetaMask, Rabby,
 * Phantom, Backpack… also show up as their own named connectors.
 *
 * With Privy (lib/privy.ts): no connectors of our own. The Privy island registers one injected connector wrapping the
 * active Privy wallet's EIP-1193 provider and marks it connected. Privy keeps the session, so wagmi stores nothing.
 */
export const wagmiConfig = createConfig({
  chains: [appConfig.chain],
  connectors: privyEnabled ? [] : [injected()],
  multiInjectedProviderDiscovery: !privyEnabled,
  transports,
  // Render "disconnected" on the server and reconnect after mount (keeps routes static).
  ssr: true,
  // Persist connections in the browser only; on the server, zustand's persist middleware
  // would touch Node's experimental localStorage and log a warning. With Privy, a storage that keeps
  // nothing: the island restores the connection from Privy's session (and `ssr` needs a storage).
  storage:
    typeof window === "undefined" ? null : privyEnabled ? createStorage({ storage: noopStorage }) : undefined,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

type ErrorLike = { name?: unknown; code?: unknown; shortMessage?: unknown; message?: unknown; cause?: unknown };

// Error names are compared instead of `instanceof` so the checks hold across
// viem / @wagmi/core copies.
function findError(error: unknown, match: (e: ErrorLike) => boolean): ErrorLike | undefined {
  let current = error;
  for (let depth = 0; depth < 10 && current && typeof current === "object"; depth++) {
    if (match(current as ErrorLike)) return current as ErrorLike;
    current = (current as ErrorLike).cause;
  }
  return undefined;
}

const named = (name: string) => (e: ErrorLike) => e.name === name;

/** The wallet user dismissed the request (EIP-1193 4001). */
export function isUserRejection(error: unknown): boolean {
  return Boolean(findError(error, (e) => e.code === 4001 || e.name === "UserRejectedRequestError"));
}

/** A contract call reverted, e.g. `ownerOf` for a token that was never minted. */
export function isContractRevert(error: unknown): boolean {
  return Boolean(findError(error, named("ContractFunctionRevertedError")));
}

/** The call returned no data: usually no contract at that address on this network. */
export function isZeroDataError(error: unknown): boolean {
  return Boolean(findError(error, named("ContractFunctionZeroDataError")));
}

/** One short, human sentence for a wallet / RPC / contract error. */
export function walletErrorMessage(error: unknown): string {
  if (!error) return "Something went wrong.";
  if (isUserRejection(error)) return "Request rejected in your wallet.";
  if (findError(error, (e) => e.code === -32002 || e.name === "ResourceUnavailableRpcError")) {
    return "Your wallet already has a pending request. Open it to continue.";
  }
  if (findError(error, named("ProviderNotFoundError"))) return "No browser wallet found.";
  if (findError(error, named("ConnectorChainMismatchError"))) {
    return `Your wallet is on another network. Switch to ${appConfig.chain.name} and try again.`;
  }
  if (findError(error, named("InsufficientFundsError"))) {
    return `Not enough ${appConfig.chain.nativeCurrency.symbol} to pay for gas.`;
  }
  const revert = findError(error, named("ContractFunctionRevertedError")) as
    | (ErrorLike & { reason?: unknown })
    | undefined;
  if (revert) {
    return typeof revert.reason === "string" && revert.reason
      ? `The contract reverted: ${revert.reason}`
      : "The contract reverted this call.";
  }
  const e = error as ErrorLike;
  const text = typeof e.shortMessage === "string" && e.shortMessage ? e.shortMessage : e.message;
  if (typeof text !== "string" || !text.trim()) return "Something went wrong.";
  // viem puts details on later lines ("…reverted with the following reason:\n<reason>").
  const oneLine = text.split("\n").map((line) => line.trim()).filter(Boolean).join(" ");
  return oneLine.length > 180 ? `${oneLine.slice(0, 177)}…` : oneLine;
}
