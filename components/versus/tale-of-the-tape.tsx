"use client";

import { type ReactNode, useCallback, useId } from "react";
import { useGenome, useStanding } from "@/components/dna/api";
import { DEFAULT_WINDOW, WINDOW_LABEL } from "@/components/dna/shared";
import type { VersusBoutPreview, VersusFighter } from "@/lib/rewind/types";
import { LABEL, Portrait, SIDE_TONE, Skeleton, StyleTag, VsBadge } from "./bits";
import {
  DAILY_POINTS_CAP,
  type FighterLabel,
  PICK_POINTS,
  POINTS_LABEL,
  type Side,
  VERSUS_SIM_LABEL,
  formatChog,
  genomeLine,
  signedPct,
  tapeRows,
} from "./shared";

export type TapeMode =
  /** A bout dealt here (Random bout, Pick two Chogs, a rematch). */
  | "fresh"
  /** A shared link (/versus/[id]) this browser hasn't picked yet. */
  | "shared";

type TapeProps = {
  preview: VersusBoutPreview;
  labels: Record<Side, FighterLabel>;
  mode: TapeMode;
  onPick: (side: Side) => void;
  onWatch: () => void;
  /** The side being locked in, while the pick request runs. */
  pending: Side | "watch" | null;
  error?: string | null;
  /** Move focus here when it appears after a click (the button that dealt it may be gone). */
  focusOnMount?: boolean;
};

/**
 * Before the bell: both fighters side by side (original art, archetype, style, one line from each
 * genome), their genes as a tale of the tape, and the question. No result is on screen yet.
 */
export function TaleOfTheTape({ preview, labels, mode, onPick, onWatch, pending, error, focusOnMount = false }: TapeProps) {
  const headingId = useId();
  const focusHeading = useCallback(
    (node: HTMLHeadingElement | null) => {
      if (node && focusOnMount) node.focus({ preventScroll: true });
    },
    [focusOnMount],
  );
  const questionId = useId();
  const genomeA = useGenome(preview.a.tokenId);
  const genomeB = useGenome(preview.b.tokenId);
  const standingA = useStanding(preview.a.tokenId, DEFAULT_WINDOW);
  const standingB = useStanding(preview.b.tokenId, DEFAULT_WINDOW);
  const genomes = { a: genomeA.data?.genome, b: genomeB.data?.genome };
  const rows = tapeRows(genomes.a, genomes.b);
  const busy = pending !== null;

  return (
    <section aria-labelledby={headingId} className="card relative overflow-hidden">
      {/* Corner glows in each fighter's color. */}
      <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 size-64 rounded-full bg-accent/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-warning/10 blur-3xl" />

      <div className="relative flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-6 sm:pt-5">
        <h2 ref={focusHeading} id={headingId} tabIndex={-1} className="eyebrow outline-none">
          Tale of the tape
        </h2>
        <p className="flex flex-wrap gap-1.5">
          <span className="chip">{preview.windowLabel || "48 hours of real $CHOG history"} · dates hidden</span>
          <span className="chip">Both start with {formatChog(preview.startChog)} $CHOG</span>
        </p>
      </div>

      <div className="relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 px-3 pt-5 sm:gap-6 sm:px-6">
        <Corner side="a" fighter={preview.a} label={labels.a} line={genomeLine(genomes.a)} loading={genomeA.isPending} />
        <div className="flex h-24 items-center sm:h-36">
          <VsBadge />
        </div>
        <Corner side="b" fighter={preview.b} label={labels.b} line={genomeLine(genomes.b)} loading={genomeB.isPending} />
      </div>

      <dl className="relative mx-3 mt-5 divide-y divide-line/60 rounded-xl border border-line/70 bg-background/40 text-xs sm:mx-6 sm:text-sm">
        <TapeRow
          label={`League · ${WINDOW_LABEL[DEFAULT_WINDOW]}`}
          labels={labels}
          a={standingA.data ? <Standing rank={standingA.data.row.rank} edge={standingA.data.row.edgePct} /> : undefined}
          b={standingB.data ? <Standing rank={standingB.data.row.rank} edge={standingB.data.row.edgePct} /> : undefined}
          loading={{ a: standingA.isPending, b: standingB.isPending }}
        />
        {rows.length > 0
          ? rows.map((row) => <TapeRow key={row.key} label={row.label} labels={labels} a={row.a} b={row.b} />)
          : ["Signal", "Trigger", "Size", "Exit"].map((label) => (
              <TapeRow
                key={label}
                label={label}
                labels={labels}
                loading={{ a: genomeA.isPending, b: genomeB.isPending }}
              />
            ))}
      </dl>

      <div className="relative mt-5 border-t border-line/70 bg-background/30 px-4 pt-5 pb-5 text-center sm:px-6">
        <h3 id={questionId} className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
          Who stacks more $CHOG?
        </h3>
        <p className="mx-auto mt-1.5 max-w-xl text-xs leading-relaxed text-pretty text-muted sm:text-sm">
          {mode === "shared" ? "Someone shared this bout with you. " : "Both genomes trade the same hidden 48 hours. "}
          Call it right for <span className="font-semibold text-accent-strong">+{PICK_POINTS} points</span> (one pick
          per bout, up to {DAILY_POINTS_CAP} a day). {POINTS_LABEL}.
        </p>

        <div role="group" aria-labelledby={questionId} className="mx-auto mt-4 grid max-w-xl grid-cols-2 gap-2 sm:gap-3">
          {(["a", "b"] as const).map((side) => (
            <button
              key={side}
              type="button"
              onClick={() => onPick(side)}
              disabled={busy}
              aria-busy={pending === side || undefined}
              className={`group flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 px-2 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:gap-3 sm:px-4 sm:text-base ${SIDE_TONE[side].button}`}
            >
              <Portrait
                side={side}
                image={preview[side].image}
                tokenId={preview[side].tokenId}
                size={32}
                className="rounded-lg"
              />
              <span className="min-w-0 truncate">
                {pending === side ? "Locking in…" : labels[side].title}
                <span className="sr-only">: pick {labels[side].spoken} to stack more $CHOG</span>
              </span>
            </button>
          ))}
        </div>

        <button type="button" onClick={onWatch} disabled={busy} className="btn btn-ghost mt-3">
          {pending === "watch" ? "Loading the bout…" : "Just watch (no pick, no points)"}
        </button>

        {error && (
          <p role="alert" className="mx-auto mt-3 max-w-md text-sm text-danger">
            {error}
          </p>
        )}
        <p className="mt-4 text-[11px] text-subtle">{VERSUS_SIM_LABEL}. Real dates are revealed at the KO.</p>
      </div>
    </section>
  );
}

