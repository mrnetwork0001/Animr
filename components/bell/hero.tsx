"use client";

import Link from "next/link";
import { useNow } from "@/components/decision-feed";
import { BELL_COPY } from "@/lib/bell/rules";
import type { BellSummaryResponse } from "@/lib/bell/types";
import { BellIcon as V2BellIcon } from "@/components/v2/icons";
import { useTodayBell } from "./api";
import { Countdown, Forecast, KindBadge, Skeleton, useBefore } from "./bits";
import { RIDE_WINDOW_HOURS, formatDay, formatPrice, formatUtcTime, nextBellAt, ringOverdue, signedPct } from "./format";
import { BullBearBar, HerdHistogram, herdAverage } from "./herd";

/** "(17:00 your time)" for a UTC time, after mount only (the server doesn't know the visitor's zone). */
function LocalTime({ at }: { at: number | null }) {
  if (at === null) return null;
  const local = new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const utc = new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  if (local.replace(/\D/g, "") === utc.replace(/\D/g, "")) return null;
  return <span className="text-[var(--v2-faint)]"> ({local} your time)</span>;
}

/**
 * The page header's aside: while rides are open, the big countdown to their close; otherwise to the next 15:00 UTC
 * ring (browser clock only, so the server and hydration render "--:--:--"). Reads the same cached Bell as the
 * dashboard below it.
 */
export function BellClock() {
  const today = useTodayBell();
  const bell = today.data;
  const now = useNow();
  const beforeClose = useBefore(bell ? Date.parse(bell.rideWindowClosesAt) : Number.NaN);
  const overdue = Boolean(bell && now !== null && ringOverdue(bell.day, now));
  const ridesOpen = Boolean(bell?.kind === "live" && bell.status === "open" && beforeClose);
  const nextRing = now === null ? null : nextBellAt(now);

  return (
    <section aria-label="Bell clock" className="v2-card v2-card--flush bell-clock">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2.5">
          <span className="v2-icon-tile v2-icon-tile--sm" aria-hidden>
            <V2BellIcon className={ridesOpen || overdue ? "bell-swing" : undefined} />
          </span>
          <span className="v2-overline">{ridesOpen && bell ? `Bell of ${formatDay(bell.day)}` : "Next Bell · 15:00 UTC"}</span>
        </span>
        {overdue ? (
          <span className="v2-badge v2-badge--teal v2-badge--live v2-badge--dot">Ringing</span>
        ) : ridesOpen ? (
          <span className="v2-badge v2-badge--teal v2-badge--live v2-badge--dot">Rides open</span>
        ) : (
          <span className="v2-badge v2-badge--dot">Rides book the next Bell</span>
        )}
      </div>
      {ridesOpen && bell ? (
        <>
          <Countdown to={Date.parse(bell.rideWindowClosesAt)} className="bell-countdown" />
          <p className="m-0 text-[length:var(--v2-fs-sm)] text-[var(--v2-nav)]">
            left to ride, until {formatUtcTime(bell.rideWindowClosesAt)}
            <LocalTime at={now === null ? null : Date.parse(bell.rideWindowClosesAt)} />. One Chog per Bell, no wallet
            needed.
          </p>
        </>
      ) : (
        <>
          <Countdown to={nextRing} className="bell-countdown" />
          <p className="m-0 text-[length:var(--v2-fs-sm)] text-[var(--v2-nav)]">
            until the next ring
            <LocalTime at={nextRing} />. Pick a Chog now and it rides that Bell; rides stay open for {RIDE_WINDOW_HOURS}{" "}
            hours after each ring.
          </p>
        </>
      )}
    </section>
  );
}

