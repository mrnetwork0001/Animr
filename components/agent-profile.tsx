"use client";

import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { type CSSProperties, type ReactNode, useState } from "react";
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
import { UNFUNDED_MESSAGE, isUnfunded } from "@/lib/agent/paper";
import { traitSafety } from "@/lib/brand-safety";
import { chogLabel, nameNumberOf } from "@/lib/chog-id";
import { publicClient } from "@/lib/clients";
import { appConfig } from "@/lib/config";
import { computeTokenBoundAccount, getTokenBoundAccountStatus } from "@/lib/erc6551";
import { explorerAddressUrl, formatAmount, formatPct, formatUsd, shortAddress } from "@/lib/format";
import { fetchNftMetadata } from "@/lib/nft";
import { isContractRevert, isZeroDataError, walletErrorMessage } from "@/lib/wagmi";
import { ActivateAgent } from "./activate-agent";
import { ChogDailyCall } from "./bell/chog-daily-call";
import { BuyPortfolioButton } from "./buy-portfolio-button";
import { ConfigNotice } from "./config-notice";
import { useIsClient } from "./connect-button";
import { DecisionFeed, TimeAgo, useNow } from "./decision-feed";
import { BrainVsInstinct, TimeMachineTeaser, WildChogCard } from "./dna/chog-instinct";
import { GenomeCard } from "./dna/genome-card";
import { chogThumbUrl } from "./dna/thumb-url";
import { HouseBuyOnly } from "./house-buy-only";
import { HiddenChogNotice } from "./stats/hidden-notice";
import { GuardOnboarding } from "./onchain/guard-onboarding";
import { Callout, Spinner } from "./onchain/ui";
import { VaultPanel } from "./onchain/vault-panel";
import { PnlBadge } from "./pnl-badge";
import { AskChog } from "./chog-chat/ask-chog";
import { Sparkline } from "./sparkline";
import { TrophyCabinet } from "./trophies/cabinet";
import { ExternalIcon, RewindIcon, SparkIcon } from "./v2/icons";
import { Badge, PillLink, SectionTitle, StatRow, type V2Stat, pillClass } from "./v2/primitives";

/** Chog Genesis (ids 1-1969) is the collection the trait DNA, the League and the Daily Bell cover. */
const HAS_DNA = appConfig.tokenIdRange.max === BigInt(1969);

/**
 * What the Chog's traits say before (and without) an awake agent, derived on the server from the
 * metadata snapshot: its AI's name (the rule activation applies) and its trait genome's archetype.
 */
