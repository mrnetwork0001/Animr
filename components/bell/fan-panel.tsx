"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useNow } from "@/components/decision-feed";
import type { BellSummaryResponse, FanResponse, FanState } from "@/lib/bell/types";
import { useChogBell, useFan, useSetNickname } from "./api";
import { ChogAvatar, Countdown, Forecast, LABEL, LoadError, Skeleton, useBefore } from "./bits";
import { bellRingsAt, bellWhen, fanName, formatDay, formatPoints, formatUtcTime, parseDay } from "./format";
import { FlameIcon } from "./icons";
import { useChogTag, useChogTitle } from "./names";

/** The visitor's fan card: a cookie identity (no wallet), points, streak and this Bell's ride. */
export function FanPanel({ bell }: { bell?: BellSummaryResponse }) {
  const fan = useFan();

  if (fan.isPending) {
    return (
      <div role="status" className="v2-card flex flex-wrap gap-6">
        <span className="v2-sr">Loading your fan card…</span>
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-20" />
        <Skeleton className="h-10 w-20" />
        <Skeleton className="h-10 flex-1" />
      </div>
    );
  }
  if (fan.isError) {
    return (
      <LoadError
        title="Couldn't load your fan card"
        error={fan.error}
        onRetry={() => fan.refetch()}
        retrying={fan.isFetching}
      />
    );
  }

  const me = fan.data;
  const history = me.history
    .filter((entry) => parseDay(entry.day) !== null)
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, 6);
  return (
    <section aria-label="Your fan card" className="v2-card">
      <div className="flex flex-wrap items-start gap-x-10 gap-y-6">
        <Nickname fan={me} />
        <Stat label="Points">
          <span className="v2-num text-[length:var(--v2-fs-stat-sm)] leading-none text-[var(--v2-ink)]">{formatPoints(me.points)}</span>
          <Rank fan={me} />
        </Stat>
        <Stat label="Streak">
          <span className="flex items-center gap-1.5 leading-none">
            <FlameIcon className={`size-5 ${me.streak > 0 ? "text-[var(--v2-teal)]" : "text-[var(--v2-faint)]"}`} />
            <span className="v2-num text-[length:var(--v2-fs-stat-sm)] text-[var(--v2-ink)]">{me.streak}</span>
            <span className="text-xs text-[var(--v2-faint)]">{me.streak === 1 ? "day" : "days"}</span>
          </span>
        </Stat>
        {bell && <ThisBell bell={bell} fan={me} />}
      </div>
      {history.length > 0 && (
        <div className="mt-6 border-t border-[var(--v2-line-soft)] pt-4">
          <h3 className={LABEL}>Your recent rides</h3>
          <ol className="mt-3 flex flex-wrap gap-2">
            {history.map((ride) => (
              <RideChip key={ride.day} ride={ride} booked={ride.day === me.next?.day} />
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

/** One past ride: its day, its Chog ("CHOG #1312") and the points it scored. */
function RideChip({ ride, booked }: { ride: FanState["history"][number]; booked: boolean }) {
  const tag = useChogTag(ride.tokenId);
  return (
    <li>
      {/* A ride booked on a Bell that hasn't rung yet has no page of its own. */}
      <Link href={booked ? "/bell" : `/bell/${ride.day}`} className="v2-chip">
        {formatDay(ride.day)}
        {tag && <span className="text-[var(--v2-nav)]">{tag}</span>}
        {typeof ride.points === "number" ? (
          <span className="text-[var(--v2-kicker)]">
            <span className="v2-num">+{formatPoints(ride.points)}</span> points
          </span>
        ) : booked ? (
          <span className="text-[var(--v2-kicker)]">next Bell</span>
        ) : (
          <span className="text-[var(--v2-faint)]">settling</span>
        )}
      </Link>
    </li>
  );
}

/** "Rank #3 of 120 fans" once the fan has scored (GET /api/fan adds rank and fans). */
function Rank({ fan }: { fan: FanResponse }) {
  if (!fan.rank || !fan.fans) return null;
  return (
    <span className="mt-1.5 block text-xs text-[var(--v2-faint)]">
      Rank <span className="v2-num text-[var(--v2-muted)]">#{fan.rank}</span> of {fan.fans.toLocaleString("en-US")}
    </span>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className={LABEL}>{label}</p>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function Nickname({ fan }: { fan: FanState }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const save = useSetNickname();
  const inputId = useId();

  // The engine keeps letters, numbers, spaces, _ and - (20 at most); an empty name clears it.
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(draft.trim(), { onSuccess: () => setEditing(false) });
  };

  if (editing) {
    return (
      <form onSubmit={submit} className="min-w-0 basis-full sm:basis-auto">
        <label htmlFor={inputId} className={LABEL}>
          Your nickname
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            id={inputId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={20}
            autoFocus
            autoComplete="nickname"
            placeholder="e.g. moonchog"
            className="v2-input w-52"
          />
          <button type="submit" disabled={save.isPending} className="v2-btn-glass">
            {save.isPending ? "Saving…" : draft.trim() || !fan.nickname ? "Save" : "Clear name"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="v2-btn-ghost">
            Cancel
          </button>
        </div>
        {save.isError && (
          <p role="alert" className="mt-1.5 text-xs text-[var(--v2-danger)]">
            {save.error.message}
          </p>
        )}
      </form>
    );
  }
  return (
    <div className="min-w-0">
      <p className={LABEL}>Fan</p>
      <p className="mt-2 flex flex-wrap items-center gap-x-2">
        <span className="v2-h3 truncate" title="No wallet needed: this browser is your fan card.">
          {fanName(fan)}
        </span>
        <button
          type="button"
          onClick={() => {
            setDraft(fan.nickname ?? "");
            setEditing(true);
          }}
          className="v2-btn-ghost v2-btn--sm"
        >
          {fan.nickname ? "Rename" : "Pick a nickname"}
        </button>
      </p>
    </div>
  );
}

/** A ride booked on the next Bell: "You're riding Silver Whiskers · CHOG #1312 at tomorrow's Bell", and when it rings. */
function NextRide({ next, className = "" }: { next: NonNullable<FanState["next"]>; className?: string }) {
  const now = useNow();
  const ringsAt = bellRingsAt(next.day);
  const call = useChogBell(next.tokenId).data?.today;
  const title = useChogTitle(next.tokenId, call?.name);
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <ChogAvatar src={call?.image} tokenId={next.tokenId} className="size-10 rounded-xl" />
      <div className="min-w-0 text-sm text-[var(--v2-muted)]">
        <p>
          You&apos;re riding{" "}
          <Link href={`/chog/${next.tokenId}`} className="font-medium text-[var(--v2-ink)] hover:text-[var(--v2-kicker)]">
            {title}
          </Link>{" "}
          at {bellWhen(next.day, now)}.
        </p>
        <p className="v2-note mt-0.5">
          {now !== null && now < ringsAt ? (
            <>
              It rings at 15:00 UTC, in <Countdown to={ringsAt} className="text-[var(--v2-muted)]" />, and your ride counts from
              the ring.
            </>
          ) : (
            "It's ringing now: the calls land any minute."
          )}
        </p>
      </div>
    </div>
  );
}

/** This Bell's ride: who you ride and what it called, how long you have left to pick, or your next Bell's ride. */
function ThisBell({ bell, fan }: { bell: BellSummaryResponse; fan: FanState }) {
  const beforeClose = useBefore(Date.parse(bell.rideWindowClosesAt));
  const riding = bell.kind === "live" && fan.ride?.day === bell.day ? fan.ride.tokenId : undefined;
  const chog = useChogBell(riding);
  const call = chog.data?.today;
  const title = useChogTitle(riding ?? 0, call?.name);
  const ridesOpen = bell.kind === "live" && bell.status === "open" && beforeClose !== false;

  if (riding === undefined && !ridesOpen) {
    // Rides on this Bell are locked in (or it's a replay): every pick now rides the next Bell.
    return (
      <div className="min-w-0 flex-1 basis-64">
        <p className={LABEL}>Your next ride</p>
        {fan.next ? (
          <NextRide next={fan.next} className="mt-2" />
        ) : (
          <p className="v2-body mt-2">No ride yet. Pick a Chog below and it rides the next Bell at 15:00 UTC.</p>
        )}
      </div>
    );
  }
  return (
    <div className="min-w-0 flex-1 basis-64">
      <p className={LABEL}>Your ride, Bell of {formatDay(bell.day)}</p>
      {riding !== undefined ? (
        <div className="mt-2 flex items-center gap-3">
          <ChogAvatar src={call?.image} tokenId={riding} className="size-10 rounded-xl" />
          <div className="min-w-0 text-sm text-[var(--v2-muted)]">
            <p className="flex flex-wrap items-center gap-x-1.5">
              Riding
              <Link href={`/chog/${riding}`} className="font-medium text-[var(--v2-ink)] hover:text-[var(--v2-kicker)]">
                {title}
              </Link>
              {call && (
                <>
                  · called <Forecast pct={call.forecastPct} size="sm" />
                </>
              )}
              {bell.status === "open" && bell.live && (
                <>
                  · $CHOG so far <Forecast pct={bell.live.movePct} size="sm" />
                </>
              )}
            </p>
            <p className="v2-note mt-0.5">
              {bell.status === "settled"
                ? "Settled. Your points are in."
                : `Your ride counts from the first hourly close after you picked; it settles at ${formatUtcTime(bell.horizonAt)}.`}
            </p>
          </div>
        </div>
      ) : (
        <p className="v2-body mt-2">
          No ride yet. Pick a Chog below. Rides close in{" "}
          <Countdown to={Date.parse(bell.rideWindowClosesAt)} className="text-[var(--v2-ink)]" />, then a pick rides the
          next Bell.
        </p>
      )}
      {fan.next && <NextRide next={fan.next} className="mt-3 border-t border-[var(--v2-line-soft)] pt-3" />}
    </div>
  );
}
