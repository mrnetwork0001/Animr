"use client";

import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import type { FanState } from "@/lib/bell/types";
import type { VersusBout, VersusRecord } from "@/lib/rewind/types";
import { LABEL, Portrait, SIDE_TONE, useReducedMotion } from "./bits";
import { KoCard, type PlayKind } from "./ko-card";
import { RaceChart, useRaceGeometry } from "./race-chart";
import {
  type BoutLine,
  type FighterLabel,
  SIDES,
  type Side,
  VERSUS_SIM_LABEL,
  boutHours,
  boutLines,
  edgeOf,
  edgeTone,
  formatChog,
  formatHour,
  frameAt,
  frameTime,
  koLine,
  signedPct,
  tasteText,
} from "./shared";

/** Playback speed: half a second per hour, so a 48-hour bout runs 24 s (clamped to 18–30 s). */
const MS_PER_HOUR = 500;
/** A speech bubble stays up this many hours of race time unless the same Chog speaks again. */
const BUBBLE_HOURS = 4;

export type RaceProps = {
  bout: VersusBout;
  labels: Record<Side, FighterLabel>;
  pick: Side | null;
  kind: PlayKind;
  correct: boolean | null;
  awarded?: number;
  fan?: FanState;
  record?: VersusRecord;
  onRematch: () => void;
  onRandom: () => void;
  /** Bring the race into view when it mounts (after a click; not on a page load). */
  scrollOnMount: boolean;
};

/**
 * The race: both genomes' $CHOG stacks against just holding, hour by hour over the hidden window, with
 * trade markers and speech bubbles, then the KO and the reveal of the real dates. Plays itself once on
 * screen (never with reduced motion: then it opens on the result); play, pause, skip and scrub.
 */
