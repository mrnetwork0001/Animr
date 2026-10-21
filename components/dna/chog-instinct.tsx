"use client";

import Link from "next/link";
import { type ReactNode, useId } from "react";
import type { Address } from "viem";
import type { AgentRecord } from "@/lib/agent/types";
import { shortAddress } from "@/lib/format";
import { ArrowRightIcon } from "@/components/v2/icons";
import { pillClass } from "@/components/v2/primitives";
import { Sparkline } from "../sparkline";
import { useReplay, useStanding } from "./api";
import { EdgeBadge } from "./edge-badge";
import { CHOG_COUNT, DEFAULT_WINDOW, WINDOW_LABEL, formatInt, signedPct } from "./shared";

// A Chog's trading DNA on its profile: the Time Machine teaser, the card of an unclaimed Chog (its DNA already
// trades), and AI vs DNA vs holding for a claimed one. Every DNA number is a simulation on real $CHOG candles; the
// first one on the page says so.

const LABEL = "text-xs text-[var(--v2-nav)]";

/** The DNA's replay as a mini chart with its verdict, League rank, trades and worst dip; the whole card opens /replay/[id]. */
export function TimeMachineTeaser({ tokenId, className = "" }: { tokenId: number; className?: string }) {
  const headingId = useId();
  const replay = useReplay(tokenId, DEFAULT_WINDOW);
  const standing = useStanding(tokenId, DEFAULT_WINDOW);
  const data = replay.data;
  const row = standing.data?.row;

  return (
    <section aria-labelledby={headingId} className={`v2-card v2-card--interactive group relative ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="v2-kicker">Time Machine</p>
          <h2 id={headingId} className="v2-h3 mt-1.5 text-balance">
            {/* The card's one link: its ::after covers the card, so the whole card opens the replay. */}
            <Link
              href={`/replay/${tokenId}`}
              className="after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] group-hover:text-[var(--v2-kicker)]"
            >
              {data ? data.verdict : "Its DNA, replayed on the real $CHOG chart"}
            </Link>
          </h2>
        </div>
        <ArrowRightIcon
          aria-hidden
          className="mt-1 size-5 shrink-0 text-[var(--v2-faint)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--v2-ink)]"
        />
      </div>

      {data ? (
        <Sparkline
          values={data.points.map((point) => point.value)}
          baseline={data.startChog}
          label={`Its $CHOG stack over ${data.window.label}, against just holding (dashed line)`}
          className="mt-5 h-20"
        />
      ) : replay.isError ? (
        <p role="alert" className="mt-5 text-sm text-[var(--v2-danger)]">
          Couldn&apos;t load the replay: {replay.error.message}
        </p>
      ) : (
        <span aria-hidden className="v2-skeleton mt-5 block h-20" />
      )}

      {data && (
        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--v2-line-soft)] pt-4">
          <Stat label="League rank">{row ? `#${formatInt(row.rank)}` : "…"}</Stat>
          <Stat label="Trades">{formatInt(data.trades.length)}</Stat>
          <Stat label="Worst dip">{signedPct(data.maxDrawdownPct)}</Stat>
        </dl>
      )}

      {/* Above the card-wide link, so it stays its own target. */}
      <Link href={`/league?id=${tokenId}`} className="v2-link relative z-10 mt-5 inline-flex text-sm">
        See it in the League
      </Link>
    </section>
  );
}

/**
 * The profile of a Chog nobody has claimed: it isn't asleep, its trading DNA already trades in the League and calls
 * the Daily Bell. Its holder (`isOwner`) also gets how claiming works; everyone gets one way on: race it.
 */
