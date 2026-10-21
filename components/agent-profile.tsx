"use client";

import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { type Address, erc20Abi, erc721Abi, formatUnits } from "viem";
import { useConnection } from "wagmi";
import {
  type AgentDetailView,
  PROVIDER_TEXT,
  type ProviderLabels,
  formatCallCost,
  isTeeVerified,
  providerLabelOf,
  receiptCostUsd,
} from "@/lib/agent/receipts";
import {
  type AgentRecord,
  type Decision,
  MANUAL_RUN_INTERVAL_MS,
  type Persona,
  type Portfolio,
  type TradingStyle,
} from "@/lib/agent/types";
import { traitSafety } from "@/lib/brand-safety";
import { chogLabel, nameNumberOf } from "@/lib/chog-id";
import { publicClient } from "@/lib/clients";
import { appConfig } from "@/lib/config";
import { computeTokenBoundAccount, getTokenBoundAccountStatus } from "@/lib/erc6551";
import { explorerAddressUrl, formatAmount, formatUsd, shortAddress } from "@/lib/format";
import { fetchNftMetadata } from "@/lib/nft";
import { isContractRevert, isZeroDataError, walletErrorMessage } from "@/lib/wagmi";
import { ActivateAgent } from "./activate-agent";
import { ChogDailyCall } from "./bell/chog-daily-call";
import { BuyPortfolioButton } from "./buy-portfolio-button";
import { ConfigNotice } from "./config-notice";
import { ConnectButton, useIsClient } from "./connect-button";
import { DecisionFeed, TimeAgo, useNow } from "./decision-feed";
import { BrainVsInstinct, TimeMachineTeaser, WildChogCard } from "./dna/chog-instinct";
import { GenomeCard } from "./dna/genome-card";
import { chogThumbUrl } from "./dna/thumb-url";
import { HouseBuyOnly } from "./house-buy-only";
import { HiddenChogNotice } from "./stats/hidden-notice";
import { GuardOnboarding } from "./onchain/guard-onboarding";
import { VaultPanel } from "./onchain/vault-panel";
import { PnlBadge } from "./pnl-badge";
import { Sparkline } from "./sparkline";

const LABEL = "text-[11px] font-medium uppercase tracking-wider text-subtle";

/** Chog Genesis (ids 1-1969) is the collection the trait DNA, the League and the Daily Bell cover. */
const HAS_DNA = appConfig.tokenIdRange.max === BigInt(1969);

/**
 * What the Chog's traits say before (and without) an awake agent, derived on the server from the
 * metadata snapshot: its AI's name (the rule activation applies) and its trait genome's archetype.
 */
export type ChogDna = { name: string; archetype: string; style: TradingStyle };

const STYLE_TONE: Record<TradingStyle, string> = {
  aggressive: "bg-warning/10 text-warning ring-warning/25",
  balanced: "bg-accent/10 text-accent-strong ring-accent/30",
  cautious: "bg-sky-400/10 text-sky-300 ring-sky-400/25",
};

const agentKey = (tokenId: string) => ["/api/agents", tokenId] as const;

// Reverts and "no contract here" are deterministic; only retry transient RPC failures.
const retryTransient = (failureCount: number, error: unknown) =>
  failureCount < 2 && !isContractRevert(error) && !isZeroDataError(error);

class ApiError extends Error {
  status: number;
  retryAfterSec: number | undefined;
  constructor(message: string, status: number, retryAfterSec?: number) {
    super(message);
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const { error, message, retryAfter } = (body ?? {}) as { error?: unknown; message?: unknown; retryAfter?: unknown };
    const header = Number(res.headers.get("retry-after"));
    const seconds = header > 0 ? header : typeof retryAfter === "number" && retryAfter > 0 ? retryAfter : undefined;
    const text = typeof error === "string" ? error : typeof message === "string" ? message : undefined;
    throw new ApiError(text ?? `Request failed (HTTP ${res.status})`, res.status, seconds);
  }
  return body as T;
}

async function fetchAgent(tokenId: string): Promise<AgentDetailView> {
  try {
    const data = await apiFetch<AgentDetailView>(`/api/agents/${tokenId}`);
    if (!data || !Array.isArray(data.decisions)) throw new Error("Unexpected response from the agents API.");
    return data;
  } catch (error) {
    // The contract returns { agent: null } for unknown Chogs; treat a 404 the same way.
    if (error instanceof ApiError && error.status === 404) return { agent: null, decisions: [] };
    throw error;
  }
}

