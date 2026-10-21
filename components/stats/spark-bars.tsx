"use client";

import { type KeyboardEvent, type PointerEvent, useState } from "react";
import type { DayCount } from "./types";
import { formatCount, formatDay, formatLongDay } from "./format";
import "./stats.css";

type SparkBarsProps = {
  /** One bar per UTC day, oldest first. */
  points: DayCount[];
  /** What a bar counts, e.g. "Rides per day". */
  label: string;
  /** Singular and plural unit for the readout ("ride", "rides"). */
  unit: readonly [string, string];
  className?: string;
};

/**
 * A small per-day bar chart for a stat tile (v2): teal bars, the latest day full teal with a glow, empty days as a
 * baseline tick. Hover or focus (arrow keys) reads one day out; a visually hidden table carries every value.
 */
export function SparkBars({ points, label, unit, className = "" }: SparkBarsProps) {
  const [active, setActive] = useState<number | null>(null);
  const n = points.length;
  const max = Math.max(0, ...points.map((point) => point.value));
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const peak = points.reduce<DayCount | null>((best, point) => (point.value > (best?.value ?? 0) ? point : best), null);
  const unitOf = (value: number) => (value === 1 ? unit[0] : unit[1]);
  const first = points[0];
  const last = points[n - 1];
  if (!first || !last) return null;

  const summary = `${label}, ${formatDay(first.day)} to ${formatDay(last.day)}: ${formatCount(total)} ${unitOf(total)}${
    peak ? `, most on ${formatDay(peak.day)} (${formatCount(peak.value)})` : ""
  }.`;
  const readout = active === null ? null : points[active];

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.width) return;
    setActive(Math.min(n - 1, Math.max(0, Math.floor(((event.clientX - box.left) / box.width) * n))));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -1, ArrowUp: 1 };
    if (event.key in moves) setActive((current) => Math.min(n - 1, Math.max(0, (current ?? n - 1) + moves[event.key])));
    else if (event.key === "Home") setActive(0);
    else if (event.key === "End") setActive(n - 1);
    else if (event.key === "Escape") setActive(null);
    else return;
    event.preventDefault();
  };

  // Edge bars anchor their readout to that side so it never spills out of the card.
  const align = active === null ? "" : active < n / 4 ? "translate-x-0" : active >= (3 * n) / 4 ? "-translate-x-full" : "-translate-x-1/2";
  const barClass = (i: number) => `${i === active ? "is-active" : ""} ${i === n - 1 ? "is-latest" : ""}`;

  return (
    <figure className={`relative ${className}`}>
      <div
        role="group"
        aria-roledescription="bar chart"
        aria-label={summary}
        tabIndex={0}
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((current) => current ?? n - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKeyDown}
        className="stats-spark"
      >
        {points.map((point, i) => {
          const height = point.value > 0 && max > 0 ? Math.max(10, (point.value / max) * 100) : 0;
          return (
            <span key={point.day} aria-hidden className="stats-spark-col">
              {height > 0 ? (
                <span className={`stats-spark-bar ${barClass(i)}`} style={{ height: `${height}%` }} />
              ) : (
                <span className={`stats-spark-zero ${i === active ? "is-active" : ""}`} />
              )}
            </span>
          );
        })}
        {readout && active !== null && (
          <span aria-hidden className={`stats-spark-tip ${align}`} style={{ left: `${((active + 0.5) / n) * 100}%` }}>
            <span className="v2-num text-[var(--v2-ink)]">{formatCount(readout.value)}</span> {unitOf(readout.value)} ·{" "}
            {formatLongDay(readout.day)}
          </span>
        )}
      </div>
      <figcaption aria-hidden className="stats-spark-axis">
        <span>{formatDay(first.day)}</span>
        <span>{n > 1 ? formatDay(last.day) : ""}</span>
      </figcaption>
      {/* What keyboard focus reads out, for screen readers. */}
      <span aria-live="polite" className="v2-sr">
        {readout ? `${formatLongDay(readout.day)}: ${formatCount(readout.value)} ${unitOf(readout.value)}` : ""}
      </span>
      <table className="v2-sr">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Day (UTC)</th>
            <th scope="col">{unit[1]}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.day}>
              <th scope="row">{formatLongDay(point.day)}</th>
              <td>{formatCount(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
