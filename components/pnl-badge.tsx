import { formatPct } from "@/lib/format";

const SIZES = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
  lg: "px-3 py-1.5 text-base",
} as const;

type PnlBadgeProps = {
  /** Percent (12.5 means +12.5%); null when unknown. */
  pct: number | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
};

/** Green/red PnL pill. PnL here is the AI's edge over simply holding $CHOG. */
export function PnlBadge({ pct, size = "sm", className = "" }: PnlBadgeProps) {
  const known = typeof pct === "number" && Number.isFinite(pct);
  // Snap values that round to 0.00% so they never render as "-0.00%" in red.
  const value = known && Math.abs(pct) >= 0.005 ? pct : known ? 0 : null;
  const sign = value === null ? 0 : Math.sign(value);
  const tone =
    sign > 0
      ? "bg-success/10 text-success ring-success/30"
      : sign < 0
        ? "bg-danger/10 text-danger ring-danger/30"
        : "bg-surface-2 text-muted ring-line";

  return (
    <span
      title="AI edge vs. simply holding $CHOG"
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full font-mono tabular-nums ring-1 ring-inset ${tone} ${SIZES[size]} ${className}`}
    >
      {sign !== 0 && (
        <span aria-hidden className="text-[0.65em]">
          {sign > 0 ? "▲" : "▼"}
        </span>
      )}
      {formatPct(value)}
    </span>
  );
}
