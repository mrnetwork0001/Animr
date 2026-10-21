"use client";

import { type UseQueryResult, skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useId } from "react";
import { type Address, erc721Abi, isAddressEqual } from "viem";
import { useConnection, useSwitchChain } from "wagmi";
import { ConnectButton, useIsClient } from "@/components/connect-button";
import type { AgentDetailResponse } from "@/lib/agent/types";
import { publicClient } from "@/lib/clients";
import { appConfig } from "@/lib/config";
import { animrTradeGuardAddress } from "@/lib/contracts/animr-trade-guard";
import { type TokenBoundAccountParams, computeTokenBoundAccount } from "@/lib/erc6551";
import { shortAddress } from "@/lib/format";
import { walletErrorMessage } from "@/lib/wagmi";
import { FundVault } from "./fund-vault";
import { GuardGuarantees, ShieldIcon } from "./guard-guarantees";
import { agentKey, fetchAgentDetail, holderKey, onchainKeys, readOnchainSetup, retryTransient } from "./queries";
import {
  type Ctx,
  ConfigurePanel,
  CreateAccountPanel,
  GoOnchainPanel,
  GrantGuardPanel,
  LivePanel,
  OperatorWarning,
  StopControls,
} from "./setup-panels";
import {
  SETUP_STEPS,
  type SetupState,
  type SetupStep,
  canStop,
  checkSetupOutcome,
  setupState,
  stepStatus,
} from "./setup-steps";
import { describeTxError } from "./tx-errors";
import { TxStatus, chainId, pollOutcome, useTxFlow } from "./tx-flow";
import { AddressLink, Callout } from "./ui";

export type GuardOnboardingProps = {
  tokenId: number;
  /** The Chog's ERC-6551 account (computeTokenBoundAccount with appConfig's implementation and salt). */
  tba: Address;
  /** The Chog's holder if the caller already read ownerOf; read on-chain otherwise. */
  owner?: Address;
};

/**
 * The holder's on-chain setup for a Chog's vault, driven by readGuardOnboarding().nextStep: create the wallet,
 * authorize AnimrTradeGuard, set limits, fund it, switch the agent to on-chain, then Disable / Revoke at any time.
 * Read-only for everyone else. Without NEXT_PUBLIC_TRADE_GUARD_ADDRESS it explains that on-chain mode is launching.
 */
export function GuardOnboarding({ tokenId, tba, owner }: GuardOnboardingProps) {
  const guard = animrTradeGuardAddress;
  if (!guard) return <OnchainLaunching tokenId={tokenId} />;
  return <GuardSetup tokenId={tokenId} tba={tba} ownerHint={owner} guard={guard} />;
}

const STEP_COUNT = SETUP_STEPS.length - 1; // "live" is the outcome, not a step

function accountParams(tokenId: number): TokenBoundAccountParams | undefined {
  const { chogNft, accountImplementation, salt, chain } = appConfig;
  if (!chogNft || !accountImplementation) return undefined;
  return {
    implementation: accountImplementation,
    tokenContract: chogNft,
    tokenId: BigInt(tokenId),
    chainId: chain.id,
    salt,
  };
}