export function WildChogCard({
  tokenId,
  account,
  isOwner = false,
  className = "",
}: {
  tokenId: number;
  account?: Address;
  isOwner?: boolean;
  className?: string;
}) {
  const headingId = useId();
  const standing = useStanding(tokenId, DEFAULT_WINDOW);
  const row = standing.data?.row;

  return (
    <section aria-labelledby={headingId} className={`v2-card v2-card--feature relative overflow-hidden ${className}`}>
      {row && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Link href={`/league?id=${tokenId}`} className="v2-chip">
            League #{formatInt(row.rank)} of {formatInt(standing.data?.total ?? CHOG_COUNT)}
          </Link>
        </div>
      )}
      <h2 id={headingId} className="v2-h3 text-balance">
        Trading on its DNA
      </h2>
      <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-[var(--v2-nav)]">
        No one has claimed this Chog&apos;s AI yet, so it trades on its traits alone.
        {row && (
          <>
            {" "}
            Over the last {WINDOW_LABEL[DEFAULT_WINDOW]} that put it <EdgeBadge pct={row.edgePct} /> vs holding
            (simulated).
          </>
        )}
      </p>

      {isOwner && (
        <details className="group mt-5 rounded-[var(--v2-r-md)] border border-[var(--v2-line-soft)] bg-white/[0.02] px-4 py-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-[520] text-[var(--v2-ink)] [&::-webkit-details-marker]:hidden">
            How claiming works
            <span aria-hidden className="ml-auto text-[var(--v2-faint)] transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <ol className="mt-2 mb-1 max-w-[90ch] list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-[var(--v2-nav)]">
            <li>You sign one free message (no gas). An AI on 0G Compute wakes up with this DNA as its character.</li>
            <li>
              It manages the $CHOG in its own ERC-6551 wallet
              {account && (
                <>
                  {" "}
                  (<span className="v2-mono text-[var(--v2-ink)]">{shortAddress(account)}</span>)
                </>
              )}
              : paper fills at live prices, or real trades through AnimrTradeGuard once you opt in.
            </li>
            <li>Its record belongs to the NFT. Sell the Chog and the trader, its wallet and its record go with it.</li>
          </ol>
        </details>
      )}

      <div className="mt-5">
        {/* Versus: this Chog against a random rival on a hidden 48 hours of real $CHOG; the visitor picks first. */}
        <Link href={`/versus?a=${tokenId}`} className={pillClass("glass", "sm")}>
          Race this Chog
        </Link>
      </div>
    </section>
  );
}

/**
 * For a claimed Chog: its AI's result vs holding since activation (or its last mode switch), its DNA replayed over
 * the same hours, and just holding (0%).
 */
export function BrainVsInstinct({ agent, className = "" }: { agent: AgentRecord; className?: string }) {
  const headingId = useId();
  const tokenId = Number(agent.tokenId);
  const since = agent.modeChangedAt ?? agent.activatedAt;
  const standing = useStanding(Number.isInteger(tokenId) ? tokenId : undefined, DEFAULT_WINDOW, since);
  const instinct = standing.data?.since;
  const onchain = agent.mode === "onchain";
  const tooEarly = instinct !== undefined && instinct.hours < 6;
  const sinceDay = new Date(since).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  const brain = Number.isFinite(agent.pnlPct) ? agent.pnlPct : 0;
  // AI, DNA, holding; the strict leader only (no "Leads" tag on a tie at the top).
  const leader = instinct && !tooEarly ? leaderOf([brain, instinct.edgePct, 0]) : -1;

  return (
    <section aria-labelledby={headingId} className={`v2-card ${className}`}>
      <h2 id={headingId} className="v2-h3">
        Its AI vs its DNA vs holding
      </h2>
      <p className="v2-note mt-1">
        Since {sinceDay}
        {instinct && instinct.hours > 0 ? `, ${formatInt(instinct.hours)} hourly candles` : ""}, each vs just holding
        $CHOG
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <Contender
          label="Its AI on 0G Compute"
          note={onchain ? "Its own calls, real $CHOG" : "Its own calls, paper fills at live prices"}
          leads={leader === 0}
        >
          <EdgeBadge pct={brain} className="text-lg" />
        </Contender>
        <Contender label="Its DNA alone" note="Same hours, simulated on real candles" leads={leader === 1}>
          {instinct && !tooEarly ? (
            <EdgeBadge pct={instinct.edgePct} className="text-lg" />
          ) : standing.isError ? (
            <span className="text-xs text-[var(--v2-danger)]">Unavailable</span>
          ) : instinct ? (
            <span className="text-xs text-[var(--v2-nav)]">Too early</span>
          ) : (
            <span className="v2-skeleton inline-block h-6 w-16 rounded-full" />
          )}
        </Contender>
        <Contender label="Just holding" note="Holding $CHOG" leads={leader === 2}>
          <EdgeBadge pct={0} className="text-lg" />
        </Contender>
      </dl>
      {tooEarly && (
        <p className="mt-3 text-xs text-[var(--v2-nav)]">
          Its DNA needs a few closed hourly candles since {sinceDay} before the comparison means anything.
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
    <div
      className={`rounded-[var(--v2-r-md)] border p-3.5 ${leads ? "border-[var(--v2-line-teal)] bg-[rgb(159_240_236/0.05)]" : "border-[var(--v2-line-soft)] bg-white/[0.02]"}`}
    >
      <dt className="flex items-center justify-between gap-2">
        <span className={LABEL}>{label}</span>
        {leads && <span className="v2-badge v2-badge--teal h-5 px-1.5 text-[10px]">Leads</span>}
      </dt>
      <dd className="mt-2">{children}</dd>
      <dd className="mt-1.5 text-[11.5px] leading-snug text-[var(--v2-faint)]">{note}</dd>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className={LABEL}>{label}</dt>
      <dd className="v2-num mt-1 text-lg">{children}</dd>
    </div>
  );
}
