"use client";

import { type UseQueryResult, skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useId } from "react";
import { type Address, erc721Abi, isAddressEqual } from "viem";
import { useConnection, useSwitchChain } from "wagmi";
import { ConnectButton, useIsClient } from "@/components/connect-button";
import { GuardIcon } from "@/components/v2/icons";
import { Badge, IconTile, Meter } from "@/components/v2/primitives";
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
  stepIndex,
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
  /**
   * The House Chog's optional buy-only step (<HouseBuyOnly embedded />), shown as an optional row after the limits.
   * Left off by default: the House Chog trades two-way.
   */
  buyOnly?: ReactNode;
};

/**
 * The holder's on-chain setup for a Chog's vault, driven by readGuardOnboarding().nextStep: create the wallet,
 * authorize AnimrTradeGuard, set limits, fund it, switch the agent to on-chain, then Disable / Revoke at any time.
 * Read-only for everyone else. Without NEXT_PUBLIC_TRADE_GUARD_ADDRESS it explains that on-chain mode is launching.
 */
export function GuardOnboarding({ tokenId, tba, owner, buyOnly }: GuardOnboardingProps) {
  const guard = animrTradeGuardAddress;
  if (!guard) return <OnchainLaunching tokenId={tokenId} />;
  return <GuardSetup tokenId={tokenId} tba={tba} ownerHint={owner} guard={guard} buyOnly={buyOnly} />;
}

/** Guard steps plus "Wake the AI" ("live" is the outcome, not a step; buy-only is optional and uncounted). */
const STEP_COUNT = SETUP_STEPS.length;

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
  buyOnly,
}: {
  tokenId: number;
  tba: Address;
  ownerHint: Address | undefined;
  guard: Address;
  buyOnly?: ReactNode;
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
        <span className="v2-mono">{tba}</span> differs from the account computed for Chog #{tokenId} (
        <span className="v2-mono">{expectedTba}</span>). Check NEXT_PUBLIC_TBA_IMPLEMENTATION and
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
          className="v2-btn-glass v2-btn--sm ml-1 h-8"
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
        <Stepper state={state} ctx={ctx} agentQuery={agentQuery} params={params} buyOnly={buyOnly} />
        {canAct && (stops.disable || stops.revoke) && <StopControls ctx={ctx} />}
      </>
    );
  }

  // The counted steps (the optional buy-only row isn't one).
  const progress =
    state?.kind === "step" ? stepRows(state.step, agent?.active === true, false) : undefined;
  const doneCount = progress?.filter((row) => row.status === "done").length ?? 0;

  return (
    <section aria-labelledby={headingId} className="v2-card v2-card--roomy scroll-mt-28" id="onchain">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <IconTile size="lg" tone="violet" className="max-sm:hidden">
            <GuardIcon />
          </IconTile>
          <div className="min-w-0">
            <p className="v2-kicker">On-chain trading · AnimrTradeGuard</p>
            <h2 id={headingId} className="v2-h2 mt-2 text-[clamp(22px,1.2vw+16px,30px)]">
              Let Chog #{tokenId} trade real $CHOG
            </h2>
            <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-[var(--v2-nav)]">
              Six steps from the holder&apos;s wallet. The AI can then trade this wallet within your limits, but never
              withdraw from it.
            </p>
          </div>
        </div>
        <SetupChip state={state} paused={setup?.paused} doneCount={doneCount} total={progress?.length ?? STEP_COUNT} />
      </div>

      {progress && (
        <div className="mt-6 flex items-center gap-3">
          <Meter
            value={doneCount / progress.length}
            label={`On-chain setup: ${doneCount} of ${progress.length} steps done`}
            className="flex-1"
          />
          <span className="v2-num shrink-0 text-sm text-[var(--v2-nav)]" aria-hidden>
            {doneCount}/{progress.length}
          </span>
        </div>
      )}

      <ViewerBar
        tokenId={tokenId}
        isClient={isClient}
        viewer={viewer}
        wrongChain={wrongChain}
        holder={holder}
        holderPending={!holder && (setupQuery.isPending || holderQuery.isLoading)}
        isHolder={isHolder}
      />

      <div className="mt-6 space-y-4">{body}</div>

      <details className="group mt-6 rounded-[var(--v2-r-lg)] border border-[var(--v2-line)] bg-[rgb(255_255_255/0.015)] px-4 py-3 sm:px-5">
        <summary className="flex cursor-pointer list-none items-center gap-2.5 text-sm font-[480] text-[var(--v2-nav)] hover:text-[var(--v2-ink)] [&::-webkit-details-marker]:hidden">
          <ShieldIcon className="size-4 text-[var(--v2-teal)]" />
          How the guard protects this wallet
          <span aria-hidden className="ml-auto text-[var(--v2-faint)] transition-transform group-open:rotate-90">
            ›
          </span>
        </summary>
        <GuardGuarantees variant="plain" headingLevel="h3" className="mt-4 mb-2" />
      </details>
    </section>
  );
}

