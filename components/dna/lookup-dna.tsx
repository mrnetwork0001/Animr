"use client";

import Link from "next/link";
import { useChogBell, useTodayBell } from "@/components/bell/api";
import { Forecast, SourceBadge } from "@/components/bell/bits";
import { appConfig } from "@/lib/config";
import { HiddenChogNotice } from "@/components/stats/hidden-notice";
import { useHiddenChogs } from "../hidden-chogs";
import { DnaApiError, useStanding } from "./api";
import { EdgeBadge } from "./edge-badge";
import { StyleChip } from "./genome-card";
import { CHOG_COUNT, DEFAULT_WINDOW, SIM_LABEL, WINDOW_LABEL, formatInt, parseChogId } from "./shared";

/**
 * After a dashboard lookup: the Chog's trading DNA at a glance (archetype, league rank, simulated
 * edge, today's Bell call) with links to its replay, profile and Bell card. Chog Genesis ids only.
 */
export function LookupDna({ tokenId }: { tokenId: string }) {
  // The DNA engine covers Chog Genesis (ids 1-1969) only, not another configured collection.
  const id = appConfig.tokenIdRange.max === BigInt(CHOG_COUNT) ? (parseChogId(tokenId) ?? undefined) : undefined;
  const hiddenIds = useHiddenChogs();
  // A Chog its holder hid: the list, or the APIs' own 404 (they check the list on the server).
  const hidden = id !== undefined && hiddenIds.has(id);
  const standing = useStanding(hidden ? undefined : id, DEFAULT_WINDOW);
  const bell = useChogBell(hidden ? undefined : id);
  const latest = useTodayBell();
  if (id === undefined) return null;
  if (hidden || (standing.error instanceof DnaApiError && standing.error.status === 404 && /public pages/.test(standing.error.message))) {
    return (
      <section aria-label="Trading DNA" className="border-t border-line px-5 py-5 sm:px-6">
        <HiddenChogNotice tokenId={id} />
      </section>
    );
  }
  const row = standing.data?.row;
  const call = bell.data?.today;
  const replayed = latest.data?.kind === "replay";

  return (
    <section aria-label="Trading DNA" className="border-t border-line px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-muted">Trading DNA · every Chog is already a trader</h4>
        {row && <StyleChip style={row.style} />}
      </div>

      {row ? (
        <>
          <p className="mt-2 text-lg font-semibold tracking-tight">
            {row.archetype} <span className="text-sm font-normal text-muted">· {row.name}</span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span>
              League #{formatInt(row.rank)} of {formatInt(standing.data?.total ?? CHOG_COUNT)}
            </span>
            <EdgeBadge pct={row.edgePct} />
            <span className="text-xs text-subtle">vs holding, last {WINDOW_LABEL[DEFAULT_WINDOW]}</span>
          </p>
        </>
      ) : standing.isError ? (
        <p className="mt-2 text-sm text-danger">Couldn&apos;t load its DNA: {standing.error.message}</p>
      ) : (
        <div aria-hidden className="mt-2 space-y-2">
          <div className="h-6 w-48 animate-pulse rounded bg-surface-2" />
          <div className="h-4 w-64 animate-pulse rounded bg-surface-2/60" />
        </div>
      )}

      {call && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          Daily Bell call{replayed ? " (replay)" : ""}: <Forecast pct={call.forecastPct} size="sm" />
          <span className="text-xs text-subtle">{replayed ? "$CHOG over 24h, rebuilt from past candles" : "$CHOG in 24h"}</span>
          <SourceBadge source={call.source} />
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/replay/${id}`} className="btn btn-secondary">
          <span aria-hidden>▶</span> Watch its replay
        </Link>
        <Link href={`/chog/${id}`} className="btn btn-ghost">
          Profile
        </Link>
        <Link href={`/chog/${id}#bell`} className="btn btn-ghost">
          Its Bell call
        </Link>
      </div>
      <p className="mt-3 text-[11px] text-subtle">League: {SIM_LABEL}.</p>
    </section>
  );
}
