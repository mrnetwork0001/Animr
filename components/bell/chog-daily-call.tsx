"use client";

import Link from "next/link";
import { type ReactNode, useId } from "react";
import { useNow } from "@/components/decision-feed";
import type { BellSeason, BellSummary, ChogBellRecord } from "@/lib/bell/types";
import { isNotFound, useChogBell, useTodayBell } from "./api";
import { CallResult, Conviction, Countdown, Forecast, LoadError, Skeleton } from "./bits";
import { RideButton } from "./call-card";
import { formatDay, formatPoints, hitRate, nextBellAt } from "./format";
import { noLiveBellLine, replayLabel } from "./standings";

/**
 * A Chog's Daily Bell card for its profile: this Bell's call (forecast, conviction, thesis and whether
 * its AI on 0G Compute or its trading DNA made it), its Bell record, and a Ride button.
 */
export function ChogDailyCall({ tokenId }: { tokenId: number }) {
  const headingId = useId();
  const chog = useChogBell(tokenId);
  const today = useTodayBell();
  const bell = today.data;
  const call = chog.data?.today;
  const record = chog.data?.record;
  const replay = chog.data?.replay;
  const season = chog.data?.season;

  let body: ReactNode;
  if (chog.isPending) {
    body = (
      <div role="status" className="mt-4 space-y-3">
        <span className="v2-sr">Loading this Chog&apos;s call…</span>
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
        <Forecast pct={call.forecastPct} size="xl" />
        <p className="v2-note mt-1.5">
          {bell?.kind === "replay"
            ? `Replayed call: $CHOG over the 24h after the Bell of ${formatDay(bell.day)}`
            : `$CHOG in the next 24h${bell ? `, Bell of ${formatDay(bell.day)}` : ""}`}
          {call.source === "llm" && ". Called by its AI on 0G Compute"}
        </p>
        <p className="bell-thesis mt-3">“{call.thesis}”</p>
        <div className="mt-3">
          <Conviction value={call.conviction} />
        </div>
        {bell?.status === "settled" && <CallResult call={call} actualPct={bell.actualPct} className="mt-3" />}
        {bell && <RideButton tokenId={tokenId} bell={bell} className="mt-4" />}
      </div>
    );
  } else {
    body = (
      <p className="v2-body mt-4">This Chog hasn&apos;t called this Bell yet. Every Chog calls $CHOG at 15:00 UTC.</p>
    );
  }

  return (
    <section aria-labelledby={headingId} className="v2-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="v2-h3">
          Daily Bell
        </h2>
        <BellClock bell={bell} />
      </div>
      {body}
      {record && <Records live={record} replay={replay} season={season} />}
      <Link href="/bell" className="v2-link mt-5 inline-flex text-sm">
        See all 1,969 calls at the Bell
      </Link>
    </section>
  );
}

function BellClock({ bell }: { bell?: BellSummary }) {
  const now = useNow();
  const ridesClose = bell?.status === "open" ? Date.parse(bell.rideWindowClosesAt) : Number.NaN;
  if (now !== null && now < ridesClose) {
    return (
      <span className="text-xs text-[var(--v2-nav)]">
        Rides close in <Countdown to={ridesClose} className="text-[var(--v2-ink)]" />
      </span>
    );
  }
  return (
    <span className="text-xs text-[var(--v2-nav)]">
      Next Bell in <Countdown to={now === null ? null : nextBellAt(now)} className="text-[var(--v2-ink)]" />
    </span>
  );
}

/** Average miss in percentage points of $CHOG's move, read as "3.5%". */
const formatMiss = (value: number) => `${value.toFixed(value < 1 ? 2 : value < 10 ? 1 : 0)}%`;

/**
 * Its Bell record from LIVE Bells (real market, on schedule). Replayed Bells (simulated on past candles) keep a
 * separate record, shown only with its label: beneath the live one until a live Bell has settled.
 */
function Records({ live, replay, season }: { live: ChogBellRecord; replay?: ChogBellRecord; season?: BellSeason }) {
  if (live.calls > 0) {
    return (
      <div className="mt-5 border-t border-[var(--v2-line-soft)] pt-4">
        <RecordStats title="Bell record" record={live} />
        <p className="v2-note mt-3">Live Bells only. The record stays with the NFT.</p>
      </div>
    );
  }
  const waiting = noLiveBellLine(season);
  return (
    <div className="mt-5 border-t border-[var(--v2-line-soft)] pt-4">
      <p className="v2-note">
        {waiting ?? "No settled live calls yet: its record starts when its first live Bell settles."}
      </p>
      {replay && replay.calls > 0 && (
        <div className="mt-4">
          <RecordStats title={replayLabel(season)} record={replay} />
        </div>
      )}
    </div>
  );
}

function RecordStats({ title, record }: { title: string; record: ChogBellRecord }) {
  return (
    <>
      <h3 className="text-[length:var(--v2-fs-sm)] font-medium text-[var(--v2-ink)]">{title}</h3>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3">
        <RecordStat label="Hit rate">
          {hitRate(record.hits, record.calls)}%{" "}
          <span className="text-xs text-[var(--v2-faint)]">
            ({record.hits}/{record.calls})
          </span>
        </RecordStat>
        <RecordStat label="Best calls">{record.oracleWins}</RecordStat>
        <RecordStat label="Avg miss">{formatMiss(record.avgErrorPts)}</RecordStat>
        <RecordStat label="Points">{formatPoints(record.totalPoints)}</RecordStat>
      </dl>
    </>
  );
}

function RecordStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-[var(--v2-faint)]">{label}</dt>
      <dd className="v2-num mt-0.5 text-[17px] text-[var(--v2-ink)]">{children}</dd>
    </div>
  );
}
