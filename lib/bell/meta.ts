import { cacheLife } from "next/cache";
import { readSummary } from "./store";
import type { BellSummary } from "./types";

/**
 * A Bell's kind for page metadata ("Replayed Bell: ..." titles), cached so generateMetadata stays cheap. A
 * rung Bell's kind never changes; a day not rung yet is re-read every few minutes. Null when unknown.
 */
export async function bellKindOf(day: string): Promise<BellSummary["kind"] | null> {
  "use cache";
  try {
    const summary = await readSummary(day);
    if (summary) cacheLife("hours");
    else cacheLife("minutes");
    return summary?.kind ?? null;
  } catch {
    cacheLife("minutes");
    return null;
  }
}
