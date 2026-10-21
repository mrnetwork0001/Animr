"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import { type FormEvent, useEffect, useId, useState } from "react";
import type { GenomeResponse } from "@/components/dna/api";
import { dnaKeys } from "@/components/dna/api";
import { randomChogId } from "@/components/dna/shared";
import { useHiddenChogs } from "@/components/hidden-chogs";
import { DiceIcon, Portrait, SIDE_TONE, StyleTag } from "./bits";
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
      className="card p-4 sm:p-5"
    >
      <h2 id={headingId} className="text-base font-semibold tracking-tight">
        Pick two Chogs
      </h2>
      <p className="mt-1 text-xs text-muted">
        Type a token id (<span className="font-mono">7</span>) or the name marketplaces show (
        <span className="font-mono">CHOG #1462</span>). Leave one empty for a random rival.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-start">
        <Field side="a" value={text.a} parsed={parsed.a} other={tokenOf("b")} metadataIds={metadataIds} onChange={(v) => set("a", v)} />
        <span aria-hidden className="hidden pt-8 text-sm font-black text-subtle sm:block">
          VS
        </span>
        <Field side="b" value={text.b} parsed={parsed.b} other={tokenOf("a")} metadataIds={metadataIds} onChange={(v) => set("b", v)} />
      </div>

      {problem && (
        <p id={errorId} role="alert" className="mt-3 text-sm text-danger">
          {problem}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary">
          Deal this bout
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">
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
    <div className="min-w-0">
      <label htmlFor={inputId} className={`text-xs font-semibold tracking-wider uppercase ${SIDE_TONE[side].text}`}>
        Chog {side.toUpperCase()}
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="7 or CHOG #1462"
          aria-invalid={parsed.kind === "invalid" || undefined}
          aria-describedby={hintId}
          className="input min-w-0 flex-1 py-2"
        />
        <button
          type="button"
          onClick={() => onChange(String(randomChogId(other ?? undefined, hidden)))}
          className="btn btn-secondary shrink-0 px-3"
          aria-label={`Random Chog ${side.toUpperCase()}`}
          title="Random Chog"
        >
          <DiceIcon />
        </button>
      </div>

      <div id={hintId} aria-live="polite" className="mt-2 min-h-11 text-xs">
        {parsed.kind === "empty" ? (
          <p className="pt-1 text-subtle">Empty: a random rival.</p>
        ) : parsed.kind === "invalid" ? (
          <p className="pt-1 text-danger">{parsed.message}</p>
        ) : (
          <div className="flex min-w-0 items-center gap-2.5">
            <Portrait side={side} image={info?.chog.image} tokenId={parsed.tokenId} size={40} className="rounded-lg" />
            <div className="min-w-0">
              <p className="truncate font-mono text-foreground">
                {metadataNumber ? `CHOG #${metadataNumber} · ` : ""}token #{parsed.tokenId}
              </p>
              <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-muted">
                {info ? (
                  <>
                    <span className="truncate">{info.genome.archetype}</span>
                    <StyleTag style={info.genome.style} />
                  </>
                ) : dna.isError ? (
                  <span>Its DNA didn&apos;t load, but it can still race.</span>
                ) : (
                  <span className="text-subtle">Reading its DNA…</span>
                )}
              </p>
              {parsed.alternative && (
                <button
                  type="button"
                  onClick={() => onChange(String(parsed.alternative!.tokenId))}
                  className="mt-0.5 text-left text-accent-strong hover:underline"
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
