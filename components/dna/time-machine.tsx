"use client";

import { Fragment, type ReactNode, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { chogLabel } from "@/lib/chog-id";
import type { ReplayTrade } from "@/lib/dna/types";
import { formatAmount } from "@/lib/format";
import { useReplay } from "./api";
import {
  Chart,
  SERIES_COLOR,
  type Series,
  SpeechBubble,
  edgeOf,
  lastAtOrBefore,
  sampleAt,
  useGeometry,
} from "./replay-chart";
import { DEFAULT_WINDOW, SIM_LABEL, type WindowKey, edgeTone, formatDay, formatHour, formatPrice, signedPct } from "./shared";
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
  className?: string;
};

/**
 * The Time Machine: replays a Chog's genome over real hourly CHOG/WMON candles as an animated chart —
 * its $CHOG stack against just holding, the price with its buys and sells, speech bubbles at key
 * moments, a running counter and a verdict at the end. With `rivalId`, two Chogs race.
 */
export function TimeMachine({ tokenId, rivalId, nameNumbers, autoPlay = true, onChallenge, className = "" }: TimeMachineProps) {
  const labelOf: Labeler = (id) => chogLabel(id, { number: nameNumbers?.[id - 1] || null });
  const [span, setSpan] = useState<WindowKey>(DEFAULT_WINDOW);
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
    <section aria-labelledby={headingId} className={`card overflow-hidden ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="min-w-0">
          <p className="eyebrow">Time Machine</p>
          <h2 id={headingId} className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">
            {rivalId === undefined ? (
              <>
                {labelOf(tokenId)} <span className="text-muted">vs just holding $CHOG</span>
              </>
            ) : (
              <>
                <span style={{ color: SERIES_COLOR[0] }}>{labelOf(tokenId)}</span> <span className="text-muted">vs</span>{" "}
                <span style={{ color: SERIES_COLOR[1] }}>{labelOf(rivalId)}</span>
              </>
            )}
          </h2>
        </div>
        <WindowPicker value={span} onChange={setSpan} />
      </div>

      <div className="px-2 pt-3 sm:px-4">
        {series ? (
          <Player
            key={`${span}:${series.map((s) => s.tokenId).join("-")}`}
            series={series}
            autoPlay={autoPlay}
            labelOf={labelOf}
            onChallenge={rivalId === undefined ? onChallenge : undefined}
          />
        ) : error ? (
          <div role="alert" className="flex h-[300px] flex-col items-center justify-center px-6 text-center sm:h-[384px]">
            <p className="font-medium text-danger">Couldn&apos;t load this replay</p>
            <p className="mt-1 max-w-md break-words font-mono text-xs text-muted">{error.message}</p>
            <button
              type="button"
              onClick={() => {
                void main.refetch();
                if (rivalId !== undefined) void rival.refetch();
              }}
              className="btn btn-secondary mt-4"
            >
              Try again
            </button>
          </div>
        ) : (
          <ChartSkeleton />
        )}
      </div>

      <p className="border-t border-line/70 px-4 py-3 text-[11px] leading-relaxed text-subtle sm:px-6">
        {SIM_LABEL}
        {meta && (
          <>
            {" "}
            · {meta.window.label} · genome <span className="font-mono">{meta.genomeVersion}</span>
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

  const height = width < 640 ? 260 : 340;
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
      <div aria-hidden className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-2 pb-2">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          {live.map((s, i) => (
            <p key={s.tokenId} className="flex items-baseline gap-2">
              <span
                className={`font-mono text-2xl font-semibold tabular-nums sm:text-3xl ${solo ? edgeTone(s.edge) : ""}`}
                style={solo ? undefined : { color: SERIES_COLOR[i] }}
              >
                {signedPct(s.edge)}
              </span>
              <span className="text-xs text-muted">
                {solo ? "vs holding · simulated" : `token ${s.tokenId}`} · {s.trades} {s.trades === 1 ? "trade" : "trades"}
              </span>
            </p>
          ))}
        </div>
        <p className="font-mono text-[11px] uppercase tracking-wider text-subtle tabular-nums">
          Day {day}/{totalDays} · {formatDay(now)}
        </p>
      </div>

      <div className="relative">
        <div ref={chartRef} className="relative h-[260px] sm:h-[340px]">
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
      <Details series={series} labelOf={labelOf} />
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
  const stampTone = {
    win: "bg-success/15 text-success ring-success/30",
    loss: "bg-danger/10 text-danger ring-danger/30",
    rekt: "bg-danger/20 text-danger ring-danger/50",
    duel: "bg-warning/15 text-warning ring-warning/30",
  }[tone];

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
    <div className="z-20 mt-3 sm:absolute sm:inset-0 sm:mt-0 sm:flex sm:items-center sm:justify-center sm:bg-background/55 sm:p-3 sm:backdrop-blur-[2px]">
      <div
        role="group"
        aria-label="Replay verdict"
        className="dna-rise relative w-full rounded-2xl border border-line-strong bg-surface p-4 shadow-2xl shadow-black/60 sm:max-w-md sm:p-5"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the verdict"
          className="absolute top-2 right-2 rounded-lg px-2 py-1 text-lg leading-none text-subtle hover:bg-surface-2 hover:text-foreground"
        >
          ×
        </button>
        <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest ring-1 ring-inset ${stampTone}`}>
          {stamp}
        </span>
        <p className="mt-2 pr-6 text-lg font-semibold tracking-tight text-balance sm:text-2xl">{line}</p>

        {solo ? (
          <dl className="mt-3 grid grid-cols-4 gap-x-3 gap-y-2 sm:mt-4">
            <Stat label="vs hold" value={signedPct(r.edgePct)} tone={edgeTone(r.edgePct)} />
            <Stat label="Worst dip" value={signedPct(-Math.abs(r.maxDrawdownPct))} />
            <Stat label="Trades" value={String(r.trades.length)} />
            <Stat label="Fees" value={formatAmount(r.feesPaidChog, 0)} hint="$CHOG" />
          </dl>
        ) : (
          <dl className="mt-3 grid grid-cols-2 gap-4 sm:mt-4">
            {series.map((s, i) => (
              <Stat
                key={s.tokenId}
                label={labelOf(s.tokenId)}
                value={signedPct(s.result.edgePct)}
                color={SERIES_COLOR[i]}
                hint={`${s.result.trades.length} trades`}
              />
            ))}
          </dl>
        )}

        <div className="mt-4 flex flex-wrap gap-2 sm:mt-5">
          <button type="button" onClick={onReplay} className="btn btn-secondary px-3 py-1.5">
            <span aria-hidden>↺</span> Replay
          </button>
          <button type="button" onClick={share} className="btn btn-secondary px-3 py-1.5">
            {shared === "copied" ? "Link copied" : shared === "failed" ? "Couldn't share" : "Share"}
          </button>
          {onChallenge && (
            <button type="button" onClick={onChallenge} className="btn btn-primary px-3 py-1.5">
              Challenge a Chog
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, tone = "", color }: { label: string; value: string; hint?: string; tone?: string; color?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10px] font-medium uppercase tracking-wider text-subtle">{label}</dt>
      <dd className={`mt-0.5 font-mono text-sm font-semibold tabular-nums sm:text-base ${tone}`} style={color ? { color } : undefined}>
        {value}
        {hint && <span className="block font-sans text-[10px] font-normal text-subtle sm:ml-1 sm:inline sm:text-[11px]">{hint}</span>}
      </dd>
    </div>
  );
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
    <div className="flex items-center gap-2 px-2 pt-3 sm:gap-3">
      <button
        type="button"
        onClick={playing ? onPause : onPlay}
        className="btn btn-primary w-[5.75rem] shrink-0"
        aria-label={playing ? "Pause the replay" : finished ? "Play the replay again" : "Play the replay"}
      >
        <span aria-hidden>{playing ? "❚❚" : "▶"}</span>
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
        className="h-2 min-w-0 flex-1 cursor-pointer accent-accent"
      />
      <button
        type="button"
        onClick={onSpeed}
        aria-label={`Playback speed ${speed}×`}
        title="Change the playback speed"
        className="btn btn-ghost w-12 shrink-0 px-2 font-mono"
      >
        {speed}×
      </button>
      <button type="button" onClick={onRestart} aria-label="Restart the replay" className="btn btn-ghost hidden shrink-0 px-2 sm:inline-flex">
        ↺
      </button>
    </div>
  );
}