function stepTitle(step: SetupStep): string {
  return SETUP_STEPS.find((s) => s.id === step)?.title ?? step;
}

type RowStatus = "done" | "current" | "todo";
type RowId = SetupStep | "wake" | "buy-only";
type Row = { id: RowId; title: string; summary: string; status: RowStatus; optional?: boolean };

/** "Wake the AI": its own row between funding and the switch on-chain (the guard's go-onchain step covers both). */
const WAKE_ROW = {
  title: "Wake the AI",
  summary: "One free signature: the Chog's AI starts thinking, on paper first.",
} as const;

const BUY_ONLY_ROW = {
  title: "Buy-only lock",
  summary: "Optional, and left off for the House Chog: it trades two-way within your limits.",
} as const;

/**
 * The stepper's rows from the guard's next step: the five guard steps with "Wake the AI" split out of the switch
 * on-chain (done once the agent is active), the House Chog's optional buy-only row after the limits, then "Live".
 */
function stepRows(current: SetupStep, agentActive: boolean, withBuyOnly: boolean): Row[] {
  const rows: Row[] = [];
  const at = stepIndex(current);
  const goIndex = stepIndex("go-onchain");
  for (const step of SETUP_STEPS) {
    let status = stepStatus(step.id, current);
    if (step.id === "go-onchain") {
      // The holder can wake the AI (paper trading) before the vault is ready, so an active agent counts at any step.
      const wake: RowStatus = agentActive || at > goIndex ? "done" : at < goIndex ? "todo" : "current";
      rows.push({ id: "wake", ...WAKE_ROW, status: wake });
      if (status === "current" && !agentActive) status = "todo";
    }
    if (step.id === "live") continue; // the outcome, shown by the chip and the live panel
    rows.push({ id: step.id, title: step.title, summary: step.summary, status });
    if (step.id === "configure" && withBuyOnly) {
      rows.push({
        id: "buy-only",
        ...BUY_ONLY_ROW,
        optional: true,
        status: at > stepIndex("configure") ? "current" : "todo",
      });
    }
  }
  return rows;
}

