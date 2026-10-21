"use client";

import Link from "next/link";
import { useState } from "react";
import type { ChogBellStanding, FanResponse, FanStanding } from "@/lib/bell/types";
import { useFan, useStandings } from "./api";
import { ChogAvatar, LoadError, SectionTitle, Skeleton } from "./bits";
import { fanName, formatErrorPts, formatPoints, hitRate } from "./format";
import { FlameIcon } from "./icons";

const RANK_TONE = ["text-warning", "text-foreground", "text-orange-300"];
const TOP = 10;

/** Season standings: Chogs by forecasting points (replays included) and fans by points from their rides. */
export function SeasonStandings() {
  const standings = useStandings();
  const fan = useFan();
  const [tab, setTab] = useState<"chogs" | "fans">("chogs");

  return (
    <section aria-label="Season standings">
      <SectionTitle
        title="Season standings"
        hint={tab === "chogs" ? "Chogs score every settled Bell, replays included." : "Fans score the Chogs they ride."}
      />
      <div className="card overflow-hidden">
        <div role="group" aria-label="Show standings for" className="flex gap-1 border-b border-line p-1.5">
          {(["chogs", "fans"] as const).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === id ? "bg-accent/15 text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {id === "chogs" ? "Chogs" : "Fans"}
            </button>
          ))}
        </div>
        {standings.isPending ? (
          <div role="status" className="space-y-3 p-4">
            <span className="sr-only">Loading standings…</span>
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
          <ChogTable rows={standings.data.chogs} />
        ) : (
          <FanTable rows={standings.data.fans} me={fan.data} />
        )}
      </div>
    </section>
  );
}

function Rank({ rank }: { rank: number }) {
  return (
    <span className={`w-7 shrink-0 font-mono text-sm font-semibold tabular-nums ${RANK_TONE[rank - 1] ?? "text-subtle"}`}>
      <span className="sr-only">Rank </span>
      {rank}
    </span>
  );
}

function Points({ value }: { value: number }) {
  return (
    <span className="font-mono text-sm font-semibold tabular-nums">
      {formatPoints(value)}
      <span className="ml-0.5 text-[11px] font-normal text-subtle">pts</span>
    </span>
  );
}

function ChogTable({ rows }: { rows: ChogBellStanding[] }) {
  if (rows.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-subtle">Chogs show up here once the first Bell settles.</p>;
  }
  return (
    <ol>
      {rows.slice(0, TOP).map((row, i) => (
        <li key={row.tokenId} className="border-b border-line/60 last:border-0">
          <Link
            href={`/chog/${row.tokenId}`}
            className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/[0.07]"
          >
            <Rank rank={row.rank ?? i + 1} />
            <ChogAvatar src={row.image} tokenId={row.tokenId} className="size-9 rounded-lg" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">Chog #{row.tokenId}</span>
              <span
                className="block truncate text-[11px] text-subtle"
                title={`${row.hits} of ${row.calls} calls hit · average error ${formatErrorPts(row.avgErrorPts)}`}
              >
                {hitRate(row.hits, row.calls)}% hits
                {row.oracleWins > 0 && ` · ${row.oracleWins} Oracle ${row.oracleWins === 1 ? "win" : "wins"}`} · off{" "}
                {formatErrorPts(row.avgErrorPts)}
              </span>
            </span>
            <Points value={row.totalPoints} />
          </Link>
        </li>
      ))}
    </ol>
  );
}

function FanTable({ rows, me }: { rows: FanStanding[]; me?: FanResponse }) {
  const shown = rows.slice(0, TOP);
  // The visitor's own row when they rank below the top rows (rank comes with GET /api/fan).
  const mine = me && me.rank && !shown.some((row) => row.fanId === me.fanId) ? me : undefined;
  if (shown.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-subtle">No fans on the board yet. Ride a Chog to be first.</p>;
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
      className={`flex items-center gap-3 border-b border-line/60 px-4 py-2.5 last:border-0 ${you ? "bg-accent/10" : ""} ${
        separated ? "border-t border-dashed border-t-line" : ""
      }`}
    >
      <Rank rank={rank} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{fanName(row)}</span>
          {you && <span className="chip border-accent/40 py-0 text-[10px] text-accent-strong">You</span>}
        </span>
        {row.streak > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-subtle">
            <FlameIcon className="size-3 text-warning" />
            {row.streak}-day streak
          </span>
        )}
      </span>
      <Points value={row.points} />
    </li>
  );
}
