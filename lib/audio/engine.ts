/*
 * Animr's sound engine: one AudioContext, the opt-in state (off by default, remembered per browser) and the two things
 * it plays: short synthesized moments (lib/audio/moments.ts) and the generative ambient (lib/audio/ambient.ts).
 *
 * Nothing sounds until the visitor turns the toggle on in this browser session: the context is created and resumed
 * inside that click (the user gesture browsers require). When a previous visit left sound on, the page waits for the
 * first gesture on it (components/audio/use-sound.ts `useSoundArming`), and the toggle reads "on, tap to start" until
 * then. Turning sound off fades the ambient out and suspends the context, so it costs nothing while off.
 *
 * playSound(name) is a no-op whenever sound is off, moments are muted, the context isn't running or Web Audio is
 * missing, so callers hook it in as a one-liner without checks.
 */

import { Ambient } from "./ambient";
import { SOUND_NAMES, type SoundName, renderMoment } from "./moments";

export { SOUND_NAMES, type SoundName };

const STORAGE_KEY = "animr.sound";
export const DEFAULT_VOLUME = 0.25;
/** The ambient's fade in and out, in seconds. */
export const FADE_SECONDS = 1.5;

/** What the visitor chose (localStorage). */
export type SoundPrefs = {
  /** The one toggle. */
  on: boolean;
  /** The short moments (bell, K.O., …). */
  moments: boolean;
  /** The ambient piece. */
  ambient: boolean;
  /** The ambient's level, 0..1. */
  volume: number;
};

export type SoundState = SoundPrefs & {
  /** The AudioContext is running: a gesture unlocked it. With `on` and not `running`, the page is waiting for one. */
  running: boolean;
  /** Web Audio is missing or refused to start. */
  unsupported: boolean;
};

const DEFAULT_PREFS: SoundPrefs = { on: false, moments: true, ambient: true, volume: DEFAULT_VOLUME };
/** What the server (and the first client render) sees: sound off. */
const SERVER_STATE: SoundState = { ...DEFAULT_PREFS, running: false, unsupported: false };

const clampVolume = (value: number) => Math.min(1, Math.max(0, value));

function loadPrefs(): Partial<SoundPrefs> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const p = parsed as Record<string, unknown>;
    const prefs: Partial<SoundPrefs> = {};
    if (typeof p.on === "boolean") prefs.on = p.on;
    if (typeof p.moments === "boolean") prefs.moments = p.moments;
    if (typeof p.ambient === "boolean") prefs.ambient = p.ambient;
    if (typeof p.volume === "number" && Number.isFinite(p.volume)) prefs.volume = clampVolume(p.volume);
    return prefs;
  } catch {
    return {};
  }
}

let state: SoundState = typeof window === "undefined" ? SERVER_STATE : { ...SERVER_STATE, ...loadPrefs() };
const listeners = new Set<() => void>();

function setState(patch: Partial<SoundState>) {
  const next = { ...state, ...patch };
  if ((Object.keys(patch) as (keyof SoundState)[]).every((key) => Object.is(next[key], state[key]))) return;
  state = next;
  for (const listener of listeners) listener();
}

function savePrefs() {
  try {
    const { on, moments, ambient, volume } = state;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ on, moments, ambient, volume }));
  } catch {
    // Private mode or blocked storage: the choice still holds for this page.
  }
}

// For useSyncExternalStore.
export const subscribeSound = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getSoundState = () => state;
export const getServerSoundState = () => SERVER_STATE;

// --- the context ----------------------------------------------------------------------------------

let ctx: AudioContext | null = null;
let momentsBus: GainNode | null = null;
let ambientBus: GainNode | null = null;
let ambient: Ambient | null = null;
let stopTimer: ReturnType<typeof setTimeout> | undefined;

function contextClass(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  if (typeof AudioContext !== "undefined") return AudioContext;
  return (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  const Context = contextClass();
  if (!Context) {
    setState({ unsupported: true });
    return null;
  }
  try {
    ctx = new Context({ latencyHint: "interactive" });
  } catch {
    setState({ unsupported: true });
    return null;
  }
  momentsBus = ctx.createGain();
  momentsBus.connect(ctx.destination);
  ambientBus = ctx.createGain();
  ambientBus.gain.value = state.volume;
  ambientBus.connect(ctx.destination);
  ambient = new Ambient(ctx, ambientBus);
  // iOS interrupts contexts (calls, other apps); the toggle then shows "tap to start" again.
  ctx.addEventListener("statechange", () => {
    setState({ running: ctx?.state === "running" });
    syncAmbient();
  });
  return ctx;
}

function syncAmbient() {
  if (!ambient || !ctx) return;
  const should = state.on && state.ambient && ctx.state === "running";
  if (should && !ambient.playing) ambient.start(FADE_SECONDS);
  else if (!should && ambient.playing) ambient.stop(FADE_SECONDS);
}

/**
 * Starts (or resumes) the context. Call it from a user gesture: browsers only unlock audio there. Resolves to whether
 * the context is running. Safe to call any time sound is on; a no-op while it is off.
 */
export async function startSound(): Promise<boolean> {
  if (!state.on) return false;
  clearTimeout(stopTimer);
  stopTimer = undefined;
  const context = ensureContext();
  if (!context) return false;
  if (context.state !== "running") {
    try {
      // resume() never settles outside a gesture in some browsers: don't wait on it for ever.
      await Promise.race([context.resume(), new Promise<void>((resolve) => setTimeout(resolve, 1500))]);
    } catch {
      // Stays suspended; the next gesture tries again.
    }
  }
  const running = context.state === "running";
  setState({ running });
  syncAmbient();
  return running;
}

function stopSound() {
  ambient?.stop(FADE_SECONDS);
  clearTimeout(stopTimer);
  stopTimer = setTimeout(() => {
    stopTimer = undefined;
    if (state.on || !ctx) return;
    void ctx.suspend().catch(() => {});
    setState({ running: false });
  }, FADE_SECONDS * 1000 + 100);
}

// --- controls -------------------------------------------------------------------------------------

/** The toggle. On: start from this gesture. Off: fade the ambient out and suspend. */
export function setSoundOn(on: boolean): void {
  if (on === state.on) return;
  setState({ on });
  savePrefs();
  if (on) void startSound();
  else stopSound();
}

export function setSoundMoments(moments: boolean): void {
  setState({ moments });
  savePrefs();
}

export function setSoundAmbient(on: boolean): void {
  setState({ ambient: on });
  savePrefs();
  syncAmbient();
}

export function setSoundVolume(volume: number): void {
  const value = clampVolume(Number.isFinite(volume) ? volume : DEFAULT_VOLUME);
  setState({ volume: value });
  savePrefs();
  if (ambientBus && ctx) ambientBus.gain.setTargetAtTime(value, ctx.currentTime, 0.05);
}

/** Plays a moment now. Returns false (and does nothing) unless sound is on, moments are on and the context runs. */
export function playSound(name: SoundName): boolean {
  if (!state.on || !state.moments || !ctx || !momentsBus || ctx.state !== "running") return false;
  try {
    renderMoment(name, ctx, momentsBus, ctx.currentTime + 0.01);
    return true;
  } catch {
    return false;
  }
}
