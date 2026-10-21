import { formatPct } from "@/lib/format";
import "@/app/design-v2.css";

const SIZES = {
  sm: "h-6 px-2 text-[13px]",
  md: "h-7 px-2.5 text-[15px]",
  lg: "h-9 px-3.5 text-[19px]",
} as const;

type PnlBadgeProps = {
  /** Percent (12.5 means +12.5%); null when unknown. */
  pct: number | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
};

/**
 * The v2 signed-change capsule: DM Sans digits, green for a gain and red for a loss (never teal), neutral glass at
 * zero or unknown. PnL here is the AI's edge over simply holding $CHOG.
 */
export function PnlBadge({ pct, size = "sm", className = "" }: PnlBadgeProps) {
  const known = typeof pct === "number" && Number.isFinite(pct);
  // Snap values that round to 0.00% so they never render as "-0.00%" in red.
  const value = known && Math.abs(pct) >= 0.005 ? pct : known ? 0 : null;
  const sign = value === null ? 0 : Math.sign(value);
  const tone = sign > 0 ? "v2-badge--success" : sign < 0 ? "v2-badge--danger" : "";

  return (
    <span
      title="AI edge vs. simply holding $CHOG"
      className={`v2-badge ${tone} v2-num font-normal tracking-normal normal-case ${SIZES[size]} ${className}`}
    >
      {sign !== 0 && (
        <span aria-hidden className="text-[0.62em]">
          {sign > 0 ? "▲" : "▼"}
        </span>
      )}
      {formatPct(value)}
    </span>
  );
}
