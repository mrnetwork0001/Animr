"use client";

import Link from "next/link";
import { useNow } from "@/components/decision-feed";
import { useBell, useTodayBell } from "./api";
import { Countdown, Forecast, useBefore } from "./bits";
import { rideable } from "./call-card";
import { formatChog, nextBellAt, shiftDay } from "./format";
import { ArrowRightIcon } from "@/components/v2/icons";

/**
 * A one-line Daily Bell teaser for other pages (Your Chogs): rides-open or next-Bell countdown and yesterday's
 * best call, linking to /bell.
 */
export function BellStrip({ className = "" }: { className?: string }) {
  const today = useTodayBell();
  const now = useNow();
  const bell = today.data;
  const previous = useBell(bell && bell.status !== "settled" ? shiftDay(bell.day, -1) : null);
  const last = bell?.status === "settled" ? bell : previous.data;
  const ridesClose = bell && rideable(bell) ? Date.parse(bell.rideWindowClosesAt) : Number.NaN;
  const ridesOpen = useBefore(ridesClose) === true;

  return (
    <section
      aria-label="Daily Bell"
      className={`v2-card v2-card--tight flex flex-wrap items-center gap-x-6 gap-y-3 ${className}`}
    >
      <span className="flex items-center gap-3">
        <span className="text-[15px] font-medium text-[var(--v2-ink)]">Daily Bell</span>
        {ridesOpen && <span className="v2-badge v2-badge--teal v2-badge--live v2-badge--dot">Rides open</span>}
      </span>
      <span className="text-sm text-[var(--v2-nav)]">
        {ridesOpen ? (
          <>
            Close in <Countdown to={ridesClose} className="text-[17px] text-[var(--v2-ink)]" />
          </>
        ) : (
          <>
            Next Bell in{" "}
            <Countdown to={now === null ? null : nextBellAt(now)} className="text-[17px] text-[var(--v2-ink)]" />
          </>
        )}
      </span>
      {last?.oracle && last.actualPct !== null && (
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-[var(--v2-nav)]">
          Yesterday&apos;s best call
          {last.kind === "replay" && <span className="text-xs text-[var(--v2-faint)]">(replay)</span>}:{" "}
          <Link href={`/chog/${last.oracle.tokenId}`} className="text-[var(--v2-ink)] hover:text-[var(--v2-kicker)]">
            {last.oracle.name}
          </Link>
          <span className="whitespace-nowrap">
            called <Forecast pct={last.oracle.forecastPct} size="sm" />,
          </span>
          <span className="whitespace-nowrap">
            $CHOG did <Forecast pct={last.actualPct} size="sm" />.
          </span>
          {last.purse?.status === "sent" && last.purse.tokenId === last.oracle.tokenId && (
            <span className="whitespace-nowrap">It won {formatChog(last.purse.amount)} $CHOG for its wallet.</span>
          )}
        </span>
      )}
      <Link href="/bell" className="v2-btn-glass v2-btn--sm ml-auto">
        Ride a Chog
        <ArrowRightIcon className="v2-btn-icon" />
      </Link>
    </section>
  );
}
