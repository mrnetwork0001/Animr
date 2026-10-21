"use client";

import { useRef, useState } from "react";
import type { Hash } from "viem";
import { useConfig } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { appConfig } from "@/lib/config";
import { explorerTxUrl } from "@/lib/format";
import { OutcomeError, TxRevertedError, describeTxError } from "./tx-errors";

export const chainId = appConfig.chain.id;

/** One wallet transaction of a flow. `send` simulates first (so reverts decode before any gas is spent), then sends. */
export type TxStep = { label: string; send: () => Promise<Hash> };

export type TxPlan = {
  /** Which part of the UI started it, so the status line renders next to that control (see TxStatus `origin`). */
  origin?: string;
  steps: TxStep[];
  /** Re-reads the chain after the receipts; returns a problem to show, or undefined when the change took effect. */
  verify?: () => Promise<string | undefined>;
  /** Shown once everything is confirmed and verified. */
  success: string;
};

type Progress =
  | { phase: "idle" }
  | { phase: "wallet"; step: number; total: number; label: string; hashes: Hash[] }
  | { phase: "confirming"; step: number; total: number; label: string; hashes: Hash[] }
  | { phase: "verifying"; hashes: Hash[] }
  | { phase: "done"; hashes: Hash[]; message: string }
  | { phase: "error"; hashes: Hash[]; message: string };

export type TxProgress = Progress & { origin?: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retries a post-transaction check a few times: a load-balanced RPC can answer from a node that hasn't seen the
 * new block yet. Returns the last problem if it never clears.
 */
export async function pollOutcome(
  check: () => Promise<string | undefined>,
  attempts = 4,
  delayMs = 1_500,
): Promise<string | undefined> {
  let problem: string | undefined;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(delayMs);
    try {
      problem = await check();
    } catch (error) {
      problem = `Couldn't re-read the result on-chain: ${describeTxError(error)}`;
    }
    if (!problem) return undefined;
  }
  return problem;
}

/**
 * Runs a TxPlan: each step's wallet prompt, its receipt (a reverted receipt fails the flow), then `verify`.
 * `onSettled` runs after every attempt, success or not, so callers can refetch.
 */
export function useTxFlow(onSettled?: () => void) {
  const config = useConfig();
  const [progress, setProgress] = useState<TxProgress>({ phase: "idle" });
  const running = useRef(false);

  async function run(plan: TxPlan): Promise<boolean> {
    if (running.current) return false;
    running.current = true;
    const { origin } = plan;
    const hashes: Hash[] = [];
    const total = plan.steps.length;
    try {
      for (const [index, step] of plan.steps.entries()) {
        setProgress({ origin, phase: "wallet", step: index + 1, total, label: step.label, hashes: [...hashes] });
        const hash = await step.send();
        hashes.push(hash);
        setProgress({ origin, phase: "confirming", step: index + 1, total, label: step.label, hashes: [...hashes] });
        const receipt = await waitForTransactionReceipt(config, { hash, chainId });
        if (receipt.status !== "success") throw new TxRevertedError(hash);
      }
      if (plan.verify) {
        setProgress({ origin, phase: "verifying", hashes: [...hashes] });
        const problem = await plan.verify();
        if (problem) throw new OutcomeError(problem);
      }
      setProgress({ origin, phase: "done", hashes, message: plan.success });
      return true;
    } catch (error) {
      setProgress({ origin, phase: "error", hashes, message: describeTxError(error) });
      return false;
    } finally {
      running.current = false;
      onSettled?.();
    }
  }

  const busy = progress.phase === "wallet" || progress.phase === "confirming" || progress.phase === "verifying";
  return { progress, busy, run, reset: () => setProgress({ phase: "idle" }) };
}

function TxLinks({ hashes }: { hashes: Hash[] }) {
  return (
    <>
      {hashes.map((hash, i) => {
        const href = explorerTxUrl(hash);
        if (!href) return null;
        return (
          <a
            key={hash}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            {hashes.length > 1 ? `Transaction ${i + 1} ↗` : "View transaction ↗"}
          </a>
        );
      })}
    </>
  );
}

/**
 * Status line for a TxPlan in flight, with explorer links for every hash sent. With `origin`, it renders only for
 * plans started with that origin (one flow, several places in the UI).
 */
export function TxStatus({ progress, origin }: { progress: TxProgress; origin?: string }) {
  if (progress.phase === "idle") return null;
  if (origin !== undefined && progress.origin !== origin) return null;
  const pending = progress.phase === "wallet" || progress.phase === "confirming" || progress.phase === "verifying";
  const tone = progress.phase === "done" ? "text-success" : progress.phase === "error" ? "text-danger" : "text-muted";
  const lead =
    "total" in progress && progress.total > 1 ? `Step ${progress.step} of ${progress.total} · ${progress.label}: ` : "";
  const text =
    progress.phase === "wallet"
      ? lead
        ? `${lead}confirm in your wallet…`
        : "Confirm in your wallet…"
      : progress.phase === "confirming"
        ? lead
          ? `${lead}submitted, waiting for confirmation…`
          : "Submitted. Waiting for confirmation…"
        : progress.phase === "verifying"
          ? "Confirmed. Checking the result on-chain…"
          : progress.message;
  return (
    <p role="status" className={`mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm ${tone}`}>
      {pending && (
        <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {progress.phase === "done" && <span aria-hidden>✓</span>}
      <span>{text}</span>
      <TxLinks hashes={progress.hashes} />
    </p>
  );
}
