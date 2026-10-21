"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { PulseIcon } from "@/components/v2/icons";
import { Badge, type BadgeTone, EmptyState, PillLink, StatRow, pillClass } from "@/components/v2/primitives";
import type { AgentRecord, TradingStyle } from "@/lib/agent/types";
import { formatAmount, formatPct, formatUsd } from "@/lib/format";
import { useConnection } from "wagmi";
import { useIsClient } from "./connect-button";
import { TimeAgo } from "./decision-feed";
import { fetchLeaderboard, leaderboardKey } from "./leaderboard-api";
import { Callout } from "./onchain/ui";
import { PnlBadge } from "./pnl-badge";

const STYLE_TONE: Record<TradingStyle, BadgeTone> = { aggressive: "warning", balanced: "violet", cautious: "teal" };

/** Best edge first; the API already sorts, this keeps the ranking honest if it ever doesn't. */
function rankAgents(agents: AgentRecord[]): AgentRecord[] {
  const score = (a: AgentRecord) => (Number.isFinite(a.pnlPct) ? a.pnlPct : -Infinity);
  return [...agents].sort((a, b) => score(b) - score(a) || 0);
}

type Filter = "all" | "onchain" | "paper";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "onchain", label: "Real wallet" },
  { id: "paper", label: "Paper" },
];

function useLeaderboard() {
  return useQuery({ queryKey: leaderboardKey, queryFn: fetchLeaderboard, refetchInterval: 15_000 });
}

/**
 * The header's numbers, from the same query (one cache entry): agents awake, the $CHOG-equivalent they manage and the
 * best edge over holding (the real-wallet count sits on the board's filter).
 */
export function LeaderboardStats() {
  const { data } = useLeaderboard();
  const agents = data?.agents ?? [];
  const awake = agents.filter((a) => a.active).length;
  const managed = agents.reduce((sum, a) => sum + (Number.isFinite(a.lastValueChog) ? a.lastValueChog : 0), 0);
  const best = agents.reduce<number | null>(
    (top, a) => (Number.isFinite(a.pnlPct) && (top === null || a.pnlPct > top) ? a.pnlPct : top),
    null,
  );
  const pending = !data;
  return (
    <StatRow
      boxed
      size="sm"
      stats={[
        { key: "awake", label: "Agents awake", value: pending ? "…" : `${awake}`, hint: pending ? undefined : `of ${agents.length}` },
        { key: "managed", label: "Managed", hint: "$CHOG-eq", value: pending ? "…" : formatAmount(managed, 0) },
        {
          key: "best",
          label: "Best edge",
          value: pending || best === null ? "—" : formatPct(best),
          tone: best !== null && best >= 0.005 ? "up" : best !== null && best <= -0.005 ? "down" : undefined,
        },
      ]}
    />
  );
}

/** Chogs ranked by their AI's PnL, refreshed every 15s. */
export function LeaderboardTable() {
  const { data, error, isFetching, refetch } = useLeaderboard();
  const [filter, setFilter] = useState<Filter>("all");
  const isClient = useIsClient();
  const connection = useConnection();
  // The server renders "disconnected"; only trust wallet state once hydrated.
  const viewer = isClient && connection.status === "connected" ? connection.address.toLowerCase() : undefined;

  if (!data) {
    if (!error) return <LeaderboardSkeleton />;
    return (
      <Callout tone="danger" title="Couldn't load the leaderboard">
        <span className="v2-mono text-xs break-words">{error.message}</span>
        <span className="mt-3 block">
          <button type="button" onClick={() => refetch()} disabled={isFetching} className={pillClass("glass", "sm")}>
            {isFetching ? "Retrying…" : "Try again"}
          </button>
        </span>
      </Callout>
    );
  }

  if (data.agents.length === 0) {
    return (
      <EmptyState
        icon={<PulseIcon />}
        title="No live agents yet, but every Chog is already trading"
        body="All 1,969 Chogs trade their trait DNA in the League, simulated on real $CHOG candles. Hold one? Claim it from the dashboard to give it an AI on 0G Compute, and it shows up here right away."
        actions={
          <>
            <PillLink href="/league">Browse the League</PillLink>
            <PillLink href="/app" variant="glass">
              Claim yours
            </PillLink>
          </>
        }
      />
    );
  }

  const ranked = rankAgents(data.agents);
  const counts: Record<Filter, number> = {
    all: ranked.length,
    onchain: ranked.filter((a) => a.mode === "onchain").length,
    paper: ranked.filter((a) => a.mode !== "onchain").length,
  };
  // Ranks stay the overall ones when filtering, so "#3" means the same thing in every view.
  const rows = ranked
    .map((agent, i) => ({ agent, rank: i + 1 }))
    .filter(({ agent }) => filter === "all" || (filter === "onchain" ? agent.mode === "onchain" : agent.mode !== "onchain"));

  return (
    <section aria-labelledby="board-title">
      <h2 id="board-title" className="v2-sr">
        Live agents, ranked by edge over holding $CHOG
      </h2>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="v2-tabs" role="group" aria-label="Filter by trading mode">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className="v2-tab" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
              <span className="v2-tab-count">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <p className="flex items-center gap-2 text-xs text-[var(--v2-faint)]" aria-live="polite">
          {error ? (
            <Badge tone="warning" dot>
              Refresh failed
            </Badge>
          ) : (
            <Badge tone="teal" live>
              Live
            </Badge>
          )}
          <span>
            {error ? "Showing data from " : "Updated "}
            <TimeAgo iso={data.updatedAt} />
          </span>
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<PulseIcon />}
          title={filter === "onchain" ? "No agent trades real $CHOG yet" : "No paper agents right now"}
          body={
            filter === "onchain"
              ? "A holder switches their Chog's AI on-chain from its profile, through AnimrTradeGuard: it can trade, never withdraw."
              : "Every awake agent here trades real $CHOG through AnimrTradeGuard."
          }
          actions={
            <button type="button" className={pillClass("glass", "sm")} onClick={() => setFilter("all")}>
              Show all agents
            </button>
          }
        />
      ) : (
        <div className="v2-table-wrap">
          <table className="v2-table">
            <caption className="v2-sr">
              Claimed Chogs ranked by their AI&apos;s edge over simply holding $CHOG. Refreshes every 15 seconds.
            </caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Chog</th>
                <th scope="col" className="v2-hide-sm">
                  Mode
                </th>
                <th scope="col" className="is-num v2-hide-sm">
                  Value
                </th>
                <th scope="col" className="is-num">
                  Edge vs hold
                </th>
                <th scope="col" className="is-num v2-hide-sm">
                  Decisions
                </th>
                <th scope="col" className="is-num v2-hide-sm">
                  Last thought
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ agent, rank }) => (
                <LeaderboardRow key={agent.tokenId} agent={agent} rank={rank} mine={viewer !== undefined && agent.owner.toLowerCase() === viewer} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="v2-note mt-3">
        Edge = the AI&apos;s portfolio value against simply holding the $CHOG it started with. Paper agents fill at live
        prices without moving tokens; real-wallet agents trade through AnimrTradeGuard, which can never withdraw.
      </p>
    </section>
  );
}

