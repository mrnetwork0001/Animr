"use client";

import { type UseQueryResult, skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { type ReactNode, useId } from "react";
import { type Address, formatUnits, isAddressEqual, zeroAddress } from "viem";
import { useConfig, useConnection, useSwitchChain } from "wagmi";
import { simulateContract, writeContract } from "wagmi/actions";
import { useIsClient } from "@/components/connect-button";
import { retryTransient } from "@/components/onchain/queries";
import { describeTxError } from "@/components/onchain/tx-errors";
import { TxStatus, chainId, pollOutcome, useTxFlow } from "@/components/onchain/tx-flow";
import { Spinner } from "@/components/onchain/ui";
import {
  Badge,
  ExternalIcon,
  GlassCard,
  Kicker,
  PillButton,
  PillLink,
  SectionTitle,
  Skeleton,
  Toast,
  pillClass,
} from "@/components/v2";
import { appConfig } from "@/lib/config";
import {
  type GuardLimits,
  type GuardOnboarding,
  animrTradeGuardAbi,
  animrTradeGuardAddress,
} from "@/lib/contracts/animr-trade-guard";
import { explorerAddressUrl, formatAmount, shortAddress } from "@/lib/format";
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
import { Mark } from "./guarantees";
import "./guard.css";

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
      <section aria-label="Live status" className="v2-section">
        <Toast title="The guard is launching" tone="warning">
          AnimrTradeGuard isn&apos;t configured on this deployment (NEXT_PUBLIC_TRADE_GUARD_ADDRESS). Until it is, every
          Chog trades on paper. What it will enforce is above.
        </Toast>
      </section>
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
    <>
      <Overview guard={guard} state={state} source={source.data} />
      <HouseVault guard={guard} houseTokenId={houseTokenId} houseLabel={houseLabel} />
      {state.data && <Wiring state={state.data} />}
    </>
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
    <section aria-labelledby={headingId} className="v2-section">
      <SectionTitle
        id={headingId}
        kicker={`Live status · ${appConfig.chain.name}`}
        title="Who holds which role, right now"
        action={
          data ? (
            data.paused ? (
              <Badge tone="warning" dot>
                Paused by the admin
              </Badge>
            ) : (
              <Badge tone="success" live>
                Live · trading allowed
              </Badge>
            )
          ) : null
        }
      />
      <GlassCard>
        <div className="guard-contract">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Kicker>AnimrTradeGuard</Kicker>
            <div className="v2-row gap-2">
              {source?.match ? (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="v2-badge v2-badge--success v2-badge--dot"
                  title="The deployed bytecode matches the source in contracts/src, compiled with the same settings"
                >
                  Source verified{source.match === "exact_match" ? " · exact match" : ""}
                  <span className="v2-sr"> on Sourcify (opens in a new tab)</span>
                </a>
              ) : source ? (
                <Badge>Source verification pending</Badge>
              ) : null}
            </div>
          </div>
          <p className="guard-address v2-mono">{guard}</p>
          {explorer && (
            <div>
              <PillLink href={explorer} external variant="glass" size="sm">
                View on {appConfig.chain.blockExplorers?.default.name ?? "the explorer"}
                <ExternalIcon className="v2-btn-icon" />
              </PillLink>
            </div>
          )}
        </div>

        {state.isError && !data ? (
          <Toast
            title="Couldn't read the guard from Monad right now"
            tone="danger"
            action={
              <PillButton variant="glass" size="sm" onClick={() => state.refetch()} disabled={state.isFetching}>
                {state.isFetching ? "Retrying…" : "Retry"}
              </PillButton>
            }
          >
            {describeTxError(state.error)}
          </Toast>
        ) : !data ? (
          <div role="status" className="grid gap-4">
            <span className="v2-sr">Reading the guard…</span>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center justify-between gap-6">
                <Skeleton variant="text" style={{ width: "40%" }} />
                <Skeleton variant="text" style={{ width: 110 }} />
              </div>
            ))}
          </div>
        ) : (
          <>
            <dl className="v2-kv guard-facts">
              <Fact
                label="Admin"
                note={
                  data.pendingAdmin
                    ? "Handing over: the pending admin takes over once it accepts."
                    : "Can pause trading and rotate the operator key. Nothing else."
                }
              >
                <AddressLink address={data.admin} />
              </Fact>
              <Fact
                label="Pending admin"
                note={data.pendingAdmin ? "Becomes admin when it calls acceptAdmin() from that wallet." : "No handover in progress."}
              >
                {data.pendingAdmin ? <AddressLink address={data.pendingAdmin} /> : <span className="text-[var(--v2-nav)]">None</span>}
              </Fact>
              <Fact label="Operator · the AI's key" note="Can only call trade(): bounded swaps whose output lands back in the same wallet.">
                <AddressLink address={data.operator} />
              </Fact>
              <Fact label="Kill switch" note="When paused, no vault trades. Settings and funds stay where they are.">
                {data.paused ? <Badge tone="warning">Paused</Badge> : <Badge tone="success">Off · trading allowed</Badge>}
              </Fact>
            </dl>

            <AdminTools guard={guard} state={data} />

            <div className="guard-lists mt-6 border-t border-[var(--v2-line-soft)] pt-5">
              <div>
                <h3 className="v2-overline text-[var(--v2-teal)]">The admin can</h3>
                <ul className="guard-list">
                  <li>
                    <Mark ok />
                    Pause or resume every vault&apos;s AI trading at once.
                  </li>
                  <li>
                    <Mark ok />
                    Rotate the operator key (never to itself).
                  </li>
                  <li>
                    <Mark ok />
                    Hand the admin role to another wallet, which must accept.
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="v2-overline text-[var(--v2-danger)]">The admin can never</h3>
                <ul className="guard-list">
                  <li>
                    <Mark ok={false} />
                    Move, withdraw or trade anyone&apos;s tokens.
                  </li>
                  <li>
                    <Mark ok={false} />
                    Change a holder&apos;s limits or buy-only switch.
                  </li>
                  <li>
                    <Mark ok={false} />
                    Change the pool, router or tokens: they&apos;re fixed at deployment.
                  </li>
                </ul>
              </div>
            </div>
            <p className="v2-note mt-5">
              Read live from {appConfig.chain.name} at block{" "}
              <span className="v2-num text-[var(--v2-nav)]">{data.blockNumber.toLocaleString("en-US")}</span>; refreshes
              every 30 seconds.
            </p>
          </>
        )}
      </GlassCard>
    </section>
  );
}