function Corner({
  side,
  fighter,
  label,
  line,
  loading,
}: {
  side: Side;
  fighter: VersusFighter;
  label: FighterLabel;
  line: string | null;
  loading: boolean;
}) {
  return (
    <div className={`flex min-w-0 flex-col items-center text-center ${side === "a" ? "vs-in-left" : "vs-in-right"}`}>
      <Portrait
        side={side}
        image={fighter.image}
        tokenId={fighter.tokenId}
        size={144}
        box="size-24 sm:size-36"
        eager
        alt={`${label.spoken}'s original art`}
        className="rounded-2xl sm:rounded-3xl"
      />
      <p className={`mt-3 max-w-full text-base leading-snug font-semibold tracking-tight text-balance break-words sm:text-lg ${SIDE_TONE[side].text}`}>
        {label.title}
      </p>
      {/* "CHOG #1462 · token #1": both names, wrapping between them on narrow screens. */}
      <p className="flex max-w-full flex-wrap justify-center gap-x-1 font-mono text-[10px] text-subtle sm:text-[11px]">
        {label.ids.split(" · ").map((part, i) => (
          <span key={part} className="whitespace-nowrap">
            {i > 0 && <span aria-hidden>· </span>}
            {part}
          </span>
        ))}
      </p>
      <p className="mt-1.5 text-sm font-medium text-balance text-foreground">{fighter.archetype}</p>
      <p className="mt-1">
        <StyleTag style={fighter.style} />
      </p>
      {line ? (
        <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-pretty text-muted italic sm:text-[13px]">
          &ldquo;{line}&rdquo;
        </p>
      ) : loading ? (
        <span className="mt-2 w-full space-y-1.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="mx-auto h-3 w-3/4" />
        </span>
      ) : null}
    </div>
  );
}

function TapeRow({
  label,
  labels,
  a,
  b,
  loading,
}: {
  label: string;
  labels: Record<Side, FighterLabel>;
  a?: ReactNode;
  b?: ReactNode;
  loading?: { a: boolean; b: boolean };
}) {
  const cell = (side: Side, value: ReactNode | undefined) =>
    value !== undefined ? (
      <>
        <span className="sr-only">{labels[side].title}: </span>
        {value}
      </>
    ) : loading?.[side] ? (
      <Skeleton className={`h-3.5 w-20 ${side === "a" ? "ml-auto" : ""}`} />
    ) : (
      <span className="text-subtle">—</span>
    );
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)] items-center gap-2 px-2.5 py-2 sm:grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)] sm:px-4">
      <dt className={`order-2 text-center ${LABEL} text-[10px] sm:text-[11px]`}>{label}</dt>
      <dd className="order-1 min-w-0 text-right font-medium text-foreground">{cell("a", a)}</dd>
      <dd className="order-3 min-w-0 text-left font-medium text-foreground">{cell("b", b)}</dd>
    </div>
  );
}

function Standing({ rank, edge }: { rank: number; edge: number }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <span>#{new Intl.NumberFormat("en-US").format(rank)}</span>
      <span className={`font-mono text-[11px] tabular-nums ${edge > 0 ? "text-success" : edge < 0 ? "text-danger" : "text-muted"}`}>
        {signedPct(edge)}
      </span>
    </span>
  );
}

/** Same footprint as the tape, while a bout loads. */
export function TapeSkeleton() {
  return (
    <div role="status" className="card overflow-hidden px-4 py-5 sm:px-6">
      <span className="sr-only">Loading the bout…</span>
      <div aria-hidden className="flex items-center justify-between">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-5 w-48" />
      </div>
      <div aria-hidden className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
        {[0, 1].map((i) => (
          <span key={i} className={`flex flex-col items-center gap-2 ${i ? "order-3" : "order-1"}`}>
            <Skeleton className="size-24 rounded-2xl sm:size-36 sm:rounded-3xl" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-20" />
          </span>
        ))}
        <span className="order-2 flex size-11 items-center justify-center rounded-full border border-line text-sm font-black text-subtle sm:size-14">
          VS
        </span>
      </div>
      <div aria-hidden className="mt-6 space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-7" />
        ))}
      </div>
      <div aria-hidden className="mt-6 grid grid-cols-2 gap-3">
        <Skeleton className="h-14 rounded-2xl" />
        <Skeleton className="h-14 rounded-2xl" />
      </div>
    </div>
  );
}