export type ChogDna = { name: string; archetype: string; style: TradingStyle };

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
    const { error, message, retryAfter } = (body ?? {}) as {
      error?: unknown;
      message?: unknown;
      retryAfter?: unknown;
    };
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
  // A paper book counts from when it started on the wallet's real balances: earlier runs held nothing.
  const since = agent.mode === "paper" && agent.fundedAt ? Date.parse(agent.fundedAt) : null;
  const own = since === null ? decisions : decisions.filter((d) => Date.parse(d.at) >= since);
  const oldestFirst = [...own].reverse();
  const oldest = oldestFirst[0];
  // With the full history the series starts at the value the PnL is measured against.
  const start =
    decisions.length >= agent.decisions || own.length < decisions.length
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
 * call) and, once claimed, its AI agent's performance and thoughts. An unclaimed Chog already trades on its DNA
 * in the League. `dna`, `metadataName` ("CHOG #1462", from the snapshot), `house`
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
  // A paper agent whose wallet holds no $CHOG or WMON: it doesn't trade until the wallet is funded.
  const unfunded = agent !== null && isUnfunded(agent);

  const metadata = useQuery({
    queryKey: ["nft-metadata", nft, tokenId],
    queryFn: nft ? () => fetchNftMetadata(nft, id) : skipToken,
    staleTime: Infinity,
  });

  const owner = useQuery({
    queryKey: ["nft-owner", nft, tokenId],
    queryFn: nft
      ? () =>
          publicClient.readContract({
            address: nft,
            abi: erc721Abi,
            functionName: "ownerOf",
            args: [id],
          })
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
              publicClient.readContract({
                address: token,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [account],
              }),
              publicClient.readContract({
                address: token,
                abi: erc20Abi,
                functionName: "decimals",
              }),
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
    mutationFn: () =>
      apiFetch<AgentDetailView>(`/api/agents/${tokenId}/tick`, {
        method: "POST",
      }),
    onMutate: () => setThrottle(null),
    onSuccess: (data) => refresh(data),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 429 && error.retryAfterSec) {
        setThrottle({
          until: Date.now() + error.retryAfterSec * 1000,
          seconds: error.retryAfterSec,
        });
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
  // An unclaimed Chog's best first move is watching its DNA trade, not leaving for a marketplace.
  const wildChog = HAS_DNA && Boolean(detail.data) && !agent && !hidden;
  // Its trait DNA, replays and Bell call, unless its holder hid it from Animr's public pages.
  const dnaShown = HAS_DNA && !hidden;

  // The claim card is the holder's alone; everyone else sees nothing here (the header has Connect).
  let activation: ReactNode = null;
  if (detail.data && !agent?.active && computedAccount && isClient && viewer) {
    if (isOwner) {
      activation = (
        <ActivateAgent
          tokenId={tokenId}
          account={computedAccount}
          owner={viewer}
          reactivate={Boolean(agent)}
          onActivated={refresh}
        />
      );
    } else if (owner.isError && !notMinted) {
      activation = (
        <Hint>
          <span className="text-[var(--v2-danger)]">
            Couldn&apos;t read the holder of {label}: {walletErrorMessage(owner.error)}
          </span>{" "}
          <button type="button" onClick={() => owner.refetch()} className={`${pillClass("glass", "sm")} ml-1 h-8`}>
            Retry
          </button>
        </Hint>
      );
    }
  }

  const style = agent?.persona.style ?? dna?.style;
  const latestLlm = decisions.find((decision) => decision.decidedBy === "llm");
  const walletChog =
    !token || !account
      ? "—"
      : balance.data !== undefined
        ? formatAmount(balance.data, 2)
        : balance.isError
          ? "Unknown"
          : "…";
  const accountText = !account
    ? "Not configured"
    : accountStatus.isPending
      ? "…"
      : accountStatus.isError
        ? "Unknown"
        : accountStatus.data === "ready"
          ? "Deployed"
          : accountStatus.data === "uninitialized"
            ? "Needs setup"
            : "Not deployed yet";
  // Claimed Chogs only: an unclaimed one's header and wallet card already say all of it.
  const stats: V2Stat[] | null = agent
    ? [
        {
          key: "wallet",
          label: "Wallet $CHOG",
          hint: "on-chain",
          value: walletChog,
        },
        {
          key: "edge",
          label: "vs holding",
          value: unfunded ? "—" : formatPct(Math.abs(agent.pnlPct) < 0.005 ? 0 : agent.pnlPct),
          tone: unfunded ? undefined : agent.pnlPct >= 0.005 ? "up" : agent.pnlPct <= -0.005 ? "down" : undefined,
        },
        {
          key: "decisions",
          label: "Decisions",
          value: formatAmount(agent.decisions, 0),
        },
      ]
    : null;

  return (
    <div className="space-y-6">
      <ConfigNotice
        keys={["chogNft", "accountImplementation"]}
        title="Setup incomplete: this Chog's wallet, holder check and activation are unavailable"
      />

      {/* ---- Portrait header: CHOG #n · token id, its AI's persona and genome, the actions. */}
      <header className="relative grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-8 xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:items-end xl:gap-12">
        <ChogImage src={image} tokenId={tokenId} alt={label} pending={metadata.isLoading} />

        <div className="min-w-0">
          {/* An unclaimed Chog gets no status badge: the card below says it trades on its DNA. */}
          {(agent || !HAS_DNA) && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <StatusBadge agent={agent} pending={detail.isPending} failed={detail.isError && !detail.data} />
              {agent?.mode === "onchain" && (
                <span title="The AI trades the real $CHOG in this Chog's wallet through AnimrTradeGuard, which can never withdraw.">
                  <Badge tone="success" dot>
                    Real $CHOG · AnimrTradeGuard
                  </Badge>
                </span>
              )}
              {agent?.mode === "paper" && (
                <span title="Every trade is simulated at live prices, so no tokens move. Its holder can switch it to real trades through AnimrTradeGuard.">
                  <Badge dot>Paper trading</Badge>
                </span>
              )}
            </div>
          )}

          {/* Both numbers, always: "CHOG #1462 · token 1" (marketplaces show the first, the contract uses the second). */}
          <h1 className="v2-h1 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-[clamp(38px,3.6vw+18px,68px)]">
            <span className="v2-ink-fade min-w-0 break-words">{heading}</span>
            <span className="v2-num text-[0.42em] tracking-normal whitespace-nowrap text-[var(--v2-faint)]">
              <span aria-hidden>· </span>token {tokenId}
            </span>
          </h1>

          <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[length:var(--v2-fs-lead)] text-[var(--v2-nav)]">
            {agent || dna ? (
              <>
                <span className="font-[480] text-[var(--v2-ink)]">{agent?.persona.name ?? dna?.name}</span>
                {dna && <Dot />}
                {dna && <span>{dna.archetype}</span>}
                {style && <Dot />}
                {style && <span>{STYLE_LABEL[style] ?? style}</span>}
              </>
            ) : (
              <span>Its trading persona is derived from its traits on activation.</span>
            )}
          </p>

          {(nft || metadataName) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-[var(--v2-faint)]">
              {nft &&
                (owner.data ? (
                  <>
                    <span>
                      Held by <AddressLink address={owner.data} />
                    </span>
                    {isOwner && <Badge tone="teal">You</Badge>}
                  </>
                ) : notMinted ? (
                  <Badge tone="danger">Not minted</Badge>
                ) : owner.isError ? (
                  <span className="text-[var(--v2-danger)]">Holder unavailable</span>
                ) : (
                  <span>Checking holder…</span>
                ))}
              {metadataName && (
                <>
                  {nft && <span aria-hidden>·</span>}
                  <span>
                    Marketplace name: <span className="v2-mono">{metadataName}</span>
                  </span>
                </>
              )}
            </div>
          )}
          {agent && (
            <BrainLine latest={latestLlm} hasDecisions={decisions.length > 0} providers={detail.data?.providers} />
          )}
        </div>

        <div className="flex flex-col items-start gap-3 sm:col-span-2 sm:flex-row sm:flex-wrap sm:items-start xl:col-span-1 xl:flex-col xl:items-stretch">
          {wildChog ? (
            <>
              {/* Its holder's one primary action is claiming the AI (the card below), so this one turns glass. */}
              <PillLink href={`/replay/${tokenId}`} variant={isOwner ? "glass" : "hero"} arrow>
                Watch it trade
              </PillLink>
              <BuyPortfolioButton
                tokenId={tokenId}
                variant="secondary"
                caption="Its trading DNA, wallet and Bell record go with the NFT."
              />
            </>
          ) : (
            <>
              <BuyPortfolioButton tokenId={tokenId} />
              {dnaShown && (
                <PillLink href={`/replay/${tokenId}`} variant="glass" className="xl:order-first">
                  <RewindIcon className="v2-btn-icon" />
                  Time Machine
                </PillLink>
              )}
            </>
          )}
        </div>
      </header>

      {stats && <StatRow stats={stats} size="sm" boxed className="!mt-8" />}

      {activation}

      {/* Phones stack the main column's first block, the side column (Bell call first), then the rest; from lg the
          side column spans both rows. */}
      <div className="grid items-start gap-6 pt-2 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:grid-rows-[auto_1fr]">
        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1">
          {detail.isPending ? (
            <div role="status" className="v2-card space-y-4">
              <span className="v2-sr">Loading agent…</span>
              <span aria-hidden className="v2-skeleton v2-skeleton--text w-32" />
              <span aria-hidden className="v2-skeleton v2-skeleton--title w-64" />
              <span aria-hidden className="v2-skeleton h-36" />
            </div>
          ) : !detail.data ? (
            <Callout tone="danger" title="Couldn't load this Chog's agent">
              <span className="v2-mono text-xs break-words">{detail.error?.message}</span>
              <span className="mt-3 block">
                <button
                  type="button"
                  onClick={() => detail.refetch()}
                  disabled={detail.isFetching}
                  className={pillClass("glass", "sm")}
                >
                  {detail.isFetching ? "Retrying…" : "Try again"}
                </button>
              </span>
            </Callout>
          ) : agent ? (
            <>
              {unfunded ? (
                <FundWalletCard account={agent.account} />
              ) : (
                <PerformanceCard agent={agent} decisions={decisions} />
              )}
              {dnaShown && !unfunded && <BrainVsInstinct agent={agent} />}
            </>
          ) : HAS_DNA ? (
            hidden ? (
              <HiddenChogNotice tokenId={chogId} label={label} />
            ) : (
              <WildChogCard tokenId={chogId} account={account} isOwner={isOwner} />
            )
          ) : (
            <section aria-labelledby="asleep-title" className="v2-card">
              <h2 id="asleep-title" className="v2-h3">
                This Chog&apos;s AI is asleep
              </h2>
              <ol className="mt-4 space-y-3 text-[15px] leading-relaxed text-[var(--v2-nav)]">
                {[
                  <>
                    Deposit $CHOG into the Chog&apos;s own wallet
                    {account && (
                      <>
                        {" "}
                        (<span className="v2-mono text-[var(--v2-ink)]">{shortAddress(account)}</span>)
                      </>
                    )}
                    . It belongs to the NFT, not to any person, and the agent&apos;s paper trades start from this real
                    balance. With an empty wallet it waits until you fund it.
                  </>,
                  <>The holder signs one free message to wake its AI agent.</>,
                  <>
                    The agent trades on its own and climbs the leaderboard. Sell the NFT and the trader and its
                    portfolio go with it.
                  </>,
                ].map((item, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="v2-num mt-px text-[var(--v2-teal)]">{i + 1}</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <aside
          aria-label="Wallet, Bell call and traits"
          className="min-w-0 space-y-6 lg:col-start-2 lg:row-span-2 lg:row-start-1"
        >
          {dnaShown && (
            // A link target: the dashboard's "Its Bell call" goes to /chog/N#bell.
            <div id="bell" className="scroll-mt-28 md:scroll-mt-24">
              <ChogDailyCall tokenId={chogId} />
            </div>
          )}

          <section aria-labelledby="wallet-title" className="v2-card">
            <h2 id="wallet-title" className="v2-h3">
              Wallet
            </h2>
            <p className="v2-note mt-1">ERC-6551 account</p>
            {account ? (
              <>
                <p className="v2-mono mt-4 rounded-[var(--v2-r-md)] border border-[var(--v2-line-soft)] bg-[rgb(255_255_255/0.03)] px-3.5 py-2.5 text-[13px] leading-relaxed break-all text-[var(--v2-ink)]">
                  {account}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <CopyButton value={account} />
                  {explorerAddressUrl(account) && (
                    <a
                      href={explorerAddressUrl(account)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${pillClass("glass", "sm")} h-8 px-3 text-xs`}
                    >
                      Explorer
                      <ExternalIcon className="size-3.5" />
                    </a>
                  )}
                </div>
                <dl className="v2-kv mt-5">
                  <div>
                    <dt>Account contract</dt>
                    <dd className={accountStatus.data === "uninitialized" ? "text-[var(--v2-warning)]" : ""}>
                      {accountText}
                    </dd>
                  </div>
                  {token && (
                    <div>
                      <dt>On-chain $CHOG</dt>
                      <dd className="v2-num text-[15px]">{walletChog}</dd>
                    </div>
                  )}
                </dl>
                <p className="v2-note mt-3">
                  Whoever holds {label} controls this wallet.
                  {accountStatus.data === "none" && " $CHOG sent here before deployment is safe and usable once it is."}
                  {accountStatus.data === "uninitialized" && (
                    <>
                      {" "}
                      It was created but never initialized, so it can&apos;t be used yet:{" "}
                      <Link href={`/app?id=${tokenId}#lookup`} className="v2-link">
                        finish its setup
                      </Link>
                      .
                    </>
                  )}
                </p>
                {accountMismatch && agent && (
                  <div className="mt-3">
                    <Callout tone="warning" title="Account mismatch">
                      The agent was activated for {shortAddress(agent.account)}, which differs from the address computed
                      from the current config. Check NEXT_PUBLIC_TBA_IMPLEMENTATION and NEXT_PUBLIC_TBA_SALT.
                    </Callout>
                  </div>
                )}
              </>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-[var(--v2-nav)]">
                Not configured: set NEXT_PUBLIC_CHOG_NFT_ADDRESS and NEXT_PUBLIC_TBA_IMPLEMENTATION to derive this
                Chog&apos;s wallet address.
              </p>
            )}
          </section>

          <TrophyCabinet account={computedAccount} />

          {/* The vault's real balances and guard status: for its holder, and for everyone once it trades real $CHOG. */}
          {HAS_DNA && computedAccount && (isOwner || agent?.mode === "onchain") && (
            <VaultPanel tba={computedAccount} tokenId={chogId} />
          )}

          {agent && <PersonaCard persona={agent.persona} />}

          {traits.length > 0 && (
            <section aria-labelledby="traits-title" className="v2-card">
              <h2 id="traits-title" className="v2-h3">
                Traits
              </h2>
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {traits.map(([key, value], i) => (
                  <li key={`${key}-${i}`} className="v2-chip">
                    <span className="text-[var(--v2-faint)]">{key}</span>{" "}
                    <span className="text-[var(--v2-ink)]">{value}</span>
                  </li>
                ))}
              </ul>
              <p className="v2-note mt-4">
                {HAS_DNA
                  ? "These traits compile into its trading DNA, so a new holder inherits the same trader."
                  : "The persona is derived from these traits, so a new holder inherits the same trader."}
              </p>
            </section>
          )}
        </aside>

        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-2">
          {agent && (
            <section aria-labelledby="thoughts-title" className="v2-card v2-card--roomy min-w-0 max-sm:px-3.5">
              <SectionTitle
                id="thoughts-title"
                kicker="AI thoughts"
                title="Every decision, with its receipt"
                description="Newest first, refreshed every 15s. LLM calls carry their 0G Compute receipt: model, provider tier and cost."
                className="!mb-5"
                action={
                  agent.active && agent.mode !== "onchain" ? (
                    <ThinkButton
                      pending={tick.isPending}
                      throttle={throttle}
                      lastDecisionAt={agent.lastDecisionAt}
                      onClick={() => tick.mutate()}
                    />
                  ) : agent.active && agent.mode === "onchain" ? (
                    <p className="v2-note max-w-60">
                      Trades real $CHOG, so it thinks on its schedule only: no one can pick the moment it trades.
                    </p>
                  ) : undefined
                }
              />
              <div aria-live="polite">
                {tick.isError && (
                  <div className="mb-4">
                    {throttled ? (
                      // Static text: the per-second countdown lives on the button, outside this live region.
                      <Callout tone="warning" title="This Chog thought recently">
                        It can&apos;t think on demand just yet.
                        {tick.error.message && !/^Request failed/.test(tick.error.message) && (
                          <span className="mt-0.5 block text-xs">{tick.error.message}</span>
                        )}
                      </Callout>
                    ) : (
                      <Callout tone="danger" title="Couldn't think right now">
                        {tick.error.message}
                      </Callout>
                    )}
                  </div>
                )}
              </div>
              <DecisionFeed
                decisions={decisions}
                providers={detail.data?.providers}
                emptyHint={
                  !agent.active
                    ? "The agent is paused."
                    : unfunded
                      ? `${UNFUNDED_MESSAGE}: it has nothing to trade yet.`
                      : "Hit “Think now”, or it thinks on its own at the next Daily Bell (15:00 UTC)."
                }
              />
            </section>
          )}

          {/* The holder's on-chain setup (AnimrTradeGuard; a "launching" card only on a deployment without a guard). The
              House Chog's holder also gets the optional buy-only row, left off: the House Chog trades two-way. */}
          {HAS_DNA && computedAccount && isOwner && (
            <GuardOnboarding
              tokenId={chogId}
              tba={computedAccount}
              owner={owner.data}
              buyOnly={house ? <HouseBuyOnly tokenId={chogId} tba={computedAccount} embedded /> : undefined}
            />
          )}
          {dnaShown && <TimeMachineTeaser tokenId={chogId} />}
          {dnaShown && <GenomeCard tokenId={chogId} hideIdentity />}
          {dnaShown && <AskChog tokenId={chogId} viewer={viewer} />}
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
    <button type="button" onClick={onClick} disabled={pending || waitSec > 0} className={pillClass("glass", "sm")}>
      {pending ? <Spinner /> : <SparkIcon className="v2-btn-icon text-[var(--v2-teal)]" />}
      {pending ? "Thinking…" : waitSec > 0 ? `Think again in ${formatWait(waitSec)}` : "Think now"}
    </button>
  );
}

/**
 * A paper agent whose wallet holds no $CHOG or WMON. There is no invented bankroll: its paper trades start from the
 * wallet's real balances, so it waits. Its next run (hourly, or "Think now") re-reads the wallet and starts.
 */
function FundWalletCard({ account }: { account: Address }) {
  return (
    <section aria-labelledby="fund-title" className="v2-card v2-card--roomy">
      <h2 id="fund-title" className="v2-h3">
        {UNFUNDED_MESSAGE}
      </h2>
      <p className="mt-3 text-[15px] leading-relaxed text-[var(--v2-nav)]">
        Its AI paper-trades the real $CHOG and WMON in this Chog&apos;s wallet, and the wallet holds none. Send $CHOG
        or WMON to <span className="v2-mono text-[var(--v2-ink)]">{shortAddress(account)}</span>: its next run starts
        from that balance and ranks it vs holding.
      </p>
      <p className="v2-note mt-4">Until then it doesn&apos;t trade, and the leaderboard shows no result for it.</p>
    </section>
  );
}

function PerformanceCard({ agent, decisions }: { agent: AgentRecord; decisions: Decision[] }) {
  const paper = agent.mode === "paper";
  const history = valueHistory(agent, decisions);
  const first = history[0];
  const last = history[history.length - 1];
  const label =
    history.length >= 2
      ? `Portfolio value in $CHOG across ${history.length - 1} decisions, from ${formatAmount(first, 2)} to ${formatAmount(last, 2)}. The dashed line is the starting value.`
      : "Portfolio value in $CHOG across decisions";

  return (
    <section aria-labelledby="performance-title" className="v2-card v2-card--feature v2-card--roomy">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="v2-kicker">Portfolio value</p>
          <h2 id="performance-title" className="v2-sr">
            Performance
          </h2>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
            <span className="v2-num text-[length:var(--v2-fs-stat)] leading-none text-[var(--v2-ink)]">
              {formatAmount(agent.lastValueChog, 2)}
            </span>
            <span className="text-[15px] text-[var(--v2-nav)]">$CHOG value</span>
          </p>
          <p className="mt-2 text-[13px] text-[var(--v2-faint)]">
            ≈ {formatUsd(agent.lastValueUsd)} · started at{" "}
            <span className="v2-num text-[var(--v2-nav)]">{formatAmount(agent.startValueChog, 2)}</span>
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-[13px] text-[var(--v2-nav)]">vs holding $CHOG</p>
          <PnlBadge pct={agent.pnlPct} size="lg" className="mt-2" />
        </div>
      </div>

      <Sparkline values={history} baseline={agent.startValueChog} label={label} className="mt-7 h-32 sm:h-40" />
      <ul className="v2-legend mt-4" aria-hidden>
        <li>
          <span className="v2-legend-swatch" />
          Portfolio value
        </li>
        <li>
          <span className="v2-legend-swatch" style={{ "--v2-swatch": "var(--v2-chart-2)" } as CSSProperties} />
          Starting value
        </li>
      </ul>

      <StatRow
        size="sm"
        className="mt-6 border-t border-[var(--v2-line-soft)] pt-5"
        stats={[
          {
            key: "chog",
            label: paper ? "Paper $CHOG" : "$CHOG",
            value: formatAmount(agent.portfolio.chog, 2),
          },
          // On-chain the quote leg is WMON (wrapped MON, 1:1), the token AnimrTradeGuard swaps against.
          {
            key: "quote",
            label: paper ? "Paper MON" : "WMON",
            value: formatAmount(agent.portfolio.quote, 4),
          },
          {
            key: "since",
            label: "Activated",
            value: <TimeAgo iso={agent.activatedAt} />,
          },
        ]}
      />
      <p className="v2-note mt-5">
        {paper ? (
          <>
            Paper book, started from the real $CHOG and WMON in this Chog&apos;s wallet
            {agent.fundedAt && (
              <>
                {" "}
                <TimeAgo iso={agent.fundedAt} />
              </>
            )}
            . Trades are simulated at market prices, so no tokens move.
          </>
        ) : (
          <>
            Real $CHOG in this Chog&apos;s wallet, traded through AnimrTradeGuard; balances are read on-chain.
            {agent.modeChangedAt && (
              <>
                {" "}
                The result vs holding counts from its switch to on-chain trading, <TimeAgo iso={agent.modeChangedAt} />.
              </>
            )}
          </>
        )}
      </p>
    </section>
  );
}

/**
 * A claimed agent's brain, from its newest LLM receipt, as chips: "<model> · 0G Compute · <provider tier> · <cost from
 * that receipt>/call" (model, tier and cost are read from the receipt, never fixed here). The provider's tier comes from the API's labels (it describes the provider, not a check of the call);
 * "TEE verified" only when that receipt says so (teeVerified === true).
 */
function BrainLine({
  latest,
  hasDecisions,
  providers,
}: {
  latest: Decision | undefined;
  hasDecisions: boolean;
  providers?: ProviderLabels;
}) {
  if (!latest) {
    return (
      <p className="mt-3 text-[13px] text-[var(--v2-faint)]">
        <span className="text-[var(--v2-nav)]">AI:</span> an LLM on 0G Compute
        {hasDecisions ? ". Its recent calls came from its trading DNA's rules instead." : ", from its first decision."}
      </p>
    );
  }
  const label = providerLabelOf(providers, latest.zg?.provider);
  const cost = receiptCostUsd(latest);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5" aria-label="Its AI, from its latest 0G receipt">
      <span className="mr-1 text-[13px] text-[var(--v2-faint)]">AI</span>
      <span className="v2-chip text-[var(--v2-ink)]">
        <SparkIcon aria-hidden className="size-3.5 text-[var(--v2-teal)]" />
        {latest.model ?? "LLM"}
      </span>
      <span className="v2-chip">0G Compute</span>
      {label && (
        <span className="v2-chip" title={PROVIDER_TEXT[label.label].long}>
          {PROVIDER_TEXT[label.label].short}
          {label.name && <span className="text-[var(--v2-faint)]">· {label.name}</span>}
        </span>
      )}
      {cost !== null && (
        <span className="v2-chip v2-num" title="What its latest decision cost on 0G Compute">
          {formatCallCost(cost)}
          <span className="text-[var(--v2-faint)]">/call</span>
        </span>
      )}
      {isTeeVerified(latest) && (
        <Badge tone="success" dot>
          TEE verified
        </Badge>
      )}
    </div>
  );
}

function PersonaCard({ persona }: { persona: Persona }) {
  return (
    <section aria-labelledby="persona-title" className="v2-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="v2-kicker">Persona</p>
          <h2 id="persona-title" className="v2-h3 mt-1.5">
            {persona.name}
          </h2>
        </div>
        <span className="text-[13px] text-[var(--v2-nav)]">{STYLE_LABEL[persona.style] ?? persona.style}</span>
      </div>
      <p className="mt-3 text-[15px] leading-relaxed text-[var(--v2-nav)]">{persona.description}</p>
      <dl className="v2-kv mt-4 border-t border-[var(--v2-line-soft)] pt-4">
        <div>
          <dt>Largest trade</dt>
          <dd className="v2-num text-[15px]">{formatAmount(persona.maxTradeBps / 100, 2)}% of a balance</dd>
        </div>
      </dl>
    </section>
  );
}

const STYLE_LABEL: Record<TradingStyle, string> = {
  aggressive: "Aggressive",
  balanced: "Balanced",
  cautious: "Cautious",
};
/** The "·" between the header's identity facts. */
function Dot() {
  return (
    <span aria-hidden className="text-[var(--v2-faint)]">
      ·
    </span>
  );
}

/** A claimed Chog's AI (active or paused); without trading DNA, also "Not activated". */
function StatusBadge({ agent, pending, failed }: { agent: AgentRecord | null; pending: boolean; failed: boolean }) {
  if (pending) return <Badge>Loading…</Badge>;
  if (failed) return <Badge>Status unknown</Badge>;
  if (!agent) return <Badge dot>Not activated</Badge>;
  return agent.active ? (
    <Badge tone="teal" live>
      AI active
    </Badge>
  ) : (
    <Badge tone="warning" dot>
      Paused
    </Badge>
  );
}

/** The Chog's face: a 288px copy of its 1000×1000 image first, then the original, then "#id". */
function ChogImage({ src, tokenId, alt, pending }: { src?: string; tokenId: string; alt: string; pending: boolean }) {
  const [failed, setFailed] = useState<string[]>([]);
  const current = (src ? [chogThumbUrl(src, 288), src] : []).find((candidate) => !failed.includes(candidate));
  const frame =
    "v2-avatar v2-avatar--xl size-32 rounded-[22px] sm:size-[168px] sm:rounded-[26px] xl:size-[212px] xl:rounded-[30px]";
  return (
    <div className="relative w-fit">
      {/* One soft violet/teal bloom behind the portrait, the hero's colours. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-8 -z-10 rounded-full bg-[radial-gradient(closest-side,rgb(111_90_220/0.32),rgb(159_240_236/0.06)_60%,transparent)] blur-xl"
      />
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
          className={frame}
        />
      ) : (
        <span
          role="img"
          aria-label={alt}
          className={`${frame} grid place-items-center bg-[var(--v2-grad-tile)] text-white/80 ${pending ? "animate-pulse" : ""}`}
        >
          <span className="v2-num text-2xl">#{tokenId}</span>
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
    <button type="button" onClick={copy} className={`${pillClass("glass", "sm")} h-8 px-3 text-xs`}>
      <span aria-live="polite">
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy address"}
      </span>
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
      className="v2-mono text-[var(--v2-nav)] underline-offset-[3px] hover:text-[var(--v2-ink)] hover:underline"
    >
      {shortAddress(address)}
    </a>
  ) : (
    <span className="v2-mono text-[var(--v2-nav)]">{shortAddress(address)}</span>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <div className="v2-card v2-card--tight px-5 text-[15px] leading-relaxed text-[var(--v2-nav)]">{children}</div>;
}

export function AgentProfileSkeleton() {
  return (
    <div role="status" className="space-y-8">
      <span className="v2-sr">Loading Chog…</span>
      <div aria-hidden className="grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-8">
        <span className="v2-skeleton size-32 rounded-[22px] sm:size-[168px] sm:rounded-[26px] xl:size-[212px] xl:rounded-[30px]" />
        <div className="space-y-4">
          <span className="v2-skeleton h-6 w-44 rounded-full" />
          <span className="v2-skeleton h-14 w-72 max-w-full" />
          <span className="v2-skeleton v2-skeleton--text w-56" />
        </div>
      </div>
      <span aria-hidden className="v2-skeleton block h-[104px] rounded-[var(--v2-r-lg)]" />
      <div aria-hidden className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <span className="v2-skeleton v2-skeleton--card h-80" />
        <span className="v2-skeleton v2-skeleton--card h-64" />
      </div>
    </div>
  );
}
