"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { SearchIcon } from "@/components/v2/icons";
import { type ChogQueryHit, chogLabel, parseChogQuery } from "@/lib/chog-id";

/**
 * The profile header's search: a token id ("1") or a Chog's name ("CHOG #1462", "#1462", "1462 (name)") opens that
 * Chog's profile. Both readings of a typed number are offered, each labelled with both numbers ("CHOG #1462 ·
 * token 1"); Enter takes the first (a bare number is a token id). `nameNumbers[id - 1]` is token id's name number.
 */
export function ChogJump({ nameNumbers, className = "" }: { nameNumbers: readonly number[]; className?: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  // Results show while the search has focus (the input or a result), so they never linger over the page.
  const [focused, setFocused] = useState(false);
  const inputId = useId();
  const resultsId = useId();
  const parsed = parseChogQuery(text, nameNumbers);
  const open = focused && text.trim().length > 0;

  const go = (tokenId: number) => {
    setText("");
    router.push(`/chog/${tokenId}`);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (parsed.kind === "ok") go(parsed.tokenId);
  };

  return (
    <form
      role="search"
      onSubmit={submit}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
      className={`relative w-full sm:w-80 ${className}`}
    >
      <label htmlFor={inputId} className="v2-sr">
        Find a Chog by token id or name
      </label>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-[var(--v2-faint)]" />
      <input
        id={inputId}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && setText("")}
        placeholder="Find a Chog: 1 or CHOG #1462"
        enterKeyHint="go"
        autoComplete="off"
        spellCheck={false}
        aria-controls={open ? resultsId : undefined}
        aria-invalid={parsed.kind === "invalid" ? true : undefined}
        className="v2-input h-11 rounded-[var(--v2-r-pill)] pl-10 text-sm"
      />
      {open && (
        <div
          id={resultsId}
          aria-live="polite"
          className="v2-glass--strong absolute inset-x-0 top-full z-30 mt-2 rounded-[var(--v2-r-md)] p-1.5 text-[length:var(--v2-fs-sm)]"
        >
          {parsed.kind === "invalid" ? (
            <p className="m-0 px-2.5 py-2 text-xs text-[var(--v2-danger)]">{parsed.message}</p>
          ) : parsed.kind === "ok" ? (
            <ul className="m-0 list-none p-0">
              <JumpRow hit={parsed} via={parsed.via} primary onGo={go} />
              {parsed.other && <JumpRow hit={parsed.other} via={parsed.other.via} onGo={go} />}
            </ul>
          ) : null}
        </div>
      )}
    </form>
  );
}

function JumpRow({
  hit,
  via,
  primary = false,
  onGo,
}: {
  hit: ChogQueryHit;
  via: "token" | "name";
  primary?: boolean;
  onGo: (tokenId: number) => void;
}) {
  return (
    <li>
      <Link
        href={`/chog/${hit.tokenId}`}
        onClick={(event) => {
          event.preventDefault();
          onGo(hit.tokenId);
        }}
        className="flex items-baseline justify-between gap-3 rounded-[var(--v2-r-sm)] px-2.5 py-2 text-[var(--v2-ink)] no-underline transition-colors hover:bg-white/[0.05]"
      >
        <span className="min-w-0 truncate">
          {!primary && <span className="text-[var(--v2-faint)]">Or </span>}
          <span className="font-medium">{chogLabel(hit.tokenId, { number: hit.nameNumber })}</span>
        </span>
        <span className="shrink-0 text-[11px] text-[var(--v2-faint)]">
          {via === "token" ? "by token id" : "by name"}
          {primary && <span aria-hidden> · Enter</span>}
        </span>
      </Link>
    </li>
  );
}
