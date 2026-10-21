"use client";

import { type CSSProperties, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Badge, type BadgeTone, pillClass } from "@/components/v2/primitives";
import { chogLabel } from "@/lib/chog-id";
import type { ReplayMoment, ReplayTrade } from "@/lib/dna/types";
import { formatAmount } from "@/lib/format";
import { useReplay } from "./api";
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
import { DEFAULT_WINDOW, SIM_LABEL, type WindowKey, formatDay, formatHour, formatPrice, signedPct } from "./shared";
import { WindowPicker } from "./window-picker";
import "./dna.css";

/** One full replay at 1x; 2x and 4x divide it. */
const DURATION_MS = 14_000;
const SPEEDS = [1, 2, 4] as const;
type Speed = (typeof SPEEDS)[number];

/** "CHOG #1463 · token 2" for a token id. */
type Labeler = (tokenId: number) => string;

type TimeMachineProps = {
  tokenId: number;
  /** Race a second Chog over the same candles ("Challenge"). */
  rivalId?: number;
  /** nameNumbers[id - 1]: the number in token id's name ("CHOG #1462" is token 1), so labels show both numbers. */
  nameNumbers?: readonly number[];
  /** Start playing once the chart is on screen; never with reduced motion. */
  autoPlay?: boolean;
  /** Shown on the verdict card of a solo replay, e.g. to pick a rival. */
  onChallenge?: () => void;
  /** The replay window, when the page owns it (the replay page's header and stats follow it); else internal. */
  span?: WindowKey;
  onSpanChange?: (span: WindowKey) => void;
  className?: string;
};

/**
 * The Time Machine: replays a Chog's genome over real hourly CHOG/WMON candles as an animated chart —
 * its $CHOG stack against just holding, the price with its buys and sells, speech bubbles at key
 * moments, a running counter and a verdict at the end. With `rivalId`, two Chogs race.
 */
