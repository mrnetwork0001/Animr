"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";
import type { BellCall, BellCallSort, BellSummary } from "@/lib/bell/types";
import { isNotFound, useBell, useBellCalls, useTodayBell } from "./api";
import {
  Countdown,
  Forecast,
  KindBadge,
  LABEL,
  LoadError,
  SampleBanner,
  SectionTitle,
  Skeleton,
  useBefore,
} from "./bits";
import { CallRow, rideable } from "./call-card";
import { formatDay, formatPrice, formatUtcTime, shiftDay } from "./format";
import { BullBearBar, HerdHistogram } from "./herd";
import { Verdict } from "./verdict";

const SORTS: { id: BellCallSort; label: string; settledOnly?: boolean }[] = [
  { id: "points", label: "Top scorers", settledOnly: true },
  { id: "bold", label: "Boldest" },
  { id: "bull", label: "Most bullish" },
  { id: "bear", label: "Most bearish" },
  { id: "tokenId", label: "Token ID" },
];

/** One Bell (live or replay): its summary, verdict and every call, sortable and paginated. */
export function BellDayView({ day }: { day: string }) {
  const query = useBell(day);
  const today = useTodayBell();
  const latest = today.data?.day;

  const nav = (
    <nav aria-label="Other Bells" className="flex flex-wrap gap-2">
      <Link href={`/bell/${shiftDay(day, -1)}`} className="btn btn-secondary px-3 py-1.5">
        ← {formatDay(shiftDay(day, -1))}
      </Link>
      {latest && day < latest && (
        <Link href={`/bell/${shiftDay(day, 1)}`} className="btn btn-secondary px-3 py-1.5">
          {formatDay(shiftDay(day, 1))} →
        </Link>
      )}
    </nav>
  );

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
      <div className="space-y-6">
        <SampleBanner />
        <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
          <p className="text-base font-medium">No Bell rang on {formatDay(day)}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Bells ring daily at 15:00 UTC. Days before the first live Bell are covered by replays where real candles
            exist.
          </p>
          <Link href="/bell" className="btn btn-primary mt-6">
            Go to today&apos;s Bell
          </Link>
        </div>
        {nav}
      </div>
    );
  }

  const bell = query.data;
  return (
    <div className="space-y-8">
      <SampleBanner />
      <Overview bell={bell} />
      {bell.status === "settled" && <Verdict bell={bell} title="Verdict" />}
      <AllCalls bell={bell} latest={bell.day === latest} />
      {nav}
    </div>
  );
}

function Overview({ bell }: { bell: BellSummary }) {
  const settled = bell.status === "settled";
  return (
    <section aria-label="Summary" className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <KindBadge kind={bell.kind} />
        <span className={`chip ${settled ? "" : "border-accent/40 text-accent-strong"}`}>
          {settled ? "Settled" : "Open"}
        </span>
        <span className="text-xs text-subtle">
          Rang {formatDay(bell.rungAt.slice(0, 10))}, {formatUtcTime(bell.rungAt)}
          {settled && ` · settled ${formatDay(bell.horizonAt.slice(0, 10))}, ${formatUtcTime(bell.horizonAt)}`}
        </span>
      </div>
      {!settled && (
        <p className="mt-3 text-sm text-muted">
          Settles at {formatUtcTime(bell.horizonAt)} on {formatDay(bell.horizonAt.slice(0, 10))}, in{" "}
          <Countdown to={Date.parse(bell.horizonAt)} className="text-foreground" />.
        </p>
      )}
      <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Entry price">
          {formatPrice(bell.entryPrice)} <span className="text-xs text-subtle">WMON</span>
        </Stat>
        <Stat label="Settle price">
          {settled ? (
            <>
              {formatPrice(bell.settlePrice)} <span className="text-xs text-subtle">WMON</span>
            </>
          ) : (
            "—"
          )}
        </Stat>
        <Stat label="$CHOG moved">{settled ? <Forecast pct={bell.actualPct} /> : "—"}</Stat>
        <Stat label="Calls">{bell.calls.toLocaleString("en-US")}</Stat>
      </dl>
      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_14rem] md:items-end">
        <HerdHistogram
          bell={bell}
          marks={settled && bell.actualPct !== null ? [{ pct: bell.actualPct, label: "Actual", tone: "actual" }] : []}
        />
        <BullBearBar bell={bell} />
      </div>
      <p className="mt-4 text-xs text-subtle">
        {bell.kind === "replay"
          ? "Replay: rebuilt from real past CHOG/WMON hourly candles with the same rules as live Bells."
          : "Live: rung on schedule."}{" "}
        Prices are WMON per $CHOG from the real CHOG/WMON pool.
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
        title="Every call"
        hint={
          latest && ridesOpen
            ? "Ride one Chog per Bell while the ride window is open."
            : latest
              ? `${settled ? "Settled: each call's points, error and hit or miss." : "Settles at the horizon."} A ride you take now books the next Bell.`
              : settled
                ? "Settled: each call's points, error and hit or miss."
                : "Settles at the horizon."
        }
      />
      <div role="group" aria-label="Sort calls" className="mb-3 flex flex-wrap gap-1.5">
        {sorts.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={sort === id}
            onClick={() => setSort(id)}
            className={`chip transition-colors ${
              sort === id ? "border-accent bg-accent/15 text-foreground" : "hover:border-accent hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="card overflow-hidden">
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
          <p className="px-4 py-10 text-center text-sm text-subtle">No calls at this Bell.</p>
        ) : (
          <ol aria-label={`Calls, ${SORTS.find((s) => s.id === sort)?.label.toLowerCase()} first`}>
            {calls.map((call: BellCall) => (
              <CallRow key={call.tokenId} call={call} bell={bell} ride={latest} />
            ))}
          </ol>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-subtle">
        <span aria-live="polite">
          Showing {calls.length.toLocaleString("en-US")} of {bell.calls.toLocaleString("en-US")} calls
        </span>
        {pages.hasNextPage && (
          <button
            type="button"
            onClick={() => pages.fetchNextPage()}
            disabled={pages.isFetchingNextPage}
            className="btn btn-secondary"
          >
            {pages.isFetchingNextPage ? "Loading…" : "Load more calls"}
          </button>
        )}
      </div>
      {pages.isFetchNextPageError && (
        <p role="alert" className="mt-2 text-xs text-danger">
          Couldn&apos;t load more calls: {pages.error?.message}
        </p>
      )}
    </section>
  );
}

function CallRowsSkeleton({ announce = true }: { announce?: boolean }) {
  return (
    <div role={announce ? "status" : undefined}>
      {announce && <span className="sr-only">Loading calls…</span>}
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} aria-hidden className="flex gap-3 border-b border-line/60 px-4 py-3.5 last:border-0">
          <Skeleton className="size-10" />
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
      <span className="sr-only">Loading this Bell…</span>
      <div className="card space-y-4 p-6">
        <Skeleton className="h-5 w-48" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
        <Skeleton className="h-36" />
      </div>
      <div className="card">
        <CallRowsSkeleton announce={false} />
      </div>
    </div>
  );
}
