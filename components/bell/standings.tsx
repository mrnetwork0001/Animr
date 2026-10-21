"use client";

import Link from "next/link";
import { useState } from "react";
import type { BellSeason, ChogBellStanding, FanResponse, FanStanding } from "@/lib/bell/types";
import { useFan, useStandings } from "./api";
import { ChogAvatar, LoadError, SectionTitle, Skeleton } from "./bits";
import { fanName, formatDay, formatErrorPts, formatPoints, formatUtcTime, hitRate } from "./format";
import { FlameIcon } from "./icons";
import { useChogTag } from "./names";

/** The podium in teal, then neutrals. */
const RANK_TONE = ["text-[var(--v2-teal)]", "text-[var(--v2-kicker)]", "text-[var(--v2-violet-ink)]"];
const TOP = 10;

/**
 * "No live Bell has settled yet. The first settles Thu, Oct 22 after 15:10 UTC." from the season's data, or null once
 * one has.
 */
export function noLiveBellLine(season?: BellSeason): string | null {
  if (!season || season.liveSettled > 0) return null;
  const at = season.firstLiveSettlesAt;
  return `No live Bell has settled yet.${at ? ` The first settles ${formatDay(at.slice(0, 10))} after ${formatUtcTime(at)}.` : ""}`;
}

/** "Simulated · 14 replayed Bells": the label every replay-derived record carries. */
export function replayLabel(season?: BellSeason): string {
  const n = season?.replaySettled ?? 0;
  return n > 0 ? `Simulated · ${n} replayed ${n === 1 ? "Bell" : "Bells"}` : "Simulated · replayed Bells";
}

/**
 * Season standings: Chogs by forecasting points on LIVE Bells, and fans by points from their rides. Until a live Bell
 * settles, the Chogs tab says so and shows the replayed Bells' standings beneath, labelled as simulated.
 */
export function SeasonStandings() {
  const standings = useStandings();
  const fan = useFan();
  const [tab, setTab] = useState<"chogs" | "fans">("chogs");
  const season = standings.data?.season;
  const liveBells = season?.liveSettled ?? 0;

  return (
    <section aria-label="Season standings">
      <SectionTitle
        compact
        title="Season standings"
        hint={
          tab === "fans"
            ? "Fans score the Chogs they ride."
            : liveBells > 0
              ? `Live Bells only · ${liveBells} settled.`
              : "Live Bells only."
        }
      />
      <div className="v2-card v2-card--flush overflow-hidden">
        <div className="border-b border-[var(--v2-line-soft)] p-2">
          <div role="group" aria-label="Show standings for" className="v2-tabs flex w-full">
            {(["chogs", "fans"] as const).map((id) => (
              <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)} className="v2-tab flex-1">
                {id === "chogs" ? "Chogs" : "Fans"}
              </button>
            ))}
          </div>
        </div>
        {standings.isPending ? (
          <div role="status" className="space-y-3 p-4">
            <span className="v2-sr">Loading standings…</span>
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : standings.isError ? (
          <div className="p-3">
            <LoadError
              title="Couldn't load the standings"
              error={standings.error}
              onRetry={() => standings.refetch()}
              retrying={standings.isFetching}
            />
          </div>
        ) : tab === "chogs" ? (
          <ChogTable rows={standings.data.chogs} replay={standings.data.replay ?? []} season={season} />
        ) : (
          <FanTable rows={standings.data.fans} me={fan.data} />
        )}
      </div>
    </section>
  );
}

function Rank({ rank }: { rank: number }) {
  return (
    <span className={`v2-num w-7 shrink-0 text-[17px] ${RANK_TONE[rank - 1] ?? "text-[var(--v2-faint)]"}`}>
      <span className="v2-sr">Rank </span>
      {rank}
    </span>
  );
}

function Points({ value }: { value: number }) {
  return (
    <span className="v2-num text-[16px] text-[var(--v2-ink)]">
      {formatPoints(value)}
      <span className="ml-1 font-[family-name:var(--v2-font-text)] text-[11px] text-[var(--v2-faint)]">pts</span>
    </span>
  );
}

