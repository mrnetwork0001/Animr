"use client";

import type { BellSummary } from "@/lib/bell/types";
import { herdSplit, signedPct } from "./format";

export type HerdMark = { pct: number; label: string; tone: "actual" | "pick" };

const MARK_TONE = {
  actual: { line: "bg-foreground", chip: "bg-foreground text-background" },
  pick: { line: "bg-accent-strong", chip: "bg-accent text-background" },
} as const;

type Bucket = { bucketPct: number; count: number };

/** The API's buckets on an evenly spaced grid (missing buckets count 0), plus the bucket width. */
function grid(histogram: Bucket[]): { buckets: Bucket[]; step: number } {
  const sorted = [...histogram].sort((a, b) => a.bucketPct - b.bucketPct);
  const gaps = sorted.slice(1).map((b, i) => b.bucketPct - sorted[i].bucketPct).filter((d) => d > 1e-9);
  const step = gaps.length ? Math.min(...gaps) : 2;
  if (sorted.length < 2) return { buckets: sorted, step };
  const first = sorted[0].bucketPct;
  const size = Math.round((sorted[sorted.length - 1].bucketPct - first) / step) + 1;
  if (size > 60) return { buckets: sorted, step };
  const counts = new Map(sorted.map((b) => [Math.round((b.bucketPct - first) / step), b.count]));
  return { buckets: Array.from({ length: size }, (_, i) => ({ bucketPct: first + i * step, count: counts.get(i) ?? 0 })), step };
}

/** The herd's average call, estimated from bucket midpoints. */
export function herdAverage(histogram: Bucket[]): number | null {
  const { buckets, step } = grid(histogram);
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  return total ? buckets.reduce((sum, b) => sum + b.count * (b.bucketPct + step / 2), 0) / total : null;
}

/** Estimated share of calls (0–100) that missed the real move by more than `errorPts`. */
export function sharePastError(histogram: Bucket[], actualPct: number, errorPts: number): number | null {
  const { buckets, step } = grid(histogram);
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  if (!total) return null;
  const beaten = buckets.reduce((sum, b) => {
    const overlap = Math.min(b.bucketPct + step, actualPct + errorPts) - Math.max(b.bucketPct, actualPct - errorPts);
    return sum + b.count * (1 - Math.max(0, Math.min(step, overlap)) / step);
  }, 0);
  return (beaten / total) * 100;
}

/** Every call of a Bell bucketed by forecast (bears red, bulls green), with optional markers. */
export function HerdHistogram({ bell, marks = [], className = "" }: { bell: BellSummary; marks?: HerdMark[]; className?: string }) {
  const { buckets, step } = grid(bell.histogram);
  if (buckets.length === 0 || bell.calls === 0) {
    return (
      <p className={`rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-subtle ${className}`}>
        No calls yet.
      </p>
    );
  }
  const first = buckets[0].bucketPct;
  const max = Math.max(1, ...buckets.map((b) => b.count));
  // Left edge of a % value in the chart, in % of its width (clamped inside the plot).
  const at = (pct: number) => (Math.min(buckets.length - 0.06, Math.max(0.06, (pct - first) / step)) / buckets.length) * 100;
  const peak = buckets.reduce((a, b) => (b.count > a.count ? b : a));
  const split = herdSplit(bell);
  const label =
    `Histogram of ${bell.calls} calls: ${split.bull}% bull, ${split.bear}% bear` +
    `${split.flat ? `, ${split.flat}% flat` : ""}. ` +
    `Most calls sit between ${signedPct(peak.bucketPct, 0)} and ${signedPct(peak.bucketPct + step, 0)}.` +
    marks.map((m) => ` ${m.label}: ${signedPct(m.pct)}.`).join("");
  const ticks = [first, ...(first < 0 && buckets[buckets.length - 1].bucketPct > 0 ? [0] : []), buckets[buckets.length - 1].bucketPct];

  return (
    <figure className={className}>
      <div role="img" aria-label={label} className="relative">
        <div className="flex h-32 items-end gap-[3px] sm:h-36">
          {buckets.map((b, i) => (
            <div
              key={b.bucketPct}
              title={`${signedPct(b.bucketPct, 0)} to ${signedPct(b.bucketPct + step, 0)}: ${b.count} calls`}
              className="flex h-full flex-1 flex-col justify-end"
            >
              <div
                className={`bell-rise rounded-t-[3px] ${b.bucketPct >= 0 ? "bg-success/75" : "bg-danger/75"}`}
                style={{ height: `${b.count ? Math.max(2.5, (b.count / max) * 100) : 0}%`, animationDelay: `${i * 30}ms` }}
              />
            </div>
          ))}
        </div>
        {marks.map((mark, i) => {
          const left = at(mark.pct);
          const align = left < 18 ? "translate-x-0" : left > 82 ? "-translate-x-full" : "-translate-x-1/2";
          return (
            <div key={mark.label} aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: `${left}%` }}>
              <span className={`absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full ${MARK_TONE[mark.tone].line}`} />
              <span
                className={`bell-pop absolute rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold whitespace-nowrap shadow ${align} ${MARK_TONE[mark.tone].chip}`}
                style={{ top: `${i * 22}px` }}
              >
                {mark.label} {signedPct(mark.pct)}
              </span>
            </div>
          );
        })}
      </div>
      <div aria-hidden className="relative mt-1.5 h-4 border-t border-line font-mono text-[10px] text-subtle">
        {ticks.map((tick) => (
          <span
            key={tick}
            className={`absolute top-1 whitespace-nowrap ${tick === first ? "" : "-translate-x-1/2"}`}
            style={{ left: `${((tick - first) / step / buckets.length) * 100}%` }}
          >
            {tick === 0 ? "0%" : signedPct(tick, 0)}
          </span>
        ))}
      </div>
    </figure>
  );
}

/**
 * The bull/bear split of a Bell's calls, both sides shown the same way (flat calls, if any, sit in between):
 * no side gets a headline.
 */
export function BullBearBar({ bell, className = "" }: { bell: Pick<BellSummary, "bullPct" | "bearPct">; className?: string }) {
  const { bull, bear, flat } = herdSplit(bell);
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2 text-xs font-medium tabular-nums">
        <span className="text-success">▲ {bull}% bull</span>
        {flat > 0 && <span className="text-subtle">{flat}% flat</span>}
        <span className="text-danger">{bear}% bear ▼</span>
      </div>
      <div
        role="img"
        aria-label={`${bull}% of calls bull, ${bear}% bear${flat ? `, ${flat}% flat` : ""}`}
        className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-line"
      >
        <span className="bg-success" style={{ width: `${bull}%` }} />
        <span className="flex-1" />
        <span className="bg-danger" style={{ width: `${bear}%` }} />
      </div>
    </div>
  );
}
