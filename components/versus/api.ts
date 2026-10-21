import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import type { VersusBout, VersusBoutPreview, VersusPickResponse, VersusStats } from "@/lib/rewind/types";
import type { Side } from "./shared";

// Client for the VERSUS HTTP contract in lib/rewind/types.ts:
//   GET  /api/versus/random              -> VersusBoutPreview
//   GET  /api/versus/new?a=&b=           -> VersusBoutPreview (either id alone: a random rival)
//   GET  /api/versus/[id]                -> VersusBoutPreview (a shared link before the pick: no spoilers)
//   POST /api/versus/[id]/pick           body { fighter } -> VersusPickResponse
//   GET  /api/versus/[id]?spectate=1     -> VersusBout (no pick, no points)
//   GET  /api/versus/stats               -> VersusStats
// Errors are JSON { error } (400, 404, 409 fan card busy, 415, 429 with Retry-After, 500).

export class VersusApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** 4xx answers (unknown bout, bad ids) won't change on a retry; network errors and 5xx might. */
export const retryVersus = (failures: number, error: Error) =>
  failures < 2 && !(error instanceof VersusApiError && error.status >= 400 && error.status < 500);

// Dev only: until the VERSUS routes exist, a missing route (Next's HTML 404) falls back to the sample
// bouts in fixtures.ts and the arena shows a "sample data" banner. Production never does this.
let sampleMode = false;
const sampleListeners = new Set<() => void>();

/** True once any VERSUS request was answered with dev sample data. */
export function useVersusSampleMode(): boolean {
  return useSyncExternalStore(
    (listener) => {
      sampleListeners.add(listener);
      return () => sampleListeners.delete(listener);
    },
    () => sampleMode,
    () => false,
  );
}

type Fixtures = typeof import("./fixtures");

async function request<T>(
  url: string,
  init: RequestInit | undefined,
  sample: (fixtures: Fixtures) => Promise<T>,
  valid: (body: unknown) => boolean,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new VersusApiError("Couldn't reach Animr. Check your connection and try again.", 0);
  }
  if (process.env.NODE_ENV !== "production" && res.status === 404 && !res.headers.get("content-type")?.includes("json")) {
    if (!sampleMode) {
      sampleMode = true;
      sampleListeners.forEach((notify) => notify());
    }
    return sample(await import("./fixtures"));
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const { error, message } = (body ?? {}) as { error?: unknown; message?: unknown };
    const text = typeof error === "string" ? error : typeof message === "string" ? message : undefined;
    const retryAfter = Number(res.headers.get("retry-after"));
    const wait = res.status === 429 && retryAfter > 0 ? ` Try again in ${Math.ceil(retryAfter)}s.` : "";
    throw new VersusApiError(`${text ?? `Request failed (HTTP ${res.status}).`}${wait}`, res.status);
  }
  if (!valid(body)) throw new VersusApiError(`Unexpected response from ${url.split("?")[0]}`, res.status);
  return body as T;
}

const isObject = (body: unknown): body is Record<string, unknown> => typeof body === "object" && body !== null;
const isFighter = (f: unknown) => isObject(f) && typeof f.tokenId === "number" && typeof f.archetype === "string";
export const isBoutPreview = (b: unknown): b is VersusBoutPreview =>
  isObject(b) && typeof b.id === "string" && isFighter(b.a) && isFighter(b.b) && typeof b.startChog === "number";
export const isBout = (b: unknown): b is VersusBout =>
  isBoutPreview(b) &&
  Array.isArray((b as VersusBout).frames) &&
  (b as VersusBout).frames.length > 1 &&
  isObject((b as VersusBout).result) &&
  isObject((b as VersusBout).reveal) &&
  Array.isArray((b as VersusBout).trades) &&
  Array.isArray((b as VersusBout).moments);
const isPickResponse = (b: unknown) => isObject(b) && isBout(b.bout) && isObject(b.fan);