function ChogTable({ rows, replay, season }: { rows: ChogBellStanding[]; replay: ChogBellStanding[]; season?: BellSeason }) {
  if (rows.length === 0) {
    return (
      <>
        <p className="v2-note px-4 py-6 text-center">
          {noLiveBellLine(season) ?? "Chogs show up here once the first live Bell settles."}
        </p>
        {replay.length > 0 && (
          <>
            <p className="border-t border-[var(--v2-line-soft)] px-4 pt-4 pb-1 text-[11px] font-medium tracking-wide text-[var(--v2-faint)] uppercase">
              {replayLabel(season)}
            </p>
            <ol aria-label={`Replay standings, ${replayLabel(season).toLowerCase()}`}>
              {replay.slice(0, TOP).map((row, i) => (
                <ChogRow key={row.tokenId} row={row} rank={row.rank ?? i + 1} />
              ))}
            </ol>
          </>
        )}
      </>
    );
  }
  return (
    <ol>
      {rows.slice(0, TOP).map((row, i) => (
        <ChogRow key={row.tokenId} row={row} rank={row.rank ?? i + 1} />
      ))}
    </ol>
  );
}

function ChogRow({ row, rank }: { row: ChogBellStanding; rank: number }) {
  const tag = useChogTag(row.tokenId);
  return (
    <li className="border-b border-[var(--v2-line-soft)] last:border-0">
      <Link
        href={`/chog/${row.tokenId}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[rgb(255_255_255/0.03)]"
      >
        <Rank rank={rank} />
        <ChogAvatar src={row.image} tokenId={row.tokenId} className="size-9 rounded-[9px]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-[var(--v2-ink)]">
            {row.name || tag}
            {row.name && tag && <span className="font-normal text-[var(--v2-faint)]"> · {tag}</span>}
          </span>
          <span
            className="block truncate text-[11px] text-[var(--v2-faint)]"
            title={`${row.hits} of ${row.calls} calls got the direction right${
              row.oracleWins > 0 ? `; best call of the day ${row.oracleWins} ${row.oracleWins === 1 ? "time" : "times"}` : ""
            }`}
          >
            {hitRate(row.hits, row.calls)}% hit rate · avg miss {formatErrorPts(row.avgErrorPts)}
          </span>
        </span>
        <Points value={row.totalPoints} />
      </Link>
    </li>
  );
}

function FanTable({ rows, me }: { rows: FanStanding[]; me?: FanResponse }) {
  const shown = rows.slice(0, TOP);
  // The visitor's own row when they rank below the top rows (rank comes with GET /api/fan).
  const mine = me && me.rank && !shown.some((row) => row.fanId === me.fanId) ? me : undefined;
  if (shown.length === 0) {
    return <p className="v2-note px-4 py-8 text-center">No fans on the board yet. Ride a Chog to be first.</p>;
  }
  return (
    <ol>
      {shown.map((row, i) => (
        <FanRow key={row.fanId} row={row} rank={row.rank ?? i + 1} you={row.fanId === me?.fanId} />
      ))}
      {mine && <FanRow row={mine} rank={mine.rank ?? 0} you separated />}
    </ol>
  );
}

function FanRow({
  row,
  rank,
  you,
  separated = false,
}: {
  row: Pick<FanStanding, "fanId" | "nickname" | "points" | "streak">;
  rank: number;
  you: boolean;
  separated?: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-3 border-b border-[var(--v2-line-soft)] px-4 py-3 last:border-0 ${
        you ? "bg-[rgb(111_90_220/0.1)] shadow-[inset_2px_0_0_var(--v2-teal)]" : ""
      } ${separated ? "border-t border-dashed border-t-[var(--v2-line)]" : ""}`}
    >
      <Rank rank={rank} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-[var(--v2-ink)]">{fanName(row)}</span>
          {you && <span className="v2-badge v2-badge--teal h-5">You</span>}
        </span>
        {row.streak > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-[var(--v2-faint)]">
            <FlameIcon className="size-3 text-[var(--v2-teal)]" />
            {row.streak}-day streak
          </span>
        )}
      </span>
      <Points value={row.points} />
    </li>
  );
}
