import { FLAGGED_TOKEN_IDS } from "./brand-safety";
import { hiddenIds } from "./optout";

// One place to ask "may this Chog appear here?". Two rules, combined so every surface applies the same ones:
//
//   1. Opt-out ("Hide my Chog", lib/optout.ts): the holder signed to take the Chog out of Animr's public pages. It
//      stays off every public surface: the League, the Daily Bell, Versus, replays, share cards and random picks.
//   2. Brand safety (FLAGGED_TOKEN_IDS, lib/brand-safety.ts): the art itself carries words from the collection's
//      metadata that Animr never features. Such a Chog is listed and searchable like any other (its own page, League
//      rows, its Bell call), but never a random pick ("Random Chog", Versus pairs), a featured slot or a showcase.
//
// Server-only: the opt-out list lives in KV (lib/optout.ts caches it ~10 s per instance). Call these from route
// handlers, metadata image routes or after `await connection()`, never inside "use cache" (the answer would be
// cached with it). Client code that already has the hidden ids (GET /api/optout lists them) can use hiddenOn().

/** Where a Chog would appear. */
export type Surface =
  /** Listings and pages about a Chog (League rows, Bell calls, replays, share cards): only an opt-out hides it. */
  | "list"
  /** Random picks: "Random Chog", Versus pairs, random replays. Opt-out and brand safety. */
  | "random"
  /** Featured slots and showcases (the Bell's featured/boldest cards, Oracle of the Day, landing showcases). */
  | "featured";

/** A snapshot of the rules, loaded once per request so many ids can be tested synchronously. */
export type Visibility = {
  /** Chogs whose holders hid them. */
  hidden: ReadonlySet<number>;
  /** True when `tokenId` must stay off `surface` (default "list"). */
  isHidden(tokenId: number, surface?: Surface): boolean;
};

/** The rule itself, for callers that already hold the hidden ids. Pure. */
export function hiddenOn(tokenId: number, surface: Surface, hidden: ReadonlySet<number>): boolean {
  return hidden.has(tokenId) || (surface !== "list" && FLAGGED_TOKEN_IDS.has(tokenId));
}

/** A token id in any common form (7, "7", "#7", 7n), or null. */
function tokenIdOf(raw: number | string | bigint): number | null {
  const id = typeof raw === "number" ? raw : Number(String(raw).trim().replace(/^#/, "") || NaN);
  return Number.isSafeInteger(id) ? id : null;
}

/** Loads the opt-out list once (lib/optout.ts keeps the last good copy if the store can't be read). */
export async function loadVisibility(): Promise<Visibility> {
  const hidden = await hiddenIds();
  return { hidden, isHidden: (tokenId, surface = "list") => hiddenOn(tokenId, surface, hidden) };
}

/**
 * True when the Chog must stay off `surface`: always when its holder hid it, and on "random" and "featured" also
 * when its art is flagged. Default surface "list".
 */
export async function isHiddenChog(tokenId: number | string | bigint, surface: Surface = "list"): Promise<boolean> {
  const id = tokenIdOf(tokenId);
  return id !== null && hiddenOn(id, surface, await hiddenIds());
}

/** `items` without the Chogs that must stay off `surface` (default "list"), order kept. */
export async function filterVisible<T>(
  items: readonly T[],
  idOf: (item: T) => number | string | bigint,
  surface: Surface = "list",
): Promise<T[]> {
  const hidden = await hiddenIds();
  return items.filter((item) => {
    const id = tokenIdOf(idOf(item));
    return id === null || !hiddenOn(id, surface, hidden);
  });
}

/** Token ids a random pick must skip (flagged art and hidden Chogs), ascending: for "exclude" lists. */
export async function randomExclusions(): Promise<number[]> {
  const hidden = await hiddenIds();
  return [...new Set([...FLAGGED_TOKEN_IDS, ...hidden])].sort((a, b) => a - b);
}

/**
 * A random token id in [min, max] fit for a random pick (neither flagged nor hidden), or null when there is none.
 * `random` defaults to Math.random: call this per request (route handler, after `connection()`), never while
 * prerendering.
 */
export async function pickRandomChog(
  range: { min: number; max: number },
  random: () => number = Math.random,
): Promise<number | null> {
  const hidden = await hiddenIds();
  const span = range.max - range.min + 1;
  if (!(span > 0)) return null;
  const ok = (id: number) => !hiddenOn(id, "random", hidden);
  // A few draws first (a small share is excluded), then a scan from a random start so it always ends.
  for (let attempt = 0; attempt < 16; attempt++) {
    const id = range.min + Math.floor(random() * span);
    if (ok(id)) return id;
  }
  const start = Math.floor(random() * span);
  for (let i = 0; i < span; i++) {
    const id = range.min + ((start + i) % span);
    if (ok(id)) return id;
  }
  return null;
}
