"use client";

import { useId, useMemo } from "react";
import type { ReplayMoment, ReplayPoint, ReplayResult } from "@/lib/dna/types";
import { formatDay, formatPrice, signedPct } from "./shared";

// The Time Machine's drawing: pixel-exact SVG (no stretching) plus the speech-bubble overlay.
// Playback state lives in time-machine.tsx; everything here is a pure function of data, size and time.

export type Series = { tokenId: number; result: ReplayResult };

/** Line colors (v2 chart tokens): the Chog in teal, its rival in a race in violet. */
export const SERIES_COLOR = ["var(--v2-chart-1)", "var(--v2-chart-2)"] as const;
/** Text-safe versions of the same two (violet text needs the lighter ink on near-black). */
export const SERIES_INK = ["var(--v2-teal)", "var(--v2-violet-ink)"] as const;

/** The subject line's one glow (components/v2/README.md, "Charts: quick recipe"). */
const GLOW = "drop-shadow(0 0 6px rgb(159 240 236 / 0.45))";
const AXIS_TEXT = { fontFamily: "var(--v2-font-text)", fontSize: 11 } as const;

/** How long a speech bubble stays up, as a share of the replayed window. */
const BUBBLE_SHARE = 0.09;

/** Index of the last item with t <= target (-1 when none). Items are sorted by t. */
export function lastAtOrBefore(items: readonly { t: number }[], target: number): number {
  let lo = 0;
  let hi = items.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].t <= target) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Linear interpolation of a point field at time t. */
export function sampleAt(points: readonly ReplayPoint[], t: number, field: "value" | "price"): number {
  const i = lastAtOrBefore(points, t);
  if (i < 0) return points[0][field];
  if (i >= points.length - 1) return points[points.length - 1][field];
  const a = points[i];
  const b = points[i + 1];
  const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return a[field] + (b[field] - a[field]) * k;
}

function niceStep(range: number, targetTicks: number): number {
  const raw = range / Math.max(1, targetTicks);
  const magnitude = 10 ** Math.floor(Math.log10(raw || 1));
  const norm = raw / magnitude;
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * magnitude;
}

/** A portfolio value as % vs just holding the starting $CHOG. */
export const edgeOf = (s: Series, value: number) => (value / s.result.startChog - 1) * 100;

const PAD = { top: 14, right: 54, bottom: 24, left: 6 };

export type Geometry = ReturnType<typeof useGeometry>;

/** Scales, paths and ticks for a chart `width` x `height` px; memoized per data and size. */
export function useGeometry(series: Series[], width: number, height: number) {
  return useMemo(() => {
    const points = series[0].result.points;
    const t0 = points[0]?.t ?? 0;
    const t1 = points[points.length - 1]?.t ?? t0;
    const x0 = PAD.left;
    const x1 = Math.max(x0 + 10, width - PAD.right);
    const inner = height - PAD.top - PAD.bottom;
    const priceH = Math.round(inner * 0.3);
    // The gap between the panels holds the price panel's label.
    const gap = 22;
    const valueTop = PAD.top;
    const valueBottom = height - PAD.bottom - priceH - gap;
    const priceTop = valueBottom + gap;
    const priceBottom = height - PAD.bottom;

    const xOf = (t: number) => x0 + ((t - t0) / Math.max(1, t1 - t0)) * (x1 - x0);

    // Value panel: % vs holding, so "just holding" is the flat 0% line.
    const edges = series.flatMap((s) => s.result.points.map((p) => edgeOf(s, p.value)));
    let lo = Math.min(0, ...edges);
    let hi = Math.max(0, ...edges);
    const padV = Math.max((hi - lo) * 0.08, 1);
    lo -= padV;
    hi += padV;
    const yEdge = (edge: number) => valueBottom - ((edge - lo) / (hi - lo)) * (valueBottom - valueTop);

    const prices = points.map((p) => p.price);
    const pLo = Math.min(...prices);
    const pHi = Math.max(...prices);
    const padP = (pHi - pLo) * 0.1 || pHi * 0.05 || 1;
    const yPrice = (price: number) =>
      priceBottom - ((price - (pLo - padP)) / (pHi - pLo + 2 * padP)) * (priceBottom - priceTop);

    const lines = series.map((s) =>
      s.result.points
        .map((p, i) => `${i ? "L" : "M"}${xOf(p.t).toFixed(1)} ${yEdge(edgeOf(s, p.value)).toFixed(1)}`)
        .join(""),
    );
    const zeroY = yEdge(0);
    const area = `${lines[0]}L${xOf(t1).toFixed(1)} ${zeroY.toFixed(1)}L${xOf(t0).toFixed(1)} ${zeroY.toFixed(1)}Z`;
    const priceLine = points.map((p, i) => `${i ? "L" : "M"}${xOf(p.t).toFixed(1)} ${yPrice(p.price).toFixed(1)}`).join("");
    const priceArea = `${priceLine}L${xOf(t1).toFixed(1)} ${priceBottom}L${xOf(t0).toFixed(1)} ${priceBottom}Z`;

    const step = niceStep(hi - lo, height < 340 ? 3 : 4);
    const edgeTicks: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) edgeTicks.push(Math.round(v * 1e6) / 1e6);

    const dayCount = width < 520 ? 3 : 5;
    const timeTicks = Array.from({ length: dayCount }, (_, i) => t0 + ((t1 - t0) * (i + 0.5)) / dayCount);

    return {
      t0, t1, x0, x1, valueTop, valueBottom, priceTop, priceBottom, zeroY, pLo, pHi,
      xOf, yEdge, yPrice, lines, area, priceLine, priceArea, edgeTicks, timeTicks,
    };
  }, [series, width, height]);
}

