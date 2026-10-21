"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import type { AgentRecord, TradingStyle } from "@/lib/agent/types";
import { formatAmount, formatUsd } from "@/lib/format";
import { TimeAgo } from "./decision-feed";
import { fetchLeaderboard, leaderboardKey } from "./leaderboard-api";
import { PnlBadge } from "./pnl-badge";

const STYLE_TONE: Record<TradingStyle, string> = {
  aggressive: "bg-warning/10 text-warning ring-warning/25",
  balanced: "bg-accent/10 text-accent-strong ring-accent/30",
  cautious: "bg-sky-400/10 text-sky-300 ring-sky-400/25",
};

const RANK_TONE = ["text-warning", "text-foreground", "text-orange-300"];

// Phones: rank | Chog | PnL. From sm: rank | Chog | value | PnL | decisions | last thought | chevron.
const GRID =
  "grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 sm:grid-cols-[2rem_minmax(0,1fr)_8.5rem_6.5rem_5.5rem_6.5rem_0.75rem] sm:gap-x-4";

/** Best edge first; the API already sorts, this keeps the ranking honest if it ever doesn't. */
function rankAgents(agents: AgentRecord[]): AgentRecord[] {
  const score = (a: AgentRecord) => (Number.isFinite(a.pnlPct) ? a.pnlPct : -Infinity);
  return [...agents].sort((a, b) => score(b) - score(a) || 0);
}

