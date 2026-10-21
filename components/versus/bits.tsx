"use client";

import { useSyncExternalStore } from "react";
import { ChogThumb } from "@/components/dna/chog-thumb";
import type { TradingStyle } from "@/lib/agent/types";
import { STYLE_CHIP, type Side } from "./shared";
import "@/app/design-v2.css";
import "./versus.css";

// Small building blocks shared by every Versus view (v2 design system: A teal, B violet).

/**
 * Fighter A in teal, B in violet. Each value is a class string: the side class (`vs-side-a` sets the
 * colour variables) plus the helper that reads them (versus.css).
 */
export const SIDE_TONE: Record<Side, { side: string; ring: string; text: string; fill: string; button: string; tag: string }> = {
  a: {
    side: "vs-side-a",
    ring: "vs-side-a vs-ring",
    text: "vs-side-a vs-text",
    fill: "vs-side-a vs-fill",
    button: "vs-side-a vs-pick",
    tag: "vs-side-a vs-tag",
  },
  b: {
    side: "vs-side-b",
    ring: "vs-side-b vs-ring",
    text: "vs-side-b vs-text",
    fill: "vs-side-b vs-fill",
    button: "vs-side-b vs-pick",
    tag: "vs-side-b vs-tag",
  },
};

function subscribeReducedMotion(notify: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

/** True when the system asks for reduced motion; false on the server. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/** A fighter's original art (resized copy, then the original, then a "#id" placeholder), ringed in its color. */
export function Portrait({
  side,
  image,
  tokenId,
  size,
  box,
  eager = false,
  alt = "",
  large = false,
  className = "",
}: {
  side: Side;
  image?: string;
  tokenId: number;
  /** Image size in CSS px (fetched at 2x). */
  size: number;
  /** Responsive size classes, e.g. "size-24 sm:size-36". */
  box?: string;
  eager?: boolean;
  alt?: string;
  /** The big corner portrait: rounder corners. */
  large?: boolean;
  className?: string;
}) {
  return (
    <ChogThumb
      image={image || undefined}
      tokenId={tokenId}
      size={size}
      box={box}
      eager={eager}
      alt={alt}
      className={`${SIDE_TONE[side].ring} ${large ? "vs-ring--lg" : ""} ${className}`}
    />
  );
}

export function StyleTag({ style }: { style: TradingStyle }) {
  return <span className={`v2-badge capitalize ${STYLE_CHIP[style] ?? STYLE_CHIP.balanced}`}>{style}</span>;
}

/** A small die, for "Random" buttons. */
export function DiceIcon({ className = "v2-btn-icon" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden fill="none">
      <rect x="2.5" y="2.5" width="15" height="15" rx="4" stroke="currentColor" strokeWidth="1.5" />
      {[
        [7, 7],
        [13, 7],
        [10, 10],
        [7, 13],
        [13, 13],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.25" fill="currentColor" />
      ))}
    </svg>
  );
}

/** The "VS" on the centre hairline between two fighters: DM Sans 380, faint. */
export function VsBadge({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`vs-axis ${className}`}>
      <span className="vs-vs vs-slam">VS</span>
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`v2-skeleton block ${className}`} />;
}
