"use client";

import type { BellSummary } from "@/lib/bell/types";
import { herdSplit, signedPct } from "./format";

export type HerdMark = { pct: number; label: string; tone: "actual" | "pick" };

const MARK_TONE = {
  actual: { line: "bg-[var(--v2-ink)]", chip: "bg-[var(--v2-ink)] text-[var(--v2-bg)]" },
  pick: { line: "bg-[var(--v2-teal)]", chip: "bg-[var(--v2-teal)] text-[var(--v2-bg)]" },
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

/** Every call of a Bell bucketed by forecast (bulls teal, bears violet: neither side gets an alarm colour), with optional markers. */
export function HerdHistogram({ bell, marks = [], className = "" }: { bell: BellSummary; marks?: HerdMark[]; className?: string }) {
  const { buckets, step } = grid(bell.histogram);
  if (buckets.length === 0 || bell.calls === 0) {
    return (
      <div className={`v2-empty ${className}`}>
        <p className="v2-empty-title">No calls yet</p>
      </div>
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
        <div className="flex h-36 items-end gap-[3px] sm:h-44">
          {buckets.map((b, i) => (
            <div
              key={b.bucketPct}
              title={`${signedPct(b.bucketPct, 0)} to ${signedPct(b.bucketPct + step, 0)}: ${b.count} calls`}
              className="flex h-full flex-1 flex-col justify-end"
            >
              <div
                className={`bell-rise rounded-t-[4px] ${b.bucketPct >= 0 ? "bell-bar-bull" : "bell-bar-bear"}`}
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
                className={`bell-pop absolute rounded-full px-2 py-0.5 text-[10.5px] font-medium whitespace-nowrap ${align} ${MARK_TONE[mark.tone].chip}`}
                style={{ top: `${i * 22}px` }}
              >
                {mark.label} {signedPct(mark.pct)}
              </span>
            </div>
          );
        })}
      </div>
      <div aria-hidden className="relative mt-2 h-5 border-t border-[var(--v2-line-soft)] text-[11px] text-[var(--v2-faint)]">
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
 * The bull/bear split of a Bell's calls, both sides shown the same way: bulls teal from the left, bears violet from
 * the right, flat calls (if any) in between. No side gets a headline or an alarm colour.
 */
export function BullBearBar({ bell, className = "" }: { bell: Pick<BellSummary, "bullPct" | "bearPct">; className?: string }) {
  const { bull, bear, flat } = herdSplit(bell);
  return (
    <div className={className}>
      <div aria-hidden className="flex items-end justify-between gap-3">
        <span className="grid gap-1">
          <span className="text-xs text-[var(--v2-nav)]">▲ Bull</span>
          <span className="bell-herd-count text-[var(--v2-teal)]">{bull}%</span>
        </span>
        {flat > 0 && (
          <span className="grid gap-1 text-center">
            <span className="text-xs text-[var(--v2-nav)]">Flat</span>
            <span className="bell-herd-count text-[var(--v2-faint)]">{flat}%</span>
          </span>
        )}
        <span className="grid gap-1 text-right">
          <span className="text-xs text-[var(--v2-nav)]">Bear ▼</span>
          <span className="bell-herd-count text-[var(--v2-violet-ink)]">{bear}%</span>
        </span>
      </div>
      <div
        role="img"
        aria-label={`${bull}% of calls bull, ${bear}% bear${flat ? `, ${flat}% flat` : ""}`}
        className="bell-herd-bar mt-3"
      >
        <span className="bell-bull" style={{ width: `${bull}%` }} />
        <span className="flex-1" />
        <span className="bell-bear" style={{ width: `${bear}%` }} />
      </div>
    </div>
  );
}
