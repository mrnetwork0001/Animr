"use client";

import Link from "next/link";
import { useState } from "react";
import type { BellSummary } from "@/lib/bell/types";
import { isNotFound, useBell, useBellDays, useTodayBell } from "./api";
import { LABEL, LoadError, SectionTitle, useBefore } from "./bits";
import { CallRow, CallRowsHeader, rideable } from "./call-card";
import { FanPanel } from "./fan-panel";
import { BellHero } from "./hero";
import { PastBells } from "./past-bells";
import { BellRecapCard } from "./recap";
import { SeasonStandings } from "./standings";
import { Verdict } from "./verdict";

const PAST_DAYS = 7;

/** Everything on /bell below the page header. All data is fetched client-side from /api/bell and /api/fan. */
export function BellDashboard() {
  const today = useTodayBell();
  const index = useBellDays();
  const bell = today.data;
  const noBellYet = today.isError && isNotFound(today.error);
  // The Bells before this one, newest first, from the index: never a request for a day without a Bell.
  const pastDays = bell && index.data ? index.data.days.filter((day) => day < bell.day).slice(-PAST_DAYS).reverse() : [];
  const previous = useBell(bell?.status === "settled" ? null : pastDays[0]);
  const verdict = bell?.status === "settled" ? bell : previous.data;

  return (
    <div className="flex flex-col gap-6">
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
      {verdict?.status === "settled" && <BellRecapCard day={verdict.day} link />}
      <FanPanel bell={bell} />

      <div className="v2-section grid items-start gap-x-10 gap-y-16 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0 space-y-16">
          {/* Open Bell: the ride comes first. Settled Bell (until the next ring): its verdict does. */}
          {bell?.status === "settled" && <Verdict bell={bell} />}
          {bell && <TodaysCalls bell={bell} />}
          {verdict && verdict !== bell && <Verdict bell={verdict} />}
        </div>
        <aside className="min-w-0 space-y-12 lg:sticky lg:top-[calc(var(--v2-header-h)+24px)]">
          <SeasonStandings />
          {(pastDays.length > 0 || (bell && index.isPending)) && <PastBells days={pastDays} pending={index.isPending} />}
        </aside>
      </div>
    </div>
  );
}

/** How many featured and boldest rows show before "Show more" (keeps phones from scrolling forever). */
const FEATURED_SHOWN = 6;
const BOLDEST_SHOWN = 4;

function TodaysCalls({ bell }: { bell: BellSummary }) {
  const [expanded, setExpanded] = useState(false);
  const featuredIds = new Set(bell.featured.map((call) => call.tokenId));
  const allBoldest = bell.boldest.filter((call) => !featuredIds.has(call.tokenId));
  const featured = expanded ? bell.featured : bell.featured.slice(0, FEATURED_SHOWN);
  const boldest = expanded ? allBoldest : allBoldest.slice(0, BOLDEST_SHOWN);
  const hidden = bell.featured.length + allBoldest.length - featured.length - boldest.length;
  // These rows always carry a Ride button: on this Bell while its window is open, else for the next Bell.
  const ridesOpen = useBefore(Date.parse(bell.rideWindowClosesAt)) !== false && rideable(bell);
  const title = ridesOpen ? "Pick a Chog to ride" : "Pick a Chog for the next Bell";

  return (
    <section aria-label={title}>
      <SectionTitle
        title={title}
        hint={
          ridesOpen
            ? "One ride per Bell. The closer its call lands, the more points."
            : "One ride per Bell. Your ride counts from the next ring at 15:00 UTC."
        }
        action={
          <Link href={`/bell/${bell.day}`} className="v2-btn-glass v2-btn--sm">
            All {bell.calls.toLocaleString("en-US")} calls
          </Link>
        }
      />
      {featured.length > 0 && (
        <CallList
          label={featuredLabel(bell)}
          calls={featured}
          bell={bell}
        />
      )}
      {boldest.length > 0 && <CallList label="Boldest calls" calls={boldest} bell={bell} className="mt-8" />}
      {hidden > 0 && (
        <button type="button" onClick={() => setExpanded(true)} className="v2-btn-glass v2-btn--block mt-5">
          Show {hidden} more {hidden === 1 ? "call" : "calls"}
        </button>
      )}
      {featured.length + boldest.length === 0 && (
        <div className="v2-empty">
          <p className="v2-empty-title">No calls at this Bell yet</p>
          <p className="v2-empty-body">Every Chog calls $CHOG at 15:00 UTC.</p>
        </div>
      )}
    </section>
  );
}

/**
 * The featured rows' heading. Their "best records" are live records once a live Bell has settled; before that (and on
 * Bells stored before records were split) they come from replayed Bells, so the heading says they are simulated.
 */
function featuredLabel(bell: BellSummary): string {
  const records = bell.featuredFrom === "live" ? "best live records" : "best replay records (simulated)";
  return bell.featured.some((call) => call.claimed) ? `AI agents and ${records}` : records[0].toUpperCase() + records.slice(1);
}

function CallList({ label, calls, bell, className = "" }: { label: string; calls: BellSummary["featured"]; bell: BellSummary; className?: string }) {
  return (
    <div className={className}>
      <h3 className={LABEL}>{label}</h3>
      <div className="v2-card v2-card--flush mt-3 overflow-hidden">
        <CallRowsHeader />
        <ol aria-label={label}>
          {calls.map((call) => (
            <CallRow key={call.tokenId} call={call} bell={bell} ride />
          ))}
        </ol>
      </div>
    </div>
  );
}
