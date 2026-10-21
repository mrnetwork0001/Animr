"use client";

import { type CSSProperties, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Badge, type BadgeTone, pillClass } from "@/components/v2/primitives";
import type { ReplayTrade } from "@/lib/dna/types";
import { formatAmount } from "@/lib/format";
import { useChogName, useReplay } from "./api";
import { PauseIcon, PlayIcon, RestartIcon } from "./icons";
import {
  Chart,
  SERIES_COLOR,
  SERIES_INK,
  type Series,
  SpeechBubble,
  edgeOf,
  lastAtOrBefore,
  sampleAt,
  useGeometry,
} from "./replay-chart";
import { DEFAULT_WINDOW, type WindowKey, formatDay, formatHour, formatPrice, signedPct } from "./shared";
import { WindowPicker } from "./window-picker";
import "./dna.css";

/** One full replay at 1x; 2x and 4x divide it. */
const DURATION_MS = 14_000;
const SPEEDS = [1, 2, 4] as const;
type Speed = (typeof SPEEDS)[number];

/** A Chog's display name for a token id: "Silver Whiskers" (or "CHOG #1312" until its DNA loads). */
type Labeler = (tokenId: number) => string;

type TimeMachineProps = {
  tokenId: number;
  /** Race a second Chog over the same candles ("Challenge"). */
  rivalId?: number;
  /** nameNumbers[id - 1]: the number in token id's name ("CHOG #1462" is token 1), the fallback label. */
  nameNumbers?: readonly number[];
  /** Start playing once the chart is on screen; never with reduced motion. */
  autoPlay?: boolean;
  /** The replay window, when the page owns it (the replay page's header and stats follow it); else internal. */
  span?: WindowKey;
  onSpanChange?: (span: WindowKey) => void;
  className?: string;
};

/**
 * The Time Machine: replays a Chog's genome over real hourly CHOG/WMON candles as an animated chart —
 * its $CHOG stack against just holding, the price with its buys and sells, speech bubbles at key
 * moments, a running counter and a verdict under the chart at the end. With `rivalId`, two Chogs race.
 */
