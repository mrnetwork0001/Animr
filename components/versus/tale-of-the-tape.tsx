"use client";

import { type ReactNode, useCallback, useId } from "react";
import { useGenome, useStanding } from "@/components/dna/api";
import { DEFAULT_WINDOW } from "@/components/dna/shared";
import type { VersusBoutPreview, VersusFighter } from "@/lib/rewind/types";
import { Portrait, SIDE_TONE, Skeleton, StyleTag, VsBadge } from "./bits";
import { type FighterLabel, PICK_POINTS, type Side, genomeLine, signedPct, tapeRows } from "./shared";

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
    <section aria-labelledby={headingId} className="v2-card v2-card--flush vs-stage">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-5 sm:px-8 sm:pt-7">
        <h2 ref={focusHeading} id={headingId} tabIndex={-1} className="v2-kicker outline-none">
          Tale of the tape
        </h2>
      </div>

      {/* The two corners, mirrored around the centre hairline. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-2 px-3 pt-6 sm:gap-8 sm:px-8 sm:pt-8">
        <Corner side="a" fighter={preview.a} label={labels.a} line={genomeLine(genomes.a)} loading={genomeA.isPending} />
        <VsBadge />
        <Corner side="b" fighter={preview.b} label={labels.b} line={genomeLine(genomes.b)} loading={genomeB.isPending} />
      </div>

      {/* The one action comes right under the corners; the gene table backs it up below. */}
      <div className="mt-7 border-y border-[var(--v2-line-soft)] bg-[rgb(255_255_255/0.012)] px-4 py-7 text-center sm:px-8 sm:py-9">
        <h3 id={questionId} className="v2-h2">
          Who stacks more $CHOG?
        </h3>
        <p className="mx-auto mt-3 max-w-xl text-[length:var(--v2-fs-sm)] leading-relaxed text-pretty text-[var(--v2-nav)]">
          {mode === "shared" ? "Someone shared this bout with you. " : ""}Right call:{" "}
          <span className="v2-num text-[var(--v2-kicker)]">+{PICK_POINTS} points</span>.
        </p>

        <div role="group" aria-labelledby={questionId} className="mx-auto mt-6 grid max-w-2xl grid-cols-2 gap-2 sm:gap-4">
          {(["a", "b"] as const).map((side) => (
            <button
              key={side}
              type="button"
              onClick={() => onPick(side)}
              disabled={busy}
              aria-busy={pending === side || undefined}
              className={`${SIDE_TONE[side].button} ${side === "b" ? "flex-row-reverse sm:flex-row" : ""}`}
            >
              <Portrait side={side} image={preview[side].image} tokenId={preview[side].tokenId} size={36} box="size-8 sm:size-9" />
              <span className="min-w-0 truncate">
                {pending === side ? "Locking in…" : labels[side].title}
                <span className="v2-sr">: pick {labels[side].spoken} to stack more $CHOG</span>
              </span>
            </button>
          ))}
        </div>

        <button type="button" onClick={onWatch} disabled={busy} className="v2-btn-ghost v2-btn--sm mt-4">
          {pending === "watch" ? "Loading the bout…" : "Just watch (no pick, no points)"}
        </button>

        {error && (
          <p role="alert" className="mx-auto mt-3 max-w-md text-sm text-[var(--v2-danger)]">
            {error}
          </p>
        )}
      </div>

      <dl aria-label="Tale of the tape: both genomes, gene by gene" className="vs-tape mx-3 my-5 sm:mx-8 sm:my-7">
        <TapeRow
          label="League rank"
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
        size={168}
        box="size-24 sm:size-36 lg:size-[168px]"
        eager
        large
        alt={`${label.spoken}'s original art`}
      />
      <p className={`vs-name mt-3 max-w-full break-words sm:mt-5 ${SIDE_TONE[side].text}`}>{label.title}</p>
      {/* Its marketplace name, "CHOG #1462", under its persona name. */}
      {label.ids !== label.title && (
        <p className="mt-1 text-[11px] whitespace-nowrap text-[var(--v2-faint)] sm:text-xs">{label.ids}</p>
      )}
      <p className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <span className="text-[length:var(--v2-fs-sm)] text-balance text-[var(--v2-muted)]">{fighter.archetype}</span>
        <StyleTag style={fighter.style} />
      </p>
      {line ? (
        <p className="vs-quote mt-3 line-clamp-3 max-w-sm sm:line-clamp-4">&ldquo;{line}&rdquo;</p>
      ) : loading ? (
        <span className="mt-3 w-full max-w-xs space-y-1.5">
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
        <span className="v2-sr">{labels[side].title}: </span>
        {value}
      </>
    ) : loading?.[side] ? (
      <Skeleton className={`h-3.5 w-20 ${side === "a" ? "ml-auto" : ""}`} />
    ) : (
      <span className="text-[var(--v2-faint)]">—</span>
    );
  return (
    <div className="vs-tape-row">
      <dt>{label}</dt>
      <dd className={SIDE_TONE.a.text}>{cell("a", a)}</dd>
      <dd className={SIDE_TONE.b.text}>{cell("b", b)}</dd>
    </div>
  );
}

function Standing({ rank, edge }: { rank: number; edge: number }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span className="v2-num">#{new Intl.NumberFormat("en-US").format(rank)}</span>
      <span className={`v2-num text-[0.85em] ${edge > 0 ? "v2-up" : edge < 0 ? "v2-down" : "v2-muted"}`}>
        {signedPct(edge)}
      </span>
    </span>
  );
}

/** Same footprint as the tape, while a bout loads. */
export function TapeSkeleton() {
  return (
    <div role="status" className="v2-card v2-card--flush vs-stage px-4 py-6 sm:px-8 sm:py-7">
      <span className="v2-sr">Loading the bout…</span>
      <div aria-hidden className="flex items-center justify-between gap-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-6 w-56" />
      </div>
      <div aria-hidden className="mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8">
        {[0, 1].map((i) => (
          <span key={i} className={`flex flex-col items-center gap-2.5 ${i ? "order-3" : "order-1"}`}>
            <Skeleton className="size-24 rounded-[var(--v2-r-xl)] sm:size-36 lg:size-[168px]" />
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-20" />
          </span>
        ))}
        <span className="order-2 vs-vs bg-transparent">VS</span>
      </div>
      <div aria-hidden className="mx-auto mt-10 grid max-w-2xl grid-cols-2 gap-4">
        <Skeleton className="h-16 rounded-full" />
        <Skeleton className="h-16 rounded-full" />
      </div>
      <div aria-hidden className="mt-10 space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-6" />
        ))}
      </div>
    </div>
  );
}
