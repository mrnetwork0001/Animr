// The herd chart of a Bell card: every call bucketed symmetrically around 0%, so bulls and bears get the
// same room. Pure (shared by lib/og/data.ts, which fills it, and lib/og/ui.tsx, which draws it).

/**
 * Slots for a half-width R (step R/5): (-inf,-4s) [-4s,-3s) [-3s,-2s) [-2s,-s) [-s,0) | 0 | (0,s] (s,2s]
 * (2s,3s] (3s,4s] (4s,inf). Index 5 holds the flat calls; the chart's edges read -R% and +R%.
 */
export const HERD_SLOTS = 11;

/** Half-widths the chart picks from, in %. */
const RANGES = [2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 50];

export type Herd = { slots: number[]; range: number };

/** The narrowest half-width that holds 95% of the calls and the real move (most calls sit within +-2%). */
export function herdRange(forecasts: readonly number[], actualPct: number | null): number {
  const sorted = forecasts.map((pct) => Math.abs(pct)).sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.floor(0.95 * (sorted.length - 1))] : 0;
  const need = Math.max(p95, actualPct === null ? 0 : Math.abs(actualPct) * 1.15);
  return RANGES.find((range) => range >= need) ?? RANGES[RANGES.length - 1];
}

/** The slot of a forecast. */
export function herdSlot(pct: number, range: number): number {
  const step = range / 5;
  if (pct === 0) return 5;
  if (pct < 0) return Math.max(0, 4 - Math.floor(-pct / step - 1e-9));
  return Math.min(10, 6 + Math.floor(pct / step - 1e-9));
}

/** Where a % move falls on the chart, in slot units (0-11): 0% in the middle, +-range at the edges. */
export function herdX(pct: number, range: number): number {
  if (pct === 0) return 5.5;
  const step = range / 5;
  const x = pct > 0 ? 6 + Math.min(pct, range) / step : 5 - Math.min(-pct, range) / step;
  return Math.min(HERD_SLOTS - 0.1, Math.max(0.1, x));
}

/** The herd from a Bell's calls. */
export function herdOfCalls(forecasts: readonly number[], actualPct: number | null): Herd {
  const range = herdRange(forecasts, actualPct);
  const slots = new Array<number>(HERD_SLOTS).fill(0);
  for (const pct of forecasts) if (Number.isFinite(pct)) slots[herdSlot(pct, range)]++;
  return { slots, range };
}

/**
 * The herd from a Bell summary's 2-point buckets (lower bounds -10..10, the 0 bucket holding the flat
 * calls too), when the calls themselves can't be read: a fixed +-10% chart.
 */
export function herdOfBuckets(histogram: readonly { bucketPct: number; count: number }[]): Herd {
  const slots = new Array<number>(HERD_SLOTS).fill(0);
  for (const { bucketPct, count } of histogram) {
    const slot = Math.max(0, Math.min(10, Math.floor(bucketPct < 0 ? 5 + bucketPct / 2 : 6 + bucketPct / 2)));
    slots[slot] += Number.isFinite(count) ? count : 0;
  }
  return { slots, range: 10 };
}
