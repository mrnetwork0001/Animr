"use client";

import { type CSSProperties, type ReactNode, useCallback, useState, useSyncExternalStore } from "react";
import { useNow } from "@/components/decision-feed";
import { chogThumbUrl } from "@/components/dna/thumb-url";
import type { BellCall, BellSummary } from "@/lib/bell/types";
import { resolveUri } from "@/lib/nft";
import { useSampleMode } from "./api";
import { errorOf, formatCountdown, formatErrorPts, formatPoints, hitOf, signedPct, spokenDuration } from "./format";
import "@/app/design-v2.css";
import "./bell.css";

// Small building blocks shared by every Daily Bell view.

/** Tracked caps for small labels (the v2 overline). */
export const LABEL = "v2-overline";

/**
 * A Chog's face over a "#id" placeholder: a small resized copy (the originals are 1000×1000, ~300 KB),
 * then the original, then the placeholder when the gateway fails.
 */
export function ChogAvatar({
  src,
  tokenId,
  className = "size-11 rounded-xl",
}: {
  src?: string;
  tokenId: number;
  className?: string;
}) {
  const sources = src ? [chogThumbUrl(src, 112), resolveUri(src)] : [];
  const [failed, setFailed] = useState<string[]>([]);
  const current = sources.find((source) => !failed.includes(source));

  return (
    <span
      className={`relative block shrink-0 overflow-hidden border border-[var(--v2-line)] bg-[radial-gradient(circle_at_30%_20%,rgb(159_240_236/0.16),transparent_60%),radial-gradient(circle_at_80%_90%,rgb(111_90_220/0.3),transparent_60%),var(--v2-bg-raised)] ${className}`}
    >
      <span aria-hidden className="absolute inset-0 flex items-center justify-center text-[10px] text-[var(--v2-nav)]">
        #{tokenId}
      </span>
      {current && (
        // eslint-disable-next-line @next/next/no-img-element -- Chog images live on IPFS gateways and the resizer
        <img
          key={current}
          src={current}
          alt=""
          width={56}
          height={56}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed((list) => [...list, current])}
          className="relative size-full object-cover"
        />
      )}
    </span>
  );
}

export function SourceBadge({ source }: { source: BellCall["source"] }) {
  return source === "llm" ? (
    <span className="v2-badge v2-badge--teal" title="Called by this Chog's live AI agent: an LLM running on 0G Compute">
      0G Compute
    </span>
  ) : (
    <span className="v2-badge" title="Called by this Chog's trait DNA: its 13 traits compiled into a trading genome">
      Trait DNA
    </span>
  );
}

export function ClaimedBadge() {
  return (
    <span className="v2-badge v2-badge--success" title="An owner claimed this Chog and woke its AI agent">
      Claimed
    </span>
  );
}

export function KindBadge({ kind }: { kind: BellSummary["kind"] }) {
  return kind === "live" ? (
    <span className="v2-badge v2-badge--success v2-badge--dot" title="Rung on schedule at 15:00 UTC">
      Live
    </span>
  ) : (
    <span className="v2-badge v2-badge--violet" title="Reconstructed from real past CHOG/WMON hourly candles">
      Replay
    </span>
  );
}

const FORECAST_SIZE = {
  sm: "text-[14px]",
  md: "text-[16px]",
  lg: "text-[22px]",
  xl: "bell-move--xl text-[clamp(40px,3vw+24px,64px)]",
} as const;

/** A % move: green and ▲ when up, red and ▼ when down. */
export function Forecast({
  pct,
  size = "md",
  className = "",
}: {
  pct: number | null | undefined;
  size?: keyof typeof FORECAST_SIZE;
  className?: string;
}) {
  const text = signedPct(pct);
  const sign = typeof pct !== "number" || text === "0.0%" ? 0 : Math.sign(pct);
  const tone = sign > 0 ? "v2-up" : sign < 0 ? "v2-down" : "v2-muted";
  return (
    <span className={`bell-move ${tone} ${FORECAST_SIZE[size]} ${className}`}>
      {sign !== 0 && (
        <span aria-hidden className="text-[0.55em]">
          {sign > 0 ? "▲" : "▼"}
        </span>
      )}
      {text}
    </span>
  );
}

export function Conviction({ value }: { value: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <span className="inline-flex items-center gap-2 text-xs text-[var(--v2-nav)]" title="Conviction: how sure the Chog is">
      <span aria-hidden className="v2-meter w-14">
        <span style={{ "--v2-value": `${pct}%` } as CSSProperties} />
      </span>
      <span className="v2-num">{pct}% sure</span>
    </span>
  );
}

