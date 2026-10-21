import { parseUnits } from "viem";
import {
  type GuardLimits,
  type GuardOnboarding,
  type OnboardingStep,
  type VaultBalances,
  DEFAULT_GUARD_LIMITS,
  GUARD_LIMIT_CEILINGS,
  validateGuardLimits,
} from "@/lib/contracts/animr-trade-guard";

// Pure step logic for the owner's on-chain setup (no React, no RPC), so scripts can test it.

export type AgentMode = "paper" | "onchain";

/** readGuardOnboarding().nextStep, plus the agent's switch to on-chain mode on the server. */
export type SetupStep = "create-account" | "grant-guard" | "configure" | "fund" | "go-onchain" | "live";

export const SETUP_STEPS: readonly { id: SetupStep; title: string; summary: string }[] = [
  {
    id: "create-account",
    title: "Create the Chog's wallet",
    summary: "Deploys and initializes its ERC-6551 account in one transaction.",
  },
  {
    id: "grant-guard",
    title: "Let the guard trade",
    summary: "The wallet lets AnimrTradeGuard execute swaps. The AI's own key never gets access.",
  },
  {
    id: "configure",
    title: "Set your limits",
    summary: "Trade size, daily budget, pace and slippage, enforced on-chain.",
  },
  {
    id: "fund",
    title: "Fund the vault",
    summary: "Deposit $CHOG and WMON (or wrap MON here): with both, the AI can sell pumps and buy dips. The guard trades only these two tokens.",
  },
  {
    id: "go-onchain",
    title: "Switch the AI to on-chain",
    summary: "Sign a free message: its decisions then execute as real swaps in this wallet.",
  },
  {
    id: "live",
    title: "Live",
    summary: "The AI trades real $CHOG within your limits. You can stop it at any time.",
  },
];

export type SetupState =
  | { kind: "blocked"; reason: "not-a-chog-account" | "unsupported-owner" }
  | { kind: "step"; step: SetupStep; index: number };

/** Where the stepper stands: the guard's next step, then whether the agent already runs on-chain. */
export function setupState(nextStep: OnboardingStep, agentMode: AgentMode | null | undefined): SetupState {
  if (nextStep === "not-a-chog-account" || nextStep === "unsupported-owner")
    return { kind: "blocked", reason: nextStep };
  const step: SetupStep = nextStep === "ready" ? (agentMode === "onchain" ? "live" : "go-onchain") : nextStep;
  return { kind: "step", step, index: stepIndex(step) };
}

export function stepIndex(step: SetupStep): number {
  return SETUP_STEPS.findIndex((s) => s.id === step);
}

export type StepStatus = "done" | "current" | "todo";

export function stepStatus(step: SetupStep, current: SetupStep): StepStatus {
  const i = stepIndex(step);
  const c = stepIndex(current);
  return i < c ? "done" : i === c ? "current" : "todo";
}

/** The guard is set up for the current owner (authorized or opted in): offer Disable / Revoke. */
export function canStop(onboarding: GuardOnboarding): { disable: boolean; revoke: boolean } {
  return { disable: Boolean(onboarding.limits?.enabled), revoke: onboarding.guardAuthorized };
}

// ------------------------------------------------------------------------------------------------ limits form

export type LimitField = "maxTradePct" | "maxDailyPct" | "minIntervalMin" | "maxSlippagePct";
export type LimitsDraft = Record<LimitField, string>;

/** UI-only bound: longer pauses than a week are better expressed with Disable. */
export const MAX_INTERVAL_MIN = 7 * 24 * 60;

export const LIMIT_FIELDS: readonly {
  key: LimitField;
  label: string;
  unit: "%" | "min";
  min: number;
  max: number;
  /** Shown under the input. */
  hint: string;
  /** The guard's hard ceiling, when the contract has one. */
  ceiling?: string;
}[] = [
  {
    key: "maxTradePct",
    label: "Per-trade size",
    unit: "%",
    min: 0.01,
    max: GUARD_LIMIT_CEILINGS.maxTradeBps / 100,
    hint: "Largest share of a balance one trade may sell.",
    ceiling: `max ${GUARD_LIMIT_CEILINGS.maxTradeBps / 100}%`,
  },
  {
    key: "maxDailyPct",
    label: "Daily budget",
    unit: "%",
    min: 0.01,
    max: GUARD_LIMIT_CEILINGS.maxDailyBps / 100,
    hint: "Value traded per 24h, buys and sells together, as a share of the vault.",
    ceiling: `max ${GUARD_LIMIT_CEILINGS.maxDailyBps / 100}%`,
  },
  {
    key: "minIntervalMin",
    label: "Minimum minutes between trades",
    unit: "min",
    min: 0,
    max: MAX_INTERVAL_MIN,
    hint: "The AI waits at least this long after each trade.",
  },
  {
    key: "maxSlippagePct",
    label: "Max slippage",
    unit: "%",
    min: 0.01,
    max: GUARD_LIMIT_CEILINGS.maxSlippageBps / 100,
    hint: "How far below the 30-minute TWAP price (after the 1% pool fee) a fill may land.",
    ceiling: `max ${GUARD_LIMIT_CEILINGS.maxSlippageBps / 100}%`,
  },
];

