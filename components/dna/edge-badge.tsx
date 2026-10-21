import { signedPct } from "./shared";
import "./dna.css";

/**
 * A genome's simulated edge over simply holding $CHOG, in DM Sans: green above, red below, grey at ~0
 * (a signed change, so the status colours; cf. components/pnl-badge.tsx).
 */
export function EdgeBadge({ pct, className = "" }: { pct: number; className?: string }) {
  const value = Number.isFinite(pct) && Math.abs(pct) >= 0.005 ? pct : 0;
  const tone = value > 0 ? "up" : value < 0 ? "down" : "flat";
  return (
    <span title="vs just holding $CHOG (simulated)" data-tone={tone} className={`dna-edge ${className}`}>
      {value !== 0 && (
        <span aria-hidden className="dna-edge-arrow">
          {value > 0 ? "▲" : "▼"}
        </span>
      )}
      {signedPct(value, 1)}
    </span>
  );
}