function ModeBadge({ agent }: { agent: AgentRecord }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {/* Honest labels: real $CHOG through AnimrTradeGuard, or simulated fills at live prices. */}
      {agent.mode === "onchain" ? (
        <span title="Trades the real $CHOG in its own wallet through AnimrTradeGuard">
          <Badge tone="success" dot>
            Real wallet
          </Badge>
        </span>
      ) : (
        <span title="Paper fills at live prices: no tokens move">
          <Badge>Paper</Badge>
        </span>
      )}
      {!agent.active && (
        <Badge tone="warning" dot>
          Paused
        </Badge>
      )}
    </span>
  );
}

/** `mine`: the connected wallet activated this agent (its holder then), highlighted like the League's "yours". */
function LeaderboardRow({ agent, rank, mine }: { agent: AgentRecord; rank: number; mine: boolean }) {
  return (
    <tr className={mine ? "is-highlight" : undefined}>
      <td className={`is-rank ${rank <= 3 ? "text-[var(--v2-ink)]" : ""}`}>
        <span className="v2-sr">Rank </span>
        {rank}
      </td>
      <td className="w-full max-w-0 sm:max-w-none">
        <Link href={`/chog/${agent.tokenId}`} className="v2-table-cell-chog group">
          <ChogAvatar src={agent.image} tokenId={agent.tokenId} />
          <span className="min-w-0">
            <span className="block truncate group-hover:text-[var(--v2-kicker)]">
              Chog #{agent.tokenId}
              {mine && <span className="ml-2 text-xs font-normal text-[var(--v2-teal)]">yours</span>}
            </span>
            <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs font-normal text-[var(--v2-nav)]">
              <span className="truncate">{agent.persona.name}</span>
              <Badge tone={STYLE_TONE[agent.persona.style] ?? "neutral"} className="h-5 px-1.5 text-[10px] max-sm:hidden">
                {agent.persona.style}
              </Badge>
            </span>
            <span className="v2-show-sm mt-1.5">
              <ModeBadge agent={agent} />
            </span>
          </span>
        </Link>
      </td>
      <td className="v2-hide-sm">
        <ModeBadge agent={agent} />
      </td>
      <td className="is-num v2-hide-sm">
        <span className="block">{formatAmount(agent.lastValueChog, 2)}</span>
        <span className="block font-[var(--v2-font-text)] text-[11px] text-[var(--v2-faint)]">
          $CHOG-eq · {formatUsd(agent.lastValueUsd)}
        </span>
      </td>
      <td className="is-num">
        <PnlBadge pct={agent.pnlPct} size="md" />
      </td>
      <td className="is-num v2-hide-sm">{formatAmount(agent.decisions, 0)}</td>
      <td className="is-num v2-hide-sm text-[13px] text-[var(--v2-faint)]">
        {agent.lastDecisionAt ? <TimeAgo iso={agent.lastDecisionAt} /> : "—"}
      </td>
    </tr>
  );
}

function ChogAvatar({ src, tokenId }: { src?: string; tokenId: string }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  if (!src || failedSrc === src) {
    return (
      <span aria-hidden className="v2-avatar grid place-items-center bg-[var(--v2-grad-tile)] text-[9px] tracking-tight text-white/85">
        #{tokenId}
      </span>
    );
  }
  return (
    // NFT images live on arbitrary hosts (IPFS gateways etc.), so next/image's allowlist doesn't fit.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
      className="v2-avatar"
    />
  );
}

export function LeaderboardSkeleton() {
  return (
    <div role="status">
      <span className="v2-sr">Loading leaderboard…</span>
      <div aria-hidden className="mb-4 flex items-center justify-between gap-3">
        <span className="v2-skeleton h-11 w-64 rounded-full" />
        <span className="v2-skeleton v2-skeleton--text w-32" />
      </div>
      <div aria-hidden className="v2-table-wrap">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex h-[61px] items-center gap-4 border-b border-[var(--v2-line-soft)] px-5 last:border-0">
            <span className="v2-skeleton v2-skeleton--text w-4" />
            <span className="v2-skeleton size-[34px] rounded-[9px]" />
            <span className="flex-1 space-y-2">
              <span className="v2-skeleton v2-skeleton--text block w-28" />
              <span className="v2-skeleton v2-skeleton--text block w-20 opacity-60" />
            </span>
            <span className="v2-skeleton h-7 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
