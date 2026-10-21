"use client";

import { useId, useMemo } from "react";
import type { VersusBout } from "@/lib/rewind/types";
import {
  SIDE_COLOR,
  type Side,
  edgeOf,
  formatDay,
  formatPrice,
  frameAt,
  frameTime,
  signedPct,
} from "./shared";

// The VERSUS race drawing: pixel-exact SVG (no stretching). Both fighters' $CHOG stacks as % vs just
// holding (the dashed line) on top, the $CHOG price index below, trade markers on each fighter's line.
// Playback state lives in race.tsx; everything here is a pure function of data, size and position.

const PAD = { top: 12, right: 46, bottom: 22, left: 6 };

function niceStep(range: number, targetTicks: number): number {
  const raw = range / Math.max(1, targetTicks);
  const magnitude = 10 ** Math.floor(Math.log10(raw || 1));
  const norm = raw / magnitude;
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * magnitude;
}

export type RaceGeometry = ReturnType<typeof useRaceGeometry>;

/** Scales, paths and ticks for a `width` x `height` chart; memoized per bout and size. */
export function useRaceGeometry(bout: VersusBout, width: number, height: number) {
  return useMemo(() => {
    const { frames, startChog } = bout;
    const n = frames.length;
    const x0 = PAD.left;
    const x1 = Math.max(x0 + 10, width - PAD.right);
    const inner = height - PAD.top - PAD.bottom;
    const priceH = Math.round(inner * 0.27);
    // The gap between the panels holds the price panel's label.
    const gap = 20;
    const valueTop = PAD.top;
    const valueBottom = height - PAD.bottom - priceH - gap;
    const priceTop = valueBottom + gap;
    const priceBottom = height - PAD.bottom;
    const xOf = (pos: number) => x0 + (pos / Math.max(1, n - 1)) * (x1 - x0);

    // Value panel: % vs holding, so "just holding" is the flat 0% line.
    const edges = frames.flatMap((f) => [edgeOf(f.a, startChog), edgeOf(f.b, startChog)]);
    let lo = Math.min(0, ...edges);
    let hi = Math.max(0, ...edges);
    const padV = Math.max((hi - lo) * 0.1, 1);
    lo -= padV;
    hi += padV;
    const yEdge = (edge: number) => valueBottom - ((edge - lo) / (hi - lo)) * (valueBottom - valueTop);

    const prices = frames.map((f) => f.priceIndex);
    const pLo = Math.min(...prices);
    const pHi = Math.max(...prices);
    const padP = (pHi - pLo) * 0.12 || pHi * 0.05 || 1;
    const yPrice = (price: number) =>
      priceBottom - ((price - (pLo - padP)) / (pHi - pLo + 2 * padP)) * (priceBottom - priceTop);

    const line = (side: Side) =>
      frames.map((f, i) => `${i ? "L" : "M"}${xOf(i).toFixed(1)} ${yEdge(edgeOf(f[side], startChog)).toFixed(1)}`).join("");
    const lines = { a: line("a"), b: line("b") };
    const priceLine = frames.map((f, i) => `${i ? "L" : "M"}${xOf(i).toFixed(1)} ${yPrice(f.priceIndex).toFixed(1)}`).join("");
    const priceArea = `${priceLine}L${xOf(n - 1).toFixed(1)} ${priceBottom}L${xOf(0).toFixed(1)} ${priceBottom}Z`;

    const step = niceStep(hi - lo, height < 300 ? 3 : 4);
    const edgeTicks: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) edgeTicks.push(Math.round(v * 1e6) / 1e6);

    // Hour ticks: every 12h on wide charts, every 24h on phones; the last frame always gets one.
    const hourStep = width < 480 ? 24 : 12;
    const timeTicks: number[] = [];
    for (let h = 0; h < n - 1; h += hourStep) timeTicks.push(h);
    if (n - 1 - (timeTicks[timeTicks.length - 1] ?? 0) < hourStep / 2) timeTicks.pop();
    timeTicks.push(n - 1);

    return {
      n, x0, x1, valueTop, valueBottom, priceTop, priceBottom, zeroY: yEdge(0), pLo, pHi,
      xOf, yEdge, yPrice, lines, priceLine, priceArea, edgeTicks, timeTicks,
    };
  }, [bout, width, height]);
}

type RaceChartProps = {
  bout: VersusBout;
  g: RaceGeometry;
  width: number;
  height: number;
  /** Fractional frame position of the playhead (0 … frames - 1). */
  pos: number;
  /** After the KO: real dates and prices on the axes, no playhead. */
  revealed: boolean;
  /** After the KO: the winner's line stands out. */
  winner?: Side | "draw";
  /** The chart's text alternative. */
  summary: string;
};

