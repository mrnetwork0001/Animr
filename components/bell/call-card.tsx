"use client";

import Link from "next/link";
import { type ReactNode, useId } from "react";
import { playSound } from "@/components/audio/use-sound";
import type { BellCall, BellSummary, FanResponse } from "@/lib/bell/types";
import { rideErrorMessage, useFan, useRide } from "./api";
import { CallResult, ChogAvatar, Conviction, Forecast, SourceBadge, useBefore } from "./bits";
import { formatDay } from "./format";
import { useChogTag, useChogTitle } from "./names";

/** Only an open live Bell takes rides on itself (the engine's rule; replays never did). */
export const rideable = (bell: BellSummary) => bell.kind === "live" && bell.status === "open";

/** Announced once a ride is taken (the button turns into a "Riding" chip). */
function rideAnnouncement(fan: FanResponse | undefined, tokenId: number, title: string): string {
  if (fan?.next?.tokenId === tokenId) {
    return `You now ride ${title} at the next Bell, ${formatDay(fan.next.day)} at 15:00 UTC. It counts from the ring.`;
  }
  return `You now ride ${title}. You score when its call settles.`;
}

/**
 * Ride a Chog, one per Bell, no wallet needed. Inside the latest Bell's ride window the ride is on that Bell; after
 * it closes (or on a replay) the same button books the next Bell, so a late ride never hits a closed door (the
 * engine decides: rideBell in lib/bell/fans.ts). Render it for the latest Bell only. A small glass "Ride" pill; its
 * title says when the ride goes to the next Bell.
 */
export function RideButton({
  tokenId,
  bell,
  name,
  className = "",
}: {
  tokenId: number;
  bell: BellSummary;
  /** The Chog's persona name, for the announcement. */
  name?: string;
  className?: string;
}) {
  const windowOpen = useBefore(Date.parse(bell.rideWindowClosesAt));
  const fan = useFan();
  const ride = useRide();
  const errorId = useId();
  const title = useChogTitle(tokenId, name);

  // Until the browser clock is known (null), a Bell that takes rides is assumed open.
  const booking = !rideable(bell) || windowOpen === false;
  const current = booking ? fan.data?.next : fan.data?.ride?.day === bell.day ? fan.data.ride : undefined;
  const riding = current?.tokenId;
  const hint =
    riding !== undefined
      ? riding === tokenId
        ? undefined
        : `One ride per Bell: you already ride another Chog${booking ? " at the next Bell" : ""}`
      : booking
        ? "This Bell's rides are locked in: this ride goes to the next Bell and counts from its ring"
        : undefined;
  return (
    <div className={className}>
      {riding === tokenId ? (
        <span
          className="inline-flex h-8 items-center justify-center gap-2 rounded-full border border-[rgb(98_224_166/0.35)] bg-[rgb(98_224_166/0.08)] px-4 text-[13px] font-medium text-[var(--v2-success)]"
          title={booking ? "You ride this Chog at the next Bell" : undefined}
        >
          <span aria-hidden>✓</span> Riding
        </span>
      ) : (
        <button
          type="button"
          onClick={() => ride.mutate(tokenId, { onSuccess: () => playSound("ride") })}
          disabled={windowOpen === null || riding !== undefined || ride.isPending}
          title={hint}
          aria-describedby={ride.isError ? errorId : undefined}
          className="v2-btn-glass v2-btn--sm"
        >
          {ride.isPending ? "Riding…" : "Ride"}
          <span className="sr-only"> {title}</span>
        </button>
      )}
      {/* The button disappears on success, so the outcome is announced here. */}
      <span role="status" className="sr-only">
        {ride.isSuccess ? rideAnnouncement(ride.data, tokenId, title) : ""}
      </span>
      {ride.isError && (
        <p id={errorId} role="alert" className="mt-1.5 max-w-60 text-xs text-[var(--v2-danger)]">
          {rideErrorMessage(ride.error)}
        </p>
      )}
    </div>
  );
}

/** A Chog's name, linked to its page: the persona name, then its marketplace number ("CHOG #1312") in grey. */
export function ChogName({ tokenId, name, className = "" }: { tokenId: number; name?: string; className?: string }) {
  const tag = useChogTag(tokenId);
  return (
    <span className={`flex min-w-0 flex-wrap items-baseline gap-x-2 ${className}`}>
      <Link href={`/chog/${tokenId}`} className="truncate text-[15px] font-medium text-[var(--v2-ink)] hover:text-[var(--v2-kicker)]">
        {name?.trim() || tag || "A Chog"}
      </Link>
      {name?.trim() && tag && <span className="text-xs text-[var(--v2-faint)]">{tag}</span>}
    </span>
  );
}

type CallCardProps = {
  call: BellCall;
  /** The Bell the call belongs to: settles the card and powers its Ride button. */
  bell?: BellSummary;
  /** False hides the settlement (the practice game keeps the answer secret until the pick). */
  reveal?: boolean;
  /** Replaces the Ride button. */
  action?: ReactNode;
  className?: string;
};

/** One Chog's call as a card (the practice game): its 24h call, thesis in its voice, conviction and its result. */
export function CallCard({ call, bell, reveal = true, action, className = "" }: CallCardProps) {
  return (
    <article className={`v2-card v2-card--tight bell-call ${className}`}>
      <div className="flex items-start gap-3">
        <ChogAvatar src={call.image} tokenId={call.tokenId} className="size-12 rounded-[12px]" />
        <ChogName tokenId={call.tokenId} name={call.name} className="flex-1 pt-0.5" />
        <Forecast pct={call.forecastPct} size="lg" className="shrink-0" />
      </div>
      <p className="bell-thesis">“{call.thesis}”</p>
      <div className="mt-auto flex flex-wrap items-center gap-2">
        <SourceBadge source={call.source} />
        <Conviction value={call.conviction} />
      </div>
      {reveal && bell?.status === "settled" && <CallResult call={call} actualPct={bell.actualPct} />}
      {action}
    </article>
  );
}

/** The column header over a list of CallRows: the 24h call is named once, not on every row. */
export function CallRowsHeader() {
  return (
    <div aria-hidden className="flex justify-between border-b border-[var(--v2-line-soft)] px-4 py-2.5 sm:px-5">
      <span className="v2-th">Chog</span>
      <span className="v2-th">24h call</span>
    </div>
  );
}

/**
 * A compact list row for a Bell's calls: avatar, name and quote, its conviction (and result once settled), and the
 * call with a small Ride button on the right. `ride`: true for the latest Bell (defaults to whether `bell` takes rides).
 */
export function CallRow({ call, bell, ride = rideable(bell) }: { call: BellCall; bell: BellSummary; ride?: boolean }) {
  return (
    <li className="bell-row border-b border-[var(--v2-line-soft)] px-4 py-4 transition-colors last:border-0 hover:bg-[rgb(255_255_255/0.02)] sm:px-5">
      <ChogAvatar src={call.image} tokenId={call.tokenId} className="size-10 rounded-[10px]" />
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-2">
          <ChogName tokenId={call.tokenId} name={call.name} className="min-w-0" />
          <SourceBadge source={call.source} />
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-[var(--v2-nav)]">“{call.thesis}”</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <Conviction value={call.conviction} />
          {bell.status === "settled" && <CallResult call={call} actualPct={bell.actualPct} />}
        </div>
      </div>
      <div className="bell-row-side">
        <Forecast pct={call.forecastPct} size="lg" />
        {ride && <RideButton tokenId={call.tokenId} bell={bell} name={call.name} />}
      </div>
    </li>
  );
}
