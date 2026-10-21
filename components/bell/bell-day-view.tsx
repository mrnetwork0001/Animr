"use client";

import Link from "next/link";
import { useState } from "react";
import { bellTime } from "@/lib/bell/rules";
import type { BellCall, BellCallSort, BellSummary } from "@/lib/bell/types";
import { isNotFound, useBell, useBellCalls, useTodayBell } from "./api";
import { StatRow, TabLinks } from "@/components/v2/primitives";
import { Countdown, Forecast, LoadError, SectionTitle, Skeleton, useBefore } from "./bits";
import { CallRow, CallRowsHeader, rideable } from "./call-card";
import { formatDay, formatPrice, formatUtcTime, shiftDay } from "./format";
import { PRACTICE_ID } from "./hero";
import { BullBearBar, HerdHistogram } from "./herd";
import { BellRecapCard } from "./recap";
import { ReplayGame } from "./replay-game";
import { Verdict } from "./verdict";

/** How many Bells before this one the practice game offers. */
const PRACTICE_DAYS = 7;

const SORTS: { id: BellCallSort; label: string; settledOnly?: boolean }[] = [
  { id: "points", label: "Top scorers", settledOnly: true },
  { id: "bold", label: "Boldest" },
  { id: "bull", label: "Most bullish" },
  { id: "bear", label: "Most bearish" },
  { id: "tokenId", label: "Token ID" },
];

/**
 * One Bell (live or replay): its summary, best and worst call and every call, sortable and paginated, then the
 * practice game on the Bells before it (never this one: its answer is already on the page).
 */
export function BellDayView({ day }: { day: string }) {
  const query = useBell(day);
  const today = useTodayBell();
  const latest = today.data?.day;
  // Today's Bell before 15:00 UTC (later days are a 404 in proxy.ts): it hasn't rung yet, so no past tense.
  const upcoming = useBefore(bellTime(day)) === true;
  const practice = (
    <div className="v2-section">
      <ReplayGame days={Array.from({ length: PRACTICE_DAYS }, (_, i) => shiftDay(day, -(i + 1)))} id={PRACTICE_ID} />
    </div>
  );

  const pager = (label: string) => (
    <TabLinks
      label={label}
      items={[
        { href: `/bell/${shiftDay(day, -1)}`, label: `← ${formatDay(shiftDay(day, -1))}` },
        { href: `/bell/${day}`, label: formatDay(day), active: true },
        ...(latest && day < latest ? [{ href: `/bell/${shiftDay(day, 1)}`, label: `${formatDay(shiftDay(day, 1))} →` }] : []),
        { href: "/bell", label: "Today's Bell" },
      ]}
    />
  );
  const nav = pager("Other Bells");

  if (query.isPending) return <BellDaySkeleton />;
  if (query.isError) {
    if (!isNotFound(query.error)) {
      return (
        <LoadError
          title="Couldn't load this Bell"
          error={query.error}
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      );
    }
    return (
      <div className="flex flex-col gap-6">
        <div className="v2-empty">
          {upcoming ? (
            <>
              <p className="v2-empty-title">This Bell hasn&apos;t rung yet</p>
              <p className="v2-empty-body">
                It rings at 15:00 UTC, in <Countdown to={bellTime(day)} className="text-[var(--v2-ink)]" />.
              </p>
            </>
          ) : (
            <>
              <p className="v2-empty-title">No Bell rang on {formatDay(day)}</p>
              <p className="v2-empty-body">
                Bells ring daily at 15:00 UTC. Days before the first live Bell are covered by replays where real candles
                exist.
              </p>
            </>
          )}
          <div className="v2-empty-actions">
            <Link href="/bell" className="v2-btn-primary">
              Go to today&apos;s Bell
            </Link>
          </div>
        </div>
        {nav}
        {practice}
      </div>
    );
  }

  const bell = query.data;
  return (
    <div className="flex flex-col gap-6">
      {pager("Bell pager")}
      {bell.status === "settled" && <BellRecapCard day={bell.day} />}
      <Overview bell={bell} />
      {bell.status === "settled" && <Verdict bell={bell} cardsOnly />}
      <div className="v2-section">
        <AllCalls bell={bell} latest={bell.day === latest} />
      </div>
      <div className="pt-4">{nav}</div>
      {practice}
    </div>
  );
}

