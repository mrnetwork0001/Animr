import { useId } from "react";

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

/** Dependency-free inline SVG sparkline, drawn in the accent color. */
export function Sparkline({ values, label, baseline, className = "h-16" }: SparklineProps) {
  const gradientId = `spark${useId().replace(/[^\w-]/g, "")}`;
  const points = values.filter(Number.isFinite);

  if (points.length < 2) {
    return (
      <div
        role="img"
        aria-label={`${label}: not enough data yet`}
        className={`flex items-center justify-center rounded-lg border border-dashed border-line text-xs text-subtle ${className}`}
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
    <div className={`relative text-accent ${className}`}>
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
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        {hasBaseline && (
          <line
            x1="0"
            x2={W}
            y1={y(baseline)}
            y2={y(baseline)}
            className="stroke-subtle"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* An HTML dot stays round however the SVG is stretched. */}
      <span
        aria-hidden
        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-4 ring-accent/25"
        style={{ left: "100%", top: `${(y(last) / H) * 100}%` }}
      />
    </div>
  );
}
