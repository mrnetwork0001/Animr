"use client";

import { type UseQueryResult, skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { type ReactNode, useId } from "react";
import { type Address, formatUnits, isAddressEqual, zeroAddress } from "viem";
import { useConfig, useConnection, useSwitchChain } from "wagmi";
import { simulateContract, writeContract } from "wagmi/actions";
import { useIsClient } from "@/components/connect-button";
import { ShieldIcon } from "@/components/onchain/guard-guarantees";
import { retryTransient } from "@/components/onchain/queries";
import { describeTxError } from "@/components/onchain/tx-errors";
import { TxStatus, chainId, pollOutcome, useTxFlow } from "@/components/onchain/tx-flow";
import { AddressLink, Callout, Spinner } from "@/components/onchain/ui";
import { appConfig } from "@/lib/config";
import {
  type GuardLimits,
  type GuardOnboarding,
  animrTradeGuardAbi,
  animrTradeGuardAddress,
} from "@/lib/contracts/animr-trade-guard";
import { explorerAddressUrl, formatAmount } from "@/lib/format";
import { walletErrorMessage } from "@/lib/wagmi";
import {
  type GuardState,
  type SourceVerification,
  chogWalletAddress,
  guardKeys,
  readGuardState,
  readHouseVault,
  readSourceVerification,
} from "./queries";

const LABEL = "text-[11px] font-medium uppercase tracking-wider text-subtle";

/**
 * /guard: AnimrTradeGuard as it stands on Monad right now: its address and verified source, the admin, pending admin
 * and operator, the kill switch, the House Chog's vault and the wiring fixed at deployment, all read live.
 * The admin can pause or resume trading here, and a pending admin can accept the handover (wagmi), each shown only to
 * that wallet.
 */
export function GuardStatus({ houseTokenId, houseLabel = null }: { houseTokenId: number | null; houseLabel?: string | null }) {
  const guard = animrTradeGuardAddress;
  if (!guard) {
    return (
      <Callout tone="warning" title="The guard is launching">
        AnimrTradeGuard isn&apos;t configured on this deployment (NEXT_PUBLIC_TRADE_GUARD_ADDRESS). Until it is, every
        Chog trades on paper. What it will enforce is below.
      </Callout>
    );
  }
  return <DeployedGuard guard={guard} houseTokenId={houseTokenId} houseLabel={houseLabel} />;
}

function DeployedGuard({ guard, houseTokenId, houseLabel }: { guard: Address; houseTokenId: number | null; houseLabel: string | null }) {
  const state = useQuery({
    queryKey: guardKeys.state(guard),
    queryFn: () => readGuardState(guard),
    refetchInterval: 30_000,
    retry: retryTransient,
  });
  const source = useQuery({
    queryKey: guardKeys.source(guard),
    queryFn: () => readSourceVerification(guard),
    staleTime: 10 * 60_000,
    retry: 1,
  });
  return (
    <div className="space-y-6">
      <Overview guard={guard} state={state} source={source.data} />
      {state.data && <AdminTools guard={guard} state={state.data} />}
      <HouseVault guard={guard} houseTokenId={houseTokenId} houseLabel={houseLabel} />
      {state.data && <Wiring state={state.data} />}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ overview + roles

function Overview({
  guard,
  state,
  source,
}: {
  guard: Address;
  state: UseQueryResult<GuardState, unknown>;
  source: SourceVerification | undefined;
}) {
  const headingId = useId();
  const data = state.data;
  const explorer = explorerAddressUrl(guard);
  return (
    <section aria-labelledby={headingId} className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Contract · {appConfig.chain.name}</p>
          <h2 id={headingId} className="mt-1 flex items-center gap-2 text-lg font-semibold tracking-tight">
            <ShieldIcon className="size-5 text-accent-strong" />
            AnimrTradeGuard
          </h2>
        </div>
        {data ? (
          data.paused ? (
            <span className="chip border-warning/40 text-warning">
              <span aria-hidden className="size-1.5 rounded-full bg-warning" />
              Paused by the admin
            </span>
          ) : (
            <span className="chip border-success/40 text-success">
              <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-success" />
              Live · trading allowed
            </span>
          )
        ) : null}
      </div>

      <p className="mt-3 font-mono text-sm break-all text-foreground">{guard}</p>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
        {explorer && (
          <a href={explorer} target="_blank" rel="noopener noreferrer" className="font-medium text-accent-strong hover:underline">
            View on {appConfig.chain.blockExplorers?.default.name ?? "the explorer"} ↗
          </a>
        )}
        {source?.match ? (
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="chip border-success/40 text-success hover:border-success"
            title="The deployed bytecode matches the source in contracts/src, compiled with the same settings"
          >
            ✓ Source verified on Sourcify{source.match === "exact_match" ? " · exact match" : ""} ↗
          </a>
        ) : source ? (
          <span className="chip">Source verification pending</span>
        ) : null}
      </p>

      {state.isError && !data ? (
        <div className="mt-5">
          <Callout tone="danger" title="Couldn't read the guard from Monad right now">
            {describeTxError(state.error)}{" "}
            <button
              type="button"
              onClick={() => state.refetch()}
              disabled={state.isFetching}
              className="btn btn-secondary ml-1 px-2.5 py-1 text-xs"
            >
              {state.isFetching ? "Retrying…" : "Retry"}
            </button>
          </Callout>
        </div>
      ) : !data ? (
        <div role="status" className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <span className="sr-only">Reading the guard…</span>
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} aria-hidden className="block h-20 animate-pulse rounded-xl bg-surface-2" />
          ))}
        </div>
      ) : (
        <>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Admin">
              <AddressLink address={data.admin} />
              <Note>
                {data.pendingAdmin
                  ? "Handing over: the pending admin takes over once it accepts."
                  : "Can pause trading and rotate the operator key. Nothing else."}
              </Note>
            </Fact>
            <Fact label="Pending admin">
              {data.pendingAdmin ? (
                <>
                  <AddressLink address={data.pendingAdmin} />
                  <Note>Becomes admin when it calls acceptAdmin() from that wallet.</Note>
                </>
              ) : (
                <>
                  <span className="text-sm text-muted">None</span>
                  <Note>No handover in progress.</Note>
                </>
              )}
            </Fact>
            <Fact label="Operator · the AI's key">
              <AddressLink address={data.operator} />
              <Note>Can only call trade(): bounded swaps whose output lands back in the same wallet.</Note>
            </Fact>
            <Fact label="Kill switch">
              <span className={`text-sm font-semibold ${data.paused ? "text-warning" : "text-success"}`}>
                {data.paused ? "Paused" : "Off · trading allowed"}
              </span>
              <Note>When paused, no vault trades. Settings and funds stay where they are.</Note>
            </Fact>
          </dl>
          <div className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold tracking-wider text-success uppercase">The admin can</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-muted">
                <li>Pause or resume every vault&apos;s AI trading at once.</li>
                <li>Rotate the operator key (never to itself).</li>
                <li>Hand the admin role to another wallet, which must accept.</li>
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold tracking-wider text-danger uppercase">The admin can never</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-muted">
                <li>Move, withdraw or trade anyone&apos;s tokens.</li>
                <li>Change a holder&apos;s limits or buy-only switch.</li>
                <li>Change the pool, router or tokens: they&apos;re fixed at deployment.</li>
              </ul>
            </div>
          </div>
          <p className="mt-4 text-xs text-subtle">
            Read live from {appConfig.chain.name} at block {data.blockNumber.toLocaleString("en-US")}; refreshes every
            30 seconds.
          </p>
        </>
      )}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 p-3">
      <dt className={LABEL}>{label}</dt>
      <dd className="mt-1.5 min-w-0 text-sm">{children}</dd>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <span className="mt-1.5 block text-xs leading-relaxed text-subtle">{children}</span>;
}