function Overview({ bell }: { bell: BellSummary }) {
  const settled = bell.status === "settled";
  return (
    <section aria-label="Summary" className="v2-card v2-card--roomy">
      <p className="v2-note">
        {bell.kind === "replay" ? "Replay · rang" : "Rang"} {formatDay(bell.rungAt.slice(0, 10))}, {formatUtcTime(bell.rungAt)}
        {settled ? (
          ` · settled ${formatDay(bell.horizonAt.slice(0, 10))}`
        ) : (
          <>
            {" "}
            · settles {formatDay(bell.horizonAt.slice(0, 10))}, {formatUtcTime(bell.horizonAt)}, in{" "}
            <Countdown to={Date.parse(bell.horizonAt)} className="text-[var(--v2-ink)]" />
          </>
        )}
      </p>
      <StatRow
        className="mt-6"
        stats={[
          { key: "entry", label: "Entry price", hint: "WMON per $CHOG", value: formatPrice(bell.entryPrice) },
          { key: "settle", label: "Settle price", hint: "WMON per $CHOG", value: settled ? formatPrice(bell.settlePrice) : "—" },
          {
            key: "moved",
            label: "$CHOG moved",
            value: settled ? <Forecast pct={bell.actualPct} className="text-[length:inherit]" /> : "—",
          },
          { key: "calls", label: "Calls", value: bell.calls.toLocaleString("en-US") },
        ]}
      />
      <div className="mt-8 grid gap-8 border-t border-[var(--v2-line-soft)] pt-7 md:grid-cols-[minmax(0,1fr)_17rem] md:items-end">
        <HerdHistogram
          bell={bell}
          marks={settled && bell.actualPct !== null ? [{ pct: bell.actualPct, label: "Actual", tone: "actual" }] : []}
        />
        <BullBearBar bell={bell} />
      </div>
    </section>
  );
}

/** `latest`: this is the latest Bell, so its rows carry Ride buttons (booking the next Bell once rides close). */
function AllCalls({ bell, latest }: { bell: BellSummary; latest: boolean }) {
  const settled = bell.status === "settled";
  const sorts = SORTS.filter((option) => settled || !option.settledOnly);
  const [sort, setSort] = useState<BellCallSort>(settled ? "points" : "bold");
  const pages = useBellCalls(bell.day, sort);
  // Cursor pages can overlap if calls are re-ranked between requests; keep each Chog once.
  const calls = [...new Map((pages.data?.pages ?? []).flatMap((page) => page.calls).map((c) => [c.tokenId, c])).values()];
  const ridesOpen = useBefore(Date.parse(bell.rideWindowClosesAt)) !== false && rideable(bell);

  return (
    <section aria-label="Every call">
      <SectionTitle
        title={`All ${bell.calls.toLocaleString("en-US")} calls`}
        hint={
          latest && ridesOpen
            ? "Ride one Chog per Bell while the ride window is open."
            : latest
              ? `${settled ? "Each call's points, miss and whether it got the direction right." : "These calls settle a day after the ring."} A ride you take now goes to the next Bell.`
              : settled
                ? "Each call's points, miss and whether it got the direction right."
                : "These calls settle a day after the ring."
        }
      />
      <div role="group" aria-label="Sort calls" className="mb-4 flex flex-wrap gap-2">
        {sorts.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={sort === id}
            onClick={() => setSort(id)}
            className="v2-chip"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="v2-card v2-card--flush overflow-hidden">
        {pages.isPending ? (
          <CallRowsSkeleton />
        ) : pages.isError && calls.length === 0 ? (
          <div className="p-3">
            <LoadError
              title="Couldn't load the calls"
              error={pages.error}
              onRetry={() => pages.refetch()}
              retrying={pages.isFetching}
            />
          </div>
        ) : calls.length === 0 ? (
          <p className="v2-note px-4 py-10 text-center">No calls at this Bell.</p>
        ) : (
          <>
            <CallRowsHeader />
            <ol aria-label={`Calls, ${SORTS.find((s) => s.id === sort)?.label.toLowerCase()} first`}>
              {calls.map((call: BellCall) => (
                <CallRow key={call.tokenId} call={call} bell={bell} ride={latest} />
              ))}
            </ol>
          </>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--v2-faint)]">
        <span aria-live="polite">
          Showing {calls.length.toLocaleString("en-US")} of {bell.calls.toLocaleString("en-US")} calls
        </span>
        {pages.hasNextPage && (
          <button
            type="button"
            onClick={() => pages.fetchNextPage()}
            disabled={pages.isFetchingNextPage}
            className="v2-btn-glass"
          >
            {pages.isFetchingNextPage ? "Loading…" : "Load more calls"}
          </button>
        )}
      </div>
      {pages.isFetchNextPageError && (
        <p role="alert" className="mt-2 text-xs text-[var(--v2-danger)]">
          Couldn&apos;t load more calls: {pages.error?.message}
        </p>
      )}
    </section>
  );
}

function CallRowsSkeleton({ announce = true }: { announce?: boolean }) {
  return (
    <div role={announce ? "status" : undefined}>
      {announce && <span className="v2-sr">Loading calls…</span>}
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} aria-hidden className="flex gap-3.5 border-b border-[var(--v2-line-soft)] px-4 py-4 last:border-0 sm:px-5">
          <Skeleton className="size-11 rounded-[11px]" />
          <span className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-3/4" />
          </span>
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

export function BellDaySkeleton() {
  return (
    <div role="status" className="space-y-6">
      <span className="v2-sr">Loading this Bell…</span>
      <Skeleton className="h-11 w-80 rounded-full" />
      <div className="v2-card v2-card--roomy space-y-6">
        <Skeleton className="h-6 w-56" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
        <Skeleton className="h-44" />
      </div>
      <div className="v2-card v2-card--flush">
        <CallRowsSkeleton announce={false} />
      </div>
    </div>
  );
}