const sameAddress = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

function valueInChog(p: Portfolio, price: number | null | undefined): number | null {
  const chog = Number(p.chog);
  const quote = Number(p.quote);
  if (!Number.isFinite(chog) || !Number.isFinite(quote)) return null;
  if (quote === 0) return chog;
  return price && price > 0 ? chog + quote / price : null;
}

// The mid price, as the server values portfolios (a trade's fill price includes its fee and impact).
const priceOf = (d: Decision) => d.market?.priceQuote ?? d.trade?.price;

/** Portfolio value ($CHOG-equivalent) before the first and after each decision, oldest -> newest. */
function valueHistory(agent: AgentRecord, decisions: Decision[]): number[] {
  const oldestFirst = [...decisions].reverse();
  const oldest = oldestFirst[0];
  // With the full history the series starts at the activation value the PnL is measured against.
  const start =
    decisions.length >= agent.decisions
      ? agent.startValueChog
      : oldest
        ? valueInChog(oldest.portfolioBefore, priceOf(oldest))
        : null;
  return [start, ...oldestFirst.map((d) => valueInChog(d.portfolioAfter, priceOf(d)))].filter(
    (v): v is number => v !== null && Number.isFinite(v),
  );
}

/**
 * Full profile of one Chog: NFT, its ERC-6551 wallet, its trait DNA (genome, Time Machine, Daily Bell
 * call) and, once claimed, its AI agent's performance and thoughts. An unclaimed Chog is "wild": its
 * instinct already trades in the League. `dna`, `metadataName` ("CHOG #1462", from the snapshot), `house`
 * (it is the House Chog, HOUSE_CHOG_TOKEN_ID) and `hidden` (its holder hid it: "Hide my Chog", lib/visibility.ts)
 * come from the server. A hidden Chog keeps its wallet, holder and agent here, but its DNA, replays and Bell call
 * give way to a notice.
 */