// ------------------------------------------------------------------------------------------------ admin tools

/**
 * Accept admin (only for the pending admin's wallet) and Pause / Resume (only for the admin's). Every transaction is
 * simulated from the connected wallet first, then confirmed by re-reading the guard.
 */
function AdminTools({ guard, state }: { guard: Address; state: GuardState }) {
  const isClient = useIsClient();
  const connection = useConnection();
  const config = useConfig();
  const switchChain = useSwitchChain();
  const queryClient = useQueryClient();
  const tx = useTxFlow(() => void queryClient.invalidateQueries({ queryKey: guardKeys.state(guard) }));

  const viewer = isClient && connection.status === "connected" ? connection.address : undefined;
  const isAdmin = Boolean(viewer && isAddressEqual(viewer, state.admin));
  const isPending = Boolean(viewer && state.pendingAdmin && isAddressEqual(viewer, state.pendingAdmin));
  // Shown only to the two wallets that can act (and to a running flow, so its outcome stays visible).
  if (!viewer || (!isAdmin && !isPending && tx.progress.phase === "idle")) return null;
  const wrongChain = connection.chainId !== chainId;

  /** Re-reads the guard until `check` passes (a load-balanced RPC may lag a block). */
  const verify = (check: (fresh: GuardState) => string | undefined) => () =>
    pollOutcome(async () => {
      const fresh = await readGuardState(guard);
      queryClient.setQueryData(guardKeys.state(guard), fresh);
      return check(fresh);
    });

  function acceptAdmin() {
    const account = viewer;
    if (!account) return;
    void tx.run({
      origin: "admin",
      steps: [
        {
          label: "Accept admin",
          send: async () => {
            const { request } = await simulateContract(config, {
              address: guard,
              abi: animrTradeGuardAbi,
              functionName: "acceptAdmin",
              account,
              chainId,
            });
            return writeContract(config, request);
          },
        },
      ],
      verify: verify((fresh) => (isAddressEqual(fresh.admin, account) ? undefined : "The guard doesn't show you as admin yet.")),
      success: "You're the guard's admin now (confirmed on-chain).",
    });
  }

  function setPaused(paused: boolean) {
    const account = viewer;
    if (!account) return;
    void tx.run({
      origin: "admin",
      steps: [
        {
          label: paused ? "Pause trading" : "Resume trading",
          send: async () => {
            const { request } = await simulateContract(config, {
              address: guard,
              abi: animrTradeGuardAbi,
              functionName: "setPaused",
              args: [paused],
              account,
              chainId,
            });
            return writeContract(config, request);
          },
        },
      ],
      verify: verify((fresh) => (fresh.paused === paused ? undefined : "The guard's pause flag hasn't changed yet.")),
      success: paused ? "Trading is paused for every vault (confirmed on-chain)." : "Trading is back on (confirmed on-chain).",
    });
  }

  return (
    <section aria-label="Admin tools" className="card border-accent/40 p-5 sm:p-6">
      <p className="eyebrow">Admin tools · only you see this</p>
      {wrongChain ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
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
      ) : (
        <div className="mt-3 space-y-4">
          {isPending && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-prose text-sm leading-relaxed text-muted">
                This wallet is the guard&apos;s <span className="text-foreground">pending admin</span>. Accept to take
                over the kill switch and operator rotation from the current admin.
              </p>
              <button type="button" onClick={acceptAdmin} disabled={tx.busy} className="btn btn-primary">
                {tx.busy && <Spinner />}
                Accept admin
              </button>
            </div>
          )}
          {isAdmin && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-prose text-sm leading-relaxed text-muted">
                This wallet is the guard&apos;s <span className="text-foreground">admin</span>.{" "}
                {state.paused
                  ? "Trading is paused for every vault. Resuming lets the AI trade within each holder's limits again."
                  : "Pausing stops every vault's AI trades at once. It never moves funds or changes anyone's limits."}
              </p>
              <button
                type="button"
                onClick={() => setPaused(!state.paused)}
                disabled={tx.busy}
                className={`btn ${state.paused ? "btn-primary" : "btn-secondary border-warning/50 text-warning"}`}
              >
                {tx.busy && <Spinner />}
                {state.paused ? "Resume trading" : "Pause all trading"}
              </button>
            </div>
          )}
        </div>
      )}
      <TxStatus progress={tx.progress} origin="admin" />
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ House Chog vault

