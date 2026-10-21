"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useId } from "react";
import { type Address, formatUnits } from "viem";
import { useConfig, useConnection } from "wagmi";
import { simulateContract, writeContract } from "wagmi/actions";
import { useIsClient } from "@/components/connect-button";
import { onchainKeys, readOnchainSetup, retryTransient } from "@/components/onchain/queries";
import { describeTxError } from "@/components/onchain/tx-errors";
import { TxStatus, chainId, pollOutcome, useTxFlow } from "@/components/onchain/tx-flow";
import { Callout, Spinner } from "@/components/onchain/ui";
import { appConfig } from "@/lib/config";
import { animrTradeGuardAddress, setBuyOnlyRequest } from "@/lib/contracts/animr-trade-guard";
import { formatAmount } from "@/lib/format";

// The House Chog's holder card: its setup at a glance plus the optional buy-only switch (setBuyOnlyRequest). The House
// Chog trades two-way through the guard (its mandate buys dips and sells only into sharp pumps; lib/agent/engine.ts
// refuses real-money sells into a dip), so buy-only stays off unless the holder wants every sale refused on-chain.
// Shown to the House Chog's holder on its profile, next to the guard onboarding (create the wallet, grant the guard,
// limits), sharing its on-chain read (onchainKeys.setup). The order: create its wallet -> grant the guard -> limits
// -> deposit.

type Step = { id: string; title: string; done: boolean };

export function HouseBuyOnly({ tokenId, tba }: { tokenId: number; tba: Address }) {
  const guard = animrTradeGuardAddress;
  if (!guard) return null;
  return <HouseBuyOnlyCard tokenId={tokenId} tba={tba} guard={guard} />;
}

