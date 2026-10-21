"use client";

import { Skeleton, StatRow } from "@/components/v2";
import { useHeistState } from "./api";
import "./heist.css";

/**
 * The scoreboard in the page header: $CHOG stolen (always 0) and today's attempts, caves and refusals. It shares the
 * /api/heist query with the room below (one request), so it streams in with it.
 */
export function HeistScoreboard() {
  const state = useHeistState();
  const counters = state.data?.counters;
  if (!counters) {
    return (
      <div className="v2-stats v2-stats--boxed heist-score" aria-busy="true" aria-label="Loading the scoreboard">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="v2-stat">
            <Skeleton variant="text" style={{ width: 84 }} />
            <Skeleton variant="title" style={{ width: 52 }} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <section aria-label="Heist scoreboard" className="grid gap-3">
      <p className="v2-overline">Scoreboard · {counters.day} UTC</p>
      <StatRow
        boxed
        className="heist-score"
        stats={[
          { key: "stolen", label: "$CHOG stolen", hint: "ever", value: counters.stolenChog.toLocaleString("en-US") },
          { key: "attempts", label: "Attempts", hint: "today", value: counters.attemptsToday.toLocaleString("en-US") },
          { key: "caves", label: "AI said yes", hint: "today", value: counters.cavesToday.toLocaleString("en-US") },
          { key: "refusals", label: "Monad said no", hint: "today", value: counters.refusalsToday.toLocaleString("en-US") },
        ]}
      />
    </section>
  );
}
