"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useNow } from "@/components/decision-feed";
import type { BellSummaryResponse, FanResponse, FanState } from "@/lib/bell/types";
import { useChogBell, useFan, useSetNickname } from "./api";
import { ChogAvatar, Countdown, Forecast, LABEL, LoadError, PointsNote, Skeleton, useBefore } from "./bits";
import { bellRingsAt, bellWhen, fanName, formatDay, formatPoints, formatUtcTime, parseDay } from "./format";
import { FlameIcon } from "./icons";

/** Where the "Replay a past Bell" mini-game sits on /bell (the fan card links to it when rides are closed). */
export const REPLAY_GAME_ID = "replay-game";

/** The visitor's fan card: a cookie identity (no wallet), points, streak and this Bell's ride. */
export function FanPanel({ bell }: { bell?: BellSummaryResponse }) {
  const fan = useFan();

  if (fan.isPending) {
    return (
      <div role="status" className="card flex flex-wrap gap-6 p-5">
        <span className="sr-only">Loading your fan card…</span>
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
    <section aria-label="Your fan card" className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <Nickname fan={me} />
        <Stat label="Points">
          <span className="font-mono text-2xl font-semibold tabular-nums">{formatPoints(me.points)}</span>
          <Rank fan={me} />
        </Stat>
        <Stat label="Streak">
          <span className="flex items-center gap-1 font-mono text-2xl font-semibold tabular-nums">
            <FlameIcon className={`size-5 ${me.streak > 0 ? "text-warning" : "text-subtle"}`} />
            {me.streak}
            <span className="font-sans text-xs font-normal text-subtle">{me.streak === 1 ? "day" : "days"}</span>
          </span>
        </Stat>
        {bell && <ThisBell bell={bell} fan={me} />}
      </div>
      {history.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <h3 className={LABEL}>Your recent rides</h3>
          <ol className="mt-2 flex flex-wrap gap-1.5">
            {history.map((ride) => {
              // A ride booked on a Bell that hasn't rung yet has no page of its own.
              const booked = ride.day === me.next?.day;
              return (
                <li key={ride.day}>
                  <Link
                    href={booked ? "/bell" : `/bell/${ride.day}`}
                    className="chip transition-colors hover:border-accent hover:text-foreground"
                  >
                    {formatDay(ride.day)} · Chog #{ride.tokenId} ·{" "}
                    {typeof ride.points === "number" ? (
                      <span className="font-mono text-accent-strong">+{formatPoints(ride.points)} pts</span>
                    ) : booked ? (
                      <span className="text-accent-strong">next Bell</span>
                    ) : (
                      <span className="text-subtle">settling</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      <PointsNote className="mt-3" />
    </section>
  );
}

/** "Rank #3 of 120 fans" once the fan has scored (GET /api/fan adds rank and fans). */
function Rank({ fan }: { fan: FanResponse }) {
  if (!fan.rank || !fan.fans) return null;
  return (
    <span className="block text-xs text-subtle">
      Rank <span className="font-mono text-muted">#{fan.rank}</span> of {fan.fans.toLocaleString("en-US")}
    </span>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className={LABEL}>{label}</p>
      <div className="mt-1">{children}</div>
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
        <div className="mt-1 flex flex-wrap gap-2">
          <input
            id={inputId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={20}
            autoFocus
            autoComplete="nickname"
            placeholder="e.g. moonchog"
            className="input w-48 py-1.5"
          />
          <button type="submit" disabled={save.isPending} className="btn btn-primary">
            {save.isPending ? "Saving…" : draft.trim() || !fan.nickname ? "Save" : "Clear name"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn btn-ghost">
            Cancel
          </button>
        </div>
        {save.isError && (
          <p role="alert" className="mt-1.5 text-xs text-danger">
            {save.error.message}
          </p>
        )}
      </form>
    );
  }
  return (
    <div className="min-w-0">
      <p className={LABEL}>Fan</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2">
        <span className="truncate text-lg font-semibold">{fanName(fan)}</span>
        <button
          type="button"
          onClick={() => {
            setDraft(fan.nickname ?? "");
            setEditing(true);
          }}
          className="btn btn-ghost px-2 py-0.5 text-xs"
        >
          {fan.nickname ? "Rename" : "Pick a nickname"}
        </button>
      </p>
      <p className="text-xs text-subtle">No wallet needed: this browser is your fan card.</p>
    </div>
  );
}

function PlayPastBell() {
  return (
    <a href={`#${REPLAY_GAME_ID}`} className="font-medium text-accent-strong hover:underline">
      Play a past Bell now ↓
    </a>
  );
}

/** A ride booked on the next Bell: "You're riding Chog #N at tomorrow's Bell", and when it rings. */
function NextRide({ next, className = "" }: { next: NonNullable<FanState["next"]>; className?: string }) {
  const now = useNow();
  const ringsAt = bellRingsAt(next.day);
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <ChogAvatar tokenId={next.tokenId} className="size-10 rounded-xl" />
      <div className="min-w-0 text-sm">
        <p>
          You&apos;re riding{" "}
          <Link href={`/chog/${next.tokenId}`} className="font-semibold hover:text-accent-strong">
            Chog #{next.tokenId}
          </Link>{" "}
          at {bellWhen(next.day, now)}.
        </p>
        <p className="text-xs text-subtle">
          {now !== null && now < ringsAt ? (
            <>
              It rings at 15:00 UTC, in <Countdown to={ringsAt} className="text-muted" />, and your ride counts from
              the ring.
            </>
          ) : (
            "Ding! It's ringing now: the calls land any minute."
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
  const ridesOpen = bell.kind === "live" && bell.status === "open" && beforeClose !== false;

  if (riding === undefined && !ridesOpen) {
    // Rides on this Bell are locked in (or it's a replay): every pick now rides the next Bell.
    return (
      <div className="min-w-0 flex-1 basis-64">
        <p className={LABEL}>Your next ride</p>
        {fan.next ? (
          <NextRide next={fan.next} className="mt-1" />
        ) : (
          <p className="mt-1 text-sm text-muted">
            {bell.kind === "live"
              ? "This Bell's rides are locked in. Pick a Chog below and it rides the next Bell (15:00 UTC)."
              : "Live Bells ring at 15:00 UTC. Pick a Chog below and it rides the next one."}{" "}
            Meanwhile: <PlayPastBell />
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="min-w-0 flex-1 basis-64">
      <p className={LABEL}>Your ride · Bell of {formatDay(bell.day)}</p>
      {riding !== undefined ? (
        <div className="mt-1 flex items-center gap-3">
          <ChogAvatar src={call?.image} tokenId={riding} className="size-10 rounded-xl" />
          <div className="min-w-0 text-sm">
            <p className="flex flex-wrap items-center gap-x-1.5">
              Riding
              <Link href={`/chog/${riding}`} className="font-semibold hover:text-accent-strong">
                Chog #{riding}
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
            <p className="text-xs text-subtle">
              {bell.status === "settled"
                ? "Settled. Your points are in."
                : `Your ride counts from the first hourly close after you picked; it settles at ${formatUtcTime(bell.horizonAt)}.`}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted">
          No ride yet. Pick a Chog below. Rides close in{" "}
          <Countdown to={Date.parse(bell.rideWindowClosesAt)} className="text-foreground" />, then a pick rides the
          next Bell.
        </p>
      )}
      {fan.next && <NextRide next={fan.next} className="mt-3 border-t border-line/60 pt-3" />}
    </div>
  );
}