/** Chogs ranked by their AI's PnL, refreshed every 15s. */
export function LeaderboardTable() {
  const { data, error, isFetching, refetch } = useQuery({
    queryKey: leaderboardKey,
    queryFn: fetchLeaderboard,
    refetchInterval: 15_000,
  });

  if (!data) {
    if (!error) return <LeaderboardSkeleton />;
    return (
      <div role="alert" className="card border-danger/40 px-6 py-10 text-center">
        <p className="font-medium text-danger">Couldn&apos;t load the leaderboard</p>
        <p className="mt-1 break-words font-mono text-xs text-muted">{error.message}</p>
        <button type="button" onClick={() => refetch()} disabled={isFetching} className="btn btn-secondary mt-5">
          {isFetching ? "Retrying…" : "Try again"}
        </button>
      </div>
    );
  }

  if (data.agents.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
        <p className="text-base font-medium">No live agents yet, but every Chog is already trading</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          All 1,969 Chogs trade their trait DNA in the League, simulated on real $CHOG candles. Hold one? Claim it from
          the dashboard to give it an AI on 0G Compute, and it shows up here right away.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/league" className="btn btn-primary px-5 py-2.5">
            Browse the League
          </Link>
          <Link href="/app" className="btn btn-secondary px-5 py-2.5">
            Claim yours
          </Link>
        </div>
      </div>
    );
  }

  const agents = rankAgents(data.agents);
  return (
    <section aria-label="Chog leaderboard">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-subtle">
        <span>
          {agents.length} {agents.length === 1 ? "agent" : "agents"} · ranked by edge over holding $CHOG
        </span>
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${error ? "bg-warning" : "bg-success"} ${isFetching ? "animate-pulse" : ""}`}
          />
          {error ? "Refresh failed, showing data from " : "Updated "}
          <TimeAgo iso={data.updatedAt} />
        </span>
      </div>

      <div className="card overflow-hidden">
        <div
          aria-hidden
          className={`${GRID} hidden border-b border-line px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-subtle sm:grid`}
        >
          <span>#</span>
          <span>Chog</span>
          <span className="text-right">Value</span>
          <span className="text-right">PnL</span>
          <span className="text-right">Decisions</span>
          <span className="text-right">Last thought</span>
          <span />
        </div>
        <ol>
          {agents.map((agent, i) => (
            <LeaderboardRow key={agent.tokenId} agent={agent} rank={i + 1} />
          ))}
        </ol>
      </div>
    </section>
  );
}

function LeaderboardRow({ agent, rank }: { agent: AgentRecord; rank: number }) {
  const style = STYLE_TONE[agent.persona.style] ?? STYLE_TONE.balanced;
  return (
    <li className="border-b border-line/60 last:border-0">
      <Link
        href={`/chog/${agent.tokenId}`}
        className={`${GRID} px-4 py-3 transition-colors hover:bg-accent/[0.07] focus-visible:bg-accent/10`}
      >
        <span className={`font-mono text-sm font-semibold tabular-nums ${RANK_TONE[rank - 1] ?? "text-subtle"}`}>
          <span className="sr-only">Rank </span>
          {rank}
        </span>

        <span className="flex min-w-0 items-center gap-3">
          <ChogAvatar src={agent.image} tokenId={agent.tokenId} />
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate font-semibold text-foreground">Chog #{agent.tokenId}</span>
              {/* Honest labels: real $CHOG through AnimrTradeGuard, or simulated fills at live prices. */}
              {agent.mode === "onchain" ? (
                <span
                  title="Trades the real $CHOG in its own wallet through AnimrTradeGuard"
                  className="shrink-0 rounded bg-success/10 px-1.5 py-px text-[10px] uppercase tracking-wider text-success ring-1 ring-inset ring-success/30"
                >
                  real wallet
                </span>
              ) : (
                <span
                  title="Paper fills at live prices: no tokens move"
                  className="shrink-0 rounded bg-surface-2 px-1.5 py-px text-[10px] uppercase tracking-wider text-muted"
                >
                  paper
                </span>
              )}
              {!agent.active && (
                <span className="rounded bg-surface-2 px-1.5 py-px text-[10px] uppercase tracking-wider text-muted">
                  paused
                </span>
              )}
            </span>
            <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted">
              <span className="truncate">{agent.persona.name}</span>
              <span className={`shrink-0 rounded px-1.5 py-px text-[10px] uppercase tracking-wider ring-1 ring-inset ${style}`}>
                {agent.persona.style}
              </span>
            </span>
            <span className="mt-1 flex flex-wrap gap-x-3 font-mono text-[11px] text-subtle sm:hidden">
              <span>{formatAmount(agent.lastValueChog, 2)} $CHOG-eq</span>
              <span>
                {agent.decisions} {agent.decisions === 1 ? "decision" : "decisions"}
              </span>
              {agent.lastDecisionAt && <TimeAgo iso={agent.lastDecisionAt} />}
            </span>
          </span>
        </span>

        <span className="hidden text-right sm:block">
          <span className="block font-mono text-sm tabular-nums text-foreground">
            <span className="sr-only">Value </span>
            {formatAmount(agent.lastValueChog, 2)}
          </span>
          <span className="block text-[11px] text-subtle">$CHOG-eq · {formatUsd(agent.lastValueUsd)}</span>
        </span>

        <span className="text-right">
          <span className="sr-only">PnL </span>
          <PnlBadge pct={agent.pnlPct} />
        </span>

        <span className="hidden text-right font-mono text-sm tabular-nums text-muted sm:block">
          {agent.decisions}
          <span className="sr-only"> decisions</span>
        </span>

        <span className="hidden text-right text-xs text-muted sm:block">
          <span className="sr-only">Last thought </span>
          {agent.lastDecisionAt ? <TimeAgo iso={agent.lastDecisionAt} /> : "—"}
        </span>

        <span aria-hidden className="hidden text-subtle sm:block">
          ›
        </span>
      </Link>
    </li>
  );
}

function ChogAvatar({ src, tokenId }: { src?: string; tokenId: string }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  if (!src || failedSrc === src) {
    return (
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-linear-to-br from-accent/50 to-accent/10 font-mono text-[10px] text-white/80"
      >
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
      className="size-10 shrink-0 rounded-xl bg-surface-2 object-cover"
    />
  );
}

export function LeaderboardSkeleton() {
  return (
    <div role="status" className="card overflow-hidden">
      <span className="sr-only">Loading leaderboard…</span>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} aria-hidden className="flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0">
          <span className="h-4 w-5 animate-pulse rounded bg-surface-2" />
          <span className="size-10 animate-pulse rounded-xl bg-surface-2" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 w-28 animate-pulse rounded bg-surface-2" />
            <span className="block h-3 w-20 animate-pulse rounded bg-surface-2/60" />
          </span>
          <span className="h-5 w-16 animate-pulse rounded-full bg-surface-2" />
        </div>
      ))}
    </div>
  );
}