export const LIMIT_PRESETS: readonly { id: string; label: string; limits: GuardLimits }[] = [
  {
    id: "cautious",
    label: "Cautious",
    limits: { enabled: true, maxTradeBps: 500, maxDailyBps: 1_500, minInterval: 3_600, maxSlippageBps: 200 },
  },
  { id: "balanced", label: "Balanced", limits: DEFAULT_GUARD_LIMITS },
  {
    id: "bold",
    label: "Bold",
    limits: { enabled: true, maxTradeBps: 2_500, maxDailyBps: 6_000, minInterval: 300, maxSlippageBps: 200 },
  },
];

/** Plain decimal string without float noise: 10 -> "10", 10.5 -> "10.5", 0.05 -> "0.05". */
function decimalString(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function limitsToDraft(limits: GuardLimits): LimitsDraft {
  return {
    maxTradePct: decimalString(limits.maxTradeBps / 100),
    maxDailyPct: decimalString(limits.maxDailyBps / 100),
    minIntervalMin: decimalString(limits.minInterval / 60),
    maxSlippagePct: decimalString(limits.maxSlippageBps / 100),
  };
}

/** Limits to start the form from: the owner's previous ones (e.g. after Disable), else the defaults. */
export function initialLimits(current: GuardLimits | null | undefined): GuardLimits {
  if (current && current.maxTradeBps > 0 && current.maxDailyBps > 0 && current.maxSlippageBps > 0) {
    return { ...current, enabled: true };
  }
  return DEFAULT_GUARD_LIMITS;
}

const DECIMAL_2 = /^(\d+(\.\d{0,2})?|\.\d{1,2})$/;

export type ParsedLimits = { ok: true; limits: GuardLimits } | { ok: false; field?: LimitField; error: string };

/** Form strings -> GuardLimits (bps and seconds), with the same checks as configure() plus friendlier messages. */
export function parseLimitsDraft(draft: LimitsDraft): ParsedLimits {
  const values = {} as Record<LimitField, number>;
  for (const field of LIMIT_FIELDS) {
    const raw = draft[field.key].trim();
    if (!raw) return { ok: false, field: field.key, error: `Enter a value for ${field.label.toLowerCase()}.` };
    if (!DECIMAL_2.test(raw)) {
      return { ok: false, field: field.key, error: `${field.label}: use a number with at most 2 decimals.` };
    }
    const value = Number(raw);
    if (value < field.min || value > field.max) {
      const range =
        field.unit === "%"
          ? `${field.min}% and ${field.max}%`
          : `${field.min} and ${field.max.toLocaleString("en-US")} minutes`;
      return { ok: false, field: field.key, error: `${field.label} must be between ${range}.` };
    }
    values[field.key] = value;
  }
  const limits: GuardLimits = {
    enabled: true,
    maxTradeBps: Math.round(values.maxTradePct * 100),
    maxDailyBps: Math.round(values.maxDailyPct * 100),
    minInterval: Math.round(values.minIntervalMin * 60),
    maxSlippageBps: Math.round(values.maxSlippagePct * 100),
  };
  const error = validateGuardLimits(limits);
  return error ? { ok: false, error } : { ok: true, limits };
}

export function sameLimits(a: GuardLimits, b: GuardLimits): boolean {
  return (
    a.enabled === b.enabled &&
    a.maxTradeBps === b.maxTradeBps &&
    a.maxDailyBps === b.maxDailyBps &&
    a.minInterval === b.minInterval &&
    a.maxSlippageBps === b.maxSlippageBps
  );
}

/** 1000 -> "10%", 1050 -> "10.5%", 5 -> "0.05%". */
export function formatBps(bps: number): string {
  return `${decimalString(bps / 100)}%`;
}

/** 0 -> "no minimum", 45 -> "45 s", 600 -> "10 min", 5400 -> "1 h 30 min", 86400 -> "24 h". */
export function formatInterval(seconds: number): string {
  if (seconds <= 0) return "no minimum";
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** One line for the owner: "10% per trade · 30% of the vault per day · 10 min apart · ≤2% slippage". */
export function describeLimits(limits: GuardLimits): string {
  return [
    `${formatBps(limits.maxTradeBps)} per trade`,
    `${formatBps(limits.maxDailyBps)} of the vault per day`,
    limits.minInterval > 0 ? `${formatInterval(limits.minInterval)} apart` : "no minimum gap",
    `≤${formatBps(limits.maxSlippageBps)} slippage`,
  ].join(" · ");
}

// ------------------------------------------------------------------------------------------------ amounts

/** Parses a token amount typed by the owner (like chog-lookup's deposit form). */
export function parseTokenAmount(
  raw: string,
  decimals: number,
  available?: bigint,
): { value?: bigint; error?: string } {
  const value = raw.trim();
  if (!value) return {};
  if (!/^(\d+\.?\d*|\.\d+)$/.test(value)) return { error: "Enter a number, like 100 or 2.5." };
  if ((value.split(".")[1] ?? "").length > decimals) return { error: `Use at most ${decimals} decimal places.` };
  const amount = parseUnits(value, decimals);
  if (amount === BigInt(0)) return { error: "Enter an amount above zero." };
  if (available !== undefined && amount > available) return { error: "That's more than your wallet holds." };
  return { value: amount };
}

/** MON kept back for gas when the owner wraps "Max" (Monad charges the gas limit, so leave room). */
export const GAS_RESERVE_WEI = BigInt(10) ** BigInt(17); // 0.1 MON

export function maxWrappable(monBalance: bigint): bigint {
  return monBalance > GAS_RESERVE_WEI ? monBalance - GAS_RESERVE_WEI : BigInt(0);
}

// ------------------------------------------------------------------------------------------------ outcomes

/** Owner actions whose result is re-read on-chain after the receipt (never trusted from the receipt alone). */
export type SetupAction = "create-account" | "grant-guard" | "configure" | "disable" | "revoke" | "revoke-operator";

/**
 * Checks a fresh readGuardOnboarding() (plus the operator tripwire) against what the action should have done.
 * Returns undefined when it took effect, else a sentence for the owner.
 */
export function checkSetupOutcome(
  action: SetupAction,
  after: GuardOnboarding & { operatorDirect?: boolean },
  expected?: { limits?: GuardLimits },
): string | undefined {
  switch (action) {
    case "revoke-operator":
      return after.operatorDirect
        ? "The transaction confirmed, but the operator can still execute for this wallet. If the operator's address holds this Chog, move the Chog to another wallet."
        : undefined;
    case "create-account":
      return after.account === "ready"
        ? undefined
        : "The transaction confirmed, but the wallet still isn't initialized on-chain.";
    case "grant-guard":
      return after.guardAuthorized
        ? undefined
        : "The transaction confirmed, but the guard still isn't authorized on this wallet. The permission only counts when the Chog's holder sends it directly (not through a smart-wallet batch, relayer or another account).";
    case "configure":
      if (!after.limits?.enabled) {
        return "The transaction confirmed, but the guard doesn't show trading as enabled for the current holder.";
      }
      return expected?.limits && !sameLimits(after.limits, expected.limits)
        ? "The transaction confirmed, but the guard shows different limits than the ones you sent."
        : undefined;
    case "disable":
      return after.limits?.enabled
        ? "The transaction confirmed, but the guard still shows trading as enabled."
        : undefined;
    case "revoke":
      return after.guardAuthorized
        ? "The transaction confirmed, but the guard is still authorized on this wallet."
        : undefined;
  }
}

/** A deposit landed: the vault's balance of that token grew by at least the amount sent. */
export function checkDepositOutcome(
  token: "chog" | "wmon",
  amount: bigint,
  before: VaultBalances,
  after: VaultBalances,
): string | undefined {
  return after[token] >= before[token] + amount
    ? undefined
    : "The transfer confirmed, but the vault's balance hasn't caught up yet. Refresh in a moment.";
}
