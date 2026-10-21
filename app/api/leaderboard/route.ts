import { connection } from "next/server";
import { getLeaderboard, publicErrorMessage } from "@/lib/agent/engine";
import type { LeaderboardResponse } from "@/lib/agent/types";
import { loadVisibility } from "@/lib/visibility";
import { shownAgent } from "../agents/shape";

/**
 * Every agent, best PnL vs holding $CHOG first: personas with display-safe traits (lib/brand-safety.ts), and
 * without the Chogs their holders hid ("Hide my Chog", lib/visibility.ts).
 */
export async function GET() {
  await connection();
  try {
    const [board, visibility] = await Promise.all([getLeaderboard(), loadVisibility()]);
    const agents = board.agents
      .filter((agent) => !(/^\d{1,4}$/.test(agent.tokenId) && visibility.isHidden(Number(agent.tokenId))))
      .map(shownAgent);
    return Response.json({ ...board, agents } satisfies LeaderboardResponse);
  } catch (error) {
    return Response.json({ error: publicErrorMessage(error, "Could not load the leaderboard.") }, { status: 500 });
  }
}
