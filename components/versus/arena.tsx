"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useId, useRef, useState } from "react";
import { parseChogId } from "@/components/dna/shared";
import type { FanState } from "@/lib/bell/types";
import type { VersusBout, VersusBoutPreview, VersusRecord } from "@/lib/rewind/types";
import {
  VersusApiError,
  fetchBoutPreview,
  fetchPairBout,
  fetchRandomBout,
  fetchSpectate,
  postPick,
  rememberPick,
  rememberWatch,
  retryVersus,
  useRememberedPick,
  useVersusSampleMode,
  useVersusStats,
} from "./api";
import { RewindIcon } from "@/components/v2/icons";
import { pillClass } from "@/components/v2/primitives";
import { DiceIcon } from "./bits";
import type { PlayKind } from "./ko-card";
import { PickTwo } from "./pick-two";
import { Race } from "./race";
import { type FighterLabel, type Side, boutPath, fighterLabel } from "./shared";
import { TaleOfTheTape, TapeSkeleton } from "./tale-of-the-tape";

/** Where the bout on screen came from. `n` makes every deal a new query (a new random draw). */
type Source =
  | { kind: "random"; n: number }
  | { kind: "pair"; a: number | null; b: number | null; n: number; avoid?: string }
  | { kind: "id"; id: string };

/** The bout being raced and how the visitor got there. */
type Play = {
  bout: VersusBout;
  pick: Side | null;
  kind: PlayKind;
  correct: boolean | null;
  awarded?: number;
  fan?: FanState;
  record?: VersusRecord;
  scroll: boolean;
};

/**
 * This session's plays by bout id. The address bar follows a revealed bout (/versus/[id]) without a
 * navigation, so a router refresh re-renders that route and remounts the arena: it picks the play back up
 * here, verdict and points included, instead of treating it as a returning visitor.
 */
const sessionPlays = new Map<string, Play>();

function initialSource(initialId: string | undefined, params: URLSearchParams): Source {
  if (initialId) return { kind: "id", id: initialId };
  // Deep links: /versus?a=7&b=42 (either alone: a random rival), e.g. from a Chog's page.
  const a = parseChogId(params.get("a"));
  const b = parseChogId(params.get("b"));
  if (a !== null || b !== null) return { kind: "pair", a, b: b === a ? null : b, n: 0 };
  return { kind: "random", n: 0 };
}

async function deal(source: Source): Promise<VersusBoutPreview> {
  if (source.kind === "random") return fetchRandomBout();
  if (source.kind === "id") return fetchBoutPreview(source.id);
  const first = await fetchPairBout(source.a, source.b);
  // A rematch should land on another window: ask once more if the same one came back.
  return source.avoid && first.id === source.avoid ? fetchPairBout(source.a, source.b) : first;
}

/** The address bar follows the bout once it's revealed (so it can be copied), and drops it for a new one. */
function syncUrl(id: string | null) {
  const path = id ? boutPath(id) : "/versus";
  if (window.location.pathname !== path) window.history.replaceState(null, "", path);
}

const labelsOf = (bout: VersusBoutPreview, metadataIds: readonly number[]): Record<Side, FighterLabel> => ({
  a: fighterLabel(bout.a, metadataIds),
  b: fighterLabel(bout.b, metadataIds),
});

/**
 * VERSUS: deal a bout (random, a chosen pair, or a shared /versus/[id]), show the tale of the tape, take
 * the visitor's pick (or let them just watch), then race the two genomes and reveal the real window.
 */
