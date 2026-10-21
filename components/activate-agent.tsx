"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { Address } from "viem";
import { useSignMessage } from "wagmi";
import { activationMessage } from "@/lib/agent/auth";
import type { ActivateRequest, AgentDetailResponse } from "@/lib/agent/types";
import { shortAddress } from "@/lib/format";
import { walletErrorMessage } from "@/lib/wagmi";
import { Spinner } from "./onchain/ui";
import { SparkIcon } from "./v2/icons";
import { IconTile, pillClass } from "./v2/primitives";

type ActivateAgentProps = {
  tokenId: string;
  /** The Chog's ERC-6551 account the agent will trade. */
  account: Address;
  /** The connected wallet; the caller has already checked it owns the NFT (ownerOf). */
  owner: Address;
  /** The agent exists but is paused. */
  reactivate?: boolean;
  /** Receives the activate response; the caller updates/refetches its profile with it. */
  onActivated?: (response: AgentDetailResponse) => void;
  /** Inside another panel (the on-chain stepper): no card of its own. */
  embedded?: boolean;
};

function apiErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const { error, message } = body as { error?: unknown; message?: unknown };
  if (typeof error === "string") return error;
  if (typeof message === "string") return message;
  return undefined;
}

/** Owner signs a free activation message; the API verifies it and starts the agent. */
export function ActivateAgent({
  tokenId,
  account,
  owner,
  reactivate = false,
  onActivated,
  embedded = false,
}: ActivateAgentProps) {
  const [phase, setPhase] = useState<"sign" | "submit">("sign");
  const { mutateAsync: signMessage } = useSignMessage();

  const activate = useMutation({
    mutationFn: async (): Promise<AgentDetailResponse> => {
      setPhase("sign");
      // Built at click time so the server's freshness check (ACTIVATION_MAX_AGE_MS) passes.
      const message = activationMessage({ tokenId, account, owner, issuedAt: new Date().toISOString() });
      const signature = await signMessage({ account: owner, message });

      setPhase("submit");
      const body: ActivateRequest = { owner, message, signature };
      const res = await fetch(`/api/agents/${tokenId}/activate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) throw new Error(apiErrorMessage(data) ?? `Activation failed (HTTP ${res.status}).`);
      if (!data || typeof data !== "object" || !("agent" in data)) {
        throw new Error("Unexpected response from the activation API.");
      }
      return data as AgentDetailResponse;
    },
    onSuccess: (data) => onActivated?.(data),
  });

  const label = activate.isPending
    ? phase === "sign"
      ? "Confirm in your wallet…"
      : "Waking the agent…"
    : reactivate
      ? "Sign & reactivate"
      : "Sign & activate";

  const copy = (
    <>
      Sign one message to prove you hold this Chog. It&apos;s free: no transaction, no gas, no token approval.{" "}
      {reactivate
        ? "The agent picks up its paper portfolio and decision history where it left off."
        : "The agent then paper-trades: it starts from the $CHOG this Chog's wallet holds right now (or a demo bankroll if the wallet is empty) and simulates every trade, so no tokens move until its holder switches it on-chain."}{" "}
      Every decision it makes shows up here.
    </>
  );

  const action = (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => activate.mutate()}
          disabled={activate.isPending}
          aria-busy={activate.isPending || undefined}
          className={`${pillClass("primary", embedded ? "sm" : "md")} disabled:cursor-wait`}
        >
          {activate.isPending ? <Spinner /> : <SparkIcon className="v2-btn-icon" />}
          {label}
        </button>
        <span className="text-xs text-[var(--v2-faint)]">
          signing as <span className="v2-mono text-[var(--v2-nav)]">{shortAddress(owner)}</span>
        </span>
      </div>
      <div aria-live="polite">
        {activate.isError && (
          <div role="alert" className="v2-toast v2-toast--danger mt-3 shadow-none">
            <div>
              <span className="v2-toast-title">Couldn&apos;t wake the agent</span>
              {walletErrorMessage(activate.error)}
            </div>
            <span />
          </div>
        )}
      </div>
    </>
  );

  if (embedded) {
    return (
      <div>
        <p className="text-sm leading-relaxed text-[var(--v2-nav)]">{copy}</p>
        {action}
      </div>
    );
  }

  return (
    <section id="wake" aria-labelledby="wake-title" className="v2-card v2-card--feature scroll-mt-28">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <IconTile size="lg">
          <SparkIcon />
        </IconTile>
        <div className="min-w-0 flex-1">
          <p className="v2-kicker">Free · one signature</p>
          <h2 id="wake-title" className="v2-h3 mt-2">
            {reactivate ? `Wake Chog #${tokenId}'s AI back up` : `Wake Chog #${tokenId}'s AI`}
          </h2>
          <p className="mt-2 max-w-[68ch] text-[15px] leading-relaxed text-[var(--v2-nav)]">{copy}</p>
          {action}
        </div>
      </div>
    </section>
  );
}
