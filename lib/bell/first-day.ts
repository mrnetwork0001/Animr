import { getKv } from "../kv";

// The day of the first Bell ever rung (live or replayed), for proxy.ts: a /bell/<day> before it gets a real 404.
// Reads lib/kv.ts directly (not ./store, which pulls in every Chog's metadata) and remembers the answer for a while.

/** Same key as KEYS.index in ./store: day -> ring time (ms), every Bell. */
const INDEX_KEY = "animr:bell:index";
const TTL_MS = 5 * 60_000;

let cached: { day: string | null; at: number } | null = null;

/** The earliest day with a Bell, or null when none has rung or the store can't be read (callers then let it through). */
export async function firstBellDay(now = Date.now()): Promise<string | null> {
  if (cached && now - cached.at < TTL_MS) return cached.day;
  try {
    const [first] = await getKv().zrange(INDEX_KEY, 0, 0);
    cached = { day: first?.member ?? null, at: now };
  } catch {
    cached = { day: null, at: now - TTL_MS + 30_000 };
  }
  return cached.day;
}
