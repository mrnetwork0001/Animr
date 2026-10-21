"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState, useTransition } from "react";
import { randomChogId } from "@/components/dna/shared";
import { useHiddenChogs } from "@/components/hidden-chogs";
import { pillClass } from "@/components/v2/primitives";
import { type ChogQuery, chogQueryText, parseChogQuery } from "@/lib/chog-id";

type Side = "a" | "b";

/** "Pick two parents": token ids or marketplace names ("CHOG #1462"), or a random pair. Navigates to /breed?a=&b=. */
export function BreedPicker({ initial, nameNumbers }: { initial?: { a: number; b: number }; nameNumbers: readonly number[] }) {
  const router = useRouter();
  const hidden = useHiddenChogs();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState<Record<Side, string>>({
    a: initial ? String(initial.a) : "",
    b: initial ? String(initial.b) : "",
  });
  const [problem, setProblem] = useState<string | null>(null);
  const errorId = useId();
  const parsed: Record<Side, ChogQuery> = { a: parseChogQuery(text.a, nameNumbers), b: parseChogQuery(text.b, nameNumbers) };

  const go = (a: number, b: number) => {
    setProblem(null);
    startTransition(() => router.push(`/breed?a=${a}&b=${b}`, { scroll: false }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const a = parsed.a;
    const b = parsed.b;
    if (a.kind !== "ok" || b.kind !== "ok") {
      const bad = a.kind === "invalid" ? a : b.kind === "invalid" ? b : null;
      return setProblem(bad?.kind === "invalid" ? bad.message : "Name both parents, or try a random pair.");
    }
    if (a.tokenId === b.tokenId) return setProblem("A Chog can't breed with itself. Pick two different Chogs.");
    go(a.tokenId, b.tokenId);
  };

  const randomPair = () => {
    const a = randomChogId(undefined, hidden);
    const b = randomChogId(a, hidden);
    setText({ a: String(a), b: String(b) });
    go(a, b);
  };

  return (
    <form onSubmit={submit} noValidate aria-describedby={problem ? errorId : undefined} aria-busy={pending} className="v2-card v2-card--tight">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] md:items-end">
        <Field side="a" value={text.a} parsed={parsed.a} onChange={(v) => setText((t) => ({ ...t, a: v }))} />
        <span aria-hidden className="hidden pb-3 text-center text-lg text-[var(--v2-faint)] md:block">
          +
        </span>
        <Field side="b" value={text.b} parsed={parsed.b} onChange={(v) => setText((t) => ({ ...t, b: v }))} />
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={pillClass("hero")} disabled={pending}>
            {pending ? "Breeding…" : "Breed them"}
          </button>
          <button type="button" onClick={randomPair} className={pillClass("glass")} disabled={pending}>
            Random pair
          </button>
        </div>
      </div>
      {problem && (
        <p id={errorId} role="alert" className="mt-3 text-sm text-[var(--v2-danger)]">
          {problem}
        </p>
      )}
    </form>
  );
}

function Field({ side, value, parsed, onChange }: { side: Side; value: string; parsed: ChogQuery; onChange: (value: string) => void }) {
  const inputId = useId();
  const hintId = useId();
  const hint =
    parsed.kind === "ok"
      ? parsed.nameNumber
        ? `CHOG #${parsed.nameNumber} · token ${parsed.tokenId}`
        : `token ${parsed.tokenId}`
      : parsed.kind === "invalid"
        ? parsed.message
        : "A token id or CHOG #1462";
  return (
    <div className="v2-field min-w-0">
      <label htmlFor={inputId} className="v2-label">
        Parent {side.toUpperCase()}
      </label>
      <input
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        inputMode="text"
        placeholder="7 or CHOG #1462"
        aria-invalid={parsed.kind === "invalid" || undefined}
        aria-describedby={hintId}
        className="v2-input"
      />
      <p id={hintId} aria-live="polite" className={`v2-help truncate ${parsed.kind === "invalid" ? "text-[var(--v2-danger)]" : ""}`}>
        {hint}
        {parsed.kind === "ok" && parsed.other ? (
          <>
            {" · "}
            <button type="button" className="v2-link" onClick={() => onChange(chogQueryText(parsed.other!))}>
              or {parsed.other.via === "name" ? `CHOG #${parsed.other.nameNumber}` : `token ${parsed.other.tokenId}`}?
            </button>
          </>
        ) : null}
      </p>
    </div>
  );
}