function GuardSetup({
  tokenId,
  tba,
  ownerHint,
  guard,
}: {
  tokenId: number;
  tba: Address;
  ownerHint: Address | undefined;
  guard: Address;
}) {
  const headingId = useId();
  const isClient = useIsClient();
  const connection = useConnection();
  const queryClient = useQueryClient();
  // The server renders "disconnected"; only trust wallet state once hydrated.
  const viewer = isClient && connection.status === "connected" ? connection.address : undefined;
  const wrongChain = viewer !== undefined && connection.chainId !== chainId;

  const setupQuery = useQuery({
    queryKey: onchainKeys.setup(guard, tba),
    queryFn: () => readOnchainSetup(guard, tba),
    refetchInterval: 30_000,
    retry: retryTransient,
  });
  const nft = appConfig.chogNft;
  const holderQuery = useQuery({
    queryKey: holderKey(tokenId),
    queryFn:
      nft && !ownerHint
        ? () =>
            publicClient.readContract({
              address: nft,
              abi: erc721Abi,
              functionName: "ownerOf",
              args: [BigInt(tokenId)],
            })
        : skipToken,
    staleTime: 30_000,
    retry: retryTransient,
  });
  const agentQuery = useQuery({
    queryKey: agentKey(tokenId),
    queryFn: () => fetchAgentDetail(tokenId),
    refetchInterval: 30_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: onchainKeys.all });
    void queryClient.invalidateQueries({ queryKey: agentKey(tokenId) });
  };
  const tx = useTxFlow(refresh);

  const setup = setupQuery.data;
  // The account's owner() once it exists; before that, ownerOf (the same address for a Chog TBA).
  const holder = setup?.owner ?? ownerHint ?? holderQuery.data;
  const isHolder = Boolean(viewer && holder && isAddressEqual(viewer, holder));
  const canAct = isHolder && !wrongChain;
  const actHint = canAct
    ? undefined
    : !viewer
      ? "Connect the holder's wallet to do this step."
      : wrongChain
        ? `Switch to ${appConfig.chain.name} to do this step.`
        : "Only the Chog's holder can do this step.";

  const params = accountParams(tokenId);
  const expectedTba = params ? computeTokenBoundAccount(params) : undefined;
  const tbaMismatch = expectedTba !== undefined && !isAddressEqual(expectedTba, tba);
  const agent = agentQuery.data?.agent ?? null;
  const state = setup ? setupState(setup.nextStep, agent?.mode) : undefined;

  const verify: Ctx["verify"] = (action, expected) => () =>
    pollOutcome(async () => {
      const fresh = await readOnchainSetup(guard, tba);
      queryClient.setQueryData(onchainKeys.setup(guard, tba), fresh);
      return checkSetupOutcome(action, fresh, expected);
    });

  let body: ReactNode;
  if (tbaMismatch) {
    body = (
      <Callout tone="danger" title={`This isn't Chog #${tokenId}'s wallet`}>
        <span className="font-mono">{tba}</span> differs from the account computed for Chog #{tokenId} (
        <span className="font-mono">{expectedTba}</span>). Check NEXT_PUBLIC_TBA_IMPLEMENTATION and
        NEXT_PUBLIC_TBA_SALT.
      </Callout>
    );
  } else if (!setup) {
    body = setupQuery.isError ? (
      <Callout tone="danger" title="Couldn't read this vault's guard setup">
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
      <StepsSkeleton />
    );
  } else if (state?.kind === "blocked") {
    body = <BlockedNotice reason={state.reason} tokenId={tokenId} holder={holder} />;
  } else if (state) {
    const ctx: Ctx = { tokenId, tba, guard, setup, viewer, canAct, actHint, tx, verify };
    const stops = canStop(setup);
    body = (
      <>
        {setup.operatorDirect && <OperatorWarning ctx={ctx} />}
        {setup.paused && (
          <Callout tone="warning" title="Trading is paused by Animr">
            The guard&apos;s global kill switch is on, so no vault trades right now. Your settings are kept, and the AI
            resumes when the pause is lifted. The pause can never move funds.
          </Callout>
        )}
        {agent?.mode === "onchain" && state.step !== "live" && (
          <Callout tone="warning" title="Set to on-chain, but it can't trade">
            The agent is in on-chain mode, but the vault isn&apos;t ready ({stepTitle(state.step).toLowerCase()}), so
            the guard refuses its trades. Finish the step below, or switch it back to paper trading.
          </Callout>
        )}
        <Stepper state={state} ctx={ctx} agentQuery={agentQuery} params={params} />
        {canAct && (stops.disable || stops.revoke) && <StopControls ctx={ctx} />}
      </>
    );
  }

  return (
    <section aria-labelledby={headingId} className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">On-chain trading · AnimrTradeGuard</p>
          <h2 id={headingId} className="mt-1 text-lg font-semibold tracking-tight">
            Let Chog #{tokenId} trade real $CHOG
          </h2>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted">
            Five steps from the holder&apos;s wallet. The AI can then trade this wallet within your limits, but never
            withdraw from it.
          </p>
        </div>
        <SetupChip state={state} paused={setup?.paused} />
      </div>

      <ViewerBar
        tokenId={tokenId}
        isClient={isClient}
        viewer={viewer}
        wrongChain={wrongChain}
        holder={holder}
        holderPending={!holder && (setupQuery.isPending || holderQuery.isLoading)}
        isHolder={isHolder}
      />

      <div className="mt-5 space-y-4">{body}</div>

      <details className="group mt-6 rounded-xl border border-line bg-surface-2/40 px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-muted hover:text-foreground">
          <ShieldIcon className="size-4 text-accent-strong" />
          How the guard protects this wallet
          <span aria-hidden className="ml-auto text-subtle transition-transform group-open:rotate-90">
            ›
          </span>
        </summary>
        <GuardGuarantees variant="plain" headingLevel="h3" className="mt-3" />
      </details>
    </section>
  );
}

