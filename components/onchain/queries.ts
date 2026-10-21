import type { Address } from "viem";
import type { AgentDetailResponse } from "@/lib/agent/types";
import { publicClient } from "@/lib/clients";
import { appConfig } from "@/lib/config";
import {
  type GuardOnboarding,
  animrTradeGuardAbi,
  operatorHasDirectAccess,
  readGuardOnboarding,
} from "@/lib/contracts/animr-trade-guard";
import { isContractRevert, isZeroDataError } from "@/lib/wagmi";
import { ApiError } from "./tx-errors";

// Query keys and readers shared by the on-chain components. Every key under "onchain" is refetched after a setup
// transaction; the agent and holder keys match components/agent-profile.tsx so both views share one cache entry.

export const onchainKeys = {
  all: ["onchain"] as const,
  setup: (guard: Address, tba: Address) => ["onchain", "setup", guard, tba] as const,
  vault: (guard: Address | undefined, tba: Address) => ["onchain", "vault", guard ?? null, tba] as const,
  wallet: (owner: Address) => ["onchain", "wallet", owner] as const,
};

export const agentKey = (tokenId: number) => ["/api/agents", String(tokenId)] as const;
export const holderKey = (tokenId: number) => ["nft-owner", appConfig.chogNft, String(tokenId)] as const;

/** Reverts and "no contract here" are deterministic; only retry transient RPC failures. */
export const retryTransient = (failureCount: number, error: unknown) =>
  failureCount < 2 && !isContractRevert(error) && !isZeroDataError(error);

export type OnchainSetup = GuardOnboarding & {
  /** The admin's global kill switch: no trades while set (settings are kept). */
  paused: boolean;
  /** guard.operator(): the AI's key, the only address that can call trade(). */
  operator: Address;
  /**
   * The operator key can execute for the wallet directly (it was granted with setPermissions, or holds the Chog),
   * which would bypass every limit of the guard. The server refuses to trade then; the holder must revoke it.
   */
  operatorDirect: boolean;
};

/** readGuardOnboarding plus the guard's pause flag and the operator tripwire (lib/agent/onchain.ts checks the same). */
export async function readOnchainSetup(guard: Address, tba: Address): Promise<OnchainSetup> {
  const contract = { address: guard, abi: animrTradeGuardAbi } as const;
  const [onboarding, paused, operator] = await Promise.all([
    readGuardOnboarding(publicClient, tba, guard),
    publicClient.readContract({ ...contract, functionName: "paused" }),
    publicClient.readContract({ ...contract, functionName: "operator" }),
  ]);
  const operatorDirect =
    onboarding.account === "ready" ? await operatorHasDirectAccess(publicClient, tba, operator) : false;
  return { ...onboarding, paused, operator, operatorDirect };
}

async function readJson(res: Response): Promise<unknown> {
  return res.json().catch(() => null);
}

export function apiErrorText(body: unknown, status: number): string {
  const { error, message } = (body ?? {}) as { error?: unknown; message?: unknown };
  return typeof error === "string" ? error : typeof message === "string" ? message : `Request failed (HTTP ${status}).`;
}

/** GET /api/agents/[tokenId]; a 404 means "never activated", like components/agent-profile.tsx. */
export async function fetchAgentDetail(tokenId: number): Promise<AgentDetailResponse> {
  const res = await fetch(`/api/agents/${tokenId}`, { cache: "no-store" });
  const body = await readJson(res);
  if (res.status === 404) return { agent: null, decisions: [] };
  if (!res.ok) throw new ApiError(apiErrorText(body, res.status), res.status);
  if (!body || typeof body !== "object" || !Array.isArray((body as AgentDetailResponse).decisions)) {
    throw new Error("Unexpected response from the agents API.");
  }
  return body as AgentDetailResponse;
}
