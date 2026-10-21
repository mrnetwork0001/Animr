"use client";

import type { HeistCounters } from "@/lib/heist/types";

/** The scoreboard: $CHOG stolen (always 0) and today's attempts, caves and refusals. */
export function Counters({ counters }: { counters: HeistCounters }) {
  const stats = [
    { label: "$CHOG stolen", value: counters.stolenChog, tone: "text-success", note: "ever" },
    { label: "Attempts", value: counters.attemptsToday, tone: "text-foreground", note: "today" },
    { label: "AI said yes", value: counters.cavesToday, tone: "text-warning", note: "today" },
    { label: "Monad said no", value: counters.refusalsToday, tone: "text-danger", note: "today" },
  ];
  return (
    <section aria-label="Heist scoreboard" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="card px-4 py-3">
          <p className="text-xs text-subtle">
            {stat.label} <span className="text-subtle/80">· {stat.note}</span>
          </p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${stat.tone}`}>{stat.value.toLocaleString("en-US")}</p>
        </div>
      ))}
    </section>
  );
}
