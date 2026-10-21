"use client";

import Link from "next/link";
import { useNow } from "@/components/decision-feed";
import { BELL_COPY } from "@/lib/bell/rules";
import type { BellSummaryResponse } from "@/lib/bell/types";
import { Countdown, Forecast, KindBadge, LABEL, Skeleton, useBefore } from "./bits";
import { RIDE_WINDOW_HOURS, formatDay, formatPrice, formatUtcTime, nextBellAt, ringOverdue, signedPct } from "./format";
import { BullBearBar, HerdHistogram, herdAverage } from "./herd";
import { BellIcon } from "./icons";

/** "(17:00 your time)" for a UTC time, after mount only (the server doesn't know the visitor's zone). */
function LocalTime({ at }: { at: number | null }) {
  if (at === null) return null;
  const local = new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const utc = new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  if (local.replace(/\D/g, "") === utc.replace(/\D/g, "")) return null;
  return <span className="font-normal text-subtle"> ({local} your time)</span>;
}

/**
 * The Bell's hero: while rides are open, the countdown to their close; otherwise to the next 15:00 UTC
 * ring (browser clock only, so the server and hydration render "--:--:--"). Then the latest Bell's
 * status and its herd.
 */
export function BellHero({ bell, pending }: { bell?: BellSummaryResponse; pending: boolean }) {
  const now = useNow();
  const beforeClose = useBefore(bell ? Date.parse(bell.rideWindowClosesAt) : Number.NaN);
  const overdue = Boolean(bell && now !== null && ringOverdue(bell.day, now));
  const ridesOpen = Boolean(bell?.kind === "live" && bell.status === "open" && beforeClose);
  const nextRing = now === null ? null : nextBellAt(now);

  return (
    <section aria-label="Today's Bell" className="card relative overflow-hidden p-5 sm:p-7">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-28 -left-20 size-80 rounded-full bg-accent/20 blur-3xl"
      />
      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center">
        <div>
          {ridesOpen && bell ? (
            <>
              <p className="flex items-center gap-2 text-sm font-medium text-muted">
                <BellIcon className="bell-swing size-5 text-accent-strong" />
                Rides are open · Bell of {formatDay(bell.day)}
              </p>
              <p className="mt-2 text-5xl font-semibold tracking-tight sm:text-6xl">
                <Countdown to={Date.parse(bell.rideWindowClosesAt)} />
              </p>
              <p className="mt-2 text-sm text-muted">
                left to ride, until {formatUtcTime(bell.rideWindowClosesAt)}
                <LocalTime at={now === null ? null : Date.parse(bell.rideWindowClosesAt)} />. One Chog per Bell, no
                wallet needed.
              </p>
            </>
          ) : (
            <>
              <p className="flex items-center gap-2 text-sm font-medium text-muted">
                <BellIcon className={`size-5 text-accent-strong ${overdue ? "bell-swing" : ""}`} />
                <span>
                  Next Bell · 15:00 UTC
                  <LocalTime at={nextRing} />
                </span>
              </p>
              <p className="mt-2 text-5xl font-semibold tracking-tight sm:text-6xl">
                <Countdown to={nextRing} />
              </p>
              <p className="mt-2 text-sm text-muted">
                Pick a Chog now and it rides the next Bell: one Chog per Bell, no wallet needed. Rides stay open for{" "}
                {RIDE_WINDOW_HOURS} hours after each ring.
              </p>
            </>
          )}
          <div className="mt-6 rounded-xl border border-line bg-surface-2/60 p-4">
            {overdue ? (
              <p className="flex items-center gap-2 text-sm font-medium text-accent-strong">
                <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Ding! The Bell is ringing. Fresh calls land any minute.
              </p>
            ) : bell ? (
              <BellStatus bell={bell} ridesOpen={ridesOpen} />
            ) : pending ? (
              <Skeleton className="h-12" />
            ) : (
              <p className="text-sm text-muted">The first Bell hasn&apos;t rung yet. Be here at 15:00 UTC.</p>
            )}
          </div>
        </div>

        <div className="min-w-0">
          {bell ? (
            <Herd bell={bell} />
          ) : pending ? (
            <div role="status" className="space-y-3">
              <span className="sr-only">Loading the herd…</span>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-36" />
              <Skeleton className="h-2" />
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-line px-4 py-12 text-center text-sm text-subtle">
              The herd shows up here once the first calls are in.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function BellStatus({ bell, ridesOpen }: { bell: BellSummaryResponse; ridesOpen: boolean }) {
  const entry = (
    <>
      {bell.live && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
          So far: $CHOG <Forecast pct={bell.live.movePct} size="sm" /> since the ring
          <span className="text-xs text-subtle">(provisional: the Bell settles on the hourly close)</span>
        </p>
      )}
      <p className="mt-1.5 text-xs text-subtle">
        Entry price <span className="font-mono text-muted">{formatPrice(bell.entryPrice)}</span> WMON per $CHOG, from
        the real CHOG/WMON pool.
      </p>
    </>
  );
  if (bell.status === "settled") {
    return (
      <>
        <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
          {bell.kind === "replay" ? "Latest replay settled:" : "Settled:"} $CHOG moved{" "}
          <Forecast pct={bell.actualPct} />
        </p>
        <p className="mt-1 text-xs text-subtle">
          <span className="font-mono text-muted">{formatPrice(bell.entryPrice)}</span> →{" "}
          <span className="font-mono text-muted">{formatPrice(bell.settlePrice)}</span> WMON per $CHOG over 24h.
        </p>
        <p className="mt-2 text-sm text-muted">
          {bell.kind === "replay"
            ? "Live Bells start at the next ring. Until then, replays rebuilt from real candles show how the herd calls."
            : "The next Bell rings at 15:00 UTC."}{" "}
          Pick a Chog now to ride it there.
        </p>
      </>
    );
  }
  if (ridesOpen) {
    return (
      <>
        {/* The hero's big number already counts down to the close. */}
        <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
          <span aria-hidden className="size-2 animate-pulse rounded-full bg-success" />
          Rides are open
        </p>
        <p className="mt-1 text-sm text-muted">
          Pick one Chog to ride before {formatUtcTime(bell.rideWindowClosesAt)}. You score when its call settles.
        </p>
        <p className="mt-1 text-xs text-subtle">{BELL_COPY.ride}</p>
        {entry}
      </>
    );
  }
  return (
    <>
      <p className="text-sm font-medium">
        {bell.kind === "replay" ? "A replay is settling" : "This Bell's rides are locked in"}
      </p>
      <p className="mt-1 text-sm text-muted">
        Every call settles at {formatUtcTime(bell.horizonAt)}, in{" "}
        <Countdown to={Date.parse(bell.horizonAt)} className="text-foreground" />.
        {bell.kind === "replay" && " Replays are rebuilt from real candles and take no rides."}
      </p>
      <p className="mt-1 text-xs text-subtle">{BELL_COPY.book}</p>
      {entry}
    </>
  );
}

function Herd({ bell }: { bell: BellSummaryResponse }) {
  const average = herdAverage(bell.histogram);
  const marks =
    bell.status === "settled" && bell.actualPct !== null
      ? [{ pct: bell.actualPct, label: "Actual", tone: "actual" as const }]
      : bell.live
        ? [{ pct: bell.live.movePct, label: "Now", tone: "actual" as const }]
        : [];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className={LABEL}>The herd · Bell of {formatDay(bell.day)}</h2>
        <KindBadge kind={bell.kind} />
      </div>
      <HerdHistogram bell={bell} marks={marks} />
      <BullBearBar bell={bell} className="mt-4" />
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
        <span>{bell.calls.toLocaleString("en-US")} calls</span>
        {average !== null && <span>Herd average ≈ {signedPct(average)}</span>}
        <Link href={`/bell/${bell.day}`} className="ml-auto font-medium text-accent-strong hover:underline">
          See every call →
        </Link>
      </p>
    </div>
  );
}
