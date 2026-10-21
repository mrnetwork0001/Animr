"use client";

import Link from "next/link";
import { type ReactNode, useId } from "react";
import type { Address } from "viem";
import type { AgentRecord } from "@/lib/agent/types";
import { shortAddress } from "@/lib/format";
import { Sparkline } from "../sparkline";
import { useReplay, useStanding } from "./api";
import { EdgeBadge } from "./edge-badge";
import { CHOG_COUNT, DEFAULT_WINDOW, SIM_LABEL, WINDOW_LABEL, edgeTone, formatInt, signedPct } from "./shared";

// A Chog's instinct (its trait genome) on its profile: the Time Machine teaser, the "wild" state of
// an unclaimed Chog, and Brain vs Instinct vs HODL for a claimed one. Every instinct number is a
// simulation on real $CHOG candles; the labels say so.

const LABEL = "text-[11px] font-medium uppercase tracking-wider text-subtle";

/** The genome's replay as a mini chart with its verdict, edge and league rank, linking to /replay/[id]. */
export function TimeMachineTeaser({ tokenId, className = "" }: { tokenId: number; className?: string }) {
  const headingId = useId();
  const replay = useReplay(tokenId, DEFAULT_WINDOW);
  const standing = useStanding(tokenId, DEFAULT_WINDOW);
  const data = replay.data;
  const row = standing.data?.row;

  return (
    <section aria-labelledby={headingId} className={`card p-5 sm:p-6 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Time Machine · last {WINDOW_LABEL[DEFAULT_WINDOW]}</p>
          <h2 id={headingId} className="mt-1 text-lg font-semibold tracking-tight text-balance">
            {data ? data.verdict : "Its DNA, replayed on the real $CHOG chart"}
          </h2>
        </div>
        {data && <EdgeBadge pct={data.edgePct} className="mt-1" />}
      </div>

      {data ? (
        <Sparkline
          values={data.points.map((point) => point.value)}
          baseline={data.startChog}
          label={`Chog #${tokenId}'s $CHOG stack over ${data.window.label}, against just holding (dashed line)`}
          className="mt-5 h-20"
        />
      ) : replay.isError ? (
        <p role="alert" className="mt-5 text-sm text-danger">
          Couldn&apos;t load the replay: {replay.error.message}
        </p>
      ) : (
        <div aria-hidden className="mt-5 h-20 animate-pulse rounded-lg bg-surface-2" />
      )}

      {data && (
        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
          <Stat label="League rank">{row ? `#${formatInt(row.rank)}` : "…"}</Stat>
          <Stat label="Trades">{formatInt(data.trades.length)}</Stat>
          <Stat label="Worst dip">{signedPct(data.maxDrawdownPct)}</Stat>
        </dl>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={`/replay/${tokenId}`} className="btn btn-primary">
          <span aria-hidden>▶</span> Watch the replay
        </Link>
        {/* VERSUS: this Chog against a random rival on a hidden 48 hours of real $CHOG; the visitor picks first. */}
        <Link href={`/versus?a=${tokenId}`} className="btn btn-secondary">
          Race this Chog
        </Link>
        <Link href={`/league?id=${tokenId}`} className="btn btn-ghost">
          See it in the League
        </Link>
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-subtle">
        {SIM_LABEL}
        {data ? ` · ${data.window.label}` : ""}. A replay of its trait genome, not a promise: past candles don&apos;t
        predict the next ones.
      </p>
    </section>
  );
}

/**
 * The profile of a Chog nobody has claimed: it isn't asleep, its instinct already trades in the League
 * and calls the Daily Bell. Claiming gives it the 0G brain and puts its real wallet to work.
 */
export function WildChogCard({ tokenId, account, className = "" }: { tokenId: number; account?: Address; className?: string }) {
  const headingId = useId();
  const standing = useStanding(tokenId, DEFAULT_WINDOW);
  const row = standing.data?.row;

  return (
    <section
      aria-labelledby={headingId}
      className={`card relative overflow-hidden border-accent/30 bg-linear-to-br from-accent/10 via-transparent to-transparent p-5 sm:p-6 ${className}`}
    >
      {/* The header's "Wild · trading on instinct" chip already says it's unclaimed. */}
      {row && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Link href={`/league?id=${tokenId}`} className="chip hover:text-foreground">
            League #{formatInt(row.rank)} of {formatInt(standing.data?.total ?? CHOG_COUNT)}
          </Link>
        </div>
      )}
      <h2 id={headingId} className="text-xl font-semibold tracking-tight text-balance">
        Its instinct is already trading
      </h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
        Nobody has claimed this Chog yet, so it runs on instinct: its 13 traits compile into a trading genome
        that trades the real $CHOG chart in the League and calls $CHOG at the Daily Bell every day.
        {row && (
          <>
            {" "}
            Over the last {WINDOW_LABEL[DEFAULT_WINDOW]} it went{" "}
            <span className={`font-mono font-medium ${edgeTone(row.edgePct)}`}>{signedPct(row.edgePct)}</span> against
            just holding (simulated, 1% fee + impact).
          </>
        )}
      </p>

      <div className="mt-5 rounded-xl border border-line bg-surface-2/50 p-4">
        <h3 className="text-sm font-semibold">Claim it: give it a brain and a real wallet</h3>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
          <li>Its holder signs one free message (no gas). An LLM on 0G Compute wakes up with this genome as its character.</li>
          <li>
            It manages the $CHOG in its own ERC-6551 wallet
            {account && (
              <>
                {" "}
                (<span className="font-mono text-foreground">{shortAddress(account)}</span>)
              </>
            )}
            : paper fills at live prices, or real trades through AnimrTradeGuard once its holder opts in (it can
            trade, never withdraw).
          </li>
          <li>Its record belongs to the NFT. Sell the Chog and the trader, its wallet and its record go with it.</li>
        </ol>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={`/replay/${tokenId}`} className="btn btn-primary">
          <span aria-hidden>▶</span> Watch its instinct trade
        </Link>
        <Link href={`/versus?a=${tokenId}`} className="btn btn-secondary">
          Race this Chog
        </Link>
        <Link href={`/app?id=${tokenId}#lookup`} className="btn btn-ghost">
          Hold it? Set up its wallet
        </Link>
      </div>
    </section>
  );
}

