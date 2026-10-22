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
import { Badge } from "./v2/primitives";

// The House Chog's holder card: its setup at a glance plus the optional buy-only switch (setBuyOnlyRequest). The House
// Chog trades two-way through the guard (its mandate buys dips and sells only into sharp pumps; lib/agent/engine.ts
// refuses real-money sells into a dip), so buy-only stays off unless the holder wants every sale refused on-chain.
// Shown to the House Chog's holder on its profile, next to the guard onboarding (create the wallet, grant the guard,
// limits), sharing its on-chain read (onchainKeys.setup). The order: create its wallet -> grant the guard -> limits
// -> deposit.

type Step = { id: string; title: string; done: boolean };

/**
 * `embedded`: rendered as the optional "Buy-only lock" row of the on-chain stepper (GuardOnboarding's `buyOnly`), with
 * no card or step list of its own; otherwise a standalone card.
 */
export function HouseBuyOnly({ tokenId, tba, embedded = false }: { tokenId: number; tba: Address; embedded?: boolean }) {
  const guard = animrTradeGuardAddress;
  if (!guard) return null;
  return <HouseBuyOnlyCard tokenId={tokenId} tba={tba} guard={guard} embedded={embedded} />;
}

function HouseBuyOnlyCard({
  tokenId,
  tba,
  guard,
  embedded,
}: {
  tokenId: number;
  tba: Address;
  guard: Address;
  embedded: boolean;
}) {
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

  const muted = "text-sm leading-relaxed text-[var(--v2-nav)]";
  let body: ReactNode;
  if (!setup) {
    body = setupQuery.isError ? (
      <Callout tone="danger" title="Couldn't read the House vault's guard setup">
        {describeTxError(setupQuery.error)}{" "}
        <button
          type="button"
          onClick={() => setupQuery.refetch()}
          disabled={setupQuery.isFetching}
          className="v2-btn-glass v2-btn--sm ml-1 h-8"
        >
          {setupQuery.isFetching ? "Retrying…" : "Retry"}
        </button>
      </Callout>
    ) : (
      <p role="status" className="text-sm text-[var(--v2-faint)]">
        Reading the House vault on-chain…
      </p>
    );
  } else if (setup.account !== "ready") {
    body = (
      <p className={muted}>
        First create the House Chog&apos;s wallet (step 1 of the setup{embedded ? "" : " below"}): create its wallet →
        grant the guard → limits → deposit. The optional buy-only switch is set on that wallet too.
      </p>
    );
  } else if (setup.nextStep === "not-a-chog-account") {
    body = (
      <p className={muted}>
        The guard doesn&apos;t accept this wallet as the House Chog&apos;s canonical account (see the setup
        {embedded ? "" : " below"}), so buy-only mode can&apos;t be set on it yet.
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
        <div className="rounded-[var(--v2-r-md)] border border-[rgb(98_224_166/0.3)] bg-[rgb(98_224_166/0.05)] p-4">
          <p className="flex items-center gap-2 text-sm font-[520] text-[var(--v2-success)]">
            <Badge tone="success" dot>
              Buy-only on
            </Badge>
            Read live from the guard
          </p>
          <p className={`mt-2 ${muted}`}>
            Every sale from this vault is refused on-chain (
            <span className="v2-mono text-xs">TradeRejected(&quot;buy-only vault&quot;)</span>). The AI can only add to
            the stack with the vault&apos;s WMON
            {noWmon ? ", so deposit WMON for it to have anything to buy with." : "."}
          </p>
          <p className="v2-note mt-1.5">
            Vault: <span className="v2-num">{formatAmount(formatUnits(setup.balances.chog, 18), 2)}</span> $CHOG ·{" "}
            <span className="v2-num">{formatAmount(formatUnits(setup.balances.wmon, 18), 4)}</span> WMON
          </p>
        </div>
        {canAct && (
          <button type="button" onClick={() => setBuyOnly(false)} disabled={tx.busy} className="v2-btn-ghost v2-btn--sm mt-3">
            Turn buy-only off
          </button>
        )}
      </>
    );
  } else {
    body = (
      <>
        <p className={muted}>
          <span className="text-[var(--v2-ink)]">Off: the AI trades two-way</span> within your limits, as the House
          Chog&apos;s mandate needs (it sells only into sharp pumps, and the engine refuses real-money sells into a dip).
          Optional: one transaction, <code className="v2-mono text-[var(--v2-kicker)]">setBuyOnly(vault, true)</code>,
          makes the guard refuse every sale from the next block. It stays tied to you as holder: a sale of the Chog
          leaves the new holder without it.
        </p>
        {canAct ? (
          <button type="button" onClick={() => setBuyOnly(true)} disabled={tx.busy} className="v2-btn-glass v2-btn--sm mt-4">
            {tx.busy && tx.progress.origin === "buy-only" && <Spinner />}
            Turn on buy-only
          </button>
        ) : (
          <p className="mt-3 text-sm text-[var(--v2-faint)]">
            {viewer ? `Switch your wallet to ${appConfig.chain.name} to do this step.` : "Log in with the holder's wallet to do this step."}
          </p>
        )}
      </>
    );
  }

  const modeBadge =
    setup?.buyOnly === true ? (
      <Badge tone="success" dot>
        Buy-only
      </Badge>
    ) : setup?.buyOnly === false ? (
      <Badge dot>Two-way</Badge>
    ) : null;

  if (embedded) {
    return (
      <div>
        <p className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-[var(--v2-faint)]">
          {modeBadge}
          House Chog · token {tokenId}: its wallet is the heist room&apos;s vault.
        </p>
        {body}
        <TxStatus progress={tx.progress} origin="buy-only" />
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className="v2-card v2-card--roomy">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-4">
          <div className="min-w-0">
            <h2 id={headingId} className="v2-h3">
              The House vault: two-way, guarded
            </h2>
            <p className={`mt-2 max-w-[62ch] ${muted}`}>
              Token {tokenId} is the House Chog: its wallet is the vault the heist room dares visitors to empty. Its AI
              can only trade through the guard, and every swap lands back in the same wallet; buy-only mode is an
              optional extra lock.
            </p>
          </div>
        </div>
        {modeBadge}
      </div>

      {steps.length > 0 && (
        <ol aria-label="House setup" className="mt-5 flex flex-wrap gap-2">
          {steps.map((step, i) => (
            <li
              key={step.id}
              className={`v2-chip ${step.done ? "is-active" : ""}`}
              aria-label={`${step.title}${step.done ? " (done)" : ""}`}
            >
              <span aria-hidden className="v2-num">
                {step.done ? "✓" : i + 1}
              </span>
              {step.title}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-5">{body}</div>
      <TxStatus progress={tx.progress} origin="buy-only" />
    </section>
  );
}
