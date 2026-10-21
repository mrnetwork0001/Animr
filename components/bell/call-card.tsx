"use client";

import Link from "next/link";
import { type ReactNode, useId } from "react";
import type { BellCall, BellSummary, FanResponse } from "@/lib/bell/types";
import { rideErrorMessage, useFan, useRide } from "./api";
import { CallResult, ChogAvatar, ClaimedBadge, Conviction, Forecast, SourceBadge, useBefore } from "./bits";
import { formatDay } from "./format";

/** Only an open live Bell takes rides on itself (the engine's rule; replays never did). */
export const rideable = (bell: BellSummary) => bell.kind === "live" && bell.status === "open";

/** Announced once a ride is taken (the button turns into a "Riding" chip). */
function rideAnnouncement(fan: FanResponse | undefined, tokenId: number): string {
  if (fan?.next?.tokenId === tokenId) {
    return `You now ride Chog #${tokenId} at the next Bell, ${formatDay(fan.next.day)} at 15:00 UTC. It counts from the ring.`;
  }
  return `You now ride Chog #${tokenId}. You score when its call settles.`;
}

/**
 * Ride a Chog, one per Bell, no wallet needed. Inside the latest Bell's ride window the ride is on that Bell; after
 * it closes (or on a replay) the same button books the next Bell, so a late ride never hits a closed door (the
 * engine decides: rideBell in lib/bell/fans.ts). Render it for the latest Bell only.
 */
export function RideButton({ tokenId, bell, className = "" }: { tokenId: number; bell: BellSummary; className?: string }) {
  const windowOpen = useBefore(Date.parse(bell.rideWindowClosesAt));
  const fan = useFan();
  const ride = useRide();
  const errorId = useId();

  // Until the browser clock is known (null), a Bell that takes rides is assumed open.
  const booking = !rideable(bell) || windowOpen === false;
  const current = booking ? fan.data?.next : fan.data?.ride?.day === bell.day ? fan.data.ride : undefined;
  const riding = current?.tokenId;
  const hint =
    riding !== undefined
      ? `One ride per Bell: you ride Chog #${riding}${booking ? " at the next Bell" : ""}`
      : booking
        ? "This Bell's rides are locked in: this ride goes to the next Bell and counts from its ring"
        : undefined;
  return (
    <div className={className}>
      {riding === tokenId ? (
        <span className="flex h-11 items-center justify-center gap-2 rounded-full border border-[rgb(98_224_166/0.35)] bg-[rgb(98_224_166/0.08)] px-4 text-sm font-medium text-[var(--v2-success)]">
          <span aria-hidden>✓</span> {booking ? "Riding next Bell" : "Riding"}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => ride.mutate(tokenId)}
          disabled={windowOpen === null || riding !== undefined || ride.isPending}
          title={hint}
          aria-describedby={ride.isError ? errorId : undefined}
          className="v2-btn-glass v2-btn--block"
        >
          {ride.isPending ? "Riding…" : booking ? "Ride next Bell" : "Ride"}
          <span className="sr-only"> with Chog #{tokenId}</span>
        </button>
      )}
      {/* The button disappears on success, so the outcome is announced here. */}
      <span role="status" className="sr-only">
        {ride.isSuccess ? rideAnnouncement(ride.data, tokenId) : ""}
      </span>
      {ride.isError && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-[var(--v2-danger)]">
          {rideErrorMessage(ride.error)}
        </p>
      )}
    </div>
  );
}

type CallCardProps = {
  call: BellCall;
  /** The Bell the call belongs to: settles the card and powers its Ride button. */
  bell?: BellSummary;
  /** False hides the settlement (the replay game keeps the answer secret until the pick). */
  reveal?: boolean;
  /** Replaces the Ride button. */
  action?: ReactNode;
  /**
   * Show the Ride button: pass true for the latest Bell (it books the next Bell once rides close). Defaults to
   * whether `bell` takes rides itself.
   */
  ride?: boolean;
  className?: string;
};

/** One Chog's call: forecast, thesis in its voice, conviction, where it came from, and its result. */
export function CallCard({ call, bell, reveal = true, action, ride, className = "" }: CallCardProps) {
  return (
    <article className={`v2-card v2-card--tight bell-call ${className}`}>
      <div className="flex items-start gap-3">
        <ChogAvatar src={call.image} tokenId={call.tokenId} className="size-12 rounded-[12px]" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-medium text-[var(--v2-ink)]">
            <Link href={`/chog/${call.tokenId}`} className="hover:text-[var(--v2-kicker)]">
              Chog #{call.tokenId}
            </Link>
          </h3>
          <p className="truncate text-xs text-[var(--v2-faint)]">{call.name}</p>
        </div>
        <div className="shrink-0 text-right">
          <Forecast pct={call.forecastPct} size="lg" />
          <p className="text-[11px] text-[var(--v2-faint)]">24h call</p>
        </div>
      </div>
      <p className="bell-thesis">“{call.thesis}”</p>
      <div className="mt-auto flex flex-wrap items-center gap-2">
        <SourceBadge source={call.source} />
        {call.claimed && <ClaimedBadge />}
        <Conviction value={call.conviction} />
      </div>
      {reveal && bell?.status === "settled" && <CallResult call={call} actualPct={bell.actualPct} />}
      {action ?? (bell && (ride ?? rideable(bell)) && <RideButton tokenId={call.tokenId} bell={bell} />)}
    </article>
  );
}

/**
 * A compact list row for the full list of a Bell's calls. `ride` shows the Ride button: true for the latest Bell
 * (defaults to whether `bell` takes rides itself).
 */
export function CallRow({ call, bell, ride = rideable(bell) }: { call: BellCall; bell: BellSummary; ride?: boolean }) {
  return (
    <li className="flex gap-3.5 border-b border-[var(--v2-line-soft)] px-4 py-4 transition-colors last:border-0 hover:bg-[rgb(255_255_255/0.02)] sm:px-5">
      <ChogAvatar src={call.image} tokenId={call.tokenId} className="size-11 rounded-[11px]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/chog/${call.tokenId}`} className="text-[15px] font-medium text-[var(--v2-ink)] hover:text-[var(--v2-kicker)]">
              Chog #{call.tokenId}
            </Link>
            <SourceBadge source={call.source} />
            {call.claimed && <ClaimedBadge />}
          </p>
          <Forecast pct={call.forecastPct} size="lg" className="shrink-0" />
        </div>
        <p className="mt-1.5 line-clamp-2 text-sm text-[var(--v2-nav)]">“{call.thesis}”</p>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Conviction value={call.conviction} />
            {bell.status === "settled" && <CallResult call={call} actualPct={bell.actualPct} />}
          </div>
          {ride && <RideButton tokenId={call.tokenId} bell={bell} className="w-full sm:w-auto sm:min-w-40" />}
        </div>
      </div>
    </li>
  );
}
