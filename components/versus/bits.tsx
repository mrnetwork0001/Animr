"use client";

import { useSyncExternalStore } from "react";
import { ChogThumb } from "@/components/dna/chog-thumb";
import type { TradingStyle } from "@/lib/agent/types";
import { STYLE_CHIP, type Side } from "./shared";
import "./versus.css";

// Small building blocks shared by every VERSUS view.

export const LABEL = "text-[11px] font-medium uppercase tracking-wider text-subtle";

/** Fighter A in the accent purple, B in amber: borders, fills and text. */
export const SIDE_TONE: Record<Side, { ring: string; text: string; fill: string; button: string; soft: string }> = {
  a: {
    ring: "ring-accent-strong/70",
    text: "text-accent-strong",
    fill: "bg-accent-strong",
    button: "border-accent-strong/60 bg-accent/10 hover:bg-accent/20 hover:border-accent-strong",
    soft: "border-accent-strong/40 bg-accent/10",
  },
  b: {
    ring: "ring-warning/70",
    text: "text-warning",
    fill: "bg-warning",
    button: "border-warning/60 bg-warning/10 hover:bg-warning/20 hover:border-warning",
    soft: "border-warning/40 bg-warning/10",
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
      className={`ring-2 ${SIDE_TONE[side].ring} ${className}`}
    />
  );
}

export function StyleTag({ style }: { style: TradingStyle }) {
  return (
    <span
      className={`rounded px-1.5 py-px text-[10px] font-medium uppercase tracking-wider ring-1 ring-inset ${STYLE_CHIP[style] ?? STYLE_CHIP.balanced}`}
    >
      {style}
    </span>
  );
}

/** A small die, for "Random" buttons. */
export function DiceIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden fill="none">
      <rect x="2.5" y="2.5" width="15" height="15" rx="4" stroke="currentColor" strokeWidth="1.6" />
      {[
        [7, 7],
        [13, 7],
        [10, 10],
        [7, 13],
        [13, 13],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.3" fill="currentColor" />
      ))}
    </svg>
  );
}

/** The round "VS" badge between two fighters. */
export function VsBadge({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`vs-slam inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line-strong bg-background text-sm font-black tracking-tight text-foreground shadow-[0_0_0_4px_rgb(131_110_249/0.12),0_10px_30px_-10px_rgb(131_110_249/0.8)] sm:size-14 sm:text-base ${className}`}
    >
      VS
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`block animate-pulse rounded-lg bg-surface-2 ${className}`} />;
}