export function Race({ bout, labels, pick, kind, correct, awarded, fan, record, onRematch, onRandom, scrollOnMount }: RaceProps) {
  const reduced = useReducedMotion();
  const headingId = useId();
  const n = bout.frames.length;
  const hours = boutHours(bout);
  const duration = Math.min(30_000, Math.max(18_000, hours * MS_PER_HOUR));
  const [progress, setProgress] = useState(() => (reduced ? 1 : 0));
  const [playing, setPlaying] = useState(false);
  const [width, setWidth] = useState(0);
  /** The race reached the KO by playing or skipping (not by opening on the result): bring the KO card into view. */
  const [landed, setLanded] = useState(false);
  const progressRef = useRef(progress);
  const chartRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The animation clock: advances progress on every frame while playing.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last: number | undefined;
    const tick = (now: number) => {
      // Clamp the step so a background tab doesn't jump to the end when it wakes up.
      const dt = last === undefined ? 0 : Math.min(now - last, 80);
      last = now;
      const next = Math.min(1, progressRef.current + dt / duration);
      progressRef.current = next;
      setProgress(next);
      if (next >= 1) {
        setPlaying(false);
        setLanded(true);
      } else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration]);

  // After a pick: focus moves here (the button that was clicked is gone) and the race scrolls into view.
  // Then it starts once it's mostly on screen.
  useEffect(() => {
    if (scrollOnMount) {
      headingRef.current?.focus({ preventScroll: true });
      sectionRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    }
    const el = chartRef.current;
    if (reduced || !el || progressRef.current > 0) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        setPlaying(true);
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduced, scrollOnMount]);

  // Drawn in real pixels so text, markers and strokes stay crisp at any width.
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
  const skip = () => {
    setPlaying(false);
    seek(1);
    setLanded(true);
  };
  const replay = () => {
    seek(0);
    setPlaying(true);
    sectionRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

  const pos = progress * (n - 1);
  const finished = progress >= 1;
  const hour = Math.min(hours, Math.floor(pos + 1e-6));
  const height = width < 640 ? 250 : 330;
  const g = useRaceGeometry(bout, width, height);
  const lines = useMemo(() => boutLines(bout), [bout]);
  const ko = koLine(bout, labels);

  const live = SIDES.map((side) => {
    const value = finished ? bout.frames[n - 1][side] : frameAt(bout.frames, pos, side);
    const edge = finished ? (side === "a" ? bout.result.aEdgePct : bout.result.bEdgePct) : edgeOf(value, bout.startChog);
    return { side, value, edge };
  });
  const gap = live[0].value - live[1].value;
  const leader: Side | null = finished
    ? bout.result.winner === "draw"
      ? null
      : bout.result.winner
    : Math.abs(gap) < bout.startChog * 0.002
      ? null
      : gap > 0
        ? "a"
        : "b";
  // The engine's last line lands on the final frame, so bubbles stay up at the KO too.
  const bubbleOf = (side: Side): BoutLine | undefined => {
    for (let k = lines.length - 1; k >= 0; k--) {
      const line = lines[k];
      if (line.side !== side || line.i > pos + 1e-6) continue;
      return pos - line.i < BUBBLE_HOURS ? line : undefined;
    }
    return undefined;
  };

  const tradeCount = (side: Side) => bout.trades.filter((t) => t.fighter === side).length;
  const summary = finished
    ? `${ko} ${labels.a.title} made ${tradeCount("a")} trades, ${labels.b.title} ${tradeCount("b")}. The window: ${bout.reveal.label}.`
    : `Race chart: ${labels.a.title} and ${labels.b.title}, hour ${hour} of ${hours}. Lines show each $CHOG stack against just holding.`;

  return (
    <section ref={sectionRef} aria-labelledby={headingId} className="card scroll-mt-28 overflow-hidden md:scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-2 px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="min-w-0">
          <p className="eyebrow">VERSUS · {finished ? "the reveal" : "48 hidden hours"}</p>
          <h2
            ref={headingRef}
            id={headingId}
            tabIndex={-1}
            className="mt-1 text-lg font-semibold tracking-tight text-balance outline-none sm:text-xl"
          >
            <span className={SIDE_TONE.a.text}>{labels.a.title}</span> <span className="text-muted">vs</span>{" "}
            <span className={SIDE_TONE.b.text}>{labels.b.title}</span>
          </h2>
        </div>
        <p className="chip">{finished ? bout.reveal.label.split(":")[0] : "Real dates hidden until the KO"}</p>
      </div>

      {/* Fighters' corners: live edge and stack, the latest thing each one said. Visual only; the
          chart's label, the live region and the play-by-play carry the same information. */}
      <div aria-hidden className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 px-3 pt-4 sm:gap-4 sm:px-6">
        <Corner
          side="a"
          bout={bout}
          label={labels.a}
          edge={live[0].edge}
          value={live[0].value}
          leads={leader === "a"}
          picked={pick === "a" && kind !== "watch"}
          bubble={bubbleOf("a")}
        />
        <div className="pt-1 text-center">
          <p className={`${LABEL} text-[10px]`}>Hour</p>
          <p className="font-mono text-lg font-semibold tabular-nums sm:text-xl">
            {hour}
            <span className="text-sm text-subtle">/{hours}</span>
          </p>
        </div>
        <Corner
          side="b"
          bout={bout}
          label={labels.b}
          edge={live[1].edge}
          value={live[1].value}
          leads={leader === "b"}
          picked={pick === "b" && kind !== "watch"}
          bubble={bubbleOf("b")}
        />
      </div>

      <div className="px-2 pt-3 sm:px-4">
        <div ref={chartRef} className="relative h-[250px] sm:h-[330px]">
          {width > 0 ? (
            <RaceChart
              bout={bout}
              g={g}
              width={width}
              height={height}
              pos={pos}
              revealed={finished}
              winner={finished ? bout.result.winner : undefined}
              summary={summary}
            />
          ) : (
            <div aria-hidden className="absolute inset-x-2 top-4 bottom-8 animate-pulse rounded-xl bg-surface-2/60" />
          )}
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {finished ? `${ko} ${bout.reveal.label}.` : ""}
      </p>

      <div className="flex items-center gap-2 px-3 pt-3 sm:gap-3 sm:px-6">
        <button
          type="button"
          onClick={playing ? () => setPlaying(false) : play}
          className="btn btn-primary w-[6.25rem] shrink-0"
          aria-label={playing ? "Pause the race" : finished ? "Watch the race again" : "Play the race"}
        >
          <span aria-hidden>{playing ? "❚❚" : finished ? "↺" : "▶"}</span>
          {playing ? "Pause" : finished ? "Again" : "Play"}
        </button>
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(progress * 1000)}
          onChange={(e) => {
            setPlaying(false);
            seek(Number(e.target.value) / 1000);
          }}
          aria-label="Race timeline"
          aria-valuetext={`Hour ${hour} of ${hours}`}
          className="h-2 min-w-0 flex-1 cursor-pointer accent-accent"
        />
        <button
          type="button"
          onClick={skip}
          disabled={finished}
          className="btn btn-secondary shrink-0 px-3"
          aria-label="Skip to the result"
        >
          Skip <span aria-hidden>⏭</span>
        </button>
      </div>

      <Legend labels={labels} />

      {finished && (
        <div className="px-3 pt-4 sm:px-6">
          <KoCard
            bout={bout}
            labels={labels}
            pick={pick}
            kind={kind}
            correct={correct}
            awarded={awarded}
            fan={fan}
            record={record}
            onRematch={onRematch}
            onRandom={onRandom}
            onReplay={replay}
            busy={null}
            scrollIntoView={landed}
          />
        </div>
      )}

      {finished && <PlayByPlay bout={bout} labels={labels} />}

      <p className="mt-4 border-t border-line/70 px-4 py-3 text-[11px] leading-relaxed text-subtle sm:px-6">
        {VERSUS_SIM_LABEL}: both Chogs start with {formatChog(bout.startChog)} $CHOG and trade the same hourly closes by
        their trait genomes. No real trades. Points only.
      </p>
    </section>
  );
}

