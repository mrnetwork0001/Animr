"use client";

import Link from "next/link";
import type { BellSummary } from "@/lib/bell/types";
import { isNotFound, useBells } from "./api";
import { Forecast, KindBadge, SectionTitle, Skeleton } from "./bits";
import { formatDay } from "./format";

/** How many tiles hold the room while the Bell index loads (the index gives up to PAST_DAYS). */
const PLACEHOLDER_TILES = 6;

/**
 * Links to recent Bells with their real move and Best call. `days` come from the Bell index (only days with a
 * Bell); `pending` while that index loads, so the tiles hold their room instead of arriving later.
 */
export function PastBells({ days, pending = false }: { days: string[]; pending?: boolean }) {
  const bells = useBells(days);
  const rows = days
    .map((day, i) => ({ day, query: bells[i] }))
    .filter(({ query }) => !(query.isError && isNotFound(query.error)));

  return (
    <section aria-label="Past Bells">
      <SectionTitle compact title="Past Bells" hint="Replays are rebuilt from real past $CHOG candles." />
      {rows.length === 0 && pending ? (
        <ol role="status" aria-label="Loading past Bells" className="grid grid-cols-2 gap-2.5">
          {Array.from({ length: PLACEHOLDER_TILES }, (_, i) => (
            <li key={i} aria-hidden className="bell-day-tile">
              <Skeleton className="h-[18px] w-20" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-[14px] w-24" />
            </li>
          ))}
        </ol>
      ) : rows.length === 0 ? (
        <div className="v2-empty">
          <p className="v2-empty-title">No past Bells yet</p>
          <p className="v2-empty-body">The first one settles 24 hours after it rings.</p>
        </div>
      ) : (
        <ol className="grid grid-cols-2 gap-2.5">
          {rows.map(({ day, query }) => (
            <PastBellTile key={day} day={day} bell={query.data} pending={query.isPending} />
          ))}
        </ol>
      )}
    </section>
  );
}

function PastBellTile({ day, bell, pending }: { day: string; bell?: BellSummary; pending: boolean }) {
  return (
    <li className="min-w-0">
      <Link href={`/bell/${day}`} className="bell-day-tile h-full">
        <span className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium whitespace-nowrap text-[var(--v2-muted)]">{formatDay(day)}</span>
          {bell ? <KindBadge kind={bell.kind} /> : pending && <Skeleton className="h-5 w-12 rounded-full" />}
        </span>
        <span className="flex min-h-7 items-end justify-between gap-2">
          {bell?.status === "settled" ? (
            <Forecast pct={bell.actualPct} size="lg" />
          ) : bell?.status === "open" ? (
            <span className="text-xs text-[var(--v2-nav)]">Settling…</span>
          ) : (
            pending && <Skeleton className="h-6 w-16" />
          )}
          <span aria-hidden className="text-[var(--v2-faint)]">
            ›
          </span>
        </span>
        <span className="truncate text-[11px] text-[var(--v2-faint)]">
          {bell?.oracle ? (
            <>
              Best call <span className="text-[var(--v2-muted)]">{bell.oracle.name}</span>
            </>
          ) : (
            "\u00a0"
          )}
        </span>
      </Link>
    </li>
  );
}