function Fact({ label, note, children }: { label: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <dt>
        <span className="text-[var(--v2-ink)]">{label}</span>
        {note != null && <span className="guard-fact-note">{note}</span>}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

/** A short address linked to the explorer (full address on hover). */
function AddressLink({ address }: { address: Address }) {
  const href = explorerAddressUrl(address);
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" title={address} className="v2-link v2-mono inline-flex items-center gap-1">
      {shortAddress(address)}
      <ExternalIcon className="size-3.5" />
      <span className="v2-sr"> (opens the explorer)</span>
    </a>
  ) : (
    <span title={address} className="v2-mono">
      {shortAddress(address)}
    </span>
  );
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
    <section aria-label="Admin tools" className="v2-card v2-card--tight v2-card--feature mt-5">
      <Kicker dot>Admin tools · only you see this</Kicker>
      {wrongChain ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[length:var(--v2-fs-sm)] text-[var(--v2-warning)]">
            Your wallet is on another network. Switch to {appConfig.chain.name}.
          </p>
          <PillButton onClick={() => switchChain.mutate({ chainId })} disabled={switchChain.isPending}>
            {switchChain.isPending ? "Switching…" : `Switch to ${appConfig.chain.name}`}
          </PillButton>
          {switchChain.isError && (
            <p className="w-full text-[length:var(--v2-fs-xs)] text-[var(--v2-danger)]">{walletErrorMessage(switchChain.error)}</p>
          )}
        </div>
      ) : (
        <div className="mt-3 grid gap-4">
          {isPending && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-prose text-[length:var(--v2-fs-sm)] leading-relaxed text-[var(--v2-nav)]">
                This wallet is the guard&apos;s <span className="text-[var(--v2-ink)]">pending admin</span>. Accept to take
                over the kill switch and operator rotation from the current admin.
              </p>
              <button type="button" onClick={acceptAdmin} disabled={tx.busy} className={pillClass("primary")}>
                {tx.busy && <Spinner />}
                Accept admin
              </button>
            </div>
          )}
          {isAdmin && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-prose text-[length:var(--v2-fs-sm)] leading-relaxed text-[var(--v2-nav)]">
                This wallet is the guard&apos;s <span className="text-[var(--v2-ink)]">admin</span>.{" "}
                {state.paused
                  ? "Trading is paused for every vault. Resuming lets the AI trade within each holder's limits again."
                  : "Pausing stops every vault's AI trades at once. It never moves funds or changes anyone's limits."}
              </p>
              <button
                type="button"
                onClick={() => setPaused(!state.paused)}
                disabled={tx.busy}
                className={
                  state.paused
                    ? pillClass("primary")
                    : `${pillClass("glass")} border-[rgb(242_193_107/0.45)] text-[var(--v2-warning)]`
                }
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
      <p className="v2-body max-w-prose text-pretty">
        The House Chog is moving in: the team is picking which Chog keeps the vault for{" "}
        <Link href="/heist" className="v2-link">
          Rob this Chog
        </Link>
        . Once it moves in, its AI trades the real $CHOG in its own wallet through this guard: every trade stays inside
        the holder&apos;s limits and lands back in the same wallet, and nothing can be sent out. This card shows it live.
      </p>
    );
  } else if (vault.isError && !vault.data) {
    body = (
      <Toast
        title={`Couldn't read ${name}'s vault right now`}
        tone="danger"
        action={
          <PillButton variant="glass" size="sm" onClick={() => vault.refetch()} disabled={vault.isFetching}>
            {vault.isFetching ? "Retrying…" : "Retry"}
          </PillButton>
        }
      >
        {describeTxError(vault.error)}
      </Toast>
    );
  } else if (!vault.data) {
    body = (
      <div role="status" aria-label="Reading the House vault…" className="grid gap-4">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-6">
            <Skeleton variant="text" style={{ width: "35%" }} />
            <Skeleton variant="text" style={{ width: 120 }} />
          </div>
        ))}
      </div>
    );
  } else {
    const v = vault.data;
    const live = v.nextStep === "ready";
    body = (
      <>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          {live ? (
            <Badge tone="success" live>
              {v.buyOnly === true ? "Live · buy-only" : "Live · trading both ways"}
            </Badge>
          ) : (
            <Badge tone="warning" dot>
              Moving in
            </Badge>
          )}
          <p className="text-[length:var(--v2-fs-sm)] text-pretty text-[var(--v2-nav)]">
            {!live
              ? `Moving in: ${NEXT_STEP[v.nextStep]}.`
              : v.buyOnly === true
                ? "The AI may buy $CHOG with the vault's WMON, and the guard refuses every sale."
                : "The AI trades $CHOG ⇄ WMON within the holder's limits, and every swap lands back in this wallet."}
          </p>
        </div>
        <dl className="v2-kv guard-facts">
          <Fact
            label={`${name}'s wallet`}
            note={
              v.account === "ready"
                ? "Deployed and initialized (Tokenbound ERC-6551)."
                : v.account === "uninitialized"
                  ? "Created, not initialized yet."
                  : "Not deployed yet: tokens sent here are safe and show once it is."
            }
          >
            <AddressLink address={tba} />
          </Fact>
          <Fact label="Vault holds">
            <span className="block">
              <span className="v2-num text-[15px]">{formatAmount(formatUnits(v.balances.chog, 18), 2)}</span> $CHOG
            </span>
            <span className="block">
              <span className="v2-num text-[15px]">{formatAmount(formatUnits(v.balances.wmon, 18), 4)}</span> WMON
            </span>
          </Fact>
          <Fact label="Limits" note={v.limits?.enabled ? undefined : "The holder sets them from the Chog's page."}>
            {v.limits?.enabled ? describeLimits(v.limits) : <span className="text-[var(--v2-nav)]">Not set yet</span>}
          </Fact>
          <Fact
            label="Buy-only mode"
            note={
              v.buyOnly === true
                ? "guard.isBuyOnly(wallet) is true: sales revert with “buy-only vault”."
                : v.buyOnly === false
                  ? "An optional holder switch, off: the AI may buy and sell, within the limits above."
                  : "An optional holder switch, set from the House Chog's page."
            }
          >
            {v.buyOnly === true ? (
              <Badge tone="teal">On</Badge>
            ) : v.buyOnly === false ? (
              <Badge>Off</Badge>
            ) : (
              <span className="text-[var(--v2-nav)]">Not set yet</span>
            )}
          </Fact>
          <Fact label="Guard authorized" note="Tokenbound's setPermissions([guard], [true]) from the Chog's holder.">
            {v.guardAuthorized ? <Badge tone="success">Yes</Badge> : <span className="text-[var(--v2-nav)]">Not yet</span>}
          </Fact>
          <Fact label="Holder">
            {v.owner ? <AddressLink address={v.owner} /> : <span className="text-[var(--v2-nav)]">Read once its wallet exists</span>}
          </Fact>
        </dl>
        <div className="v2-row mt-6 border-t border-[var(--v2-line-soft)] pt-5">
          <PillLink href={`/chog/${houseTokenId}`} variant="glass" size="sm">
            {name}&apos;s page
          </PillLink>
          <PillLink href="/heist" variant="ghost" size="sm" arrow>
            Try to talk its AI out of the stack
          </PillLink>
        </div>
      </>
    );
  }

  return (
    <section aria-labelledby={headingId} className="v2-section">
      <SectionTitle
        id={headingId}
        kicker="The House Chog's vault"
        title="Guarded: the AI trades it, nobody can take it"
      />
      <GlassCard>{body}</GlassCard>
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
    <section aria-labelledby={headingId} className="v2-section">
      <SectionTitle
        id={headingId}
        kicker="Fixed at deployment"
        title="One pool, one router, two tokens"
        description="These are immutable: no key can point the guard at another venue. trade() takes no recipient, token, router or calldata, so every swap is CHOG ⇄ WMON on this pool, back into the same Chog wallet."
      />
      <GlassCard>
        <dl className="v2-kv">
          {rows.map(({ key, label }) => {
            const address = wiring[key] as Address;
            const want = expected[key];
            const matches = want ? isAddressEqual(want, address) : null;
            return (
              <div key={key}>
                <dt>{label}</dt>
                <dd className="inline-flex flex-wrap items-center justify-end gap-2">
                  <AddressLink address={address} />
                  {matches === true && (
                    <Badge tone="success" className="h-5 px-1.5">
                      <span aria-hidden>✓</span>
                      <span className="v2-sr">Matches the app&apos;s config</span>
                    </Badge>
                  )}
                  {matches === false && <Badge tone="warning">≠ app config</Badge>}
                </dd>
              </div>
            );
          })}
        </dl>
        <p className="v2-note mt-5 border-t border-[var(--v2-line-soft)] pt-4 text-pretty">
          Hard ceilings in the contract: at most {pct(ceilings.maxTradeBps)} of a balance per trade,{" "}
          {pct(ceilings.maxDailyBps)} of the vault per day and {pct(ceilings.maxSlippageBps)} slippage, against a{" "}
          {Math.round(ceilings.twapWindow / 60)}-minute TWAP floor. Each holder sets their own limits beneath them.
        </p>
      </GlassCard>
    </section>
  );
}
