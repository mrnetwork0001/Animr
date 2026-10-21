"use client";

import Link from "next/link";
import { useState } from "react";
import { useNow } from "@/components/decision-feed";
import type { BellSummary } from "@/lib/bell/types";
import { isNotFound, useBell, useTodayBell } from "./api";
import { LABEL, LoadError, SampleBanner, SectionTitle, useBefore } from "./bits";
import { CallCard, rideable } from "./call-card";
import { FanPanel, REPLAY_GAME_ID } from "./fan-panel";
import { scheduledDay, shiftDay } from "./format";
import { BellHero } from "./hero";
import { PastBells } from "./past-bells";
import { ReplayGame } from "./replay-game";
import { SeasonStandings } from "./standings";
import { Verdict } from "./verdict";

const PAST_DAYS = 7;

/** Everything on /bell below the page header. All data is fetched client-side from /api/bell and /api/fan. */
export function BellDashboard() {
  const today = useTodayBell();
  const now = useNow();
  const bell = today.data;
  const noBellYet = today.isError && isNotFound(today.error);
  // Before the first live Bell, past (replayed) Bells are counted back from the clock.
  const anchor = bell?.day ?? (noBellYet && now !== null ? scheduledDay(now) : null);
  const pastDays = anchor
    ? Array.from({ length: PAST_DAYS }, (_, i) => shiftDay(anchor, bell ? -(i + 1) : -i))
    : [];
  const previous = useBell(bell?.status === "settled" ? null : pastDays[0]);
  const verdict = bell?.status === "settled" ? bell : previous.data;
  // The practice game comes after the real picks: open or closed, the calls' Ride buttons (this Bell, or the next one)
  // come first, so a phone reaches a ride that counts before a practice one. The fan card links down to the game.
  const game = pastDays.length > 0 && <ReplayGame days={pastDays} id={REPLAY_GAME_ID} />;

  return (
    <div className="space-y-8">
      <SampleBanner />
      {today.isError && !noBellYet ? (
        <LoadError
          title="Couldn't reach the Bell"
          error={today.error}
          onRetry={() => today.refetch()}
          retrying={today.isFetching}
        />
      ) : (
        <BellHero bell={bell} pending={today.isPending} />
      )}
      <FanPanel bell={bell} />

      <div className="grid items-start gap-x-8 gap-y-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-10">
          {/* Open Bell: the ride comes first. Settled Bell (until the next ring): its verdict does. */}
          {bell?.status === "settled" && <Verdict bell={bell} />}
          {bell && <TodaysCalls bell={bell} />}
          {verdict && verdict !== bell && <Verdict bell={verdict} />}
          {game}
        </div>
        <aside className="min-w-0 space-y-10">
          <SeasonStandings />
          {pastDays.length > 0 && <PastBells days={pastDays} />}
        </aside>
      </div>
    </div>
  );
}

/** How many featured and boldest cards show before "Show more" (keeps phones from scrolling forever). */
const FEATURED_SHOWN = 6;
const BOLDEST_SHOWN = 4;

function TodaysCalls({ bell }: { bell: BellSummary }) {
  const [expanded, setExpanded] = useState(false);
  const featuredIds = new Set(bell.featured.map((call) => call.tokenId));
  const allBoldest = bell.boldest.filter((call) => !featuredIds.has(call.tokenId));
  const featured = expanded ? bell.featured : bell.featured.slice(0, FEATURED_SHOWN);
  const boldest = expanded ? allBoldest : allBoldest.slice(0, BOLDEST_SHOWN);
  const hidden = bell.featured.length + allBoldest.length - featured.length - boldest.length;
  // These cards always carry a Ride button: on this Bell while its window is open, else for the next Bell.
  const ridesOpen = useBefore(Date.parse(bell.rideWindowClosesAt)) !== false && rideable(bell);
  const title = ridesOpen ? "Pick a Chog to ride" : "Pick a Chog for the next Bell";
  const settledLine = bell.status === "open" ? "These calls settle 24h after their Bell." : "These calls are settled: hits, misses and points.";

  return (
    <section aria-label={title}>
      <SectionTitle
        title={title}
        hint={
          ridesOpen
            ? "One ride per Bell. It counts from the first hourly close after you pick, and scores when the call settles: the closer, the more points."
            : `${settledLine} A ride you take now goes to the next Bell (15:00 UTC) and counts from its ring.`
        }
        action={
          <Link href={`/bell/${bell.day}`} className="text-sm font-medium text-accent-strong hover:underline">
            All {bell.calls.toLocaleString("en-US")} calls →
          </Link>
        }
      />
      {featured.length > 0 && (
        <>
          <h3 className={`${LABEL} mt-4`}>
            {bell.featured.some((call) => call.claimed) ? "Featured · claimed AI agents and top oracles" : "Top oracles"}
          </h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {featured.map((call) => (
              <CallCard key={call.tokenId} call={call} bell={bell} ride />
            ))}
          </div>
        </>
      )}
      {boldest.length > 0 && (
        <>
          <h3 className={`${LABEL} mt-6`}>Boldest calls</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {boldest.map((call) => (
              <CallCard key={call.tokenId} call={call} bell={bell} ride />
            ))}
          </div>
        </>
      )}
      {hidden > 0 && (
        <button type="button" onClick={() => setExpanded(true)} className="btn btn-secondary mt-4 w-full">
          Show {hidden} more {hidden === 1 ? "call" : "calls"}
        </button>
      )}
      {featured.length + boldest.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-subtle">
          No calls at this Bell yet.
        </p>
      )}
    </section>
  );
}
