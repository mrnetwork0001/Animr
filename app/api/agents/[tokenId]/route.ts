import { connection } from "next/server";
import { publicErrorMessage } from "@/lib/agent/engine";
import type { AgentDetailView } from "@/lib/agent/receipts";
import { parseTokenId } from "@/lib/agent/store";
import { agentDetailView } from "../shape";

/**
 * The Chog's agent (null if never activated) and its 50 newest decisions, shaped for display (../shape.ts): safe
 * trait names and theses, plus `providers`, the 0G provider label behind each LLM decision.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/agents/[tokenId]">) {
  await connection();
  const tokenId = parseTokenId((await ctx.params).tokenId);
  if (!tokenId) return Response.json({ error: "Token id must be a non-negative integer." }, { status: 400 });
  try {
    // Polled by every open profile: a few seconds at the CDN absorbs that (a run or claim answers with fresh data).
    return Response.json((await agentDetailView(tokenId)) satisfies AgentDetailView, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=30" },
    });
  } catch (error) {
    return Response.json({ error: publicErrorMessage(error, "Could not load this agent.") }, { status: 500 });
  }
}
