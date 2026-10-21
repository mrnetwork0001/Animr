import { parseChogId } from "@/components/dna/shared";

// The pair a /breed URL asks for (?a=<token id>&b=<token id>). Pure: safe on server and client.

/** The pair /breed opens with: two tradey parents whose child makes a lively chart. */
export const BREED_PRESET = { a: 93, b: 1415 } as const;

/** What the picker says when both parents are the same Chog (the form and direct links alike). */
export const SELF_BREED = "A Chog can't breed with itself. Pick two different Chogs.";

type Query = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * What ?a=&b= asks for. A missing side falls back to the preset pair (a bare /breed opens on it); a side that is there
 * but isn't a token id, or the same Chog twice, is never swapped for another Chog: `pair` is null, `text` keeps what
 * was asked (for the picker's inputs) and `self` marks the same-Chog case.
 */
export function readBreedQuery(query: Query): { pair: { a: number; b: number } | null; text: { a: string; b: string }; self: boolean } {
  const rawA = first(query.a)?.trim() || undefined;
  const rawB = first(query.b)?.trim() || undefined;
  const a = rawA === undefined ? null : parseChogId(rawA);
  const b = rawB === undefined ? null : parseChogId(rawB);
  if ((rawA !== undefined && a === null) || (rawB !== undefined && b === null)) {
    return { pair: null, text: { a: rawA ?? "", b: rawB ?? "" }, self: false };
  }
  let pair: { a: number; b: number };
  if (a === null && b === null) pair = { ...BREED_PRESET };
  else if (a === null) pair = { a: b === BREED_PRESET.a ? BREED_PRESET.b : BREED_PRESET.a, b: b! };
  else if (b === null) pair = { a, b: a === BREED_PRESET.b ? BREED_PRESET.a : BREED_PRESET.b };
  else pair = { a, b };
  const text = { a: String(pair.a), b: String(pair.b) };
  return pair.a === pair.b ? { pair: null, text, self: true } : { pair, text, self: false };
}