function Legend({ ids, labelOf }: { ids: number[]; labelOf: Labeler }) {
  return (
    <ul aria-hidden className="flex flex-wrap gap-x-4 gap-y-1 px-3 pt-3 text-[11px] text-muted">
      {ids.map((id, i) => (
        <li key={id} className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: SERIES_COLOR[i] }} />
          {ids.length > 1 ? labelOf(id) : "Chog's stack"}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="w-4 border-t-[1.5px] border-dashed border-muted" /> Just holding
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded-full bg-accent/70" /> $CHOG price
      </li>
      <li className="flex items-center gap-1.5">
        <span className="text-success">▲</span> buy <span className="text-danger">▼</span> sell
        {ids.length > 1 && ` (${labelOf(ids[0])})`}
      </li>
    </ul>
  );
}

function Details({ series, labelOf }: { series: Series[]; labelOf: Labeler }) {
  const r = series[0].result;
  const moments = [...r.moments].sort((a, b) => a.t - b.t);
  return (
    <div className="space-y-1 px-2 pt-3 pb-4">
      {moments.length > 0 && (
        <Disclosure title={`Key moments (${moments.length})`}>
          <ol className="space-y-2">
            {moments.map((m, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <time dateTime={new Date(m.t * 1000).toISOString()} className="w-28 shrink-0 font-mono text-xs text-subtle">
                  {formatHour(m.t).replace(" UTC", "")}
                </time>
                <span className="text-muted">{m.text}</span>
              </li>
            ))}
          </ol>
        </Disclosure>
      )}
      <Disclosure title={`Trades of ${labelOf(series[0].tokenId)} (${r.trades.length})`}>
        {r.trades.length === 0 ? (
          <p className="text-sm text-muted">It never traded in this window: it just held its $CHOG.</p>
        ) : (
          <TradeTable trades={r.trades} />
        )}
      </Disclosure>
    </div>
  );
}

function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl px-2">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-2 text-sm font-medium text-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="text-xs text-subtle transition-transform group-open:rotate-90">
          ▶
        </span>
        {title}
      </summary>
      <div className="max-h-80 overflow-y-auto pb-3">{children}</div>
    </details>
  );
}

