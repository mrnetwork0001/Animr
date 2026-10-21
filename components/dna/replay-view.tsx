"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, type RefObject, useId, useRef, useState } from "react";
import { chogLabel, parseChogQuery } from "@/lib/chog-id";
import { useHiddenChogs } from "../hidden-chogs";
import { useGenome, useStanding } from "./api";
import { ChogThumb } from "./chog-thumb";
import { GenomeCard, StyleChip } from "./genome-card";
import { DiceIcon } from "./icons";
import { CHOG_COUNT, DEFAULT_WINDOW, formatInt, parseChogId, randomChogId } from "./shared";
import { TimeMachine } from "./time-machine";

/**
 * The shareable /replay/[tokenId] page body: who this Chog is, its Time Machine, its genome and the
 * way to wake it up for real. `?vs=<id>` turns the replay into a race against another Chog. `nameNumbers`
 * (token id -> the number in its name, "CHOG #1462" is token 1) labels every Chog with both numbers.
 */
export function ReplayView({ tokenId, nameNumbers = [] }: { tokenId: number; nameNumbers?: readonly number[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const vs = parseChogId(params.get("vs"));
  const rivalId = vs !== null && vs !== tokenId ? vs : undefined;
  const hidden = useHiddenChogs();
  const labelOf = (id: number) => chogLabel(id, { number: nameNumbers[id - 1] || null });
  const label = labelOf(tokenId);
  // VERSUS: the same pair (or this Chog and a random rival) on a hidden 48 hours, picked before the race.
  const versusHref = rivalId === undefined ? `/versus?a=${tokenId}` : `/versus?a=${tokenId}&b=${rivalId}`;
  const genome = useGenome(tokenId);
  // The rank and claimed badge: this Chog's league row only, not the whole ~0.5 MB population.
  const standing = useStanding(tokenId, DEFAULT_WINDOW);
  const row = standing.data?.row;
  const challengeRef = useRef<HTMLInputElement>(null);

  const setRival = (id?: number) =>
    router.replace(id ? `/replay/${tokenId}?vs=${id}` : `/replay/${tokenId}`, { scroll: false });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-5">
          <ChogThumb
            image={genome.data?.chog.image}
            tokenId={tokenId}
            size={96}
            box="size-16 sm:size-24"
            eager
            alt={label}
            className="rounded-2xl ring-1 ring-line sm:rounded-3xl"
          />
          <div className="min-w-0">
            <p className="eyebrow">Trading DNA · {label}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance sm:mt-2 sm:text-4xl">
              {genome.data?.genome.archetype ?? label}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted sm:mt-2">
              {/* Its persona name, as on the landing page and the League ("Rocket Ears"). */}
              {row && <span className="font-medium text-foreground">{row.name}</span>}
              {genome.data && <StyleChip style={genome.data.genome.style} />}
              {row && (
                <Link href={`/league?id=${tokenId}`} className="hover:text-foreground hover:underline">
                  #{formatInt(row.rank)} of {formatInt(standing.data?.total ?? CHOG_COUNT)} traders
                </Link>
              )}
              {row?.claimed && (
                <span className="rounded bg-success/10 px-1.5 py-px text-[10px] font-medium uppercase tracking-wider text-success ring-1 ring-inset ring-success/30">
                  Live AI awake
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch">
          <Link href={`/chog/${tokenId}`} className="btn btn-secondary">
            Meet this Chog
          </Link>
          <Link href={versusHref} className="btn btn-secondary">
            {rivalId === undefined ? "Race this Chog" : "Race them in VERSUS"}
          </Link>
          <button type="button" onClick={() => router.push(`/replay/${randomChogId(tokenId, hidden)}`)} className="btn btn-ghost">
            <DiceIcon /> Random Chog
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <TimeMachine
            tokenId={tokenId}
            rivalId={rivalId}
            nameNumbers={nameNumbers}
            onChallenge={() => challengeRef.current?.focus()}
          />
          <ChallengeBar
            tokenId={tokenId}
            rivalId={rivalId}
            onRival={setRival}
            inputRef={challengeRef}
            nameNumbers={nameNumbers}
            hidden={hidden}
            labelOf={labelOf}
          />
        </div>
        <div className="space-y-6">
          <GenomeCard tokenId={tokenId} hideIdentity />
          {rivalId !== undefined && <GenomeCard tokenId={rivalId} />}
        </div>
      </div>

      <WakeUp tokenId={tokenId} claimed={row?.claimed ?? false} />
    </div>
  );
}

function ChallengeBar({
  tokenId,
  rivalId,
  onRival,
  inputRef,
  nameNumbers,
  hidden,
  labelOf,
}: {
  tokenId: number;
  rivalId?: number;
  onRival: (id?: number) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  nameNumbers: readonly number[];
  hidden: ReadonlySet<number>;
  labelOf: (id: number) => string;
}) {
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    // A bare number is a token id; "CHOG #1462" or "#1462" is the number in a Chog's name (lib/chog-id.ts).
    const query = parseChogQuery(text, nameNumbers, CHOG_COUNT);
    if (query.kind === "empty") return setProblem(`Type a token id (1 to ${formatInt(CHOG_COUNT)}) or a name like CHOG #1462.`);
    if (query.kind === "invalid") return setProblem(query.message);
    const id = query.tokenId;
    if (id === tokenId) return setProblem("A Chog can't race itself. Pick another one.");
    setProblem(null);
    setText("");
    onRival(id);
  };

  return (
    <form onSubmit={submit} className="card flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5" noValidate>
      <label htmlFor={inputId} className="mr-1 text-sm font-medium">
        {rivalId === undefined ? "Challenge: race it against" : `Racing ${labelOf(rivalId)}. Swap for`}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoComplete="off"
        placeholder="7 or CHOG #1462"
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? errorId : undefined}
        className="input w-40 py-1.5"
      />
      <button type="submit" className="btn btn-secondary">
        Race
      </button>
      <button type="button" onClick={() => onRival(randomChogId(tokenId, hidden))} className="btn btn-ghost">
        Random rival
      </button>
      {rivalId !== undefined && (
        <button type="button" onClick={() => onRival(undefined)} className="btn btn-ghost sm:ml-auto">
          End race
        </button>
      )}
      {problem && (
        <p id={errorId} role="alert" className="w-full text-xs text-danger">
          {problem}
        </p>
      )}
    </form>
  );
}

function WakeUp({ tokenId, claimed }: { tokenId: number; claimed: boolean }) {
  return (
    <section
      aria-labelledby="wake-up-title"
      className="card relative overflow-hidden px-5 py-6 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:px-8"
    >
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 size-64 rounded-full bg-accent/15 blur-3xl" />
      <div className="relative max-w-2xl">
        <h2 id="wake-up-title" className="text-lg font-semibold tracking-tight">
          {claimed ? "This Chog is already awake" : "That was a replay. Wake it up for real."}
        </h2>
        <p className="mt-1.5 text-sm text-muted">
          {claimed
            ? "Its owner gave it a live brain: an LLM on 0G Compute that decides with this genome in mind, inside the Chog's own ERC-6551 wallet."
            : "Every Chog owns an ERC-6551 wallet. Its owner signs once to give it a live brain on 0G Compute that trades with this genome in mind. Sell the Chog and the trader, wallet and record go with it."}
        </p>
      </div>
      <div className="relative mt-4 flex shrink-0 flex-wrap gap-2 sm:mt-0">
        {claimed ? (
          <Link href={`/chog/${tokenId}`} className="btn btn-primary px-5 py-2.5">
            See its live AI
          </Link>
        ) : (
          <Link href={`/app?id=${tokenId}#lookup`} className="btn btn-primary px-5 py-2.5">
            Wake it up for real
          </Link>
        )}
        <Link href="/league" className="btn btn-secondary px-5 py-2.5">
          All 1,969 Chogs
        </Link>
      </div>
    </section>
  );
}

/** Suspense fallback while the page reads its params. */
export function ReplaySkeleton() {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">Loading the Time Machine…</span>
      <div aria-hidden className="flex items-center gap-5">
        <span className="size-24 animate-pulse rounded-3xl bg-surface-2" />
        <span className="flex-1 space-y-3">
          <span className="block h-3 w-40 animate-pulse rounded bg-surface-2" />
          <span className="block h-8 w-64 animate-pulse rounded bg-surface-2" />
          <span className="block h-3 w-52 animate-pulse rounded bg-surface-2/60" />
        </span>
      </div>
      <div aria-hidden className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="card h-[480px] animate-pulse sm:h-[560px]" />
        <div className="card h-[480px] animate-pulse" />
      </div>
    </div>
  );
}
