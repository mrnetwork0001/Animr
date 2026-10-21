"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import { type FormEvent, useEffect, useId, useState } from "react";
import type { GenomeResponse } from "@/components/dna/api";
import { dnaKeys } from "@/components/dna/api";
import { randomChogId } from "@/components/dna/shared";
import { useHiddenChogs } from "@/components/hidden-chogs";
import { pillClass } from "@/components/v2/primitives";
import { DiceIcon, Portrait, SIDE_TONE, StyleTag, VsBadge } from "./bits";
import { type ParsedFighter, type Side, parseFighterInput } from "./shared";

type PickTwoProps = {
  id: string;
  /** `metadataIds[id - 1]` is token #id's marketplace number ("CHOG #1462" is token #1). */
  metadataIds: readonly number[];
  /** Prefill: the bout on screen. */
  initial?: { a: number; b: number };
  /** Token ids; null asks the engine for a random rival. */
  onStart: (a: number | null, b: number | null) => void;
  onCancel: () => void;
};

/** "Pick two Chogs": token ids or metadata names ("CHOG #1462"), each shown under both labels. */
export function PickTwo({ id, metadataIds, initial, onStart, onCancel }: PickTwoProps) {
  const [text, setText] = useState<Record<Side, string>>({
    a: initial ? String(initial.a) : "",
    b: initial ? String(initial.b) : "",
  });
  const [problem, setProblem] = useState<string | null>(null);
  const headingId = useId();
  const errorId = useId();
  const parsed: Record<Side, ParsedFighter> = {
    a: parseFighterInput(text.a, metadataIds),
    b: parseFighterInput(text.b, metadataIds),
  };
  const tokenOf = (side: Side) => {
    const p = parsed[side];
    return p.kind === "ok" ? p.tokenId : null;
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (parsed.a.kind === "invalid" || parsed.b.kind === "invalid") {
      return setProblem("One of those isn't a Chog yet: fix it, or leave it empty for a random rival.");
    }
    const a = tokenOf("a");
    const b = tokenOf("b");
    if (a === null && b === null) return setProblem("Name at least one Chog. Leave the other empty for a random rival.");
    if (a !== null && a === b) return setProblem("A Chog can't race itself. Pick two different Chogs.");
    setProblem(null);
    onStart(a, b);
  };

  const set = (side: Side, value: string) => {
    setProblem(null);
    setText((current) => ({ ...current, [side]: value }));
  };

  return (
    <form
      id={id}
      onSubmit={submit}
      noValidate
      aria-labelledby={headingId}
      aria-describedby={problem ? errorId : undefined}
      className="v2-card vs-stage"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="grid gap-2">
          <p className="v2-kicker">Pick two</p>
          <h2 id={headingId} className="v2-h3">
            Choose the fighters
          </h2>
        </div>
        <p className="v2-note max-w-md">
          A token id (<span className="v2-mono">7</span>) or the name marketplaces show (
          <span className="v2-mono">CHOG #1462</span>). Leave one empty for a random rival.
        </p>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-stretch md:gap-8">
        <Field side="a" value={text.a} parsed={parsed.a} other={tokenOf("b")} metadataIds={metadataIds} onChange={(v) => set("a", v)} />
        <VsBadge className="hidden md:flex" />
        <Field side="b" value={text.b} parsed={parsed.b} other={tokenOf("a")} metadataIds={metadataIds} onChange={(v) => set("b", v)} />
      </div>

      {problem && (
        <p id={errorId} role="alert" className="mt-4 text-sm text-[var(--v2-danger)]">
          {problem}
        </p>
      )}
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="submit" className={pillClass("primary")}>
          Start the bout
        </button>
        <button type="button" onClick={onCancel} className={pillClass("ghost")}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function Field({
  side,
  value,
  parsed,
  other,
  metadataIds,
  onChange,
}: {
  side: Side;
  value: string;
  parsed: ParsedFighter;
  other: number | null;
  metadataIds: readonly number[];
  onChange: (value: string) => void;
}) {
  const inputId = useId();
  const hintId = useId();
  // The dice never lands on a Chog its holder hid.
  const hidden = useHiddenChogs();
  const tokenId = parsed.kind === "ok" ? parsed.tokenId : undefined;
  const settled = useDebounced(tokenId, 250);
  // Same cache entry as the genome card's useGenome: { chog, genome } from /api/dna/[tokenId].
  const dna = useQuery({
    queryKey: dnaKeys.genome(settled ?? 0),
    queryFn:
      settled === undefined
        ? skipToken
        : async () => {
            const res = await fetch(`/api/dna/${settled}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return (await res.json()) as GenomeResponse;
          },
    staleTime: Infinity,
    retry: 1,
  });
  const info = tokenId !== undefined && settled === tokenId ? dna.data : undefined;
  const metadataNumber = tokenId !== undefined ? metadataIds[tokenId - 1] : 0;

  return (
    <div className={`v2-field min-w-0 rounded-[var(--v2-r-lg)] border border-[var(--v2-line-soft)] bg-[rgb(255_255_255/0.015)] p-4 ${SIDE_TONE[side].side}`}>
      <label htmlFor={inputId} className="vs-text text-[11px] font-medium tracking-[0.16em] uppercase">
        Chog {side.toUpperCase()}
      </label>
      <div className="v2-input-group">
        <input
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="7 or CHOG #1462"
          aria-invalid={parsed.kind === "invalid" || undefined}
          aria-describedby={hintId}
          className="v2-input"
        />
        <button
          type="button"
          onClick={() => onChange(String(randomChogId(other ?? undefined, hidden)))}
          className={`${pillClass("glass", "sm")} shrink-0`}
          aria-label={`Random Chog ${side.toUpperCase()}`}
          title="Random Chog"
        >
          <DiceIcon /> Random
        </button>
      </div>

      <div id={hintId} aria-live="polite" className="min-h-12 text-xs">
        {parsed.kind === "empty" ? (
          <p className="pt-1 text-[var(--v2-faint)]">Empty: a random rival.</p>
        ) : parsed.kind === "invalid" ? (
          <p className="pt-1 text-[var(--v2-danger)]">{parsed.message}</p>
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <Portrait side={side} image={info?.chog.image} tokenId={parsed.tokenId} size={44} />
            <div className="min-w-0">
              <p className="truncate text-[var(--v2-ink)]">
                {metadataNumber ? `CHOG #${metadataNumber} · ` : ""}token {parsed.tokenId}
              </p>
              <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[var(--v2-nav)]">
                {info ? (
                  <>
                    <span className="truncate">{info.genome.archetype}</span>
                    <StyleTag style={info.genome.style} />
                  </>
                ) : dna.isError ? (
                  <span>Its DNA didn&apos;t load, but it can still race.</span>
                ) : (
                  <span className="text-[var(--v2-faint)]">Reading its DNA…</span>
                )}
              </p>
              {parsed.alternative && (
                <button
                  type="button"
                  onClick={() => onChange(String(parsed.alternative!.tokenId))}
                  className="v2-link mt-1 text-left"
                >
                  {parsed.alternative.hint}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
