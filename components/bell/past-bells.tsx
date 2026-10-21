"use client";

import Link from "next/link";
import type { BellSummary } from "@/lib/bell/types";
import { isNotFound, useBells } from "./api";
import { Forecast, KindBadge, SectionTitle, Skeleton } from "./bits";
import { formatDay } from "./format";

/** Links to recent Bells with their real move and Oracle; days without a Bell are left out. */
export function PastBells({ days }: { days: string[] }) {
  const bells = useBells(days);
  const rows = days
    .map((day, i) => ({ day, query: bells[i] }))
    .filter(({ query }) => !(query.isError && isNotFound(query.error)));

  return (
    <section aria-label="Past Bells">
      <SectionTitle compact kicker="Archive" title="Past Bells" hint="Replays were rebuilt from real past $CHOG candles." />
      {rows.length === 0 ? (
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
          <span className="v2-overline tracking-[0.08em] whitespace-nowrap">{formatDay(day)}</span>
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
              Oracle <span className="text-[var(--v2-muted)]">Chog #{bell.oracle.tokenId}</span>
            </>
          ) : (
            "\u00a0"
          )}
        </span>
      </Link>
    </li>
  );
}
