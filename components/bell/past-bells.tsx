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
      <SectionTitle title="Past Bells" hint="Replays were rebuilt from real past $CHOG candles." />
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-subtle">
          No past Bells yet. The first one settles 24 hours after it rings.
        </p>
      ) : (
        <ol className="card overflow-hidden">
          {rows.map(({ day, query }) => (
            <PastBellRow key={day} day={day} bell={query.data} pending={query.isPending} />
          ))}
        </ol>
      )}
    </section>
  );
}

function PastBellRow({ day, bell, pending }: { day: string; bell?: BellSummary; pending: boolean }) {
  return (
    <li className="border-b border-line/60 last:border-0">
      <Link
        href={`/bell/${day}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/[0.07]"
      >
        <span className="w-28 shrink-0">
          <span className="block text-sm font-medium">{formatDay(day)}</span>
          {bell ? <KindBadge kind={bell.kind} /> : pending && <Skeleton className="mt-1 h-4 w-12" />}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-subtle">
          {bell?.oracle ? (
            <>
              Oracle <span className="font-semibold text-muted">Chog #{bell.oracle.tokenId}</span>
            </>
          ) : bell?.status === "open" ? (
            "Settling…"
          ) : null}
        </span>
        {bell?.status === "settled" ? (
          <Forecast pct={bell.actualPct} size="sm" />
        ) : (
          pending && <Skeleton className="h-4 w-14" />
        )}
        <span aria-hidden className="text-subtle">
          ›
        </span>
      </Link>
    </li>
  );
}