/** The replay chart: value vs holding on top, price with trade markers below, revealed up to `progress`. */
export function Chart({
  series,
  g,
  width,
  height,
  progress,
  now,
  summary,
}: {
  series: Series[];
  g: Geometry;
  width: number;
  height: number;
  progress: number;
  now: number;
  summary: string;
}) {
  const id = useId().replace(/[^\w-]/g, "");
  const single = series.length === 1;
  const headX = g.x0 + (g.x1 - g.x0) * progress;
  const holdColor = single ? "var(--v2-chart-2)" : "var(--v2-chart-3)";
  const holdInk = single ? "var(--v2-violet-ink)" : "var(--v2-nav)";

  // Everything static is built once per size/data; each frame only moves the clip, the playhead and dots.
  const staticLayers = useMemo(
    () => (
      <>
        <defs>
          <clipPath id={`${id}-above`}>
            <rect x={0} y={0} width={width} height={g.zeroY} />
          </clipPath>
          <clipPath id={`${id}-below`}>
            <rect x={0} y={g.zeroY} width={width} height={height - g.zeroY} />
          </clipPath>
          {/* The equity area: teal fading down to the hold line above it, a faint danger wash below it. */}
          <linearGradient id={`${id}-up`} gradientUnits="userSpaceOnUse" x1="0" y1={g.valueTop} x2="0" y2={g.zeroY}>
            <stop offset="0%" stopColor="var(--v2-chart-1)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--v2-chart-1)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}-down`} gradientUnits="userSpaceOnUse" x1="0" y1={g.zeroY} x2="0" y2={g.valueBottom}>
            <stop offset="0%" stopColor="var(--v2-danger)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--v2-danger)" stopOpacity="0.16" />
          </linearGradient>
          <linearGradient id={`${id}-price`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid: horizontal hairlines only, labels in faint Inter on the right. */}
        {g.edgeTicks.map((tick) => (
          <g key={tick}>
            {tick !== 0 && (
              <line x1={g.x0} x2={g.x1} y1={g.yEdge(tick)} y2={g.yEdge(tick)} stroke="var(--v2-chart-grid)" strokeWidth={1} />
            )}
            <text
              x={g.x1 + 8}
              y={g.yEdge(tick) + 3.5}
              fill={tick === 0 ? holdInk : "var(--v2-chart-axis)"}
              style={AXIS_TEXT}
            >
              {tick === 0 ? "hold" : signedPct(tick, Math.abs(tick) < 10 && tick % 1 ? 1 : 0)}
            </text>
          </g>
        ))}
        <line x1={g.x0} x2={g.x1} y1={g.priceTop} y2={g.priceTop} stroke="var(--v2-chart-grid)" strokeWidth={1} />
        <text x={g.x1 + 8} y={g.priceTop + 9} fill="var(--v2-chart-axis)" style={AXIS_TEXT}>
          {formatPrice(g.pHi)}
        </text>
        <text x={g.x1 + 8} y={g.priceBottom} fill="var(--v2-chart-axis)" style={AXIS_TEXT}>
          {formatPrice(g.pLo)}
        </text>
        <text x={g.x0 + 2} y={g.priceTop - 8} fill="var(--v2-chart-axis)" style={AXIS_TEXT}>
          $CHOG price (WMON per $CHOG)
        </text>
        {g.timeTicks.map((t) => (
          <text key={t} x={g.xOf(t)} y={height - 6} fill="var(--v2-chart-axis)" textAnchor="middle" style={AXIS_TEXT}>
            {formatDay(t)}
          </text>
        ))}

        {/* "Just holding": known in advance, so it's drawn in full as the dashed ghost to beat (violet when it is
            the one benchmark, neutral in a race, where violet is the rival). */}
        <line
          x1={g.x0}
          x2={g.x1}
          y1={g.zeroY}
          y2={g.zeroY}
          stroke={holdColor}
          strokeWidth={1.6}
          strokeDasharray="4 5"
          strokeLinecap="round"
        />
        <line x1={g.x0} x2={g.x1} y1={g.priceBottom} y2={g.priceBottom} stroke="var(--v2-chart-grid)" strokeWidth={1} />
      </>
    ),
    [g, id, width, height, holdColor, holdInk],
  );

  const revealed = useMemo(
    () => (
      <>
        {single && (
          <>
            <path d={g.area} fill={`url(#${id}-up)`} clipPath={`url(#${id}-above)`} />
            <path d={g.area} fill={`url(#${id}-down)`} clipPath={`url(#${id}-below)`} />
          </>
        )}
        <path d={g.priceArea} fill={`url(#${id}-price)`} />
        <path d={g.priceLine} fill="none" stroke="var(--v2-chart-3)" strokeOpacity={0.5} strokeWidth={1.25} strokeLinejoin="round" />
        {/* The rival first, so the subject (and its one glow) draws on top. */}
        {series
          .map((s, i) => (
            <path
              key={s.tokenId}
              d={g.lines[i]}
              fill="none"
              stroke={SERIES_COLOR[i]}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              style={i === 0 ? { filter: GLOW } : undefined}
            />
          ))
          .reverse()}
        <TradeMarkers series={series[0]} g={g} />
      </>
    ),
    [g, id, series, single],
  );

  return (
    <svg
      role="img"
      aria-label={summary}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0 select-none"
    >
      <title>{summary}</title>
      {staticLayers}
      <clipPath id={`${id}-reveal`}>
        <rect x={0} y={0} width={Math.max(0, headX)} height={height} />
      </clipPath>
      <g clipPath={`url(#${id}-reveal)`}>{revealed}</g>

      {progress > 0 && progress < 1 && (
        <line
          x1={headX}
          x2={headX}
          y1={g.valueTop}
          y2={g.priceBottom}
          stroke="#ffffff"
          strokeOpacity={0.22}
          strokeWidth={1}
        />
      )}
      {/* The playhead (or, at the end, the end marker): near-black dots ringed in each series' colour. */}
      {progress > 0 && (
        <g>
          {series
            .map((s, i) => (
              <circle
                key={s.tokenId}
                cx={headX}
                cy={g.yEdge(edgeOf(s, sampleAt(s.result.points, now, "value")))}
                r={4}
                fill="var(--v2-bg)"
                stroke={SERIES_COLOR[i]}
                strokeWidth={2}
                style={i === 0 ? { filter: GLOW } : undefined}
              />
            ))
            .reverse()}
          {progress < 1 && (
            <circle cx={headX} cy={g.yPrice(sampleAt(series[0].result.points, now, "price"))} r={2.5} fill="var(--v2-chart-3)" />
          )}
        </g>
      )}
    </svg>
  );
}