function TradeTable({ trades }: { trades: ReplayTrade[] }) {
  return (
    <table className="w-full text-left text-xs">
      <thead className="text-[10px] uppercase tracking-wider text-subtle">
        <tr>
          <th scope="col" className="py-1 pr-3 font-medium">When (UTC)</th>
          <th scope="col" className="py-1 pr-3 font-medium">Side</th>
          <th scope="col" className="py-1 pr-3 text-right font-medium">Price</th>
          <th scope="col" className="hidden py-1 pr-3 font-medium sm:table-cell">Why</th>
        </tr>
      </thead>
      <tbody className="font-mono tabular-nums">
        {trades.map((trade, i) => (
          <Fragment key={i}>
            <tr className="border-t border-line/50">
              <td className="py-1.5 pr-3 text-muted">{formatHour(trade.t).replace(" UTC", "")}</td>
              <td className={`py-1.5 pr-3 font-semibold ${trade.side === "buy" ? "text-success" : "text-danger"}`}>{trade.side}</td>
              <td className="py-1.5 pr-3 text-right text-muted">{formatPrice(trade.price)}</td>
              <td className="hidden py-1.5 pr-3 font-sans text-muted sm:table-cell">{trade.reason}</td>
            </tr>
            {/* Phones: the reason gets its own line under the trade. */}
            <tr className="sm:hidden">
              <td colSpan={3} className="pb-2 font-sans text-muted">
                {trade.reason}
              </td>
            </tr>
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

function ChartSkeleton({ bare = false }: { bare?: boolean }) {
  return (
    <div role="status" className={`overflow-hidden ${bare ? "absolute inset-0" : "relative h-[300px] sm:h-[384px]"}`}>
      <span className="sr-only">Loading the replay…</span>
      <div aria-hidden className="absolute inset-x-2 top-6 bottom-[38%] animate-pulse rounded-xl bg-surface-2/60" />
      <div aria-hidden className="absolute inset-x-2 bottom-8 h-[22%] animate-pulse rounded-xl bg-surface-2/40" />
    </div>
  );
}
