import type { AgentDetailResponse, Decision } from "./types";

// 0G Compute receipts as the UI shows them. Every LLM decision keeps the Router's x_0g_trace (Decision.zg): the
// serving provider's on-chain address, the request id, the exact cost, and tee_verified when the Router reports one.
// The agents API labels each provider from the Router's public provider list (zgProviderInfo in zg-compute.ts,
// server-side and cached) and sends the labels next to the decisions as `providers`.
// Honest labels: a provider's tier (TeeML enclave, TeeTLS broker or standard) says how that provider serves calls; it
// is not a check of this call. "TEE verified" is shown only when the receipt itself says tee_verified === true (the
// Router seals traffic and reports no verdict for it today). Pure: safe in client components.

/** How a 0G provider serves calls, strongest first (mirrors ZgProviderLabel in zg-compute.ts). */
export type ProviderTier = "TeeML" | "TeeTLS" | "standard";

export type ProviderLabel = {
  label: ProviderTier;
  /** Operator-declared name, e.g. "0G Foundation" or "Baidu / Tencent". */
  name?: string;
};

/** Provider labels keyed by lowercase address. */
export type ProviderLabels = Record<string, ProviderLabel>;

/** GET /api/agents/[tokenId] (and the activate, mode and tick answers): the detail plus the decisions' providers. */
export type AgentDetailView = AgentDetailResponse & { providers?: ProviderLabels };

/** Describes the provider, never the call: the tier is how 0G lists that provider, not a check of this decision. */
export const PROVIDER_TEXT: Record<ProviderTier, { long: string; short: string }> = {
  TeeML: {
    long: "Served by a provider 0G lists as TeeML (model in a TEE enclave). This call's attestation isn't verified.",
    short: "TeeML provider",
  },
  TeeTLS: {
    long: "Served by a provider 0G lists as TeeTLS (a TEE broker over attested TLS). This call's attestation isn't verified.",
    short: "TeeTLS provider",
  },
  standard: { long: "Served by a standard 0G provider (no TEE)", short: "standard provider" },
};

export function isProviderTier(value: unknown): value is ProviderTier {
  return value === "TeeML" || value === "TeeTLS" || value === "standard";
}

/** The label of the provider that served a decision, when the API resolved one. */
export function providerLabelOf(labels: ProviderLabels | undefined, address: string | undefined): ProviderLabel | undefined {
  if (!labels || typeof address !== "string") return undefined;
  const label = labels[address.trim().toLowerCase()];
  return label && isProviderTier(label.label) ? label : undefined;
}

/** True only when the decision's own receipt says the Router verified the provider's TEE signature. */
export function isTeeVerified(decision: Pick<Decision, "zg">): boolean {
  return decision.zg?.teeVerified === true;
}

/** The receipt's cost in USD, or null without one. */
export function receiptCostUsd(decision: Pick<Decision, "zg">): number | null {
  const micro = Number(decision.zg?.costUsdMicro);
  return decision.zg?.costUsdMicro && Number.isFinite(micro) && micro >= 0 ? micro / 1e6 : null;
}

/** "$0.0018": a 0G call costs a fraction of a cent, so show 2 significant digits. */
export function formatCallCost(usd: number): string {
  if (!Number.isFinite(usd) || usd < 0) return "—";
  if (usd === 0) return "$0";
  if (usd < 0.0001) return "<$0.0001";
  if (usd >= 0.01) return `$${usd.toFixed(2)}`;
  return `$${Number(usd.toPrecision(2))}`;
}
