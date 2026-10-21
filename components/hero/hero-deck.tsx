"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useReducer, useRef } from "react";
import { heroDeck } from "./content";
import type { DeckChog } from "./deck-data";

// The hero's artwork: a deck of real Chogs in perspective. Five cards are in the DOM: four on show, one
// hidden at the back where a card's Chog is swapped while nobody can see it. Every few seconds the front card
// slides out and tucks behind the deck, the others step forward, and a new Chog fades in at the back.
//
// The page is prerendered, so the first deal is heroDeck.ids' first five (the front one is the LCP image).
// After load, the rest of the pool is shuffled in the browser and the three back cards are re-dealt at random
// behind a quick veil; the front card stays until its first cycle. Hidden Chogs ("Hide my Chog", GET
// /api/optout) never come up once that list has loaded.
//
// Motion is CSS (hero.css): each card's pose comes from its data-slot; this file only moves slots, swaps
// faces and sets the pointer tilt. No cycling, sheen or tilt with reduced motion: a still, fanned deck.
// Cycling also pauses while the deck is off screen, the tab is hidden, or the front card is hovered/focused.

const CARDS = 5;
/** How long the front card stays in front. */
const CYCLE_MS = 4200;
/** hero.css hx-deck-leave: the front card's trip to the back. Its face is swapped after it. */
const LEAVE_MS = 1400;
/** hero.css .hx-deck-card[data-dip]: the veil's fade before a visible card's face is swapped. */
const DIP_MS = 260;
const IMAGE_TIMEOUT_MS = 8000;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const FINE_POINTER = "(hover: hover) and (pointer: fine)";

type Face = { chog: DeckChog; url: string };
type DeckState = { front: number; leaving: number | null; faces: Face[] };
type DeckAction = { type: "advance" } | { type: "face"; index: number; face: Face };

function reduce(state: DeckState, action: DeckAction): DeckState {
  if (action.type === "advance") {
    return { ...state, front: (state.front + 1) % state.faces.length, leaving: state.front };
  }
  const faces = state.faces.slice();
  faces[action.index] = action.face;
  return { ...state, faces };
}

function shuffle<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Loads and decodes a Chog's image: the self-hosted copy, else the IPFS gateway. Null if neither arrives. */
async function loadFace(chog: DeckChog): Promise<Face | null> {
  for (const url of [chog.src, chog.fallbackSrc]) {
    try {
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      img.src = url;
      await Promise.race([
        img.decode(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), IMAGE_TIMEOUT_MS)),
      ]);
      if (img.naturalWidth > 0) return { chog, url };
    } catch {
      // Next source.
    }
  }
  return null;
}

/** Every hidden Chog's token id, or none if the list can't be read (the curated pool is brand-safe already). */
async function loadHiddenIds(): Promise<ReadonlySet<number>> {
  try {
    const res = await fetch("/api/optout", { signal: AbortSignal.timeout(4000) });
    const body = res.ok ? ((await res.json()) as { hiddenIds?: unknown }) : null;
    const ids = Array.isArray(body?.hiddenIds) ? body.hiddenIds : [];
    return new Set(ids.filter((id): id is number => Number.isSafeInteger(id)));
  } catch {
    return new Set();
  }
}

const slotOf = (index: number, front: number, count: number) => (index - front + count) % count;