export function AgentProfile({
  tokenId,
  dna,
  metadataName: snapshotName,
  house = false,
  hidden = false,
}: {
  tokenId: string;
  dna?: ChogDna;
  metadataName?: string;
  house?: boolean;
  hidden?: boolean;
}) {
  const queryClient = useQueryClient();
  const isClient = useIsClient();
  const connection = useConnection();
  // The server renders "disconnected"; only trust wallet state once hydrated.
  const viewer = isClient && connection.status === "connected" ? connection.address : undefined;

  const nft = appConfig.chogNft;
  const implementation = appConfig.accountImplementation;
  const token = appConfig.chogToken;
  const id = BigInt(tokenId);
  // Chog Genesis ids (1-1969) are safe as numbers; the DNA, Bell and guard components take them so.
  const chogId = Number(tokenId);

  const detail = useQuery({
    queryKey: agentKey(tokenId),
    queryFn: () => fetchAgent(tokenId),
    // An awake agent's feed refreshes every 15s; an unclaimed Chog only needs to notice a claim elsewhere.
    refetchInterval: (query) => (query.state.data?.agent ? 15_000 : 120_000),
  });
  const agent = detail.data?.agent ?? null;
  const decisions = detail.data?.decisions ?? [];

  const metadata = useQuery({
    queryKey: ["nft-metadata", nft, tokenId],
    queryFn: nft ? () => fetchNftMetadata(nft, id) : skipToken,
    staleTime: Infinity,
  });

  const owner = useQuery({
    queryKey: ["nft-owner", nft, tokenId],
    queryFn: nft
      ? () => publicClient.readContract({ address: nft, abi: erc721Abi, functionName: "ownerOf", args: [id] })
      : skipToken,
    staleTime: 30_000,
    retry: retryTransient,
  });
  const notMinted = owner.isError && isContractRevert(owner.error);

  const computedAccount =
    nft && implementation
      ? computeTokenBoundAccount({
          implementation,
          tokenContract: nft,
          tokenId: id,
          chainId: appConfig.chain.id,
          salt: appConfig.salt,
        })
      : undefined;
  const account = computedAccount ?? agent?.account;
  const accountMismatch = Boolean(agent && computedAccount && !sameAddress(agent.account, computedAccount));

  // "Has code" isn't enough: a created Tokenbound proxy is unusable until it's initialized.
  const accountStatus = useQuery({
    queryKey: ["tba-status", account],
    queryFn: account ? () => getTokenBoundAccountStatus(publicClient, account) : skipToken,
    staleTime: 60_000,
    retry: 1,
  });

  const balance = useQuery({
    queryKey: ["tba-chog-balance", token, account],
    queryFn:
      token && account
        ? async () => {
            const [raw, decimals] = await Promise.all([
              publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
              publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
            ]);
            return formatUnits(raw, decimals);
          }
        : skipToken,
    refetchInterval: 30_000,
    retry: retryTransient,
  });

  const refresh = (data?: AgentDetailView) => {
    // A run or claim answers with fresh data; refetching then could bring back the CDN's few-seconds-old copy.
    if (data && Array.isArray(data.decisions)) queryClient.setQueryData(agentKey(tokenId), data);
    else void queryClient.invalidateQueries({ queryKey: agentKey(tokenId) });
    void queryClient.invalidateQueries({ queryKey: ["/api/leaderboard"] });
  };

  const [throttle, setThrottle] = useState<Throttle | null>(null);
  const tick = useMutation({
    mutationFn: () => apiFetch<AgentDetailView>(`/api/agents/${tokenId}/tick`, { method: "POST" }),
    onMutate: () => setThrottle(null),
    onSuccess: (data) => refresh(data),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 429 && error.retryAfterSec) {
        setThrottle({ until: Date.now() + error.retryAfterSec * 1000, seconds: error.retryAfterSec });
      }
      refresh();
    },
  });
  const throttled = tick.error instanceof ApiError && tick.error.status === 429;

  const isOwner = sameAddress(viewer, owner.data);
  const image = metadata.data?.image ?? agent?.image;
  // Two numbers name a Chog: the metadata name marketplaces show ("CHOG #1463") and its token id (2). The header
  // shows both, "CHOG #1463 · token 2"; a collection without "CHOG #" names keeps "Chog #2" plus its marketplace name.
  const marketName = snapshotName ?? metadata.data?.name ?? undefined;
  const named = nameNumberOf(marketName) !== null;
  const heading = named && marketName ? marketName : `Chog #${tokenId}`;
  const label = chogLabel(tokenId, { metadataName: marketName });
  const metadataName = !named && marketName && marketName !== heading ? marketName : undefined;
  // Flagged values in the collection's metadata show under their neutral names (lib/brand-safety.ts).
  const traits = (
    agent
      ? Object.entries(agent.persona.traits ?? {})
      : (metadata.data?.attributes ?? []).map((a) => [a.trait_type, a.value] as const)
  ).flatMap(([key, value]) => {
    const verdict = traitSafety(key, value);
    return verdict.action === "hide" ? [] : [[key, verdict.display] as const];
  });
  // An unclaimed Chog's best first move is watching its instinct trade, not leaving for a marketplace.
  const wildChog = HAS_DNA && Boolean(detail.data) && !agent && !hidden;
  // Its trait DNA, replays and Bell call, unless its holder hid it from Animr's public pages.
  const dnaShown = HAS_DNA && !hidden;

  let activation: ReactNode = null;
  if (detail.data && !agent?.active && computedAccount && isClient) {
    if (!viewer) {
      activation = (
        <Hint>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>Hold {label}? Connect that wallet to claim it and wake its AI.</span>
            {/* ml-auto keeps the button (and its right-aligned panel) on the right when wrapped. */}
            <ConnectButton className="ml-auto" />
          </div>
        </Hint>
      );
    } else if (owner.isPending) {
      activation = <Hint>Checking who holds {label}…</Hint>;
    } else if (notMinted) {
      activation = (
        <Hint>
          Token {tokenId} hasn&apos;t been minted (<code className="font-mono">ownerOf</code> reverted), so nobody can
          activate its AI yet.
        </Hint>
      );
    } else if (owner.isError) {
      activation = (
        <Hint>
          <span className="text-danger">
            Couldn&apos;t read the holder of {label}: {walletErrorMessage(owner.error)}
          </span>{" "}
          <button type="button" onClick={() => owner.refetch()} className="btn btn-secondary ml-1 px-2.5 py-1 text-xs">
            Retry
          </button>
        </Hint>
      );
    } else if (!isOwner) {
      activation = (
        <Hint>
          Only the holder of {label} can activate its AI. The connected wallet (
          <span className="font-mono text-foreground">{shortAddress(viewer)}</span>) doesn&apos;t hold it.
        </Hint>
      );
    } else {
      activation = (
        <ActivateAgent
          tokenId={tokenId}
          account={computedAccount}
          owner={viewer}
          reactivate={Boolean(agent)}
          onActivated={refresh}
        />
      );
    }
  }

  return (
    <div className="space-y-6">
      <ConfigNotice
        keys={["chogNft", "accountImplementation"]}
        title="Setup incomplete: this Chog's wallet, holder check and activation are unavailable"
      />

      <section className="card flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        <ChogImage src={image} tokenId={tokenId} alt={label} pending={metadata.isLoading} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip agent={agent} pending={detail.isPending} failed={detail.isError && !detail.data} wild={HAS_DNA} />
            {agent?.mode === "onchain" && (
              <span
                className="chip border-success/40 text-success"
                title="The AI trades the real $CHOG in this Chog's wallet through AnimrTradeGuard, which can never withdraw."
              >
                Real $CHOG · AnimrTradeGuard
              </span>
            )}
            {agent?.mode === "paper" && (
              <span
                className="chip"
                title="Every trade is simulated at live prices, so no tokens move. Its holder can switch it to real trades through AnimrTradeGuard."
              >
                Paper trading
              </span>
            )}
            {agent?.mode === "paper" && agent.bankroll !== "wallet" && (
              <span
                className="chip border-warning/40 text-warning"
                title="This agent started from a demo bankroll, not from the $CHOG in its wallet."
              >
                Demo bankroll
              </span>
            )}
          </div>
          {/* Both numbers, always: "CHOG #1462 · token 1" (marketplaces show the first, the contract uses the second). */}
          <h1 className="mt-3 flex min-w-0 flex-wrap items-baseline gap-x-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            <span className="min-w-0 truncate">{heading}</span>
            <span className="text-lg font-normal whitespace-nowrap text-muted sm:text-xl">
              <span aria-hidden>· </span>token {tokenId}
            </span>
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            {agent ? (
              <>
                <span className="font-medium text-foreground">{agent.persona.name}</span>
                {dna && <span>· {dna.archetype}</span>}
                <StyleChip style={agent.persona.style} />
              </>
            ) : dna ? (
              <>
                <span className="font-medium text-foreground">{dna.name}</span>
                <span>· {dna.archetype}</span>
                <StyleChip style={dna.style} />
              </>
            ) : (
              <span>Its trading persona is derived from its traits on activation.</span>
            )}
          </p>
          {agent && <BrainLine decisions={decisions} providers={detail.data?.providers} />}
          {(nft || metadataName) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle">
              {nft &&
                (owner.data ? (
                  <>
                    <span>
                      Held by <AddressLink address={owner.data} />
                    </span>
                    {isOwner && <span className="chip border-accent/40 text-accent-strong">You</span>}
                  </>
                ) : notMinted ? (
                  <span className="chip border-danger/40 text-danger">Not minted</span>
                ) : owner.isError ? (
                  <span className="text-danger">Holder unavailable</span>
                ) : (
                  <span>Checking holder…</span>
                ))}
              {metadataName && (
                <>
                  {nft && <span aria-hidden>·</span>}
                  <span>
                    Marketplace name: <span className="font-mono">{metadataName}</span>
                  </span>
                </>
              )}
            </div>
          )}
        </div>
        {wildChog ? (
          <div className="flex flex-col items-start gap-2 sm:max-w-60 sm:items-stretch">
            <Link href={`/replay/${tokenId}`} className="btn btn-primary px-4 py-2.5">
              <span aria-hidden>▶</span> Watch it trade
            </Link>
            <BuyPortfolioButton
              tokenId={tokenId}
              variant="secondary"
              caption="Its trait DNA, wallet and Bell record transfer with the NFT."
            />
          </div>
        ) : (
          <BuyPortfolioButton tokenId={tokenId} className="sm:max-w-60" />
        )}
      </section>

      {activation}

      {/* Phones stack the headline card, the side column (Bell call first), then the rest; from lg the
          side column spans both rows. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr]">
        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
          {detail.isPending ? (
            <div className="card h-72 animate-pulse" role="status">
              <span className="sr-only">Loading agent…</span>
            </div>
          ) : !detail.data ? (
            <section role="alert" className="card border-danger/40 p-6">
              <p className="font-medium text-danger">Couldn&apos;t load this Chog&apos;s agent</p>
              <p className="mt-1 break-words font-mono text-xs text-muted">{detail.error?.message}</p>
              <button
                type="button"
                onClick={() => detail.refetch()}
                disabled={detail.isFetching}
                className="btn btn-secondary mt-4"
              >
                {detail.isFetching ? "Retrying…" : "Try again"}
              </button>
            </section>
          ) : agent ? (
            <>
              <PerformanceCard agent={agent} decisions={decisions} />
              {dnaShown && <BrainVsInstinct agent={agent} />}
            </>
          ) : HAS_DNA ? (
            hidden ? (
              <HiddenChogNotice tokenId={chogId} label={label} />
            ) : (
              <WildChogCard tokenId={chogId} account={account} />
            )
          ) : (
            <section className="rounded-2xl border border-dashed border-line p-6">
              <h2 className="text-lg font-semibold">This Chog&apos;s AI is asleep</h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted">
                <li>
                  Deposit $CHOG into the Chog&apos;s own wallet
                  {account && (
                    <>
                      {" "}
                      (<span className="font-mono text-foreground">{shortAddress(account)}</span>)
                    </>
                  )}
                  . It belongs to the NFT, not to any person, and the agent&apos;s paper portfolio starts from this
                  balance (an empty wallet gets a demo bankroll).
                </li>
                <li>The holder signs one free message to wake its AI agent.</li>
                <li>
                  The agent trades on its own and climbs the leaderboard. Sell the NFT and the trader and its portfolio
                  go with it.
                </li>
              </ol>
            </section>
          )}
        </div>

        <aside className="min-w-0 space-y-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {dnaShown && (
            // A link target: the dashboard's "Its Bell call" goes to /chog/N#bell.
            <div id="bell" className="scroll-mt-28 md:scroll-mt-24">
              <ChogDailyCall tokenId={chogId} />
            </div>
          )}

          <section className="card p-5">
            <h2 className={LABEL}>Chog wallet · ERC-6551</h2>
            {account ? (
              <>
                <p className="mt-2 rounded-xl border border-line bg-surface-2 px-3 py-2 font-mono text-[13px] break-all text-foreground">
                  {account}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <CopyButton value={account} />
                  {explorerAddressUrl(account) && (
                    <a
                      href={explorerAddressUrl(account)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost px-2.5 py-1 text-xs"
                    >
                      Explorer ↗
                    </a>
                  )}
                </div>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-subtle">Account contract</dt>
                    <dd className={`text-right ${accountStatus.data === "uninitialized" ? "text-warning" : ""}`}>
                      {accountStatus.isPending
                        ? "…"
                        : accountStatus.isError
                          ? "Unknown"
                          : accountStatus.data === "ready"
                            ? "Deployed"
                            : accountStatus.data === "uninitialized"
                              ? "Needs setup"
                              : "Not deployed yet"}
                    </dd>
                  </div>
                  {token && (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-subtle">On-chain $CHOG</dt>
                      <dd className="text-right font-mono tabular-nums">
                        {balance.data !== undefined ? formatAmount(balance.data, 2) : balance.isError ? "Unknown" : "…"}
                      </dd>
                    </div>
                  )}
                </dl>
                <p className="mt-3 text-xs leading-relaxed text-subtle">
                  Whoever holds {label} controls this wallet.
                  {accountStatus.data === "none" && " $CHOG sent here before deployment is safe and usable once it is."}
                  {accountStatus.data === "uninitialized" && (
                    <>
                      {" "}
                      It was created but never initialized, so it can&apos;t be used yet:{" "}
                      <Link href={`/app?id=${tokenId}#lookup`} className="text-accent-strong hover:underline">
                        finish its setup
                      </Link>{" "}
                      from the dashboard.
                    </>
                  )}
                </p>
                {accountMismatch && agent && (
                  <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                    The agent was activated for {shortAddress(agent.account)}, which differs from the address computed
                    from the current config. Check NEXT_PUBLIC_TBA_IMPLEMENTATION and NEXT_PUBLIC_TBA_SALT.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Not configured: set NEXT_PUBLIC_CHOG_NFT_ADDRESS and NEXT_PUBLIC_TBA_IMPLEMENTATION to derive this
                Chog&apos;s wallet address.
              </p>
            )}
          </section>

          {/* The vault's real balances and guard status: for its holder, and for everyone once it trades real $CHOG. */}
          {HAS_DNA && computedAccount && (isOwner || agent?.mode === "onchain") && (
            <VaultPanel tba={computedAccount} tokenId={chogId} />
          )}

          {agent && <PersonaCard persona={agent.persona} />}

          {traits.length > 0 && (
            <section className="card p-5">
              <h2 className={LABEL}>Traits</h2>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {traits.map(([key, value], i) => (
                  <li key={`${key}-${i}`} className="chip">
                    <span className="text-subtle">{key}</span> <span className="text-foreground">{value}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-subtle">
                {HAS_DNA
                  ? "These traits compile into its trading genome, so a new holder inherits the same trader."
                  : "The persona is derived from these traits, so a new holder inherits the same trader."}
              </p>
            </section>
          )}
        </aside>

        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-2">
          {agent && (
            <section className="card min-w-0 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">AI thoughts</h2>
                  <p className="text-xs text-subtle">Every decision, newest first. Refreshes every 15s.</p>
                </div>
                {agent.active && agent.mode !== "onchain" && (
                  <ThinkButton
                    pending={tick.isPending}
                    throttle={throttle}
                    lastDecisionAt={agent.lastDecisionAt}
                    onClick={() => tick.mutate()}
                  />
                )}
                {agent.active && agent.mode === "onchain" && (
                  <p className="max-w-56 text-xs text-subtle">
                    Trades real $CHOG, so it thinks on its schedule only: no one can pick the moment it trades.
                  </p>
                )}
              </div>
              <div aria-live="polite">
                {tick.isError &&
                  (throttled ? (
                    // Static text: the per-second countdown lives on the button, outside this live region.
                    <p className="mt-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                      This Chog thought recently, so it can&apos;t think on demand just yet.
                      {tick.error.message && !/^Request failed/.test(tick.error.message) && (
                        <span className="mt-0.5 block text-xs text-muted">{tick.error.message}</span>
                      )}
                    </p>
                  ) : (
                    <p className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                      Couldn&apos;t think right now: {tick.error.message}
                    </p>
                  ))}
              </div>
              <div className="mt-4">
                <DecisionFeed
                  decisions={decisions}
                  providers={detail.data?.providers}
                  emptyHint={
                    agent.active
                      ? "No thoughts yet. Hit “Think now”, or it thinks on its own at the next Daily Bell (15:00 UTC)."
                      : "No thoughts yet. The agent is paused."
                  }
                />
              </div>
            </section>
          )}

          {/* The House Chog's holder: buy-only mode, its extra step (create its wallet -> grant the guard -> limits +
              buy-only -> deposit), next to the guard onboarding below. */}
          {HAS_DNA && house && computedAccount && isOwner && <HouseBuyOnly tokenId={chogId} tba={computedAccount} />}
          {/* The holder's on-chain setup (AnimrTradeGuard; a "launching" card only on a deployment without a guard). */}
          {HAS_DNA && computedAccount && isOwner && (
            <GuardOnboarding tokenId={chogId} tba={computedAccount} owner={owner.data} />
          )}
          {dnaShown && <TimeMachineTeaser tokenId={chogId} />}
          {dnaShown && <GenomeCard tokenId={chogId} hideIdentity />}
          {HAS_DNA && hidden && agent && <HiddenChogNotice tokenId={chogId} label={label} />}
        </div>
      </div>
    </div>
  );
}

/** A 429 from the tick API: when the agent may think again, and the Retry-After it was given. */
type Throttle = { until: number; seconds: number };

function formatWait(seconds: number): string {
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s` : `${seconds}s`;
}

/**
 * "Think now", with a countdown until the API accepts the next manual run (MANUAL_RUN_INTERVAL_MS after the
 * last decision, or a 429's Retry-After). Owns the 1 Hz clock so only the button re-renders.
 */
function ThinkButton({
  pending,
  throttle,
  lastDecisionAt,
  onClick,
}: {
  pending: boolean;
  throttle: Throttle | null;
  lastDecisionAt: string | null;
  onClick: () => void;
}) {
  const now = useNow();
  const fromThrottle =
    throttle && now !== null ? Math.min(throttle.seconds, Math.ceil((throttle.until - now) / 1000)) : 0;
  const nextRunAt = lastDecisionAt ? Date.parse(lastDecisionAt) + MANUAL_RUN_INTERVAL_MS : Number.NaN;
  // Capped at the interval in case this browser's clock runs behind the server's.
  const fromInterval =
    now !== null && Number.isFinite(nextRunAt)
      ? Math.min(MANUAL_RUN_INTERVAL_MS / 1000, Math.ceil((nextRunAt - now) / 1000))
      : 0;
  const waitSec = Math.max(0, fromThrottle, fromInterval);
  return (
    <button type="button" onClick={onClick} disabled={pending || waitSec > 0} className="btn btn-primary">
      {pending && (
        <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {pending ? "Thinking…" : waitSec > 0 ? `Think again in ${formatWait(waitSec)}` : "Think now"}
    </button>
  );
}

function PerformanceCard({ agent, decisions }: { agent: AgentRecord; decisions: Decision[] }) {
  const paper = agent.mode === "paper";
  const simulatedMarket = decisions[0]?.market.source === "mock";
  const history = valueHistory(agent, decisions);
  const first = history[0];
  const last = history[history.length - 1];
  const label =
    history.length >= 2
      ? `Portfolio value in $CHOG-equivalent across ${history.length - 1} decisions, from ${formatAmount(first, 2)} to ${formatAmount(last, 2)}. The dashed line is the starting value.`
      : "Portfolio value in $CHOG-equivalent across decisions";

  return (
    <section className="card p-5 sm:p-6">
      <h2 className="sr-only">Performance</h2>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className={LABEL}>Portfolio value</p>
          <p className="mt-1 font-mono text-3xl tabular-nums">
            {formatAmount(agent.lastValueChog, 2)} <span className="text-base text-muted">$CHOG-eq</span>
          </p>
          <p className="mt-1 text-sm text-subtle">
            ≈ {formatUsd(agent.lastValueUsd)} · started at{" "}
            <span className="font-mono">{formatAmount(agent.startValueChog, 2)}</span>
          </p>
        </div>
        <div className="sm:text-right">
          <p className={LABEL}>Edge vs. holding $CHOG</p>
          <PnlBadge pct={agent.pnlPct} size="lg" className="mt-2" />
        </div>
      </div>

      <Sparkline values={history} baseline={agent.startValueChog} label={label} className="mt-6 h-24" />

      <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
        <Stat label={paper ? "Paper $CHOG" : "$CHOG"}>{formatAmount(agent.portfolio.chog, 2)}</Stat>
        {/* On-chain the quote leg is WMON (wrapped MON, 1:1), the token AnimrTradeGuard swaps against. */}
        <Stat label={paper ? "Paper MON" : "WMON"}>{formatAmount(agent.portfolio.quote, 4)}</Stat>
        <Stat label="Decisions">{agent.decisions}</Stat>
        <Stat label="Last thought">{agent.lastDecisionAt ? <TimeAgo iso={agent.lastDecisionAt} /> : "—"}</Stat>
      </dl>
      <p className="mt-4 text-xs text-subtle">
        Activated <TimeAgo iso={agent.activatedAt} />.{" "}
        {paper ? (
          `Paper portfolio, started from ${
            agent.bankroll === "wallet" ? "the $CHOG in this Chog's wallet" : "a demo bankroll"
          }. Trades are simulated at ${
            simulatedMarket ? "prices from a simulated demo market" : "market prices"
          }, so no tokens move.`
        ) : (
          <>
            Real $CHOG in this Chog&apos;s wallet, traded through AnimrTradeGuard; balances are read on-chain.
            {agent.modeChangedAt && (
              <>
                {" "}
                The edge counts from its switch to on-chain trading, <TimeAgo iso={agent.modeChangedAt} />.
              </>
            )}
          </>
        )}
      </p>
    </section>
  );
}

/**
 * A claimed agent's brain, from its newest LLM receipt: "glm-5.3 · 0G Compute · TEE enclave (TeeML), 0G Foundation ·
 * $0.0018/call". The provider's tier comes from the API's labels (it describes the provider, not a check of the call);
 * "TEE verified" only when that receipt says so (teeVerified === true).
 */
function BrainLine({ decisions, providers }: { decisions: Decision[]; providers?: ProviderLabels }) {
  const latest = decisions.find((decision) => decision.decidedBy === "llm");
  if (!latest) {
    return (
      <p className="mt-1.5 text-xs text-subtle">
        <span className="text-muted">Brain:</span> an LLM on 0G Compute
        {decisions.length > 0 ? " · its recent calls came from its trait instinct (rules) instead" : " · from its first decision"}
      </p>
    );
  }
  const label = providerLabelOf(providers, latest.zg?.provider);
  const cost = receiptCostUsd(latest);
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-subtle">
      <span className="text-muted">Brain:</span>
      <span className="font-medium text-foreground/90">{latest.model ?? "LLM"}</span>
      <span aria-hidden>·</span>
      <span>0G Compute</span>
      {label && (
        <>
          <span aria-hidden>·</span>
          <span title={PROVIDER_TEXT[label.label].long}>
            {PROVIDER_TEXT[label.label].short}
            {label.name && `, ${label.name}`}
          </span>
        </>
      )}
      {cost !== null && (
        <>
          <span aria-hidden>·</span>
          <span className="font-mono tabular-nums" title="What its latest decision cost on 0G Compute">
            {formatCallCost(cost)}/call
          </span>
        </>
      )}
      {isTeeVerified(latest) && <span className="text-success">· TEE verified</span>}
    </p>
  );
}

function PersonaCard({ persona }: { persona: Persona }) {
  return (
    <section className="card p-5">
      <h2 className={LABEL}>Persona</h2>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="text-lg font-semibold">{persona.name}</p>
        <StyleChip style={persona.style} />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">{persona.description}</p>
      <p className="mt-3 text-xs text-subtle">
        Trades at most{" "}
        <span className="font-mono text-foreground">{formatAmount(persona.maxTradeBps / 100, 2)}%</span> of a balance
        per decision.
      </p>
    </section>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className={LABEL}>{label}</dt>
      <dd className="mt-1 font-mono text-sm tabular-nums">{children}</dd>
    </div>
  );
}

function StyleChip({ style }: { style: TradingStyle }) {
  return (
    <span
      className={`rounded px-1.5 py-px text-[10px] uppercase tracking-wider ring-1 ring-inset ${STYLE_TONE[style] ?? STYLE_TONE.balanced}`}
    >
      {style}
    </span>
  );
}

function StatusChip({
  agent,
  pending,
  failed,
  wild,
}: {
  agent: AgentRecord | null;
  pending: boolean;
  failed: boolean;
  /** Unclaimed Chogs with trait DNA aren't asleep: their instinct trades in the League. */
  wild: boolean;
}) {
  const [text, tone] = pending
    ? ["Loading…", "animate-pulse"]
    : failed
      ? ["Status unknown", ""]
      : !agent
        ? wild
          ? ["Wild · trading on instinct", "border-accent/40 text-accent-strong"]
          : ["Not activated", ""]
        : agent.active
          ? ["AI active", "border-success/40 text-success"]
          : ["Paused", "border-warning/40 text-warning"];
  return (
    <span className={`chip ${tone}`}>
      {agent?.active && !pending && <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-success" />}
      {text}
    </span>
  );
}

/** The Chog's face: a 288px copy of its 1000×1000 image first, then the original, then "#id". */
function ChogImage({ src, tokenId, alt, pending }: { src?: string; tokenId: string; alt: string; pending: boolean }) {
  const [failed, setFailed] = useState<string[]>([]);
  const current = (src ? [chogThumbUrl(src, 288), src] : []).find((candidate) => !failed.includes(candidate));
  return (
    <div className="relative size-28 shrink-0 overflow-hidden rounded-2xl bg-linear-to-br from-accent/50 to-accent/5 ring-1 ring-line sm:size-36">
      {current ? (
        // NFT images live on arbitrary hosts (IPFS gateways etc.), so next/image's allowlist doesn't fit.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={current}
          src={current}
          alt={alt}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed((list) => [...list, current])}
          className="size-full object-cover"
        />
      ) : (
        <span
          className={`flex size-full items-center justify-center font-mono text-lg text-white/80 ${pending ? "animate-pulse" : ""}`}
        >
          #{tokenId}
        </span>
      )}
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1500);
  };
  return (
    <button type="button" onClick={copy} className="btn btn-secondary px-2.5 py-1 text-xs">
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy address"}</span>
    </button>
  );
}

function AddressLink({ address }: { address: Address }) {
  const href = explorerAddressUrl(address);
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-muted underline-offset-2 hover:text-foreground hover:underline"
    >
      {shortAddress(address)}
    </a>
  ) : (
    <span className="font-mono text-muted">{shortAddress(address)}</span>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <div className="card px-5 py-4 text-sm leading-relaxed text-muted">{children}</div>;
}

export function AgentProfileSkeleton() {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">Loading Chog…</span>
      <div aria-hidden className="card flex items-center gap-5 p-6">
        <div className="size-28 shrink-0 animate-pulse rounded-2xl bg-surface-2 sm:size-36" />
        <div className="flex-1 space-y-3">
          <div className="h-4 w-24 animate-pulse rounded bg-surface-2" />
          <div className="h-7 w-48 animate-pulse rounded bg-surface-2" />
          <div className="h-4 w-32 animate-pulse rounded bg-surface-2" />
        </div>
      </div>
      <div aria-hidden className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="card h-72 animate-pulse" />
        <div className="card h-48 animate-pulse" />
      </div>
    </div>
  );
}
