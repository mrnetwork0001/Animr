import { formatPct } from "@/lib/format";

/** Green/red pill for a genome's simulated edge over simply holding $CHOG (cf. components/pnl-badge.tsx). */
export function EdgeBadge({ pct, className = "" }: { pct: number; className?: string }) {
  const value = Number.isFinite(pct) && Math.abs(pct) >= 0.005 ? pct : 0;
  const tone =
    value > 0
      ? "bg-success/10 text-success ring-success/30"
      : value < 0
        ? "bg-danger/10 text-danger ring-danger/30"
        : "bg-surface-2 text-muted ring-line";
  return (
    <span
      title="Simulated edge vs simply holding $CHOG"
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-xs tabular-nums ring-1 ring-inset ${tone} ${className}`}
    >
      {value !== 0 && (
        <span aria-hidden className="text-[0.65em]">
          {value > 0 ? "▲" : "▼"}
        </span>
      )}
      {formatPct(value, 1)}
    </span>
  );
}