/**
 * For a claimed Chog: its live brain's edge since activation (or its last mode switch), its genome
 * replayed over the same hours, and just holding (0%).
 */
export function BrainVsInstinct({ agent, className = "" }: { agent: AgentRecord; className?: string }) {
  const headingId = useId();
  const tokenId = Number(agent.tokenId);
  const since = agent.modeChangedAt ?? agent.activatedAt;
  const standing = useStanding(Number.isInteger(tokenId) ? tokenId : undefined, DEFAULT_WINDOW, since);
  const instinct = standing.data?.since;
  const onchain = agent.mode === "onchain";
  const tooEarly = instinct !== undefined && instinct.hours < 6;
  const sinceDay = new Date(since).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  const brain = Number.isFinite(agent.pnlPct) ? agent.pnlPct : 0;
  // Brain, instinct, HODL; the strict leader only (no "Leads" tag on a tie at the top).
  const leader = instinct && !tooEarly ? leaderOf([brain, instinct.edgePct, 0]) : -1;

  return (
    <section aria-labelledby={headingId} className={`card p-5 sm:p-6 ${className}`}>
      <h2 id={headingId} className="text-lg font-semibold tracking-tight">
        Brain vs Instinct vs HODL
      </h2>
      <p className="mt-1 text-xs text-subtle">
        Since {sinceDay}
        {instinct && instinct.hours > 0 ? ` · ${formatInt(instinct.hours)} hourly candles` : ""} · edge over just holding
        $CHOG
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <Contender
          label="Brain · 0G Compute"
          note={onchain ? "Its own calls, real $CHOG" : "Its own calls, paper fills at live prices"}
          leads={leader === 0}
        >
          <EdgeBadge pct={brain} />
        </Contender>
        <Contender
          label="Instinct · genome only"
          note="Same hours, simulated on real candles (1% fee + impact)"
          leads={leader === 1}
        >
          {instinct && !tooEarly ? (
            <EdgeBadge pct={instinct.edgePct} />
          ) : standing.isError ? (
            <span className="text-xs text-danger">Unavailable</span>
          ) : instinct ? (
            <span className="text-xs text-muted">Too early</span>
          ) : (
            <span className="inline-block h-6 w-16 animate-pulse rounded-full bg-surface-2" />
          )}
        </Contender>
        <Contender label="HODL" note="Just holding $CHOG" leads={leader === 2}>
          <EdgeBadge pct={0} />
        </Contender>
      </dl>
      {tooEarly && (
        <p className="mt-3 text-xs text-muted">
          The instinct needs a few closed hourly candles since {sinceDay} before the comparison means anything.
        </p>
      )}
    </section>
  );
}

/** Index of the strictly highest score, or -1 when the top is tied. */
function leaderOf(scores: number[]): number {
  const best = Math.max(...scores);
  return scores.filter((score) => score === best).length === 1 ? scores.indexOf(best) : -1;
}

function Contender({
  label,
  note,
  leads,
  children,
}: {
  label: string;
  note: string;
  leads: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-3 ${leads ? "border-accent/50 bg-accent/10" : "border-line bg-surface-2/40"}`}>
      <dt className="flex items-center justify-between gap-2">
        <span className={LABEL}>{label}</span>
        {leads && <span className="text-[10px] font-medium uppercase tracking-wider text-accent-strong">Leads</span>}
      </dt>
      <dd className="mt-2">{children}</dd>
      <dd className="mt-1.5 text-[11px] leading-snug text-subtle">{note}</dd>
    </div>
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