function stepTitle(step: SetupStep): string {
  return SETUP_STEPS.find((s) => s.id === step)?.title ?? step;
}

function SetupChip({ state, paused }: { state: SetupState | undefined; paused: boolean | undefined }) {
  if (!state) return null;
  if (state.kind === "blocked") return <span className="chip border-danger/40 text-danger">Blocked</span>;
  if (state.step === "live") {
    return paused ? (
      <span className="chip border-warning/40 text-warning">Paused by Animr</span>
    ) : (
      <span className="chip border-success/40 text-success">
        <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-success" />
        Live · real $CHOG
      </span>
    );
  }
  return (
    <span className="chip border-accent/40 text-accent-strong">
      Step {state.index + 1} of {STEP_COUNT}
    </span>
  );
}

function ViewerBar({
  tokenId,
  isClient,
  viewer,
  wrongChain,
  holder,
  holderPending,
  isHolder,
}: {
  tokenId: number;
  isClient: boolean;
  viewer: Address | undefined;
  wrongChain: boolean;
  holder: Address | undefined;
  holderPending: boolean;
  isHolder: boolean;
}) {
  const switchChain = useSwitchChain();
  if (!isClient) return null;
  if (!viewer) {
    return (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/50 px-4 py-3">
        <p className="text-sm text-muted">
          Hold Chog #{tokenId}? Connect that wallet to set this up. Anyone can follow the setup here.
        </p>
        <ConnectButton className="ml-auto" />
      </div>
    );
  }
  if (wrongChain) {
    return (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
        <p className="text-sm text-warning">Your wallet is on another network. Switch to {appConfig.chain.name}.</p>
        <button
          type="button"
          onClick={() => switchChain.mutate({ chainId })}
          disabled={switchChain.isPending}
          className="btn btn-primary"
        >
          {switchChain.isPending ? "Switching…" : `Switch to ${appConfig.chain.name}`}
        </button>
        {switchChain.isError && <p className="w-full text-xs text-danger">{walletErrorMessage(switchChain.error)}</p>}
      </div>
    );
  }
  if (holderPending) return <p className="mt-4 text-sm text-subtle">Checking who holds Chog #{tokenId}…</p>;
  if (!isHolder) {
    return (
      <p className="mt-4 rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-sm text-muted">
        Read-only: Chog #{tokenId} is held by {holder ? <AddressLink address={holder} /> : "another wallet"}. Only the
        holder can change these settings; the connected wallet (
        <span className="font-mono text-foreground">{shortAddress(viewer)}</span>) can follow along.
      </p>
    );
  }
  return (
    <p className="mt-4 flex items-center gap-2 text-xs text-subtle">
      <span className="chip border-accent/40 text-accent-strong">You hold this Chog</span>
      Every step is a transaction or signature from <span className="font-mono">{shortAddress(viewer)}</span>.
    </p>
  );
}