export function TimeMachine({
  tokenId,
  rivalId,
  nameNumbers,
  autoPlay = true,
  span: spanProp,
  onSpanChange,
  className = "",
}: TimeMachineProps) {
  const mainName = useChogName(tokenId, nameNumbers);
  const rivalName = useChogName(rivalId, nameNumbers);
  const labelOf: Labeler = (id) => (id === rivalId ? rivalName : mainName);
  const [ownSpan, setOwnSpan] = useState<WindowKey>(DEFAULT_WINDOW);
  const span = spanProp ?? ownSpan;
  const setSpan = (next: WindowKey) => {
    setOwnSpan(next);
    onSpanChange?.(next);
  };
  const main = useReplay(tokenId, span);
  const rival = useReplay(rivalId, span);
  const headingId = useId();

  const series = useMemo<Series[] | null>(() => {
    if (!main.data) return null;
    if (rivalId === undefined) return [{ tokenId, result: main.data }];
    return rival.data ? [{ tokenId, result: main.data }, { tokenId: rivalId, result: rival.data }] : null;
  }, [tokenId, rivalId, main.data, rival.data]);
  const error = main.error ?? (rivalId !== undefined ? rival.error : null);

  return (
    <section aria-labelledby={headingId} className={`v2-card v2-card--feature v2-card--flush ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-5 sm:px-7 sm:pt-6">
        <div className="min-w-0">
          <h2 id={headingId} className="v2-h3">
            {rivalId === undefined ? (
              "vs just holding $CHOG"
            ) : (
              <>
                <span style={{ color: SERIES_INK[0] }}>{labelOf(tokenId)}</span> <span className="text-[var(--v2-nav)]">vs</span>{" "}
                <span style={{ color: SERIES_INK[1] }}>{labelOf(rivalId)}</span>
              </>
            )}
          </h2>
        </div>
        <WindowPicker value={span} onChange={setSpan} />
      </div>

      <div className="px-2 pt-4 sm:px-5">
        {series ? (
          <Player
            key={`${span}:${series.map((s) => s.tokenId).join("-")}`}
            series={series}
            autoPlay={autoPlay}
            labelOf={labelOf}
            span={span}
          />
        ) : error ? (
          <div role="alert" className="flex h-[300px] flex-col items-center justify-center px-6 text-center sm:h-[440px]">
            <p className="font-[480] text-[var(--v2-danger)]">Couldn&apos;t load this replay</p>
            <p className="v2-mono mt-1 max-w-md break-words text-xs text-[var(--v2-nav)]">{error.message}</p>
            <button
              type="button"
              onClick={() => {
                void main.refetch();
                if (rivalId !== undefined) void rival.refetch();
              }}
              className={`${pillClass("glass", "sm")} mt-4`}
            >
              Try again
            </button>
          </div>
        ) : (
          <ChartSkeleton />
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Player: playback state, the counter, the chart (replay-chart.tsx) and its controls.

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

function Player({
  series,
  autoPlay,
  labelOf,
  span,
}: {
  series: Series[];
  autoPlay: boolean;
  labelOf: Labeler;
  span: WindowKey;
}) {
  const reducedMotion = useReducedMotion();
  const [progress, setProgress] = useState(() => (autoPlay && !reducedMotion ? 0 : 1));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [width, setWidth] = useState(0);
  const progressRef = useRef(progress);
  const chartRef = useRef<HTMLDivElement>(null);

  // The animation clock: advances progress on every frame while playing.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last: number | undefined;
    const tick = (now: number) => {
      // Clamp the step so a background tab doesn't jump to the end when it wakes up.
      const dt = last === undefined ? 0 : Math.min(now - last, 80);
      last = now;
      const next = Math.min(1, progressRef.current + (dt * speed) / DURATION_MS);
      progressRef.current = next;
      setProgress(next);
      if (next >= 1) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed]);

  // Autoplay once, as soon as the chart's top is on screen: on a phone the card starts low, and waiting for most of it
  // left the timeline at day 1 over an empty chart.
  useEffect(() => {
    const el = chartRef.current;
    if (!autoPlay || reducedMotion || !el || progressRef.current > 0) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        setPlaying(true);
      },
      // Any of it, 40px above the fold: the chart's top entering the screen starts it.
      { threshold: 0, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [autoPlay, reducedMotion]);

  // The chart is drawn in real pixels so text, markers and strokes stay crisp at any width.
  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const seek = (value: number) => {
    progressRef.current = value;
    setProgress(value);
  };
  const play = () => {
    if (progressRef.current >= 1) seek(0);
    setPlaying(true);
  };
  const restart = () => {
    seek(0);
    setPlaying(true);
  };

  const height = width < 640 ? 270 : 400;
  const g = useGeometry(series, width, height);
  const primary = series[0];
  const points = primary.result.points;
  const { t0, t1 } = g;
  const now = t0 + (t1 - t0) * progress;
  const finished = progress >= 1;
  const totalDays = Math.max(1, Math.round((t1 - t0) / 86_400));
  const day = Math.min(totalDays, Math.floor((now - t0) / 86_400) + 1);

  const live = series.map((s) => {
    const value = sampleAt(s.result.points, now, "value");
    return { ...s, value, edge: edgeOf(s, value), trades: lastAtOrBefore(s.result.trades, now) + 1 };
  });

  const summary =
    series.length === 1
      ? `The $CHOG stack of ${labelOf(primary.tokenId)} against just holding, ${formatDay(t0)} to ${formatDay(t1)}: it ends ${signedPct(primary.result.edgePct)} versus holding after ${primary.result.trades.length} trades.`
      : `${labelOf(series[0].tokenId)} (${signedPct(series[0].result.edgePct)}) racing ${labelOf(series[1].tokenId)} (${signedPct(series[1].result.edgePct)}) against just holding, ${formatDay(t0)} to ${formatDay(t1)}.`;

  const solo = series.length === 1;

  return (
    <div>
      {/* Running counter; the chart's text alternative is its aria-label, the verdict and the lists below. */}
      <div aria-hidden className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-2 pb-3">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          {live.map((s, i) => (
            <p key={s.tokenId} className="flex items-baseline gap-2.5">
              <span
                className="v2-num text-[length:var(--v2-fs-stat)] leading-none"
                style={{ color: solo ? edgeColor(s.edge) : SERIES_INK[i] }}
              >
                {signedPct(s.edge)}
              </span>
              <span className="text-[13px] text-[var(--v2-nav)]">
                {solo ? (
                  <>
                    vs holding · <span className="v2-num text-[var(--v2-ink)]">{formatAmount(s.value, 0)}</span> $CHOG (from{" "}
                    {formatAmount(s.result.startChog, 0)})
                  </>
                ) : (
                  labelOf(s.tokenId)
                )}{" "}
                · {s.trades} {s.trades === 1 ? "trade" : "trades"}
              </span>
            </p>
          ))}
        </div>
        <p className="v2-overline v2-num">
          Day {day}/{totalDays} · {formatDay(now)}
        </p>
      </div>

      <div ref={chartRef} className="relative h-[270px] sm:h-[400px]">
        {width > 0 && points.length > 1 ? (
          <Chart series={series} g={g} width={width} height={height} progress={progress} now={now} summary={summary} />
        ) : (
          <ChartSkeleton bare />
        )}
        {width > 0 && points.length > 1 && !finished && <SpeechBubble series={primary} g={g} width={width} now={now} />}
      </div>

      <p aria-live="polite" className="sr-only">
        {finished ? verdictLine(series, labelOf) : ""}
      </p>

      <Controls
        playing={playing}
        finished={finished}
        speed={speed}
        progress={progress}
        now={now}
        onPlay={play}
        onPause={() => setPlaying(false)}
        onRestart={restart}
        onSpeed={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])}
        onSeek={(value) => {
          setPlaying(false);
          seek(value);
        }}
      />

      <Legend ids={series.map((s) => s.tokenId)} labelOf={labelOf} />

      {/* The verdict sits under the chart, never over it: the finished chart stays readable. */}
      {finished && !playing && <Verdict series={series} labelOf={labelOf} span={span} onReplay={restart} />}
    </div>
  );
}

function verdictLine(series: Series[], labelOf: Labeler): string {
  if (series.length > 1) {
    const [a, b] = series;
    const diff = a.result.edgePct - b.result.edgePct;
    if (Math.abs(diff) < 0.05) return `Dead heat: both Chogs end ${signedPct(a.result.edgePct)} vs holding.`;
    const [winner, loser] = diff > 0 ? [a, b] : [b, a];
    return `${labelOf(winner.tokenId)} beats ${labelOf(loser.tokenId)}: ${signedPct(winner.result.edgePct)} vs ${signedPct(loser.result.edgePct)} against holding.`;
  }
  const r = series[0].result;
  return r.verdict || `${signedPct(r.edgePct)} vs holding`;
}

function Verdict({
  series,
  labelOf,
  span,
  onReplay,
}: {
  series: Series[];
  labelOf: Labeler;
  span: WindowKey;
  onReplay: () => void;
}) {
  const [shared, setShared] = useState<"idle" | "copied" | "failed">("idle");
  const solo = series.length === 1;
  const r = series[0].result;
  const line = verdictLine(series, labelOf);
  const tone = !solo ? "duel" : r.edgePct > 0.05 ? "win" : r.edgePct <= -25 ? "rekt" : "loss";
  const label = { win: "Beat holding", loss: "Trailed holding", rekt: "Rekt", duel: "Race over" }[tone];
  // The engine's verdict often names the outcome already ("REKT -59%"); don't stamp it twice.
  const stamp = line.toLowerCase().includes(label.toLowerCase()) ? "Verdict" : label;
  const stampTone: BadgeTone = { win: "success", loss: "danger", rekt: "danger", duel: "violet" }[tone] as BadgeTone;

  const share = async () => {
    // The link opens on the window being shown (?window=30d; the default one needs no parameter).
    const link = new URL(window.location.href);
    if (span === DEFAULT_WINDOW) link.searchParams.delete("window");
    else link.searchParams.set("window", span);
    const url = link.toString();
    const text = solo
      ? `${labelOf(series[0].tokenId)}: its trading DNA, simulated on real $CHOG candles (1% fee + impact): ${line}`
      : `${line} (simulated on real $CHOG candles, 1% fee + impact)`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Animr Time Machine", text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShared("copied");
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      setShared("failed");
    }
    setTimeout(() => setShared("idle"), 2500);
  };

  return (
    <div
      role="group"
      aria-label="Replay verdict"
      className="dna-rise mx-2 mb-5 flex flex-col gap-4 rounded-[var(--v2-r-lg)] border border-[var(--v2-line-soft)] bg-[rgb(255_255_255/0.02)] p-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5"
    >
      <div className="min-w-0">
        <Badge tone={stampTone}>{stamp}</Badge>
        <p className="mt-2.5 font-[family-name:var(--v2-font-display)] text-[20px] leading-[1.2] font-[380] tracking-[-0.012em] text-balance sm:text-[24px]">
          {line}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button type="button" onClick={onReplay} className={pillClass("glass", "sm")}>
          <RestartIcon className="size-4" /> Replay
        </button>
        <button type="button" onClick={share} className={pillClass("glass", "sm")}>
          {shared === "copied" ? "Link copied" : shared === "failed" ? "Couldn't share" : "Share"}
        </button>
      </div>
    </div>
  );
}

/** A signed edge's colour: green above holding, red below, grey at ~0 (signed changes only). */
function edgeColor(pct: number): string {
  if (!Number.isFinite(pct) || Math.abs(pct) < 0.05) return "var(--v2-nav)";
  return pct > 0 ? "var(--v2-success)" : "var(--v2-danger)";
}

// ---------------------------------------------------------------------------------------------
// Controls, legend and the text version of the replay

function Controls({
  playing,
  finished,
  speed,
  progress,
  now,
  onPlay,
  onPause,
  onRestart,
  onSpeed,
  onSeek,
}: {
  playing: boolean;
  finished: boolean;
  speed: Speed;
  progress: number;
  now: number;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  onSpeed: () => void;
  onSeek: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2 pt-4 sm:gap-3">
      <button
        type="button"
        onClick={playing ? onPause : onPlay}
        className={`${pillClass("glass")} h-11 w-[6.25rem] shrink-0 gap-2 px-0`}
        aria-label={playing ? "Pause the replay" : finished ? "Play the replay again" : "Play the replay"}
      >
        {playing ? <PauseIcon className="size-4 text-[var(--v2-teal)]" /> : <PlayIcon className="size-4 text-[var(--v2-teal)]" />}
        {playing ? "Pause" : finished ? "Again" : "Play"}
      </button>
      <input
        type="range"
        min={0}
        max={1000}
        step={1}
        value={Math.round(progress * 1000)}
        onChange={(e) => onSeek(Number(e.target.value) / 1000)}
        aria-label="Replay timeline"
        aria-valuetext={formatHour(now)}
        className="dna-range min-w-0 flex-1"
        style={{ "--dna-progress": `${(progress * 100).toFixed(2)}%` } as CSSProperties}
      />
      <button
        type="button"
        onClick={onSpeed}
        aria-label={`Playback speed ${speed}×`}
        title="Change the playback speed"
        className={`${pillClass("ghost", "sm")} v2-num w-12 shrink-0 px-0 text-[15px]`}
      >
        {speed}×
      </button>
      <button
        type="button"
        onClick={onRestart}
        aria-label="Restart the replay"
        className={`${pillClass("ghost", "sm")} hidden w-10 shrink-0 px-0 sm:inline-flex`}
      >
        <RestartIcon className="size-[18px]" />
      </button>
    </div>
  );
}

function Legend({ ids, labelOf }: { ids: number[]; labelOf: Labeler }) {
  const solo = ids.length === 1;
  return (
    <ul aria-hidden className="v2-legend px-3 pt-4 pb-5 sm:pb-6">
      {ids.map((id, i) => (
        <li key={id}>
          <span className="v2-legend-swatch" style={{ "--v2-swatch": SERIES_COLOR[i] } as CSSProperties} />
          {solo ? "Chog's $CHOG stack" : labelOf(id)}
        </li>
      ))}
      <li>
        <span
          className="dna-swatch-dash"
          style={{ "--v2-swatch": solo ? "var(--v2-chart-2)" : "var(--v2-chart-3)" } as CSSProperties}
        />
        Just holding
      </li>
      <li>
        <span className="v2-legend-swatch" style={{ "--v2-swatch": "rgb(211 211 215 / 0.5)", boxShadow: "none" } as CSSProperties} />
        $CHOG price
      </li>
      <li>
        <span className="dna-swatch-dot" style={{ "--v2-swatch": "var(--v2-chart-up)" } as CSSProperties} /> buy
        <span className="dna-swatch-dot ml-1" style={{ "--v2-swatch": "var(--v2-chart-down)" } as CSSProperties} /> sell
        {!solo && ` (${labelOf(ids[0])})`}
      </li>
    </ul>
  );
}

/** Every simulated trade: when (faint), side (a teal Buy / violet Sell badge), price and amounts in DM Sans, why. */
export function TradeLog({ trades }: { trades: readonly ReplayTrade[] }) {
  return (
    <table className="v2-table">
      <caption className="v2-sr">Simulated trades, oldest first</caption>
      <thead>
        <tr>
          <th scope="col">When (UTC)</th>
          <th scope="col">Side</th>
          <th scope="col" className="is-num">
            Price
          </th>
          <th scope="col" className="is-num v2-hide-sm">
            In
          </th>
          <th scope="col" className="is-num v2-hide-sm">
            Out
          </th>
          <th scope="col" className="max-lg:hidden">
            Why
          </th>
        </tr>
      </thead>
      <tbody>
        {trades.map((trade, i) => {
          const buy = trade.side === "buy";
          // A buy spends WMON for $CHOG; a sell spends $CHOG for WMON.
          const [inUnit, outUnit] = buy ? ["WMON", "$CHOG"] : ["$CHOG", "WMON"];
          return (
            <tr key={i}>
              <td className="v2-num text-[13px] text-[var(--v2-faint)]">{formatHour(trade.t).replace(" UTC", "")}</td>
              <td>
                <Badge tone={buy ? "teal" : "violet"}>{buy ? "Buy" : "Sell"}</Badge>
              </td>
              <td className="is-num">{formatPrice(trade.price)}</td>
              <td className="is-num v2-hide-sm text-[var(--v2-muted)]">
                {formatAmount(trade.amountIn, 2)} <span className="text-xs text-[var(--v2-faint)]">{inUnit}</span>
              </td>
              <td className="is-num v2-hide-sm text-[var(--v2-muted)]">
                {formatAmount(trade.amountOut, 2)} <span className="text-xs text-[var(--v2-faint)]">{outUnit}</span>
              </td>
              <td className="min-w-[16rem] text-[13px] leading-snug whitespace-normal text-[var(--v2-nav)] max-lg:hidden">
                {trade.reason}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ChartSkeleton({ bare = false }: { bare?: boolean }) {
  return (
    <div role="status" className={`overflow-hidden ${bare ? "absolute inset-0" : "relative h-[330px] sm:h-[480px]"}`}>
      <span className="v2-sr">Loading the replay…</span>
      <span aria-hidden className="v2-skeleton absolute inset-x-2 top-6 bottom-[38%]" />
      <span aria-hidden className="v2-skeleton absolute inset-x-2 bottom-8 h-[22%] opacity-60" />
    </div>
  );
}