/**
 * The Bell's status card on /bell: where the latest Bell stands (open, locked in, settled, ringing), its entry
 * price, and its herd: every call bucketed, and the symmetric bull/bear split.
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
          {overdue ? (
            <p className="flex items-center gap-2.5 text-[length:var(--v2-fs-base)] text-[var(--v2-kicker)]">
              <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Ding! The Bell is ringing. Fresh calls land any minute.
            </p>
          ) : bell ? (
            <BellStatus bell={bell} ridesOpen={ridesOpen} />
          ) : pending ? (
            <div role="status" className="grid gap-3">
              <span className="v2-sr">Loading the Bell…</span>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-16" />
            </div>
          ) : (
            <p className="v2-body m-0">The first Bell hasn&apos;t rung yet. Be here at 15:00 UTC.</p>
          )}
        </div>

        <div className="min-w-0">
          {bell ? (
            <Herd bell={bell} />
          ) : pending ? (
            <div role="status" className="space-y-3">
              <span className="v2-sr">Loading the herd…</span>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-40" />
              <Skeleton className="h-3" />
            </div>
          ) : (
            <div className="v2-empty">
              <p className="v2-empty-title">The herd shows up here</p>
              <p className="v2-empty-body">once the first calls are in.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function BellStatus({ bell, ridesOpen }: { bell: BellSummaryResponse; ridesOpen: boolean }) {
  const entry = (
    <div className="grid gap-2 border-t border-[var(--v2-line-soft)] pt-4">
      {bell.live && (
        <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-[length:var(--v2-fs-sm)] text-[var(--v2-nav)]">
          So far: $CHOG <Forecast pct={bell.live.movePct} size="md" /> since the ring
          <span className="v2-note">(provisional: the Bell settles on the hourly close)</span>
        </p>
      )}
      <p className="v2-note">
        Entry price <span className="v2-num text-[var(--v2-muted)]">{formatPrice(bell.entryPrice)}</span> WMON per
        $CHOG, from the real CHOG/WMON pool.
      </p>
    </div>
  );
  if (bell.status === "settled") {
    return (
      <>
        <p className="v2-kicker v2-kicker--dot">{bell.kind === "replay" ? "Latest replay · settled" : "Settled"}</p>
        <div>
          <p className="v2-overline">$CHOG moved</p>
          <Forecast pct={bell.actualPct} size="xl" className="mt-2" />
        </div>
        <p className="v2-note">
          <span className="v2-num text-[var(--v2-muted)]">{formatPrice(bell.entryPrice)}</span> →{" "}
          <span className="v2-num text-[var(--v2-muted)]">{formatPrice(bell.settlePrice)}</span> WMON per $CHOG over 24h.
        </p>
        <p className="v2-body m-0">
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
        <p className="v2-kicker v2-kicker--dot">Rides are open</p>
        <h2 className="v2-h2">Pick one Chog. Ride its call.</h2>
        <p className="v2-body m-0">
          Pick one Chog to ride before {formatUtcTime(bell.rideWindowClosesAt)}. You score when its call settles.
        </p>
        <p className="v2-note">{BELL_COPY.ride}</p>
        {entry}
      </>
    );
  }
  return (
    <>
      <p className="v2-kicker v2-kicker--dot">{bell.kind === "replay" ? "A replay is settling" : "Rides locked in"}</p>
      <h2 className="v2-h2">
        Settles in <Countdown to={Date.parse(bell.horizonAt)} />
      </h2>
      <p className="v2-body m-0">
        Every call settles at {formatUtcTime(bell.horizonAt)}.
        {bell.kind === "replay" && " Replays are rebuilt from real candles and take no rides."}
      </p>
      <p className="v2-note">{BELL_COPY.book}</p>
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="v2-overline">The herd · Bell of {formatDay(bell.day)}</h2>
        <KindBadge kind={bell.kind} />
      </div>
      <HerdHistogram bell={bell} marks={marks} />
      <BullBearBar bell={bell} className="mt-6" />
      <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--v2-faint)]">
        <span>
          <span className="v2-num text-[var(--v2-muted)]">{bell.calls.toLocaleString("en-US")}</span> calls
        </span>
        {average !== null && (
          <span>
            Herd average ≈ <span className="v2-num text-[var(--v2-muted)]">{signedPct(average)}</span>
          </span>
        )}
        <Link href={`/bell/${bell.day}`} className="v2-link ml-auto">
          See every call
        </Link>
      </p>
    </div>
  );
}
