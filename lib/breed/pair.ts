import { parseChogId } from "@/components/dna/shared";

// The pair a /breed URL asks for (?a=<token id>&b=<token id>). Pure: safe on server and client.

/** The pair /breed opens with: two tradey parents whose child makes a lively chart. */
export const BREED_PRESET = { a: 93, b: 1415 } as const;

type Query = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Token ids from ?a=&b=; a missing or unreadable side falls back to the preset pair. */
export function breedPair(query: Query): { a: number; b: number } {
  const a = parseChogId(first(query.a));
  const b = parseChogId(first(query.b));
  if (a === null && b === null) return { ...BREED_PRESET };
  if (a === null) return { a: b === BREED_PRESET.a ? BREED_PRESET.b : BREED_PRESET.a, b: b! };
  if (b === null) return { a, b: a === BREED_PRESET.b ? BREED_PRESET.a : BREED_PRESET.b };
  return { a, b };
}
