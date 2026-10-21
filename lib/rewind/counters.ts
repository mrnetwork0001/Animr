import { randomUUID } from "node:crypto";
import { getKv } from "../kv";
import type { VersusStats } from "./types";

// VERSUS totals for /stats, in lib/kv.ts (Redis stores them as animr:<namespace>:versus:count:*):
//   animr:versus:count:bouts   hash  server instance id -> fresh bouts that instance dealt (/random, /new)
//   animr:versus:count:picks   hash  server instance id -> first picks that instance recorded
// Each instance only ever writes its own field (its running total), so concurrent instances never lose each
// other's counts without needing INCRBY (lib/kv.ts counters are in-memory in the file backend). The total is
// the sum of the fields: read it with getVersusCounts() (or GET /api/versus/stats).

export const VERSUS_COUNT_KEYS = {
  bouts: "animr:versus:count:bouts",
  picks: "animr:versus:count:picks",
} as const;

export type VersusCounter = keyof typeof VERSUS_COUNT_KEYS;

type Local = {
  instance: string;
  totals: Record<VersusCounter, number>;
  /** One write in flight per counter; `dirty` asks it to write again once it lands. */
  inflight: Partial<Record<VersusCounter, Promise<void>>>;
  dirty: Record<VersusCounter, boolean>;
};

// One running total per server instance, shared by every route bundle (and kept across dev hot reloads).
const globalForCounts = globalThis as typeof globalThis & { __animrVersusCounts?: Local };

function local(): Local {
  return (globalForCounts.__animrVersusCounts ??= {
    instance: randomUUID(),
    totals: { bouts: 0, picks: 0 },
    inflight: {},
    dirty: { bouts: false, picks: false },
  });
}

/** Adds one to a VERSUS total. Never throws; call it from after() so the response doesn't wait. */
export function countVersus(counter: VersusCounter): Promise<void> {
  const mine = local();
  mine.totals[counter]++;
  const running = mine.inflight[counter];
  if (running) {
    // The write in flight may have sent an older total: write once more after it.
    mine.dirty[counter] = true;
    return running;
  }
  const run = (async () => {
    do {
      mine.dirty[counter] = false;
      await getKv().hset(VERSUS_COUNT_KEYS[counter], { [mine.instance]: mine.totals[counter] });
    } while (mine.dirty[counter]);
  })()
    .catch((error) => console.warn(`[animr] VERSUS: couldn't store the ${counter} count:`, (error as Error).message))
    .finally(() => {
      mine.inflight[counter] = undefined;
    });
  mine.inflight[counter] = run;
  return run;
}

/** Bouts dealt and picks recorded, summed over every server instance. */
export async function getVersusCounts(): Promise<VersusStats> {
  const kv = getKv();
  const mine = local();
  const sum = async (counter: VersusCounter) => {
    const fields = await kv.hgetall<unknown>(VERSUS_COUNT_KEYS[counter]);
    // This instance's own field comes from memory (the stored copy may lag a write still in flight).
    let total = mine.totals[counter];
    for (const [instance, value] of Object.entries(fields)) {
      const n = Number(value);
      if (instance !== mine.instance && Number.isFinite(n) && n > 0) total += n;
    }
    return total;
  };
  const [bouts, picks] = await Promise.all([sum("bouts"), sum("picks")]);
  return { bouts, picks };
}
