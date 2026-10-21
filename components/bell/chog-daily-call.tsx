"use client";

import Link from "next/link";
import { type ReactNode, useId } from "react";
import { useNow } from "@/components/decision-feed";
import type { BellSummary, ChogBellRecord } from "@/lib/bell/types";
import { isNotFound, useChogBell, useTodayBell } from "./api";
import {
  CallResult,
  ClaimedBadge,
  Conviction,
  Countdown,
  Forecast,
  KindBadge,
  LABEL,
  LoadError,
  Skeleton,
  SourceBadge,
} from "./bits";
import { RideButton } from "./call-card";
import { formatDay, formatErrorPts, formatPoints, hitRate, nextBellAt } from "./format";
import { BellIcon } from "./icons";

/**
 * A Chog's Daily Bell card for its profile: this Bell's call (forecast, conviction, thesis and whether
 * its AI on 0G Compute or its trait DNA made it), its forecasting record, and a Ride button.
 */
export function ChogDailyCall({ tokenId }: { tokenId: number }) {
  const headingId = useId();
  const chog = useChogBell(tokenId);
  const today = useTodayBell();
  const bell = today.data;
  const call = chog.data?.today;
  const record = chog.data?.record;

  let body: ReactNode;
  if (chog.isPending) {
    body = (
      <div role="status" className="mt-4 space-y-3">
        <span className="sr-only">Loading Chog #{tokenId}&apos;s call…</span>
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-4" />
        <Skeleton className="h-9" />
      </div>
    );
  } else if (chog.isError && !isNotFound(chog.error)) {
    body = (
      <div className="mt-4">
        <LoadError
          title="Couldn't load this Chog's call"
          error={chog.error}
          onRetry={() => chog.refetch()}
          retrying={chog.isFetching}
        />
      </div>
    );
  } else if (call) {
    body = (
      <div className="mt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Forecast pct={call.forecastPct} size="xl" />
            <p className="mt-1 text-xs text-subtle">
              {bell?.kind === "replay"
                ? `Replayed call · $CHOG over the 24h after the Bell of ${formatDay(bell.day)}`
                : `$CHOG in the next 24h${bell ? ` · Bell of ${formatDay(bell.day)}` : ""}`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {bell && <KindBadge kind={bell.kind} />}
            <SourceBadge source={call.source} />
            {call.claimed && <ClaimedBadge />}
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-pretty">“{call.thesis}”</p>
        <div className="mt-3">
          <Conviction value={call.conviction} />
        </div>
        {bell?.status === "settled" && <CallResult call={call} actualPct={bell.actualPct} className="mt-3" />}
        {bell && <RideButton tokenId={tokenId} bell={bell} className="mt-4" />}
      </div>
    );
  } else {
    body = (
      <p className="mt-4 text-sm text-muted">
        Chog #{tokenId} hasn&apos;t called this Bell yet. Every Chog calls $CHOG at 15:00 UTC.
      </p>
    );
  }

  return (
    <section aria-labelledby={headingId} className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className={`${LABEL} flex items-center gap-1.5`}>
          <BellIcon className="size-4 text-accent-strong" />
          Daily Bell
        </h2>
        <BellClock bell={bell} />
      </div>
      {body}
      {record && <Record tokenId={tokenId} record={record} />}
      <Link href="/bell" className="mt-4 inline-flex text-sm font-medium text-accent-strong hover:underline">
        See all 1,969 calls at the Bell →
      </Link>
    </section>
  );
}

function BellClock({ bell }: { bell?: BellSummary }) {
  const now = useNow();
  const ridesClose = bell?.status === "open" ? Date.parse(bell.rideWindowClosesAt) : Number.NaN;
  if (now !== null && now < ridesClose) {
    return (
      <span className="text-xs text-muted">
        Rides close in <Countdown to={ridesClose} className="text-foreground" />
      </span>
    );
  }
  return (
    <span className="text-xs text-muted">
      Next Bell in <Countdown to={now === null ? null : nextBellAt(now)} className="text-foreground" />
    </span>
  );
}

function Record({ tokenId, record }: { tokenId: number; record: ChogBellRecord }) {
  if (record.calls === 0) {
    return (
      <p className="mt-5 border-t border-line pt-4 text-xs text-subtle">
        No settled calls yet: Chog #{tokenId}&apos;s record starts when its first Bell settles.
      </p>
    );
  }
  return (
    <div className="mt-5 border-t border-line pt-4">
      <h3 className={LABEL}>Forecasting record · replays included</h3>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3">
        <RecordStat label="Hit rate">
          {hitRate(record.hits, record.calls)}%{" "}
          <span className="text-xs text-subtle">
            ({record.hits}/{record.calls})
          </span>
        </RecordStat>
        <RecordStat label="Oracle wins">{record.oracleWins}</RecordStat>
        <RecordStat label="Avg error">{formatErrorPts(record.avgErrorPts)}</RecordStat>
        <RecordStat label="Points">{formatPoints(record.totalPoints)}</RecordStat>
      </dl>
      <p className="mt-3 text-[11px] text-subtle">
        Counts every settled Bell, including the ones replayed from real past candles. The record belongs to the NFT:
        whoever holds Chog #{tokenId} inherits it.
      </p>
    </div>
  );
}

function RecordStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-subtle">{label}</dt>
      <dd className="font-mono text-sm tabular-nums">{children}</dd>
    </div>
  );
}