export function TimeMachine({
  tokenId,
  rivalId,
  nameNumbers,
  autoPlay = true,
  onChallenge,
  span: spanProp,
  onSpanChange,
  className = "",
}: TimeMachineProps) {
  const labelOf: Labeler = (id) => chogLabel(id, { number: nameNumbers?.[id - 1] || null });
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
  const meta = main.data;

  return (
    <section aria-labelledby={headingId} className={`v2-card v2-card--feature v2-card--flush ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-5 sm:px-7 sm:pt-6">
        <div className="min-w-0">
          <p className="v2-kicker">Time Machine</p>
          <h2 id={headingId} className="v2-h3 mt-1.5">
            {rivalId === undefined ? (
              <>
                {labelOf(tokenId)} <span className="text-[var(--v2-nav)]">vs just holding $CHOG</span>
              </>
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
            onChallenge={rivalId === undefined ? onChallenge : undefined}
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

      <p className="v2-note border-t border-[var(--v2-line-soft)] px-4 py-3.5 sm:px-7">
        {SIM_LABEL}
        {meta && (
          <>
            {" "}
            · {meta.window.label} · genome <span className="v2-mono">{meta.genomeVersion}</span>
          </>
        )}
        . A rules replay of this Chog&apos;s DNA, not a promise: past candles don&apos;t predict the next ones.
      </p>
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
  onChallenge,
}: {
  series: Series[];
  autoPlay: boolean;
  labelOf: Labeler;
  onChallenge?: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [progress, setProgress] = useState(() => (autoPlay && !reducedMotion ? 0 : 1));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [verdictClosed, setVerdictClosed] = useState(false);
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
    setVerdictClosed(false);
    setPlaying(true);
  };
  const restart = () => {
    seek(0);
    setVerdictClosed(false);
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
                {solo ? "vs holding · simulated" : `token ${s.tokenId}`} · {s.trades} {s.trades === 1 ? "trade" : "trades"}
              </span>
            </p>
          ))}
        </div>
        <p className="v2-overline v2-num tracking-[0.12em]">
          Day {day}/{totalDays} · {formatDay(now)}
        </p>
      </div>

      <div className="relative">
        <div ref={chartRef} className="relative h-[270px] sm:h-[400px]">
          {width > 0 && points.length > 1 ? (
            <Chart series={series} g={g} width={width} height={height} progress={progress} now={now} summary={summary} />
          ) : (
            <ChartSkeleton bare />
          )}
          {width > 0 && points.length > 1 && !finished && <SpeechBubble series={primary} g={g} width={width} now={now} />}
        </div>

        {finished && !verdictClosed && !playing && (
          <VerdictCard
            series={live}
            labelOf={labelOf}
            onReplay={restart}
            onClose={() => setVerdictClosed(true)}
            onChallenge={onChallenge}
          />
        )}
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

function VerdictCard({
  series,
  labelOf,
  onReplay,
  onClose,
  onChallenge,
}: {
  series: (Series & { edge: number })[];
  labelOf: Labeler;
  onReplay: () => void;
  onClose: () => void;
  onChallenge?: () => void;
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
    const url = window.location.href;
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
    // Phones: a card under the chart, so the finished chart stays visible. From sm: over the chart.
    <div className="z-20 mt-3 sm:absolute sm:inset-0 sm:mt-0 sm:flex sm:items-center sm:justify-center sm:bg-[rgb(13_12_17/0.5)] sm:p-3 sm:backdrop-blur-[2px]">
      <div
        role="group"
        aria-label="Replay verdict"
        className="dna-rise v2-glass--strong relative w-full rounded-[var(--v2-r-lg)] p-5 sm:max-w-[30rem] sm:p-6"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the verdict"
          className="absolute top-3 right-3 grid size-8 place-items-center rounded-full text-lg leading-none text-[var(--v2-faint)] transition-colors hover:bg-white/5 hover:text-[var(--v2-ink)]"
        >
          ×
        </button>
        <Badge tone={stampTone} dot>
          {stamp}
        </Badge>
        <p className="mt-3 pr-6 font-[family-name:var(--v2-font-display)] text-[22px] leading-[1.18] font-[380] tracking-[-0.015em] text-balance sm:text-[28px]">
          {line}
        </p>

        {solo ? (
          <dl className="mt-5 grid grid-cols-4 gap-x-3 gap-y-2 border-t border-[var(--v2-line-soft)] pt-4">
            <Stat label="vs hold" value={signedPct(r.edgePct)} color={edgeColor(r.edgePct)} />
            <Stat label="Worst dip" value={signedPct(-Math.abs(r.maxDrawdownPct))} />
            <Stat label="Trades" value={String(r.trades.length)} />
            <Stat label="Fees" value={formatAmount(r.feesPaidChog, 0)} hint="$CHOG" />
          </dl>
        ) : (
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-[var(--v2-line-soft)] pt-4">
            {series.map((s, i) => (
              <Stat
                key={s.tokenId}
                label={labelOf(s.tokenId)}
                value={signedPct(s.result.edgePct)}
                color={SERIES_INK[i]}
                hint={`${s.result.trades.length} trades`}
              />
            ))}
          </dl>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={onReplay} className={pillClass("glass", "sm")}>
            <RestartIcon className="size-4" /> Replay
          </button>
          <button type="button" onClick={share} className={pillClass("glass", "sm")}>
            {shared === "copied" ? "Link copied" : shared === "failed" ? "Couldn't share" : "Share"}
          </button>
          {onChallenge && (
            <button type="button" onClick={onChallenge} className={pillClass("primary", "sm")}>
              Challenge a Chog
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-[var(--v2-nav)]">{label}</dt>
      <dd className="v2-num mt-1 text-[19px] leading-tight sm:text-[22px]" style={color ? { color } : undefined}>
        {value}
        {hint && <span className="block font-[family-name:var(--v2-font-text)] text-[11px] text-[var(--v2-faint)] sm:ml-1 sm:inline">{hint}</span>}
      </dd>
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

/** The key moments of a replay, oldest first, on a rail. */
export function KeyMoments({ moments }: { moments: readonly ReplayMoment[] }) {
  const sorted = [...moments].sort((a, b) => a.t - b.t);
  return (
    <ol className="dna-rail">
      {sorted.map((m, i) => (
        <li key={i}>
          <time dateTime={new Date(m.t * 1000).toISOString()} className="v2-num block text-xs text-[var(--v2-faint)]">
            {formatHour(m.t)}
          </time>
          <span className="mt-0.5 block text-[14px] leading-relaxed text-[var(--v2-muted)]">{m.text}</span>
        </li>
      ))}
    </ol>
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
                <Badge tone={buy ? "teal" : "violet"}>{trade.side}</Badge>
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
