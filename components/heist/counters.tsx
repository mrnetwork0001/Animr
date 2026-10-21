"use client";

import { Skeleton, StatRow } from "@/components/v2";
import { useHeistState } from "./api";
import "./heist.css";

/**
 * The scoreboard in the page header: today's attempts; "AI said yes" and "Monad said no" join them once they have
 * happened today. Every check is an eth_call, so nothing is ever broadcast (said in plain copy, not as a counted stat).
 * It shares the /api/heist query with the room below (one request).
 */
export function HeistScoreboard() {
  const state = useHeistState();
  const counters = state.data?.counters;
  if (!counters) {
    return (
      <div className="v2-stats v2-stats--boxed heist-score" aria-busy="true" aria-label="Loading the scoreboard">
        {[0].map((i) => (
          <div key={i} className="v2-stat">
            <Skeleton variant="text" style={{ width: 84 }} />
            <Skeleton variant="title" style={{ width: 52 }} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <section aria-label="Heist scoreboard">
      <StatRow
        boxed
        className="heist-score"
        stats={[
          { key: "attempts", label: "Attempts today", value: counters.attemptsToday.toLocaleString("en-US") },
          ...(counters.cavesToday > 0
            ? [{ key: "caves", label: "AI said yes today", value: counters.cavesToday.toLocaleString("en-US") }]
            : []),
          ...(counters.refusalsToday > 0
            ? [{ key: "refusals", label: "Monad said no today", value: counters.refusalsToday.toLocaleString("en-US") }]
            : []),
        ]}
      />
    </section>
  );
}
