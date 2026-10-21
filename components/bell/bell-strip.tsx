"use client";

import Link from "next/link";
import { useNow } from "@/components/decision-feed";
import { useBell, useTodayBell } from "./api";
import { Countdown, Forecast, useBefore } from "./bits";
import { rideable } from "./call-card";
import { formatChog, nextBellAt, shiftDay } from "./format";
import { BellIcon, CrownIcon } from "./icons";

/**
 * A one-line Daily Bell teaser for other pages (dashboard, leaderboard): rides-open or next-Bell
 * countdown and the last Oracle of the Day, linking to /bell.
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
    <Link
      href="/bell"
      className={`card group flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 transition-colors hover:border-accent/60 ${className}`}
    >
      <span className="flex items-center gap-2 font-semibold">
        <BellIcon className={`size-5 text-accent-strong ${ridesOpen ? "bell-swing" : ""}`} />
        Daily Bell
      </span>
      <span className="text-sm text-muted">
        {ridesOpen ? (
          <>
            Rides open · close in <Countdown to={ridesClose} className="text-foreground" />
          </>
        ) : (
          <>
            Next Bell in <Countdown to={now === null ? null : nextBellAt(now)} className="text-foreground" />
          </>
        )}
      </span>
      {last?.oracle && last.actualPct !== null && (
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-muted">
          <CrownIcon className="size-4 text-warning" />
          Last Oracle{last.kind === "replay" && <span className="text-xs text-subtle">(replay)</span>}{" "}
          <span className="font-semibold text-foreground">Chog #{last.oracle.tokenId}</span>
          <span className="whitespace-nowrap">
            called <Forecast pct={last.oracle.forecastPct} size="sm" />
          </span>
          <span className="whitespace-nowrap">
            · $CHOG did <Forecast pct={last.actualPct} size="sm" />
          </span>
          {last.purse?.status === "sent" && last.purse.tokenId === last.oracle.tokenId && (
            <span className="whitespace-nowrap">· Oracle Purse {formatChog(last.purse.amount)} $CHOG</span>
          )}
        </span>
      )}
      <span className="ml-auto text-sm font-medium text-accent-strong group-hover:underline">
        {ridesOpen ? "Ride a Chog →" : "Ride the next Bell →"}
      </span>
    </Link>
  );
}