function Stepper({
  state,
  ctx,
  agentQuery,
  params,
}: {
  state: Extract<SetupState, { kind: "step" }>;
  ctx: Ctx;
  agentQuery: UseQueryResult<AgentDetailResponse>;
  params: TokenBoundAccountParams | undefined;
}) {
  return (
    <ol aria-label="Setup steps">
      {SETUP_STEPS.map((step, i) => {
        const status = stepStatus(step.id, state.step);
        const live = step.id === "live";
        return (
          <li
            key={step.id}
            aria-current={status === "current" ? "step" : undefined}
            className="relative flex gap-3 pb-5 last:pb-0"
          >
            {i < SETUP_STEPS.length - 1 && (
              <span
                aria-hidden
                className={`absolute top-9 bottom-1 left-4 w-px ${status === "done" ? "bg-success/40" : "bg-line"}`}
              />
            )}
            <StepBadge n={i + 1} status={status} live={live} />
            <div className="min-w-0 flex-1 pt-1.5">
              <h3
                className={`text-sm font-semibold ${status === "todo" ? "text-subtle" : status === "done" ? "text-muted" : "text-foreground"}`}
              >
                {step.title}
                {status === "done" && <span className="sr-only"> (done)</span>}
              </h3>
              {status === "current" ? (
                <div className="mt-2">
                  <StepPanel step={step.id} ctx={ctx} agentQuery={agentQuery} params={params} />
                  <TxStatus progress={ctx.tx.progress} origin="step" />
                </div>
              ) : (
                status === "todo" && <p className="mt-0.5 text-xs text-subtle">{step.summary}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StepBadge({ n, status, live }: { n: number; status: "done" | "current" | "todo"; live: boolean }) {
  const tone =
    status === "done" || (live && status === "current")
      ? "border-success/50 bg-success/15 text-success"
      : status === "current"
        ? "border-accent bg-accent/20 text-foreground shadow-[0_0_0_4px_rgb(131_110_249/0.15)]"
        : "border-line bg-surface-2 text-subtle";
  return (
    <span
      aria-hidden
      className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-semibold ${tone}`}
    >
      {status === "done" || (live && status === "current") ? (
        <svg
          viewBox="0 0 16 16"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m3.5 8.5 3 3 6-7" />
        </svg>
      ) : (
        n
      )}
    </span>
  );
}

function StepPanel({
  step,
  ctx,
  agentQuery,
  params,
}: {
  step: SetupStep;
  ctx: Ctx;
  agentQuery: UseQueryResult<AgentDetailResponse>;
  params: TokenBoundAccountParams | undefined;
}) {
  switch (step) {
    case "create-account":
      return <CreateAccountPanel ctx={ctx} params={params} />;
    case "grant-guard":
      return <GrantGuardPanel ctx={ctx} />;
    case "configure":
      return <ConfigurePanel ctx={ctx} />;
    case "fund":
      return (
        <FundVault tba={ctx.tba} viewer={ctx.viewer} canAct={ctx.canAct} balances={ctx.setup.balances} tx={ctx.tx} />
      );
    case "go-onchain":
      return <GoOnchainPanel ctx={ctx} agentQuery={agentQuery} />;
    case "live":
      return <LivePanel ctx={ctx} agentQuery={agentQuery} />;
  }
}

function BlockedNotice({
  reason,
  tokenId,
  holder,
}: {
  reason: "not-a-chog-account" | "unsupported-owner";
  tokenId: number;
  holder: Address | undefined;
}) {
  if (reason === "not-a-chog-account") {
    return (
      <Callout tone="danger" title="Not a Chog's canonical wallet">
        AnimrTradeGuard only accepts the canonical Tokenbound wallet of a Chog (the ERC-6551 registry, Tokenbound&apos;s
        AccountProxy, salt 0). This address isn&apos;t one, so the guard refuses it. Check
        NEXT_PUBLIC_TBA_IMPLEMENTATION and NEXT_PUBLIC_TBA_SALT.
      </Callout>
    );
  }
  return (
    <Callout tone="warning" title="Held by another token-bound account">
      Chog #{tokenId} is held by {holder ? <AddressLink address={holder} /> : "an ERC-6551 account"}, which is itself
      owned by an NFT. The guard refuses nested ownership: selling the NFT above it wouldn&apos;t reset the AI&apos;s
      permission or limits. Move the Chog to a regular wallet to set up on-chain trading. Paper trading still works.
    </Callout>
  );
}

function StepsSkeleton() {
  return (
    <div role="status" className="space-y-4">
      <span className="sr-only">Reading the vault&apos;s setup on-chain…</span>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} aria-hidden className="flex items-center gap-3">
          <div className="size-8 animate-pulse rounded-full bg-surface-2" />
          <div className="h-4 w-48 animate-pulse rounded bg-surface-2" />
        </div>
      ))}
    </div>
  );
}

/** NEXT_PUBLIC_TRADE_GUARD_ADDRESS is unset: say so plainly, and what the guard will guarantee. */
function OnchainLaunching({ tokenId }: { tokenId: number }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow">On-chain trading</p>
        <span className="chip border-warning/40 text-warning">
          <span aria-hidden className="size-1.5 rounded-full bg-warning" />
          Launching
        </span>
      </div>
      <h2 className="mt-1 text-lg font-semibold tracking-tight">On-chain mode is launching — paper trading today</h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
        Chog #{tokenId}&apos;s AI already makes its calls at live prices, but every fill is simulated, so no tokens
        move. Once AnimrTradeGuard is deployed, the holder can let it trade the real $CHOG in this wallet in five steps:
      </p>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
        {SETUP_STEPS.filter((step) => step.id !== "live").map((step, i) => (
          <li key={step.id} className="flex gap-2.5 rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-sm">
            <span className="font-mono text-subtle">{i + 1}</span>
            <span>
              <span className="text-foreground">{step.title}</span>
              <span className="block text-xs text-muted">{step.summary}</span>
            </span>
          </li>
        ))}
      </ol>
      <GuardGuarantees
        variant="plain"
        status="launching"
        headingLevel="h3"
        className="mt-5 border-t border-line pt-5"
      />
    </section>
  );
}