export function Stamp({ hit, className = "" }: { hit: boolean; className?: string }) {
  return (
    <span
      className={`bell-stamp bell-stamp-mark ${hit ? "v2-up" : "v2-down"} ${className}`}
    >
      {hit ? "Hit" : "Miss"}
    </span>
  );
}

/** A settled call: hit or miss, its error and the points it earned. */
export function CallResult({ call, actualPct, className = "" }: { call: BellCall; actualPct: number | null; className?: string }) {
  const error = errorOf(call, actualPct);
  const hit = hitOf(call, actualPct);
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--v2-nav)] ${className}`}>
      {hit !== null && <Stamp hit={hit} />}
      {error !== null && (
        <span>
          off by <span className="v2-num text-[var(--v2-ink)]">{formatErrorPts(error)}</span>
        </span>
      )}
      {typeof call.points === "number" && (
        <span className="v2-num text-[13px] text-[var(--v2-kicker)]">+{formatPoints(call.points)} pts</span>
      )}
    </div>
  );
}

/**
 * Whether the browser clock is still before `deadline` (ms). Unlike useNow() it re-renders only once,
 * at the deadline, so long lists of Ride buttons don't tick every second. null until mounted.
 */
export function useBefore(deadline: number): boolean | null {
  const subscribe = useCallback(
    (notify: () => void) => {
      const wait = deadline - Date.now();
      if (!(wait > 0)) return () => {};
      const timer = setTimeout(notify, Math.min(wait + 50, 2_000_000_000));
      return () => clearTimeout(timer);
    },
    [deadline],
  );
  return useSyncExternalStore(
    subscribe,
    () => Date.now() < deadline,
    () => null,
  );
}

/** Time left until `to` (ms), ticking each second; "--:--:--" until the browser clock is known. */
export function Countdown({ to, className = "" }: { to: number | null; className?: string }) {
  const now = useNow();
  const left = now === null || to === null || !Number.isFinite(to) ? null : Math.max(0, to - now);
  return (
    <span
      role="timer"
      aria-label={left === null ? undefined : spokenDuration(left)}
      className={`v2-num ${className}`}
    >
      {left === null ? "--:--:--" : formatCountdown(left)}
    </span>
  );
}

export function SampleBanner() {
  const sample = useSampleMode();
  if (!sample) return null;
  return (
    <div role="note" className="v2-toast v2-toast--warning">
      <div>
        <span className="v2-toast-title">Sample data, dev only</span>
        The Bell API isn&apos;t answering on this server yet, so these calls, results and points are made up.
      </div>
      <span />
    </div>
  );
}

export function PointsNote({ className = "" }: { className?: string }) {
  return (
    <p className={`v2-note ${className}`}>
      Points only: bragging rights, no cash value. Nothing to pay in, nothing to cash out.
    </p>
  );
}

export function LoadError({
  title,
  error,
  onRetry,
  retrying,
}: {
  title: string;
  error: Error | null;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div role="alert" className="v2-empty">
      <p className="v2-empty-title">{title}</p>
      {error && <p className="v2-empty-body v2-mono break-words">{error.message}</p>}
      <button type="button" onClick={onRetry} disabled={retrying} className="v2-btn-glass v2-btn--sm">
        {retrying ? "Retrying…" : "Try again"}
      </button>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`v2-skeleton block ${className}`} />;
}

/**
 * A section's heading row on the v2 pattern: teal kicker, DM Sans h2 (or the smaller h3 look for side columns,
 * still an h2 element), a faint hint and a right-hand action.
 */
export function SectionTitle({
  title,
  hint,
  action,
  icon,
  kicker,
  compact = false,
  id,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  kicker?: ReactNode;
  compact?: boolean;
  id?: string;
}) {
  return (
    <div className={`v2-section-title ${compact ? "mb-4" : ""}`}>
      <div className="v2-section-title-copy">
        {kicker != null && <p className="v2-kicker">{kicker}</p>}
        <h2 id={id} className={`flex items-center gap-2.5 ${compact ? "v2-h3" : "v2-h2"}`}>
          {icon}
          {title}
        </h2>
        {hint && <p className={compact ? "text-[13px]" : undefined}>{hint}</p>}
      </div>
      {action}
    </div>
  );
}
