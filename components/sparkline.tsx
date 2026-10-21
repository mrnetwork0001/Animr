import { useId } from "react";
import "@/app/design-v2.css";

// viewBox units; the SVG stretches to its container (preserveAspectRatio="none").
const W = 100;
const H = 40;
const PAD = 3;

type SparklineProps = {
  /** Oldest -> newest. Non-finite values are skipped. */
  values: number[];
  /** Accessible description of what the line shows. */
  label: string;
  /** Optional dashed reference line, e.g. the starting value. */
  baseline?: number;
  /** Sizing classes; the width fills the container. */
  className?: string;
};

/**
 * Dependency-free inline SVG sparkline in the v2 chart recipe: the subject in teal with a soft area and one glow,
 * the reference line dashed violet, three faint grid lines and a hollow end marker.
 */
export function Sparkline({ values, label, baseline, className = "h-16" }: SparklineProps) {
  const gradientId = `spark${useId().replace(/[^\w-]/g, "")}`;
  const points = values.filter(Number.isFinite);

  if (points.length < 2) {
    return (
      <div
        role="img"
        aria-label={`${label}: not enough data yet`}
        className={`flex items-center justify-center rounded-[var(--v2-r-md)] border border-dashed border-[var(--v2-line)] text-xs text-[var(--v2-faint)] ${className}`}
      >
        Not enough data to chart yet
      </div>
    );
  }

  const hasBaseline = baseline !== undefined && Number.isFinite(baseline);
  const domain = hasBaseline ? [...points, baseline] : points;
  const min = Math.min(...domain);
  const max = Math.max(...domain);
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => (max === min ? H / 2 : PAD + (1 - (v - min) / (max - min)) * (H - 2 * PAD));

  const line = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const last = points[points.length - 1];

  return (
    <div className={`v2-chart relative ${className}`}>
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        <title>{label}</title>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--v2-chart-1)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--v2-chart-1)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[PAD, H / 2, H - PAD].map((gy) => (
          <line key={gy} className="grid" x1="0" x2={W} y1={gy} y2={gy} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill={`url(#${gradientId})`} />
        {hasBaseline && (
          <line
            x1="0"
            x2={W}
            y1={y(baseline)}
            y2={y(baseline)}
            stroke="var(--v2-chart-2)"
            strokeWidth="1.6"
            strokeDasharray="4 5"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path
          d={line}
          fill="none"
          stroke="var(--v2-chart-1)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ filter: "drop-shadow(0 0 6px rgb(159 240 236 / .45))" }}
        />
      </svg>
      {/* An HTML marker stays round however the SVG is stretched. */}
      <span
        aria-hidden
        className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--v2-chart-1)] bg-[#0d0c11]"
        style={{ left: "100%", top: `${(y(last) / H) * 100}%` }}
      />
    </div>
  );
}