function HouseBuyOnlyCard({ tokenId, tba, guard }: { tokenId: number; tba: Address; guard: Address }) {
  const headingId = useId();
  const config = useConfig();
  const queryClient = useQueryClient();
  const isClient = useIsClient();
  const connection = useConnection();
  const viewer = isClient && connection.status === "connected" ? connection.address : undefined;
  const wrongChain = viewer !== undefined && connection.chainId !== chainId;
  const tx = useTxFlow(() => void queryClient.invalidateQueries({ queryKey: onchainKeys.all }));

  const setupQuery = useQuery({
    queryKey: onchainKeys.setup(guard, tba),
    queryFn: () => readOnchainSetup(guard, tba),
    refetchInterval: 30_000,
    retry: retryTransient,
  });
  const setup = setupQuery.data;
  // The holder check is the profile's (it renders this card for the holder only); only the network can be wrong.
  const canAct = Boolean(viewer) && !wrongChain;

  const steps: Step[] = setup
    ? [
        { id: "wallet", title: "Create its wallet", done: setup.account === "ready" },
        { id: "grant", title: "Grant the guard", done: setup.guardAuthorized },
        { id: "limits", title: "Limits", done: Boolean(setup.limits?.enabled) },
        { id: "deposit", title: "Deposit", done: setup.balances.wmon > BigInt(0) && setup.balances.chog > BigInt(0) },
      ]
    : [];

  function setBuyOnly(on: boolean) {
    if (!viewer) return;
    void tx.run({
      origin: "buy-only",
      steps: [
        {
          label: on ? "Turn on buy-only" : "Turn off buy-only",
          send: async () => {
            const { request } = await simulateContract(config, { ...setBuyOnlyRequest(tba, on, guard), account: viewer, chainId });
            return writeContract(config, request);
          },
        },
      ],
      verify: () =>
        pollOutcome(async () => {
          const fresh = await readOnchainSetup(guard, tba);
          queryClient.setQueryData(onchainKeys.setup(guard, tba), fresh);
          return fresh.buyOnly === on
            ? undefined
            : `The transaction confirmed, but the guard doesn't show buy-only mode ${on ? "on" : "off"} yet.`;
        }),
      success: on
        ? "Buy-only is on (confirmed on-chain): the guard now refuses every sale from this vault."
        : "Buy-only is off (confirmed on-chain): the AI may sell $CHOG again, within your limits.",
    });
  }

  let body: ReactNode;
  if (!setup) {
    body = setupQuery.isError ? (
      <Callout tone="danger" title="Couldn't read the House vault's guard setup">
        {describeTxError(setupQuery.error)}{" "}
        <button
          type="button"
          onClick={() => setupQuery.refetch()}
          disabled={setupQuery.isFetching}
          className="btn btn-secondary ml-1 px-2.5 py-1 text-xs"
        >
          {setupQuery.isFetching ? "Retrying…" : "Retry"}
        </button>
      </Callout>
    ) : (
      <p role="status" className="text-sm text-subtle">
        Reading the House vault on-chain…
      </p>
    );
  } else if (setup.account !== "ready") {
    body = (
      <p className="text-sm leading-relaxed text-muted">
        First create the House Chog&apos;s wallet (step 1 of the setup below): create its wallet → grant the guard →
        limits → deposit. The optional buy-only switch is set on that wallet too.
      </p>
    );
  } else if (setup.nextStep === "not-a-chog-account") {
    body = (
      <p className="text-sm leading-relaxed text-muted">
        The guard doesn&apos;t accept this wallet as the House Chog&apos;s canonical account (see the setup below), so
        buy-only mode can&apos;t be set on it yet.
      </p>
    );
  } else if (setup.buyOnly === undefined) {
    body = (
      <Callout tone="warning" title="This guard has no buy-only mode">
        The AnimrTradeGuard at this address predates buy-only mode. The House Chog trades two-way within your limits
        either way; point NEXT_PUBLIC_TRADE_GUARD_ADDRESS at the buy-only capable deployment to have the switch.
      </Callout>
    );
  } else if (setup.buyOnly) {
    const noWmon = setup.balances.wmon === BigInt(0);
    body = (
      <>
        <div className="rounded-xl border border-success/30 bg-success/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-success">
            <span aria-hidden>✓</span> Buy-only is on, read live from the guard
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Every sale from this vault is refused on-chain (<span className="font-mono text-xs">TradeRejected(&quot;buy-only
            vault&quot;)</span>). The AI can only add to the stack with the vault&apos;s WMON
            {noWmon ? ", so deposit WMON for it to have anything to buy with." : "."}
          </p>
          <p className="mt-1 text-xs text-subtle">
            Vault: <span className="font-mono">{formatAmount(formatUnits(setup.balances.chog, 18), 2)}</span> $CHOG ·{" "}
            <span className="font-mono">{formatAmount(formatUnits(setup.balances.wmon, 18), 4)}</span> WMON
          </p>
        </div>
        {canAct && (
          <button type="button" onClick={() => setBuyOnly(false)} disabled={tx.busy} className="btn btn-ghost mt-3 text-xs">
            Turn buy-only off
          </button>
        )}
      </>
    );
  } else {
    body = (
      <>
        <p className="text-sm leading-relaxed text-muted">
          Buy-only is off: the AI trades two-way within your limits, as the House Chog&apos;s mandate needs (it sells only
          into sharp pumps, and the engine refuses real-money sells into a dip). Optional: one transaction,{" "}
          <code className="font-mono text-foreground">setBuyOnly(vault, true)</code>, makes the guard refuse every sale
          from the next block. It stays tied to you as holder: a sale of the Chog leaves the new holder without it.
        </p>
        {canAct ? (
          <button type="button" onClick={() => setBuyOnly(true)} disabled={tx.busy} className="btn btn-secondary mt-3">
            {tx.busy && tx.progress.origin === "buy-only" && <Spinner />}
            Turn on buy-only
          </button>
        ) : (
          <p className="mt-3 text-sm text-subtle">
            {viewer ? `Switch your wallet to ${appConfig.chain.name} to do this step.` : "Connect the holder's wallet to do this step."}
          </p>
        )}
      </>
    );
  }

  return (
    <section aria-labelledby={headingId} className="card border-accent/30 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">House Chog · Rob this Chog</p>
          <h2 id={headingId} className="mt-1 text-lg font-semibold tracking-tight">
            The House vault: two-way, guarded
          </h2>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted">
            Token {tokenId} is the House Chog: its wallet is the vault the heist room dares visitors to empty. Its AI can
            only trade through the guard, and every swap lands back in the same wallet; buy-only mode is an optional extra
            lock.
          </p>
        </div>
        {setup?.buyOnly === true ? (
          <span className="chip border-success/40 text-success">Buy-only</span>
        ) : setup?.buyOnly === false ? (
          <span className="chip text-muted">Two-way</span>
        ) : null}
      </div>

      {steps.length > 0 && (
        <ol aria-label="House setup" className="mt-4 flex flex-wrap gap-2">
          {steps.map((step, i) => (
            <li
              key={step.id}
              className={`chip ${step.done ? "border-success/40 text-success" : "text-muted"}`}
              aria-label={`${step.title}${step.done ? " (done)" : ""}`}
            >
              <span aria-hidden className="font-mono">
                {step.done ? "✓" : i + 1}
              </span>
              {step.title}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4">{body}</div>
      <TxStatus progress={tx.progress} origin="buy-only" />
    </section>
  );
}
