"use client";

import { type ReactNode, useCallback, useState, useSyncExternalStore } from "react";
import { useNow } from "@/components/decision-feed";
import { chogThumbUrl } from "@/components/dna/thumb-url";
import type { BellCall, BellSummary } from "@/lib/bell/types";
import { resolveUri } from "@/lib/nft";
import { useSampleMode } from "./api";
import { errorOf, formatCountdown, formatErrorPts, formatPoints, hitOf, signedPct, spokenDuration } from "./format";
import "./bell.css";

// Small building blocks shared by every Daily Bell view.

export const LABEL = "text-[11px] font-medium uppercase tracking-wider text-subtle";

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
    <span className={`relative block shrink-0 overflow-hidden bg-linear-to-br from-accent/45 to-accent/10 ${className}`}>
      <span aria-hidden className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-white/80">
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

const CHIP = "chip py-0 text-[11px]";

export function SourceBadge({ source }: { source: BellCall["source"] }) {
  return source === "llm" ? (
    <span
      className={`${CHIP} border-accent/40 bg-accent/10 text-accent-strong`}
      title="Called by this Chog's live AI agent: an LLM running on 0G Compute"
    >
      0G Compute
    </span>
  ) : (
    <span className={CHIP} title="Called by this Chog's trait DNA: its 13 traits compiled into a trading genome">
      Trait DNA
    </span>
  );
}

export function ClaimedBadge() {
  return (
    <span className={`${CHIP} border-success/35 text-success`} title="An owner claimed this Chog and woke its AI agent">
      Claimed
    </span>
  );
}

export function KindBadge({ kind }: { kind: BellSummary["kind"] }) {
  return kind === "live" ? (
    <span className={`${CHIP} border-success/40 text-success`} title="Rung on schedule at 15:00 UTC">
      Live
    </span>
  ) : (
    <span className={`${CHIP} border-warning/40 text-warning`} title="Reconstructed from real past CHOG/WMON hourly candles">
      Replay
    </span>
  );
}

const FORECAST_SIZE = { sm: "text-sm", md: "text-base", lg: "text-xl", xl: "text-4xl sm:text-5xl" } as const;

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
  const tone = sign > 0 ? "text-success" : sign < 0 ? "text-danger" : "text-muted";
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono font-semibold tabular-nums whitespace-nowrap ${tone} ${FORECAST_SIZE[size]} ${className}`}
    >
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
    <span className="inline-flex items-center gap-2 text-xs text-muted" title="Conviction: how sure the Chog is">
      <span aria-hidden className="h-1.5 w-12 overflow-hidden rounded-full bg-line">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </span>
      <span className="font-mono tabular-nums">{pct}% sure</span>
    </span>
  );
}

export function Stamp({ hit, className = "" }: { hit: boolean; className?: string }) {
  return (
    <span
      className={`bell-stamp inline-block rounded-md border-2 px-1.5 font-mono text-[11px] leading-5 font-bold tracking-widest uppercase ${
        hit ? "border-success text-success" : "border-danger text-danger"
      } ${className}`}
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
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted ${className}`}>
      {hit !== null && <Stamp hit={hit} />}
      {error !== null && (
        <span>
          off by <span className="font-mono text-foreground">{formatErrorPts(error)}</span>
        </span>
      )}
      {typeof call.points === "number" && (
        <span className="font-mono font-semibold text-accent-strong">+{formatPoints(call.points)} pts</span>
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
      className={`font-mono tabular-nums ${className}`}
    >
      {left === null ? "--:--:--" : formatCountdown(left)}
    </span>
  );
}

export function SampleBanner() {
  const sample = useSampleMode();
  if (!sample) return null;
  return (
    <p role="note" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-warning">
      <strong className="font-semibold">Sample data, dev only.</strong> The Bell API isn&apos;t answering on this server
      yet, so these calls, results and points are made up.
    </p>
  );
}

export function PointsNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-subtle ${className}`}>
      Points only: bragging rights, never money. Nothing to pay in, nothing to cash out.
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
    <div role="alert" className="card border-danger/40 px-5 py-6 text-center">
      <p className="font-medium text-danger">{title}</p>
      {error && <p className="mt-1 font-mono text-xs break-words text-muted">{error.message}</p>}
      <button type="button" onClick={onRetry} disabled={retrying} className="btn btn-secondary mt-4">
        {retrying ? "Retrying…" : "Try again"}
      </button>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`block animate-pulse rounded-xl bg-surface-2 ${className}`} />;
}

export function SectionTitle({
  title,
  hint,
  action,
  icon,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          {icon}
          {title}
        </h2>
        {hint && <p className="mt-0.5 text-xs text-subtle">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