const pct = (bps: number) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

function describeLimits(limits: GuardLimits): string {
  const minutes = Math.round(limits.minInterval / 60);
  const pace = limits.minInterval === 0 ? "no minimum gap" : minutes >= 1 ? `${minutes} min apart` : `${limits.minInterval} s apart`;
  return `${pct(limits.maxTradeBps)} per trade · ${pct(limits.maxDailyBps)} of the vault per day · ${pace} · ${pct(limits.maxSlippageBps)} max slippage`;
}

const NEXT_STEP: Record<GuardOnboarding["nextStep"], string> = {
  "create-account": "its wallet is being created",
  "not-a-chog-account": "its wallet isn't the canonical Chog wallet",
  "unsupported-owner": "it's held by another token-bound account",
  "grant-guard": "the holder is authorizing the guard",
  configure: "the holder is setting its limits",
  fund: "its vault is being funded",
  ready: "ready",
};

function HouseVault({ guard, houseTokenId, houseLabel }: { guard: Address; houseTokenId: number | null; houseLabel: string | null }) {
  // "CHOG #891 · token 1399": both numbers, as on its own page.
  const name = houseLabel ?? `token ${houseTokenId}`;
  const headingId = useId();
  const tba = houseTokenId === null ? null : chogWalletAddress(houseTokenId);
  const vault = useQuery({
    queryKey: guardKeys.house(guard, tba ?? zeroAddress),
    queryFn: tba ? () => readHouseVault(guard, tba) : skipToken,
    refetchInterval: 30_000,
    retry: retryTransient,
  });

  let body: ReactNode;
  if (houseTokenId === null || !tba) {
    body = (
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted">
        The House Chog is moving in: the team is picking which Chog keeps the vault for{" "}
        <Link href="/heist" className="font-medium text-accent-strong hover:underline">
          Rob this Chog
        </Link>
        . Once it moves in, its AI trades the real $CHOG in its own wallet through this guard: every trade stays inside
        the holder&apos;s limits and lands back in the same wallet, and nothing can be sent out. This card shows it live.
      </p>
    );
  } else if (vault.isError && !vault.data) {
    body = (
      <div className="mt-3">
        <Callout tone="danger" title={`Couldn't read ${name}'s vault right now`}>
          {describeTxError(vault.error)}{" "}
          <button
            type="button"
            onClick={() => vault.refetch()}
            disabled={vault.isFetching}
            className="btn btn-secondary ml-1 px-2.5 py-1 text-xs"
          >
            {vault.isFetching ? "Retrying…" : "Retry"}
          </button>
        </Callout>
      </div>
    );
  } else if (!vault.data) {
    body = <span role="status" aria-label="Reading the House vault…" className="mt-3 block h-24 animate-pulse rounded-xl bg-surface-2" />;
  } else {
    const v = vault.data;
    const live = v.nextStep === "ready";
    body = (
      <>
        <p className="mt-2 text-sm text-muted">
          {!live
            ? `Moving in: ${NEXT_STEP[v.nextStep]}.`
            : v.buyOnly === true
              ? "Live, in buy-only mode: the AI may buy $CHOG with the vault's WMON, and the guard refuses every sale."
              : "Live: the AI trades $CHOG ⇄ WMON within the holder's limits, and every swap lands back in this wallet."}
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Fact label={`${name}'s wallet`}>
            <AddressLink address={tba} />
            <Note>
              {v.account === "ready"
                ? "Deployed and initialized (Tokenbound ERC-6551)."
                : v.account === "uninitialized"
                  ? "Created, not initialized yet."
                  : "Not deployed yet: tokens sent here are safe and show once it is."}
            </Note>
          </Fact>
          <Fact label="Buy-only mode">
            <span
              className={`text-sm font-semibold ${v.buyOnly === true ? "text-success" : v.buyOnly === false ? "text-foreground" : "text-muted"}`}
            >
              {v.buyOnly === true ? "On" : v.buyOnly === false ? "Off" : "Not set yet"}
            </span>
            <Note>
              {v.buyOnly === true
                ? "guard.isBuyOnly(wallet) is true: sales revert with “buy-only vault”."
                : v.buyOnly === false
                  ? "An optional holder switch, off: the AI may buy and sell, within the limits below."
                  : "An optional holder switch, set from the House Chog's page."}
            </Note>
          </Fact>
          <Fact label="Guard authorized">
            <span className={`text-sm font-semibold ${v.guardAuthorized ? "text-success" : "text-muted"}`}>
              {v.guardAuthorized ? "Yes" : "Not yet"}
            </span>
            <Note>Tokenbound&apos;s setPermissions([guard], [true]) from the Chog&apos;s holder.</Note>
          </Fact>
          <Fact label="Limits">
            <span className="text-sm">{v.limits?.enabled ? describeLimits(v.limits) : "Not set yet"}</span>
          </Fact>
          <Fact label="Vault holds">
            <span className="font-mono text-sm tabular-nums">
              {formatAmount(formatUnits(v.balances.chog, 18), 2)} $CHOG
              <br />
              {formatAmount(formatUnits(v.balances.wmon, 18), 4)} WMON
            </span>
          </Fact>
          <Fact label="Holder">
            {v.owner ? <AddressLink address={v.owner} /> : <span className="text-sm text-muted">Read once its wallet exists</span>}
          </Fact>
        </dl>
        <p className="mt-4 text-xs text-subtle">
          <Link href={`/chog/${houseTokenId}`} className="font-medium text-accent-strong hover:underline">
            {name}&apos;s page
          </Link>{" "}
          · try to talk its AI out of the stack on{" "}
          <Link href="/heist" className="font-medium text-accent-strong hover:underline">
            Rob this Chog
          </Link>
          .
        </p>
      </>
    );
  }

  return (
    <section aria-labelledby={headingId} className="card p-5 sm:p-6">
      <p className="eyebrow">The House Chog&apos;s vault</p>
      <h2 id={headingId} className="mt-1 text-lg font-semibold tracking-tight">
        Guarded: the AI trades it, nobody can take it
      </h2>
      {body}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ wiring

function Wiring({ state }: { state: GuardState }) {
  const headingId = useId();
  const { wiring, ceilings } = state;
  // What the app itself trades and computes wallets with (lib/config.ts): the guard must agree.
  const expected: Partial<Record<keyof GuardState["wiring"], Address | undefined>> = {
    chog: appConfig.chogToken,
    chogNft: appConfig.chogNft,
    accountImplementation: appConfig.accountImplementation,
  };
  const rows: { key: keyof GuardState["wiring"]; label: string }[] = [
    { key: "chog", label: "$CHOG token" },
    { key: "wmon", label: "WMON" },
    { key: "pool", label: `Pool · CHOG/WMON, ${wiring.fee / 10_000}% fee` },
    { key: "router", label: "Swap router" },
    { key: "chogNft", label: "Chog Genesis NFT" },
    { key: "registry", label: "ERC-6551 registry" },
    { key: "accountImplementation", label: "Account implementation" },
  ];
  return (
    <section aria-labelledby={headingId} className="card p-5 sm:p-6">
      <p className="eyebrow">Fixed at deployment</p>
      <h2 id={headingId} className="mt-1 text-lg font-semibold tracking-tight">
        One pool, one router, two tokens
      </h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
        These are immutable: no key can point the guard at another venue. trade() takes no recipient, token, router or
        calldata, so every swap is CHOG ⇄ WMON on this pool, back into the same Chog wallet.
      </p>
      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(({ key, label }) => {
          const address = wiring[key] as Address;
          const want = expected[key];
          return (
            <div key={key} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line/60 pb-2">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="flex items-center gap-1.5 text-sm">
                <AddressLink address={address} />
                {want && (
                  <span
                    className={isAddressEqual(want, address) ? "text-success" : "text-warning"}
                    title={isAddressEqual(want, address) ? "Matches the app's config" : "Differs from the app's config"}
                  >
                    {isAddressEqual(want, address) ? "✓" : "≠ app config"}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-subtle">
        Hard ceilings in the contract: at most {pct(ceilings.maxTradeBps)} of a balance per trade,{" "}
        {pct(ceilings.maxDailyBps)} of the vault per day and {pct(ceilings.maxSlippageBps)} slippage, against a{" "}
        {Math.round(ceilings.twapWindow / 60)}-minute TWAP floor. Each holder sets their own limits beneath them.
      </p>
    </section>
  );
}