function Corner({
  side,
  bout,
  label,
  edge,
  value,
  leads,
  picked,
  bubble,
}: {
  side: Side;
  bout: VersusBout;
  label: FighterLabel;
  edge: number;
  value: number;
  leads: boolean;
  picked: boolean;
  bubble?: BoutLine;
}) {
  const right = side === "b";
  const tone = SIDE_TONE[side];
  return (
    <div className={`min-w-0 ${right ? "text-right" : ""}`}>
      <div className={`flex items-center gap-2 ${right ? "flex-row-reverse" : ""}`}>
        <Portrait side={side} image={bout[side].image} tokenId={bout[side].tokenId} size={44} box="size-9 sm:size-11" className="rounded-xl" />
        <div className="min-w-0">
          <p className={`truncate text-sm font-semibold ${tone.text}`}>{label.title}</p>
          <p className={`flex min-h-4 flex-wrap gap-1 ${right ? "justify-end" : ""}`}>
            {leads && (
              <span className="vs-bob inline-flex rounded bg-success/15 px-1 text-[9px] font-bold tracking-wider text-success uppercase">
                Leads
              </span>
            )}
            {picked && (
              <span className={`inline-flex rounded px-1 text-[9px] font-bold tracking-wider uppercase ${tone.text} ring-1 ring-current/40`}>
                Your pick
              </span>
            )}
          </p>
        </div>
      </div>
      <p className={`mt-1.5 font-mono text-xl font-semibold tabular-nums sm:text-2xl ${edgeTone(edge)}`}>{signedPct(edge)}</p>
      <p className="text-[11px] text-subtle">
        <span className="font-mono tabular-nums">{formatChog(value)}</span> $CHOG
      </p>
      <div className={`mt-2 flex min-h-[3.75rem] items-start ${right ? "justify-end" : ""}`}>
        {bubble && (
          <div
            key={`${bubble.i}:${bubble.text}`}
            className={`vs-pop max-w-full rounded-2xl border px-2.5 py-1.5 text-left text-[11px] leading-snug text-foreground sm:text-xs ${tone.soft} ${
              right ? "rounded-tr-sm" : "rounded-tl-sm"
            }`}
          >
            <p className="line-clamp-3">
              {bubble.kind === "trade" && (
                <span className={`mr-1 font-mono text-[10px] font-bold uppercase ${bubble.tradeSide === "buy" ? "text-success" : "text-danger"}`}>
                  {bubble.tradeSide === "buy" ? "▲ buys" : "▼ sells"}
                </span>
              )}
              {bubble.text}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ labels }: { labels: Record<Side, FighterLabel> }) {
  return (
    <ul aria-hidden className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-3 text-[11px] text-muted sm:px-6">
      {SIDES.map((side) => (
        <li key={side} className="flex min-w-0 items-center gap-1.5">
          <span className={`h-0.5 w-4 rounded-full ${SIDE_TONE[side].fill}`} />
          <span className="truncate">{labels[side].title}&apos;s $CHOG stack</span>
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="w-4 border-t-[1.5px] border-dashed border-muted" /> Just holding
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded-full bg-accent/70" /> $CHOG price
      </li>
      <li className="flex items-center gap-1.5">▲ buys $CHOG back · ▼ sells $CHOG</li>
    </ul>
  );
}

/** Every line and trade in order: the race as text (and for the curious). */
function PlayByPlay({ bout, labels }: { bout: VersusBout; labels: Record<Side, FighterLabel> }) {
  const events: { i: number; side: Side; node: ReactNode; key: string }[] = [
    ...bout.moments.map((m, k) => ({
      i: m.i,
      side: m.fighter,
      key: `m${k}`,
      node: <span className="text-muted">&ldquo;{tasteText(m.text)}&rdquo;</span>,
    })),
    ...bout.trades.map((t, k) => ({
      i: t.i,
      side: t.fighter,
      key: `t${k}`,
      node: (
        <span className="text-muted">
          <span className={`font-mono text-[11px] font-semibold uppercase ${t.side === "buy" ? "text-success" : "text-danger"}`}>
            {t.side === "buy" ? "bought $CHOG" : "sold $CHOG"}
          </span>
          {t.reason ? <> · {tasteText(t.reason)}</> : null}
        </span>
      ),
    })),
  ].sort((x, y) => x.i - y.i);

  return (
    <details className="group mx-3 mt-3 rounded-xl px-2 sm:mx-5">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-2 text-sm font-medium text-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="text-xs text-subtle transition-transform group-open:rotate-90">
          ▶
        </span>
        Play-by-play ({bout.trades.length} {bout.trades.length === 1 ? "trade" : "trades"})
      </summary>
      <ol className="max-h-80 space-y-2 overflow-y-auto pb-3">
        {events.map((event) => {
          const t = frameTime(bout, event.i);
          return (
          <li key={event.key} className="flex gap-3 text-sm">
            <time
              dateTime={Number.isFinite(t) ? new Date(t).toISOString() : undefined}
              className="w-16 shrink-0 font-mono text-xs text-subtle sm:w-36"
              title={formatHour(t)}
            >
              <span className="sm:hidden">Hour {event.i}</span>
              <span className="hidden sm:inline">{formatHour(t).replace(" UTC", "")}</span>
            </time>
            <span className="min-w-0">
              <span className={`font-medium ${SIDE_TONE[event.side].text}`}>{labels[event.side].title}</span> {event.node}
            </span>
          </li>
          );
        })}
        {events.length === 0 && <li className="text-sm text-muted">Neither Chog traded: both just held their $CHOG.</li>}
      </ol>
    </details>
  );
}