function TradeMarkers({ series, g }: { series: Series; g: Geometry }) {
  const { trades, points } = series.result;
  const dense = trades.length > 60;
  return (
    <g>
      {trades.map((trade, i) => {
        const x = g.xOf(trade.t);
        const y = g.yPrice(sampleAt(points, trade.t, "price"));
        const buy = trade.side === "buy";
        const fill = buy ? "var(--v2-chart-up)" : "var(--v2-chart-down)";
        // Small dots on the price line: buys green, sells red.
        return <circle key={i} cx={x} cy={y} r={dense ? 2.25 : 3.25} fill={fill} stroke="var(--v2-bg)" strokeWidth={dense ? 0.75 : 1.25} />;
      })}
    </g>
  );
}

/** The latest key moment (or, without any, a trade's reason) for a short while after it happens. */
export function SpeechBubble({ series, g, width, now }: { series: Series; g: Geometry; width: number; now: number }) {
  const { points, moments, trades } = series.result;
  const said: ReplayMoment[] = useMemo(
    () =>
      moments.length > 0
        ? [...moments].sort((a, b) => a.t - b.t)
        : trades
            .filter((_, i) => i % Math.max(1, Math.ceil(trades.length / 6)) === 0)
            .map((trade) => ({ t: trade.t, text: trade.reason })),
    [moments, trades],
  );
  const index = lastAtOrBefore(said, now);
  const moment = index >= 0 ? said[index] : undefined;
  if (!moment?.text || now - moment.t > (g.t1 - g.t0) * BUBBLE_SHARE) return null;

  const x = g.xOf(moment.t);
  const y = g.yEdge(edgeOf(series, sampleAt(points, moment.t, "value")));
  const below = y - g.valueTop < 96;
  const align = x < 120 ? "left" : x > width - 120 ? "right" : "center";
  const shift = align === "left" ? "-12px" : align === "right" ? "calc(-100% + 12px)" : "-50%";

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-10"
      // Placed with transforms only (never left/top): a moving bubble is then no layout shift.
      style={{ transform: `translate(${x}px, ${y}px) translate(${shift}, ${below ? "14px" : "calc(-100% - 14px)"})` }}
    >
      <div
        key={moment.t}
        className="dna-pop v2-glass--strong relative w-max max-w-[200px] rounded-[var(--v2-r-md)] px-3 py-2 text-xs leading-snug text-[var(--v2-ink)] sm:max-w-[250px] sm:text-[13px]"
      >
        <span className="line-clamp-4">{moment.text}</span>
        <span
          className={`absolute size-2.5 rotate-45 border-[var(--v2-line)] bg-[#17161c] ${
            below ? "-top-[6px] border-t border-l" : "-bottom-[6px] border-r border-b"
          }`}
          style={{ left: align === "left" ? 8 : align === "right" ? "calc(100% - 18px)" : "calc(50% - 5px)" }}
        />
      </div>
    </div>
  );
}
