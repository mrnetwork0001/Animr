import { after } from "next/server";
import { bellDays, readSummary } from "../bell/store";
import { awardTrophy, isTrophyMintingConfigured } from "./award";
import { TROPHY_KINDS, dayContext } from "./config";

// The three places the app awards trophies. Each never throws and does nothing when trophies aren't configured
// (NEXT_PUBLIC_TROPHIES_ADDRESS + OPERATOR_PRIVATE_KEY). Server only.

/** Live Bells this recent are (re)checked on each Bell maintenance run, so a failed mint is retried. */
const BELL_CATCH_UP = 3;

/**
 * Daily Bell (from maintainBells, after settling): the Oracle of the Day of each recently settled LIVE Bell gets
 * "Best call", and its furthest call "Most rekt". Replayed Bells never award. One award per day per kind.
 */
export async function awardBellTrophies(): Promise<void> {
  if (!isTrophyMintingConfigured()) return;
  try {
    for (const day of (await bellDays("live")).slice(-BELL_CATCH_UP)) {
      const summary = await readSummary(day);
      if (summary?.kind !== "live" || summary.status !== "settled") continue;
      const context = dayContext(day);
      if (summary.oracle) {
        await awardTrophy({ chogId: summary.oracle.tokenId, kind: TROPHY_KINDS.bestCall, context });
      }
      if (summary.mostRekt) {
        await awardTrophy({ chogId: summary.mostRekt.tokenId, kind: TROPHY_KINDS.mostRekt, context });
      }
    }
  } catch (error) {
    console.warn("[animr] trophies: the Bell awards failed:", (error as Error).message);
  }
}

/**
 * Heist: the House Chog's AI said yes and Monad refused the transfer (a live proof). "Survived a heist", at most
 * once per UTC day. Runs after the response is sent, so the robber's reply never waits for a mint.
 */
export function scheduleHeistTrophy(houseTokenId: number | null, now: number): void {
  if (houseTokenId === null || !isTrophyMintingConfigured()) return;
  const task = () =>
    awardTrophy({ chogId: houseTokenId, kind: TROPHY_KINDS.survivedHeist, context: dayContext(now) }).then(() => {});
  try {
    after(task);
  } catch {
    // Outside a request (scripts, tests): run it now, still never throwing.
    void task();
  }
}

/** First real guarded trade of a Chog: "First real trade", once per Chog (context = its token id). */
export async function awardFirstTradeTrophy(tokenId: number | string): Promise<void> {
  const chogId = Number(tokenId);
  if (!Number.isSafeInteger(chogId) || chogId < 0 || !isTrophyMintingConfigured()) return;
  await awardTrophy({ chogId, kind: TROPHY_KINDS.firstTrade, context: BigInt(chogId) });
}
