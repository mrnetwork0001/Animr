"use client";

import Link from "next/link";
import { useChogBell, useTodayBell } from "@/components/bell/api";
import { Forecast, SourceBadge } from "@/components/bell/bits";
import { pillClass } from "@/components/v2/primitives";
import { appConfig } from "@/lib/config";
import { HiddenChogNotice } from "@/components/stats/hidden-notice";
import { useHiddenChogs } from "../hidden-chogs";
import { DnaApiError, useStanding } from "./api";
import { EdgeBadge } from "./edge-badge";
import { StyleChip } from "./genome-card";
import { PlayIcon } from "./icons";
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
      <section aria-label="Trading DNA" className="border-t border-[var(--v2-line-soft)] px-5 py-5 sm:px-6">
        <HiddenChogNotice tokenId={id} />
      </section>
    );
  }
  const row = standing.data?.row;
  const call = bell.data?.today;
  const replayed = latest.data?.kind === "replay";

  return (
    <section aria-label="Trading DNA" className="border-t border-[var(--v2-line-soft)] px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="v2-kicker">Trading DNA · every Chog is already a trader</h4>
        {row && <StyleChip style={row.style} />}
      </div>

      {row ? (
        <>
          <p className="v2-h3 mt-2.5">
            {row.archetype} <span className="text-sm font-normal text-[var(--v2-nav)]">· {row.name}</span>
          </p>
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-sm text-[var(--v2-nav)]">
            <span>
              League <span className="v2-num text-[var(--v2-ink)]">#{formatInt(row.rank)}</span> of{" "}
              {formatInt(standing.data?.total ?? CHOG_COUNT)}
            </span>
            <EdgeBadge pct={row.edgePct} className="text-[15px]" />
            <span className="text-xs text-[var(--v2-faint)]">vs holding, last {WINDOW_LABEL[DEFAULT_WINDOW]}</span>
          </p>
        </>
      ) : standing.isError ? (
        <p className="mt-2 text-sm text-[var(--v2-danger)]">Couldn&apos;t load its DNA: {standing.error.message}</p>
      ) : (
        <div aria-hidden className="mt-3 space-y-2.5">
          <span className="v2-skeleton block h-6 w-48 rounded-lg" />
          <span className="v2-skeleton v2-skeleton--text block w-64" />
        </div>
      )}

      {call && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--v2-nav)]">
          Daily Bell call{replayed ? " (replay)" : ""}: <Forecast pct={call.forecastPct} size="sm" />
          <span className="text-xs text-[var(--v2-faint)]">{replayed ? "$CHOG over 24h, rebuilt from past candles" : "$CHOG in 24h"}</span>
          <SourceBadge source={call.source} />
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/replay/${id}`} className={pillClass("glass", "sm")}>
          <PlayIcon className="size-3.5 text-[var(--v2-teal)]" /> Watch its replay
        </Link>
        <Link href={`/chog/${id}`} className={pillClass("ghost", "sm")}>
          Profile
        </Link>
        <Link href={`/chog/${id}#bell`} className={pillClass("ghost", "sm")}>
          Its Bell call
        </Link>
      </div>
      <p className="v2-note mt-3">League: {SIM_LABEL}.</p>
    </section>
  );
}