function SetupChip({
  state,
  paused,
  doneCount,
  total,
}: {
  state: SetupState | undefined;
  paused: boolean | undefined;
  doneCount: number;
  total: number;
}) {
  if (!state) return null;
  if (state.kind === "blocked") return <Badge tone="danger">Blocked</Badge>;
  if (state.step === "live") {
    return paused ? (
      <Badge tone="warning" dot>
        Paused by Animr
      </Badge>
    ) : (
      <Badge tone="success" live>
        Live · real $CHOG
      </Badge>
    );
  }
  return (
    <Badge tone="teal">
      Step {Math.min(doneCount + 1, total)} of {total}
    </Badge>
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
  const bar = "mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[var(--v2-r-md)] border px-4 py-3";
  if (!viewer) {
    return (
      <div className={`${bar} border-[var(--v2-line-soft)] bg-[rgb(255_255_255/0.025)]`}>
        <p className="text-sm text-[var(--v2-nav)]">
          Hold Chog #{tokenId}? Connect that wallet to set this up. Anyone can follow the setup here.
        </p>
        <ConnectButton className="ml-auto" />
      </div>
    );
  }
  if (wrongChain) {
    return (
      <div className={`${bar} border-[rgb(242_193_107/0.3)] bg-[rgb(242_193_107/0.07)]`}>
        <p className="text-sm text-[var(--v2-warning)]">Your wallet is on another network. Switch to {appConfig.chain.name}.</p>
        <button
          type="button"
          onClick={() => switchChain.mutate({ chainId })}
          disabled={switchChain.isPending}
          className="v2-btn-primary v2-btn--sm"
        >
          {switchChain.isPending ? "Switching…" : `Switch to ${appConfig.chain.name}`}
        </button>
        {switchChain.isError && (
          <p className="w-full text-xs text-[var(--v2-danger)]">{walletErrorMessage(switchChain.error)}</p>
        )}
      </div>
    );
  }
  if (holderPending) return <p className="mt-5 text-sm text-[var(--v2-faint)]">Checking who holds Chog #{tokenId}…</p>;
  if (!isHolder) {
    return (
      <p className={`${bar} block border-[var(--v2-line-soft)] bg-[rgb(255_255_255/0.025)] text-sm text-[var(--v2-nav)]`}>
        Read-only: Chog #{tokenId} is held by {holder ? <AddressLink address={holder} /> : "another wallet"}. Only the
        holder can change these settings; the connected wallet (
        <span className="v2-mono text-[var(--v2-ink)]">{shortAddress(viewer)}</span>) can follow along.
      </p>
    );
  }
  return (
    <p className="mt-5 flex flex-wrap items-center gap-2 text-xs text-[var(--v2-faint)]">
      <Badge tone="teal" dot>
        You hold this Chog
      </Badge>
      Every step is a transaction or signature from <span className="v2-mono">{shortAddress(viewer)}</span>.
    </p>
  );
}

function Stepper({
  state,
  ctx,
  agentQuery,
  params,
  buyOnly,
}: {
  state: Extract<SetupState, { kind: "step" }>;
  ctx: Ctx;
  agentQuery: UseQueryResult<AgentDetailResponse>;
  params: TokenBoundAccountParams | undefined;
  buyOnly?: ReactNode;
}) {
  const agentActive = agentQuery.data?.agent?.active === true;
  const rows = stepRows(state.step, agentActive, buyOnly != null);
  const live = state.step === "live";
  // The guard's go-onchain step drives both "Wake the AI" and the switch; its panel renders in whichever is current.
  const panelRow: RowId = state.step === "go-onchain" ? (agentActive ? "go-onchain" : "wake") : state.step;
  let n = 0;
  return (
    <>
      <ol aria-label="Setup steps" className="relative">
        {rows.map((row, i) => {
          const number = row.optional ? undefined : ++n;
          const open = row.id === panelRow && row.status === "current";
          const optionalOpen = row.optional && row.status === "current";
          return (
            <li
              key={row.id}
              aria-current={open ? "step" : undefined}
              className="relative flex gap-4 pb-3 last:pb-0"
            >
              {i < rows.length - 1 && (
                <span
                  aria-hidden
                  className={`absolute top-10 bottom-0 left-[17.5px] w-px ${
                    row.status === "done" ? "bg-[rgb(159_240_236/0.45)]" : "bg-[var(--v2-line-soft)]"
                  }`}
                />
              )}
              <StepTile n={number} status={row.status} optional={row.optional} />
              <div
                className={`min-w-0 flex-1 ${
                  open || optionalOpen
                    ? "rounded-[var(--v2-r-lg)] border border-[var(--v2-line)] bg-[rgb(255_255_255/0.025)] p-4 shadow-[var(--v2-glass-glow)] sm:p-5"
                    : "pt-2 pb-3"
                } ${open ? "border-[rgb(169_155_243/0.4)]" : ""}`}
              >
                <h3
                  className={`flex flex-wrap items-center gap-2 text-[15px] font-[520] ${
                    row.status === "todo" ? "text-[var(--v2-faint)]" : row.status === "done" ? "text-[var(--v2-nav)]" : "text-[var(--v2-ink)]"
                  }`}
                >
                  {row.title}
                  {row.optional && <span className="v2-chip h-[22px] px-2 text-[11px]">Optional</span>}
                  {row.status === "done" && <span className="v2-sr"> (done)</span>}
                  {open && <span className="v2-sr"> (current step)</span>}
                </h3>
                {open ? (
                  <div className="mt-3">
                    <StepPanel step={state.step} ctx={ctx} agentQuery={agentQuery} params={params} />
                    <TxStatus progress={ctx.tx.progress} origin="step" />
                  </div>
                ) : optionalOpen ? (
                  <div className="mt-3">{buyOnly}</div>
                ) : (
                  row.status === "todo" && <p className="mt-1 text-[13px] text-[var(--v2-faint)]">{row.summary}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {live && (
        <div className="rounded-[var(--v2-r-lg)] border border-[rgb(98_224_166/0.25)] bg-[rgb(98_224_166/0.03)] p-4 sm:p-5">
          <LivePanel ctx={ctx} agentQuery={agentQuery} />
          <TxStatus progress={ctx.tx.progress} origin="step" />
        </div>
      )}
    </>
  );
}

function StepTile({ n, status, optional }: { n: number | undefined; status: RowStatus; optional?: boolean }) {
  const base =
    "relative z-10 grid size-9 shrink-0 place-items-center rounded-[10px] border text-[13px] v2-num transition-colors";
  if (status === "done") {
    return (
      <span aria-hidden className={`v2-icon-tile v2-icon-tile--sm ${base}`}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3.5 8.5 3 3 6-7" />
        </svg>
      </span>
    );
  }
  if (status === "current" && !optional) {
    return (
      <span aria-hidden className={`v2-icon-tile v2-icon-tile--sm v2-icon-tile--violet ${base} text-[var(--v2-ink)]`}>
        {n}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={`${base} ${optional ? "border-dashed" : ""} border-[var(--v2-line)] bg-[var(--v2-bg)] text-[var(--v2-faint)]`}
    >
      {optional ? "·" : n}
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
      <span className="v2-sr">Reading the vault&apos;s setup on-chain…</span>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} aria-hidden className="flex items-center gap-4">
          <span className="v2-skeleton size-9 rounded-[10px]" />
          <span className="v2-skeleton v2-skeleton--text w-56" />
        </div>
      ))}
    </div>
  );
}

/** NEXT_PUBLIC_TRADE_GUARD_ADDRESS is unset: say so plainly, and what the guard will guarantee. */
function OnchainLaunching({ tokenId }: { tokenId: number }) {
  const rows = [
    ...SETUP_STEPS.filter((step) => step.id !== "live" && step.id !== "go-onchain"),
    { id: "wake", ...WAKE_ROW },
    SETUP_STEPS.find((step) => step.id === "go-onchain")!,
  ];
  return (
    <section className="v2-card v2-card--roomy">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="v2-kicker">On-chain trading</p>
        <Badge tone="warning" dot>
          Launching
        </Badge>
      </div>
      <h2 className="v2-h2 mt-2 text-[clamp(22px,1.2vw+16px,30px)]">On-chain mode is launching — paper trading today</h2>
      <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-[var(--v2-nav)]">
        Chog #{tokenId}&apos;s AI already makes its calls at live prices, but every fill is simulated, so no tokens
        move. Once AnimrTradeGuard is deployed, the holder can let it trade the real $CHOG in this wallet in six steps:
      </p>
      <ol className="mt-5 grid gap-2.5 sm:grid-cols-2">
        {rows.map((step, i) => (
          <li
            key={step.id}
            className="flex gap-3 rounded-[var(--v2-r-md)] border border-[var(--v2-line-soft)] bg-[rgb(255_255_255/0.02)] px-3.5 py-3 text-sm"
          >
            <span className="v2-num text-[var(--v2-faint)]">{i + 1}</span>
            <span>
              <span className="text-[var(--v2-ink)]">{step.title}</span>
              <span className="mt-0.5 block text-xs text-[var(--v2-nav)]">{step.summary}</span>
            </span>
          </li>
        ))}
      </ol>
      <GuardGuarantees
        variant="plain"
        status="launching"
        headingLevel="h3"
        className="mt-6 border-t border-[var(--v2-line-soft)] pt-6"
      />
    </section>
  );
}
