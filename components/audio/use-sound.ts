"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  type SoundName,
  type SoundState,
  getServerSoundState,
  getSoundState,
  playSound,
  setSoundAmbient,
  setSoundMoments,
  setSoundOn,
  setSoundVolume,
  startSound,
  subscribeSound,
} from "@/lib/audio/engine";

// The React side of lib/audio/engine.ts: the state, the controls and one-line hooks for the sound moments. Every hook
// is a no-op while sound is off, so a component calls it without a check.

export { playSound };
export type { SoundName, SoundState };

export function useSoundState(): SoundState {
  return useSyncExternalStore(subscribeSound, getSoundState, getServerSoundState);
}

/** The sound state with its controls. */
export function useSound() {
  const state = useSoundState();
  return {
    ...state,
    /** The toggle. Call it from the click. */
    toggle: () => setSoundOn(!state.on),
    setOn: setSoundOn,
    setMoments: setSoundMoments,
    setAmbient: setSoundAmbient,
    setVolume: setSoundVolume,
    /** Resumes a context a previous visit left on; call it from a gesture. */
    start: startSound,
    play: playSound,
  };
}

const GESTURES = ["click", "keydown", "touchend"] as const;

/**
 * When a previous visit left sound on, the browser still needs a gesture before anything plays: the first click, key
 * or tap anywhere on the page starts it (the toggle's own clicks are left to the toggle). Mounted by the toggle.
 */
export function useSoundArming(state: SoundState): void {
  const armed = state.on && !state.running && !state.unsupported;
  useEffect(() => {
    if (!armed) return;
    const onGesture = (event: Event) => {
      if (event.target instanceof Element && event.target.closest("[data-sound-toggle]")) return;
      void startSound();
    };
    const options = { capture: true, passive: true } as const;
    for (const type of GESTURES) document.addEventListener(type, onGesture, options);
    return () => {
      for (const type of GESTURES) document.removeEventListener(type, onGesture, options);
    };
  }, [armed]);
}

/** Plays `name` once when the component mounts (null: nothing). A K.O. card appearing, a verdict landing. */
export function useSoundOnMount(name: SoundName | null): void {
  const nameRef = useRef(name);
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current || !nameRef.current) return;
    fired.current = true;
    playSound(nameRef.current);
  }, []);
}

/** Longer than this and the deadline isn't this page's business (and setTimeout wouldn't hold it anyway). */
const MAX_WAIT_MS = 36 * 3_600_000;

/** Plays `name` when the browser clock reaches `at` (ms), once per distinct `at`, if the page is still open. */
export function useSoundAt(name: SoundName, at: number | null): void {
  useEffect(() => {
    if (at === null || !Number.isFinite(at)) return;
    const wait = at - Date.now();
    if (!(wait > 0) || wait > MAX_WAIT_MS) return;
    const timer = setTimeout(() => playSound(name), wait);
    return () => clearTimeout(timer);
  }, [name, at]);
}

const played = new Set<string>();
const onceKey = (key: string) => `animr.sound.once:${key}`;

function playedBefore(key: string): boolean {
  if (played.has(key)) return true;
  try {
    return window.sessionStorage.getItem(onceKey(key)) === "1";
  } catch {
    return false;
  }
}

function remember(key: string) {
  played.add(key);
  try {
    window.sessionStorage.setItem(onceKey(key), "1");
  } catch {
    // The in-memory set still covers this page.
  }
}

/**
 * Plays `name` once per browser session for `key` (null: nothing), e.g. a trophy cabinet per Chog. Only a sound that
 * actually played is remembered, so a cabinet seen with sound off still chimes once sound is on.
 */
export function useSoundOnce(name: SoundName, key: string | null): void {
  const state = useSoundState();
  const playable = state.on && state.moments && state.running;
  useEffect(() => {
    if (!key || !playable || playedBefore(key)) return;
    if (playSound(name)) remember(key);
  }, [name, key, playable]);
}
