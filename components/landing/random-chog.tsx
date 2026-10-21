"use client";

import { useRouter } from "next/navigation";
import { type MouseEvent, type ReactNode, useEffect, useState } from "react";

type RandomChogLinkProps = {
  /** Token ids it may land on, inclusive. */
  min: number;
  max: number;
  /** Never these: Chogs whose art carries flagged words (lib/brand-safety.ts), from the server. */
  exclude: readonly number[];
  /** A brand-safe Chog for the link before hydration, or if no draw succeeds. */
  fallbackId: number;
  className?: string;
  children: ReactNode;
};

// The Chogs their holders hid ("Hide my Chog"): this page is static, so the list is read in the browser (GET
// /api/optout, CDN-cached ~15 s) once the page is idle, and shared by every Random Chog link on it. Until it
// arrives (or if it can't), draws skip the flagged Chogs only; a hidden Chog's replay page says it's hidden.
let hiddenIds: ReadonlySet<number> = new Set();
let hiddenRequest: Promise<void> | undefined;

function loadHiddenIds(): Promise<void> {
  hiddenRequest ??= fetch("/api/optout")
    .then((res) => (res.ok ? res.json() : null))
    .then((body: { hiddenIds?: unknown } | null) => {
      const ids = Array.isArray(body?.hiddenIds) ? body.hiddenIds : [];
      hiddenIds = new Set(ids.filter((id): id is number => Number.isSafeInteger(id)));
    })
    .catch(() => {
      // Try again on the next page view.
      hiddenRequest = undefined;
    });
  return hiddenRequest;
}

/**
 * "Random Chog": opens a random brand-safe Chog's replay (/replay/[id]). A plain link to
 * `fallbackId` until hydration; then every click draws a new Chog. The draw happens in event
 * handlers only, never while rendering, so the page still prerenders. Hovering or focusing it
 * draws one ahead of time, so opening it in a new tab lands on a random Chog too.
 */
export function RandomChogLink({ min, max, exclude, fallbackId, className = "", children }: RandomChogLinkProps) {
  const router = useRouter();
  const [next, setNext] = useState<number | null>(null);

  useEffect(() => {
    const load = () => void loadHiddenIds();
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(load, { timeout: 4_000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = setTimeout(load, 1_500);
    return () => clearTimeout(timer);
  }, []);

  const draw = (): number => {
    const skip = new Set(exclude);
    for (let attempt = 0; attempt < 64; attempt++) {
      const id = min + Math.floor(Math.random() * (max - min + 1));
      if (!skip.has(id) && !hiddenIds.has(id)) return id;
    }
    return fallbackId;
  };
  const prepare = () => {
    void loadHiddenIds();
    if (next === null || hiddenIds.has(next)) setNext(draw());
  };

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // New tab, new window, download: let the browser follow the href (already a random Chog once prepared).
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const id = next !== null && !hiddenIds.has(next) ? next : draw();
    router.push(`/replay/${id}`);
    // The next click (after coming back) lands somewhere else.
    setNext(draw());
  };

  return (
    <a
      href={`/replay/${next ?? fallbackId}`}
      onClick={onClick}
      onPointerEnter={prepare}
      onFocus={prepare}
      className={className}
    >
      {children}
    </a>
  );
}
