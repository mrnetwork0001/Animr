import type { Visibility } from "../visibility";
import { extremes } from "./rules";
import { readCalls } from "./store";
import type { BellCall, BellSummary } from "./types";

// What the public Bell shows of a stored Bell, applied when it is read (lib/visibility.ts): a Chog whose holder hid
// it ("Hide my Chog", lib/optout.ts) leaves the featured and boldest cards and the full list of calls, and a hidden
// Oracle of the Day or Most Rekt hands its card to the next call in line (flagged Chogs left out, as at settlement).
// The stored Bell, the season records and the aggregates (histogram, bull/bear shares, call count) are untouched.
// Server-only.

/** The summary with hidden Chogs out of its showcases (the same object when nobody is hidden). */
export async function visibleSummary(bell: BellSummary, visibility: Visibility): Promise<BellSummary> {
  if (!visibility.hidden.size) return bell;
  const shown = (call: BellCall | undefined) => !call || !visibility.hidden.has(call.tokenId);
  const { oracle, mostRekt, ...rest } = bell;
  let picks: { oracle?: BellCall; mostRekt?: BellCall } = { oracle, mostRekt };
  if (!shown(oracle) || !shown(mostRekt)) {
    const replacements = extremes(await readCalls(bell), bell.day, (tokenId) => visibility.isHidden(tokenId, "featured"));
    picks = {
      oracle: shown(oracle) ? oracle : replacements.oracle,
      mostRekt: shown(mostRekt) ? mostRekt : replacements.mostRekt,
    };
  }
  return {
    ...rest,
    featured: bell.featured.filter(shown),
    boldest: bell.boldest.filter(shown),
    ...(picks.oracle && { oracle: picks.oracle }),
    ...(picks.mostRekt && { mostRekt: picks.mostRekt }),
  };
}