const boutUrl = (id: string) => `/api/versus/${encodeURIComponent(id)}`;

/** A random pair on a random drama-ranked window (no result yet). */
export const fetchRandomBout = () =>
  request<VersusBoutPreview>("/api/versus/random", undefined, (f) => f.sampleRandom(), isBoutPreview);

/** A chosen pair (token ids 1–1969) on a random window; leave one side null for a random rival. */
export function fetchPairBout(a: number | null, b: number | null) {
  const query = new URLSearchParams();
  if (a !== null) query.set("a", String(a));
  if (b !== null) query.set("b", String(b));
  return request<VersusBoutPreview>(`/api/versus/new?${query}`, undefined, (f) => f.samplePair(a, b), isBoutPreview);
}

/** A shared bout before the pick: fighters only, no spoilers. */
export const fetchBoutPreview = (id: string) =>
  request<VersusBoutPreview>(boutUrl(id), undefined, (f) => f.samplePreview(id), isBoutPreview);

/** The whole bout without picking: no points. */
export const fetchSpectate = (id: string) =>
  request<VersusBout>(`${boutUrl(id)}?spectate=1`, undefined, (f) => f.sampleBout(id), isBout);

/** Records the visitor's pick (cookie fan); a repeat answers correct: null and `pick` = the first pick. */
export const postPick = (id: string, fighter: Side) =>
  request<VersusPickResponse>(
    `${boutUrl(id)}/pick`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fighter }) },
    (f) => f.samplePick(id, fighter),
    isPickResponse,
  );

/** Bouts dealt and picks made so far, for a little social proof (hidden until there are some). */
export function useVersusStats() {
  return useQuery({
    queryKey: ["versus", "stats"],
    queryFn: () =>
      request<VersusStats>(
        "/api/versus/stats",
        undefined,
        (f) => f.sampleStats(),
        (b) => isObject(b) && typeof b.bouts === "number" && typeof b.picks === "number",
      ),
    staleTime: 60_000,
    retry: retryVersus,
  });
}

// ---------------------------------------------------------------------------------------------
// Bouts this browser picked or watched, so a shared link it already played opens on the replay: with
// its pick, or (after "Just watch") without pick buttons, since the result is no secret any more. A
// per-viewer convenience only (the engine keeps the real record): it may be empty or unavailable.

const PICKS_KEY = "animr:versus:picks";
const MAX_PICKS = 60;
const pickListeners = new Set<() => void>();
type Stored = Side | "w";

function readPicks(): Record<string, Stored> {
  try {
    const raw = window.localStorage.getItem(PICKS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isObject(parsed) ? (parsed as Record<string, Stored>) : {};
  } catch {
    return {};
  }
}

function remember(id: string, value: Stored) {
  try {
    const picks = readPicks();
    // A pick outranks having watched; the newest entry goes last, the oldest drop off.
    if (value === "w" && (picks[id] === "a" || picks[id] === "b")) return;
    delete picks[id];
    picks[id] = value;
    const kept = Object.entries(picks).slice(-MAX_PICKS);
    window.localStorage.setItem(PICKS_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Storage blocked or full: the pick still counts on the server.
  }
  pickListeners.forEach((notify) => notify());
}

export const rememberPick = (id: string, side: Side) => remember(id, side);
export const rememberWatch = (id: string) => remember(id, "w");

/**
 * What this browser did on bout `id`: its pick, "watch" (it watched without picking), or null (always null on
 * the server and before hydration).
 */
export function useRememberedPick(id: string | undefined): Side | "watch" | null {
  return useSyncExternalStore(
    (listener) => {
      pickListeners.add(listener);
      return () => pickListeners.delete(listener);
    },
    () => {
      if (!id) return null;
      const value = readPicks()[id];
      return value === "a" || value === "b" ? value : value === "w" ? "watch" : null;
    },
    () => null,
  );
}
