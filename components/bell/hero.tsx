"use client";

import Link from "next/link";
import { useSoundAt } from "@/components/audio/use-sound";
import { useNow } from "@/components/decision-feed";
import { utcDay } from "@/lib/bell/rules";
import type { BellSummaryResponse } from "@/lib/bell/types";
import { Countdown, Forecast, LABEL, Skeleton, useBefore } from "./bits";
import { formatDay, formatPrice, formatUtcTime, nextBellAt, ringOverdue, shiftDay, signedPct } from "./format";
import { BullBearBar, HerdHistogram, herdAverage } from "./herd";

/** The practice game's anchor on a past Bell's page (bell-day-view.tsx). */
export const PRACTICE_ID = "practice";

/** "(17:00 your time)" for a UTC time, after mount only (the server doesn't know the visitor's zone). */
function LocalTime({ at }: { at: number | null }) {
  if (at === null) return null;
  const local = new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const utc = new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  if (local.replace(/\D/g, "") === utc.replace(/\D/g, "")) return null;
  return <span className="text-[var(--v2-faint)]"> ({local} your time)</span>;
}

/**
 * The Bell's one status card on /bell: a single countdown (to the ride window's close while rides are open, else to
 * the next 15:00 UTC ring, which is also when today's calls settle), one status sentence, $CHOG's move so far, and the
 * crowd: every call bucketed, with the symmetric bull/bear split. The clock is the browser's, so the server and
 * hydration render "--:--:--".
 */
export function BellHero({ bell, pending }: { bell?: BellSummaryResponse; pending: boolean }) {
  const now = useNow();
  const beforeClose = useBefore(bell ? Date.parse(bell.rideWindowClosesAt) : Number.NaN);
  const overdue = Boolean(bell && now !== null && ringOverdue(bell.day, now));
  const ridesOpen = Boolean(bell?.kind === "live" && bell.status === "open" && beforeClose);

  return (
    <section aria-label="Today's Bell" className="v2-card v2-card--feature v2-card--roomy">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-12">
        <div className="grid content-start gap-4">
          {pending && !bell ? (
            <div role="status" className="grid gap-3">
              <span className="v2-sr">Loading the Bell…</span>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-16 w-64" />
              <Skeleton className="h-10" />
            </div>
          ) : (
            <Clock bell={bell} ridesOpen={ridesOpen} overdue={overdue} now={now} />
          )}
        </div>

        <div className="min-w-0">
          {bell ? (
            <Crowd bell={bell} />
          ) : pending ? (
            <div role="status" className="space-y-3">
              <span className="v2-sr">Loading all calls…</span>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-40" />
              <Skeleton className="h-3" />
            </div>
          ) : (
            <div className="v2-empty">
              <p className="v2-empty-title">Every call shows up here</p>
              <p className="v2-empty-body">once the first Bell rings.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Clock({
  bell,
  ridesOpen,
  overdue,
  now,
}: {
  bell?: BellSummaryResponse;
  ridesOpen: boolean;
  overdue: boolean;
  now: number | null;
}) {
  const closesAt = bell ? Date.parse(bell.rideWindowClosesAt) : null;
  const nextRing = now === null ? null : nextBellAt(now);
  // The Bell strikes when the ring comes (sound is opt-in: components/audio).
  useSoundAt("bell", nextRing);
  const target = ridesOpen ? closesAt : nextRing;
  // The newest settled Bell: the practice game sits on its page.
  const practiceDay = bell ? (bell.status === "settled" ? bell.day : shiftDay(bell.day, -1)) : null;

  let status: string;
  if (!bell) status = "The first Bell hasn't rung yet. Pick a Chog at 15:00 UTC.";
  else if (ridesOpen) status = "Rides are open: pick one Chog below. Your ride counts from the next hourly close.";
  else if (bell.kind === "replay")
    status = `${
      now !== null && bell.day === utcDay(now) ? "Today's calls are" : `The Bell of ${formatDay(bell.day)} is`
    } a replay rebuilt from real candles; the next live Bell rings at 15:00 UTC.`;
  else if (bell.status === "settled") status = `The Bell of ${formatDay(bell.day)} has settled. A Chog you pick now rides the next one.`;
  else status = "This Bell's rides are locked in and its calls settle at the next ring. A Chog you pick now rides that Bell.";

  return (
    <>
      {overdue ? (
        <p className="flex items-center gap-2.5 text-[length:var(--v2-fs-base)] text-[var(--v2-kicker)]">
          <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          The Bell is ringing. Fresh calls land any minute.
        </p>
      ) : (
        <div>
          <p className={LABEL}>{ridesOpen ? "Rides close in" : "Next Bell in"}</p>
          <Countdown to={target} className="bell-countdown mt-2" />
          <p className="v2-note mt-2">
            {ridesOpen && bell ? formatUtcTime(bell.rideWindowClosesAt) : "15:00 UTC"}
            <LocalTime at={target} />
          </p>
        </div>
      )}
      <p className="v2-body m-0 text-pretty">{status}</p>
      {bell?.live && bell.status === "open" && (
        <p
          className="m-0 flex flex-wrap items-baseline gap-x-2 text-[length:var(--v2-fs-sm)] text-[var(--v2-nav)]"
          title={`From the entry price, ${formatPrice(bell.entryPrice)} WMON per $CHOG on the real CHOG/WMON pool`}
        >
          So far: $CHOG <Forecast pct={bell.live.movePct} size="md" /> since the ring
        </p>
      )}
      {practiceDay && (
        <Link href={`/bell/${practiceDay}#${PRACTICE_ID}`} className="v2-link text-[length:var(--v2-fs-sm)]">
          Practice on a past Bell →
        </Link>
      )}
    </>
  );
}

function Crowd({ bell }: { bell: BellSummaryResponse }) {
  const average = herdAverage(bell.histogram);
  const marks =
    bell.status === "settled" && bell.actualPct !== null
      ? [{ pct: bell.actualPct, label: "Actual", tone: "actual" as const }]
      : bell.live
        ? [{ pct: bell.live.movePct, label: "Now", tone: "actual" as const }]
        : [];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-medium text-[var(--v2-ink)]">All calls</h2>
        <span className="text-xs text-[var(--v2-faint)]">Bell of {formatDay(bell.day)}</span>
      </div>
      <HerdHistogram bell={bell} marks={marks} />
      <BullBearBar bell={bell} className="mt-6" />
      <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--v2-faint)]">
        <span>
          <span className="v2-num text-[var(--v2-muted)]">{bell.calls.toLocaleString("en-US")}</span> calls
        </span>
        {average !== null && (
          <span>
            Average call ≈ <span className="v2-num text-[var(--v2-muted)]">{signedPct(average)}</span>
          </span>
        )}
        <Link href={`/bell/${bell.day}`} className="v2-link ml-auto">
          See every call
        </Link>
      </p>
    </div>
  );
}
