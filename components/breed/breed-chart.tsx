"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDay, formatHour, formatPrice, signedPct } from "@/components/dna/shared";

// Child, parent A and parent B on the same real $CHOG candles, as % vs just holding (the dashed 0% line), with the
// $CHOG price underneath. Pixel-exact SVG sized by a ResizeObserver; hover or touch shows the three values.

export type BreedLine = { key: string; label: string; color: string; ink: string; width: number; glow?: boolean };

/** [t, price, ...edge % per line]. */
type Point = readonly number[];

const PAD = { top: 12, right: 52, bottom: 24, left: 4 };
const AXIS = { fontFamily: "var(--v2-font-text)", fontSize: 11, fill: "var(--v2-chart-axis)" } as const;

function niceStep(range: number, ticks: number): number {
  const raw = range / Math.max(1, ticks);
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

export function BreedChart({ points, lines, summary }: { points: Point[]; lines: BreedLine[]; summary: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = width < 560 ? 280 : 360;
  const g = useMemo(() => {
    if (width === 0 || points.length < 2) return null;
    const t0 = points[0][0];
    const t1 = points[points.length - 1][0];
    const x0 = PAD.left;
    const x1 = width - PAD.right;
    const priceH = Math.round((height - PAD.top - PAD.bottom) * 0.24);
    const gap = 20;
    const vTop = PAD.top;
    const vBottom = height - PAD.bottom - priceH - gap;
    const pTop = vBottom + gap;
    const pBottom = height - PAD.bottom;
    const xOf = (t: number) => x0 + ((t - t0) / Math.max(1, t1 - t0)) * (x1 - x0);

    let lo = 0;
    let hi = 0;
    for (const p of points) {
      for (let k = 2; k < p.length; k++) {
        lo = Math.min(lo, p[k]);
        hi = Math.max(hi, p[k]);
      }
    }
    const pad = Math.max((hi - lo) * 0.08, 1);
    lo -= pad;
    hi += pad;
    const yEdge = (v: number) => vBottom - ((v - lo) / (hi - lo)) * (vBottom - vTop);

    const prices = points.map((p) => p[1]);
    const pLo = Math.min(...prices);
    const pHi = Math.max(...prices);
    const padP = (pHi - pLo) * 0.1 || pHi * 0.05 || 1;
    const yPrice = (v: number) => pBottom - ((v - (pLo - padP)) / (pHi - pLo + 2 * padP)) * (pBottom - pTop);

    const paths = lines.map((_, k) => points.map((p, i) => `${i ? "L" : "M"}${xOf(p[0]).toFixed(1)} ${yEdge(p[k + 2]).toFixed(1)}`).join(""));
    const price = points.map((p, i) => `${i ? "L" : "M"}${xOf(p[0]).toFixed(1)} ${yPrice(p[1]).toFixed(1)}`).join("");
    const priceArea = `${price}L${xOf(t1).toFixed(1)} ${pBottom}L${xOf(t0).toFixed(1)} ${pBottom}Z`;
    const step = niceStep(hi - lo, height < 300 ? 3 : 4);
    const ticks: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    const days = width < 560 ? 3 : 5;
    const timeTicks = Array.from({ length: days }, (_, i) => t0 + ((t1 - t0) * (i + 0.5)) / days);
    return { x0, x1, vTop, vBottom, pTop, pBottom, xOf, yEdge, yPrice, paths, price, priceArea, ticks, timeTicks, t0, t1 };
  }, [points, lines, width, height]);

  const pick = (clientX: number) => {
    const el = box.current;
    if (!el || !g) return;
    const x = clientX - el.getBoundingClientRect().left;
    const t = g.t0 + ((x - g.x0) / Math.max(1, g.x1 - g.x0)) * (g.t1 - g.t0);
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i][0] - t) < Math.abs(points[best][0] - t)) best = i;
    setHover(best);
  };

  const at = hover !== null ? points[hover] : null;
  return (
    <div>
      <ul className="v2-legend mb-3 text-sm" aria-label="Lines">
        {lines.map((line) => (
          <li key={line.key}>
            <span className="v2-legend-swatch" style={{ ["--v2-swatch" as string]: line.color }} />
            {line.label}
          </li>
        ))}
        <li>
          <span className="inline-block h-0 w-[14px] border-t border-dashed border-[var(--v2-faint)]" />
          Just holding
        </li>
      </ul>
      <div
        ref={box}
        className="relative w-full touch-pan-y select-none"
        style={{ height }}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        {g && (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={summary} className="v2-chart block">
            {g.ticks.map((v) => (
              <g key={v}>
                <line className="grid" x1={g.x0} x2={g.x1} y1={g.yEdge(v)} y2={g.yEdge(v)} stroke="var(--v2-chart-grid)" />
                <text x={g.x1 + 8} y={g.yEdge(v) + 4} style={AXIS}>
                  {v > 0 ? "+" : ""}
                  {v}%
                </text>
              </g>
            ))}
            <line x1={g.x0} x2={g.x1} y1={g.yEdge(0)} y2={g.yEdge(0)} stroke="var(--v2-faint)" strokeDasharray="4 4" />
            {/* Parents first, child on top. */}
            {lines
              .map((line, k) => ({ line, k }))
              .reverse()
              .map(({ line, k }) => (
                <path
                  key={line.key}
                  d={g.paths[k]}
                  fill="none"
                  stroke={line.color}
                  strokeWidth={line.width}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  style={line.glow ? { filter: "drop-shadow(0 0 6px rgb(159 240 236 / 0.45))" } : undefined}
                />
              ))}
            <path d={g.priceArea} fill="rgb(255 255 255 / 0.04)" />
            <path d={g.price} fill="none" stroke="var(--v2-chart-4)" strokeWidth={1.25} />
            <text x={g.x0} y={g.pTop - 6} style={AXIS}>
              $CHOG price (WMON)
            </text>
            {g.timeTicks.map((t) => (
              <text key={t} x={g.xOf(t)} y={height - 6} textAnchor="middle" style={AXIS}>
                {formatDay(t)}
              </text>
            ))}
            {at && (
              <g>
                <line x1={g.xOf(at[0])} x2={g.xOf(at[0])} y1={g.vTop} y2={g.pBottom} stroke="var(--v2-line-strong)" />
                {lines.map((line, k) => (
                  <circle key={line.key} cx={g.xOf(at[0])} cy={g.yEdge(at[k + 2])} r={3.5} fill={line.color} />
                ))}
              </g>
            )}
          </svg>
        )}
        {g && at && (
          <div
            className="v2-glass--strong pointer-events-none absolute top-2 rounded-[var(--v2-r-sm)] border border-[var(--v2-line)] bg-[var(--v2-bg-overlay)] px-3 py-2 text-xs"
            style={g.xOf(at[0]) > width / 2 ? { left: 8 } : { right: PAD.right + 8 }}
          >
            <p className="text-[var(--v2-faint)]">{formatHour(at[0])}</p>
            {lines.map((line, k) => (
              <p key={line.key} className="v2-num mt-0.5 flex justify-between gap-4">
                <span style={{ color: line.ink }}>{line.label}</span>
                <span>{signedPct(at[k + 2])}</span>
              </p>
            ))}
            <p className="mt-0.5 flex justify-between gap-4 text-[var(--v2-faint)]">
              <span>Price</span>
              <span className="v2-num">{formatPrice(at[1])}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