export function VersusArena({ initialId, metadataIds }: { initialId?: string; metadataIds: readonly number[] }) {
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const nonce = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const formId = useId();
  const [source, setSource] = useState<Source>(() => initialSource(initialId, params));
  const [play, setPlayState] = useState<Play | null>(() => {
    const restored = initialId ? sessionPlays.get(initialId) : undefined;
    return restored ? { ...restored, scroll: false } : null;
  });
  const setPlay = (next: Play | null) => {
    if (next) sessionPlays.set(next.bout.id, next);
    setPlayState(next);
  };
  const [formOpen, setFormOpen] = useState(false);
  /** The bout on screen was dealt by a click (not the page load): its tape takes focus when it appears. */
  const [dealtByClick, setDealtByClick] = useState(false);
  const sample = useVersusSampleMode();

  const dealt = useQuery({
    queryKey: ["versus", "deal", source],
    queryFn: () => deal(source),
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: retryVersus,
    refetchOnWindowFocus: false,
  });
  const preview = dealt.data;

  // A shared link this browser already picked (or watched): straight to the replay of that bout.
  const sharedId = source.kind === "id" ? source.id : undefined;
  const remembered = useRememberedPick(sharedId);
  const replayQuery = useQuery({
    queryKey: ["versus", "spectate", sharedId ?? ""],
    queryFn: () => fetchSpectate(sharedId!),
    enabled: sharedId !== undefined && remembered !== null && play === null,
    staleTime: Infinity,
    retry: retryVersus,
  });
  const returning: Play | null =
    remembered && replayQuery.data && replayQuery.data.id === sharedId
      ? remembered === "watch"
        ? { bout: replayQuery.data, pick: null, kind: "watch", correct: null, scroll: false }
        : { bout: replayQuery.data, pick: remembered, kind: "returning", correct: null, scroll: false }
      : null;
  const current = play ?? returning;

  const pick = useMutation({
    mutationFn: ({ id, side }: { id: string; side: Side }) => postPick(id, side),
    onSuccess: (res, { side }) => {
      // On a repeat the engine answers with the original pick, which is the one to show.
      const picked: Side = res.pick === "a" || res.pick === "b" ? res.pick : side;
      rememberPick(res.bout.id, picked);
      setPlay({
        bout: res.bout,
        pick: picked,
        kind: "points",
        correct: res.correct,
        awarded: res.awarded,
        fan: res.fan,
        record: res.record,
        scroll: true,
      });
      syncUrl(res.bout.id);
      void queryClient.invalidateQueries({ queryKey: ["fan"] });
      void queryClient.invalidateQueries({ queryKey: ["versus", "stats"] });
    },
  });
  const watch = useMutation({
    mutationFn: (id: string) => fetchSpectate(id),
    onSuccess: (bout) => {
      rememberWatch(bout.id);
      setPlay({ bout, pick: null, kind: "watch", correct: null, scroll: true });
      syncUrl(bout.id);
    },
  });

  const redeal = (next: Source) => {
    setPlay(null);
    pick.reset();
    watch.reset();
    setFormOpen(false);
    setSource(next);
    setDealtByClick(true);
    syncUrl(null);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = rootRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) rootRef.current?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  };
  const randomBout = () => redeal({ kind: "random", n: ++nonce.current });
  const pairBout = (a: number | null, b: number | null) => redeal({ kind: "pair", a, b, n: ++nonce.current });
  const rematch = (bout: VersusBout) =>
    redeal({ kind: "pair", a: bout.a.tokenId, b: bout.b.tokenId, n: ++nonce.current, avoid: bout.id });

  let body;
  if (current) {
    body = (
      <Race
        key={`${current.bout.id}:${current.kind}`}
        bout={current.bout}
        labels={labelsOf(current.bout, metadataIds)}
        pick={current.pick}
        kind={current.kind}
        correct={current.correct}
        awarded={current.awarded}
        fan={current.fan}
        record={current.record}
        onRematch={() => rematch(current.bout)}
        onRandom={randomBout}
        scrollOnMount={current.scroll}
      />
    );
  } else if (preview && !(remembered && replayQuery.isPending)) {
    const pending = pick.isPending ? pick.variables.side : watch.isPending ? "watch" : null;
    body = (
      <TaleOfTheTape
        key={preview.id}
        preview={preview}
        labels={labelsOf(preview, metadataIds)}
        mode={source.kind === "id" ? "shared" : "fresh"}
        pending={pending}
        error={(pick.error ?? watch.error)?.message ?? null}
        onPick={(side) => pick.mutate({ id: preview.id, side })}
        onWatch={() => watch.mutate(preview.id)}
        focusOnMount={dealtByClick}
      />
    );
  } else if (dealt.isError) {
    body = (
      <DealError
        error={dealt.error}
        shared={source.kind === "id"}
        retrying={dealt.isFetching}
        onRetry={() => void dealt.refetch()}
        onRandom={randomBout}
      />
    );
  } else {
    body = <TapeSkeleton />;
  }

  const onScreen = current?.bout ?? preview;

  return (
    <div ref={rootRef} className="scroll-mt-28 space-y-5 md:scroll-mt-24">
      {sample && (
        <div role="status" className="v2-toast v2-toast--warning">
          <div>
            <span className="v2-toast-title">Sample data</span>
            The VERSUS engine isn&apos;t answering on this server yet, so these races are a synthetic stand-in
            (development only).
          </div>
          <span />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={randomBout} className={pillClass("glass")}>
          <DiceIcon /> Random bout
        </button>
        <button
          type="button"
          onClick={() => setFormOpen((open) => !open)}
          aria-expanded={formOpen}
          aria-controls={formOpen ? formId : undefined}
          className={pillClass("ghost")}
        >
          Pick two Chogs
        </button>
        <Stats />
      </div>

      {formOpen && (
        <PickTwo
          id={formId}
          metadataIds={metadataIds}
          initial={onScreen ? { a: onScreen.a.tokenId, b: onScreen.b.tokenId } : undefined}
          onStart={pairBout}
          onCancel={() => setFormOpen(false)}
        />
      )}

      {body}
    </div>
  );
}

function Stats() {
  const { data } = useVersusStats();
  if (!data || data.bouts < 10) return null;
  const format = (n: number) => new Intl.NumberFormat("en-US").format(n);
  return (
    <p className="v2-chip ml-auto">
      <span className="v2-num text-[var(--v2-ink)]">{format(data.bouts)}</span> bouts dealt ·{" "}
      <span className="v2-num text-[var(--v2-ink)]">{format(data.picks)}</span> picks
    </p>
  );
}

function DealError({
  error,
  shared,
  retrying,
  onRetry,
  onRandom,
}: {
  error: Error;
  shared: boolean;
  retrying: boolean;
  onRetry: () => void;
  onRandom: () => void;
}) {
  const missing = error instanceof VersusApiError && error.status === 404;
  return (
    <div role="alert" className="v2-empty">
      <span className="v2-icon-tile v2-icon-tile--lg" aria-hidden>
        <RewindIcon />
      </span>
      <p className="v2-empty-title">{missing && shared ? "This bout can't be replayed here" : "Couldn't deal this bout"}</p>
      <p className="v2-empty-body">{error.message}</p>
      <div className="v2-empty-actions">
        <button type="button" onClick={onRandom} className={pillClass("primary")}>
          <DiceIcon /> Deal a random bout
        </button>
        {!missing && (
          <button type="button" onClick={onRetry} disabled={retrying} className={pillClass("glass")}>
            {retrying ? "Retrying…" : "Try again"}
          </button>
        )}
      </div>
      <p className="v2-note">
        Meanwhile, every Chog is still trading:{" "}
        <Link href="/league" className="v2-link">
          meet all 1,969 in the League
        </Link>
      </p>
    </div>
  );
}

/** Suspense fallback while the page reads its params. */
export function VersusArenaSkeleton() {
  return (
    <div className="space-y-5">
      <div aria-hidden className="flex gap-2">
        <span className={`${pillClass("glass")} opacity-50`}>Random bout</span>
        <span className={`${pillClass("ghost")} opacity-50`}>Pick two Chogs</span>
      </div>
      <TapeSkeleton />
    </div>
  );
}