/** The race: both value lines and their trades revealed up to `pos`, the price index below. */
export function RaceChart({ bout, g, width, height, pos, revealed, winner, summary }: RaceChartProps) {
  const id = useId().replace(/[^\w-]/g, "");
  const headX = g.xOf(pos);
  const { startChog, frames, reveal } = bout;
  const narrow = width < 480;

  // Everything static is built once per size and data; each frame only moves the clip, playhead and dots.
  const grid = useMemo(
    () => (
      <>
        <defs>
          <linearGradient id={`${id}-price`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.24" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {g.edgeTicks.map((tick) => (
          <g key={tick}>
            {tick !== 0 && (
              <line
                x1={g.x0}
                x2={g.x1}
                y1={g.yEdge(tick)}
                y2={g.yEdge(tick)}
                stroke="var(--color-line)"
                strokeWidth={1}
                strokeDasharray="2 4"
                opacity={0.8}
              />
            )}
            <text x={g.x1 + 6} y={g.yEdge(tick) + 3.5} fontSize={10} fill="var(--color-subtle)" className="font-mono">
              {tick === 0 ? "hold" : signedPct(tick, Math.abs(tick) < 10 && tick % 1 ? 1 : 0)}
            </text>
          </g>
        ))}
        {/* "Just holding": known in advance, so it's drawn in full as the line to beat. */}
        <line
          x1={g.x0}
          x2={g.x1}
          y1={g.zeroY}
          y2={g.zeroY}
          stroke="var(--color-muted)"
          strokeWidth={1.5}
          strokeDasharray="5 5"
          opacity={0.8}
        />
        <line x1={g.x0} x2={g.x1} y1={g.priceBottom} y2={g.priceBottom} stroke="var(--color-line)" strokeWidth={1} />
      </>
    ),
    [g, id],
  );

  // Axis labels change at the reveal: hours and an index before, real dates and WMON prices after.
  const priceLabel = (index: number) => (revealed ? formatPrice((reveal.priceStart * index) / 100) : index.toFixed(0));
  const timeLabel = (frame: number) => {
    if (!revealed) return `${frame}h`;
    const t = frameTime(bout, frame);
    if (!Number.isFinite(t)) return `${frame}h`;
    return narrow ? formatDay(t) : `${formatDay(t)} ${new Date(t).toISOString().slice(11, 13)}h`;
  };

  // Revealed with the playhead: the price index (the future price would give the result away) and both
  // value lines; at the KO the winner's line is drawn last and thicker, the other steps back a little.
  const lines = useMemo(() => {
    const order: Side[] = winner === "a" ? ["b", "a"] : winner === "b" ? ["a", "b"] : ["b", "a"];
    return (
      <>
        <path d={g.priceArea} fill={`url(#${id}-price)`} />
        <path d={g.priceLine} fill="none" stroke="var(--color-accent)" strokeOpacity={0.75} strokeWidth={1.25} strokeLinejoin="round" />
        {order.map((side) => (
          <path
            key={side}
            d={g.lines[side]}
            fill="none"
            stroke={SIDE_COLOR[side]}
            strokeWidth={winner === side ? 3.25 : 2.5}
            strokeOpacity={winner && winner !== "draw" && winner !== side ? 0.6 : 1}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </>
    );
  }, [g, id, winner]);

  const visibleTrades = bout.trades.filter((trade) => trade.i <= pos + 1e-6);

  return (
    <svg
      role="img"
      aria-label={summary}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0 select-none"
    >
      {grid}

      <text x={g.x0 + 2} y={g.priceTop - 7} fontSize={10} fill="var(--color-subtle)">
        {revealed ? "$CHOG price (WMON per $CHOG)" : "$CHOG price index (100 = start)"}
      </text>
      <text x={g.x1 + 6} y={g.priceTop + 8} fontSize={10} fill="var(--color-subtle)" className="font-mono">
        {priceLabel(g.pHi)}
      </text>
      <text x={g.x1 + 6} y={g.priceBottom} fontSize={10} fill="var(--color-subtle)" className="font-mono">
        {priceLabel(g.pLo)}
      </text>
      {g.timeTicks.map((frame, i) => (
        <text
          key={frame}
          x={g.xOf(frame)}
          y={height - 7}
          fontSize={10}
          fill="var(--color-subtle)"
          textAnchor={i === 0 ? "start" : i === g.timeTicks.length - 1 ? "end" : "middle"}
          className="font-mono"
        >
          {timeLabel(frame)}
        </text>
      ))}

      <clipPath id={`${id}-reveal`}>
        <rect x={0} y={0} width={Math.max(0, headX + 1)} height={height} />
      </clipPath>
      <g clipPath={revealed ? undefined : `url(#${id}-reveal)`}>{lines}</g>

      {visibleTrades.map((trade, k) => {
        const x = g.xOf(trade.i);
        const frame = frames[Math.max(0, Math.min(frames.length - 1, Math.round(trade.i)))];
        const y = g.yEdge(edgeOf(frame[trade.fighter], startChog));
        const buy = trade.side === "buy";
        // Buys sit under the line pointing up, sells above it pointing down.
        const d = buy ? `M${x} ${y + 4}l5 8h-10z` : `M${x} ${y - 4}l5 -8h-10z`;
        return (
          <path
            key={`${trade.fighter}-${trade.i}-${k}`}
            d={d}
            fill={SIDE_COLOR[trade.fighter]}
            stroke="var(--color-background)"
            strokeWidth={1.25}
            className="vs-mark"
          />
        );
      })}

      {!revealed && pos > 0 && (
        <g>
          <line
            x1={headX}
            x2={headX}
            y1={g.valueTop}
            y2={g.priceBottom}
            stroke="var(--color-foreground)"
            strokeOpacity={0.3}
            strokeWidth={1}
          />
          <circle cx={headX} cy={g.yPrice(frameAt(frames, pos, "priceIndex"))} r={3} fill="var(--color-accent)" />
          {(["b", "a"] as const).map((side) => (
            <circle
              key={side}
              cx={headX}
              cy={g.yEdge(edgeOf(frameAt(frames, pos, side), startChog))}
              r={5}
              fill={SIDE_COLOR[side]}
              stroke="var(--color-background)"
              strokeWidth={2}
            />
          ))}
        </g>
      )}

      {revealed &&
        (["a", "b"] as const).map((side) => {
          const last = frames[frames.length - 1];
          return (
            <circle
              key={side}
              cx={g.xOf(frames.length - 1)}
              cy={g.yEdge(edgeOf(last[side], startChog))}
              r={4.5}
              fill={SIDE_COLOR[side]}
              stroke="var(--color-background)"
              strokeWidth={2}
            />
          );
        })}
    </svg>
  );
}