export function HeroDeck({ chogs }: { chogs: DeckChog[] }) {
  const [state, dispatch] = useReducer(reduce, chogs, (pool) => ({
    front: 0,
    leaving: null,
    faces: pool.slice(0, CARDS).map((chog) => ({ chog, url: chog.src })),
  }));
  const deckRef = useRef<HTMLDivElement>(null);
  // The latest state, for timers and listeners (written after each commit, read only outside render).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const count = state.faces.length;

  // Shuffle, re-deal the back cards, then cycle while the deck can be seen.
  useEffect(() => {
    const deck = deckRef.current;
    if (!deck || count < 3) return;
    const root = deck.closest<HTMLElement>("[data-hx-state]");
    const reduced = matchMedia(REDUCED_MOTION);
    let hidden: ReadonlySet<number> = new Set();
    let queue: DeckChog[] = [];
    let busy = 0;
    let onScreen = true;
    let held = false;
    let disposed = false;
    let cycleTimer: ReturnType<typeof setTimeout> | undefined;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!disposed) fn();
      }, ms);
      timers.add(timer);
    };

    const shown = () => new Set(stateRef.current.faces.map((face) => face.chog.tokenId));
    /** The next Chog to deal: shuffled, never one on show, never a hidden one. */
    const takeNext = (): DeckChog | undefined => {
      const onShow = shown();
      for (let refills = 0; refills < 2; refills++) {
        while (queue.length > 0) {
          const chog = queue.shift()!;
          if (!onShow.has(chog.tokenId) && !hidden.has(chog.tokenId)) return chog;
        }
        queue = shuffle(chogs.filter((chog) => !onShow.has(chog.tokenId) && !hidden.has(chog.tokenId)));
      }
      return undefined;
    };
    /** A loaded face for card `index`; with `dip`, the card veils itself while the face changes. */
    const redeal = async (index: number, dip: boolean) => {
      busy++;
      try {
        for (let attempt = 0; attempt < 4; attempt++) {
          const chog = takeNext();
          if (!chog) return;
          const face = await loadFace(chog);
          if (disposed) return;
          if (!face) continue;
          const card = deck.querySelector<HTMLElement>(`[data-card="${index}"]`);
          if (dip && card && !reduced.matches) {
            card.dataset.dip = "";
            await new Promise((resolve) => later(() => resolve(null), DIP_MS));
            // The new <img> clears data-dip once it has loaded (onLoad below).
          }
          dispatch({ type: "face", index, face });
          return;
        }
      } finally {
        busy--;
      }
    };

    const canCycle = () => !reduced.matches && onScreen && !held && !document.hidden;
    const step = () => {
      cycleTimer = undefined;
      if (!canCycle()) return;
      // Still dealing, or the entrance is still playing: try again shortly.
      if (busy > 0 || root?.dataset.hxState === "run") {
        cycleTimer = setTimeout(step, 700);
        return;
      }
      const { front } = stateRef.current;
      const back = (front + count - 1) % count;
      const backImg = deck.querySelector<HTMLImageElement>(`[data-card="${back}"] img`);
      // The card about to appear at the back must be ready; else deal it a new face first.
      if (!backImg || !backImg.complete || backImg.naturalWidth === 0) {
        if (backImg?.complete) void redeal(back, false);
        cycleTimer = setTimeout(step, 700);
        return;
      }
      dispatch({ type: "advance" });
      // Once the old front has tucked in behind, give it the next Chog.
      later(() => void redeal(front, false), LEAVE_MS + 50);
      schedule();
    };
    const schedule = () => {
      clearTimeout(cycleTimer);
      cycleTimer = canCycle() ? setTimeout(step, CYCLE_MS) : undefined;
    };

    // After the page has settled: read the hidden list, shuffle, re-deal the back cards.
    const start = async () => {
      hidden = await loadHiddenIds();
      if (disposed) return;
      queue = shuffle(chogs.filter((chog) => !shown().has(chog.tokenId) && !hidden.has(chog.tokenId)));
      const { front } = stateRef.current;
      const jobs: Promise<void>[] = [];
      for (let index = 0; index < count; index++) {
        const slot = slotOf(index, front, count);
        // The front card stays (it is the LCP image) unless its holder hid it.
        if (slot === 0 && !hidden.has(stateRef.current.faces[index].chog.tokenId)) continue;
        jobs.push(redeal(index, slot !== count - 1));
      }
      await Promise.all(jobs);
      if (!disposed) schedule();
    };
    let idle: number | undefined;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    if (typeof window.requestIdleCallback === "function") {
      idle = window.requestIdleCallback(() => void start(), { timeout: 1500 });
    } else {
      idleTimer = setTimeout(() => void start(), 600);
    }

    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      schedule();
    });
    observer.observe(deck);
    const hold = (value: boolean) => () => {
      held = value;
      schedule();
    };
    const onFocusOut = (event: FocusEvent) => {
      if (!deck.contains(event.relatedTarget as Node | null)) hold(false)();
    };
    const onEnter = hold(true);
    const onLeave = hold(false);
    deck.addEventListener("pointerenter", onEnter);
    deck.addEventListener("pointerleave", onLeave);
    deck.addEventListener("focusin", onEnter);
    deck.addEventListener("focusout", onFocusOut);
    document.addEventListener("visibilitychange", schedule);
    reduced.addEventListener("change", schedule);

    return () => {
      disposed = true;
      if (idle !== undefined) window.cancelIdleCallback(idle);
      clearTimeout(idleTimer);
      clearTimeout(cycleTimer);
      timers.forEach(clearTimeout);
      observer.disconnect();
      deck.removeEventListener("pointerenter", onEnter);
      deck.removeEventListener("pointerleave", onLeave);
      deck.removeEventListener("focusin", onEnter);
      deck.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("visibilitychange", schedule);
      reduced.removeEventListener("change", schedule);
    };
  }, [chogs, count]);

  // The pointer tilt: desktop pointers only, never with reduced motion. One write per frame.
  useEffect(() => {
    const deck = deckRef.current;
    if (!deck) return;
    const fine = matchMedia(FINE_POINTER);
    const reduced = matchMedia(REDUCED_MOTION);
    let frame = 0;
    let x = 0;
    let y = 0;
    const paint = () => {
      frame = 0;
      deck.style.setProperty("--tilt-x", x.toFixed(3));
      deck.style.setProperty("--tilt-y", y.toFixed(3));
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !fine.matches || reduced.matches) return;
      const rect = deck.getBoundingClientRect();
      if (rect.width === 0) return;
      const clamp = (value: number) => Math.max(-1, Math.min(1, value));
      x = clamp((event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.9));
      y = clamp((event.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.9));
      deck.dataset.tilt = "";
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const onOut = (event: PointerEvent) => {
      if (event.relatedTarget) return;
      x = 0;
      y = 0;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onOut);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onOut);
    };
  }, []);

  return (
    <div ref={deckRef} className="hx-deck" style={{ "--tilt-x": 0, "--tilt-y": 0 } as CSSProperties}>
      <div className="hx-deck-rig">
        {state.faces.map((face, index) => {
          const slot = slotOf(index, state.front, count);
          const { chog } = face;
          const front = slot === 0;
          return (
            <div
              key={index}
              className="hx-deck-card"
              data-card={index}
              data-slot={slot}
              data-leaving={state.leaving === index ? "" : undefined}
              inert={!front}
            >
              <Link
                href={`/chog/${chog.tokenId}`}
                prefetch={false}
                className="hx-deck-link"
                aria-label={heroDeck.openLabel(chog.name, chog.number)}
              >
                <span className="hx-deck-face" aria-hidden="true">
                  <span className="hx-deck-art">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a fixed 600px copy (IPFS fallback): nothing to resize */}
                    <img
                      key={face.url}
                      src={face.url}
                      alt=""
                      width={heroDeck.imageSize}
                      height={heroDeck.imageSize}
                      decoding="async"
                      loading={index === 0 ? "eager" : "lazy"}
                      fetchPriority={index === 0 ? "high" : "low"}
                      referrerPolicy="no-referrer"
                      draggable={false}
                      onLoad={(event) => {
                        delete event.currentTarget.closest<HTMLElement>("[data-card]")?.dataset.dip;
                      }}
                      onError={(event) => {
                        // The self-hosted copy failed: try the gateway once; past that, the card hides its art
                        // (the frame and caption stay) and the next cycle deals it a new Chog.
                        if (face.url !== chog.fallbackSrc) {
                          dispatch({ type: "face", index, face: { chog, url: chog.fallbackSrc } });
                        } else {
                          event.currentTarget.dataset.broken = "";
                        }
                      }}
                    />
                    <span className="hx-deck-foil" />
                  </span>
                  <span className="hx-deck-cap">
                    <span className="hx-deck-name">{chog.name}</span>
                    <span className="hx-deck-meta">
                      <span className="hx-deck-number">{chog.number}</span>
                      <span className="hx-deck-style">{chog.style}</span>
                    </span>
                  </span>
                  <span className="hx-deck-sheen" />
                </span>
                <span className="hx-deck-veil" aria-hidden="true" />
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
