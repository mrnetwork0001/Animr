import { AgentBusyError, ChainReadError, activateAgent, publicErrorMessage } from "@/lib/agent/engine";
import type { AgentDetailView } from "@/lib/agent/receipts";
import { parseTokenId } from "@/lib/agent/store";
import { rateLimit } from "@/lib/bell/http";
import { verifyActivation } from "@/lib/agent/verify-activation";
import { agentDetailView } from "../../shape";

/** Body: ActivateRequest. Creates (or re-activates) the Chog's paper-trading agent for its verified owner. */
export async function POST(request: Request, ctx: RouteContext<"/api/agents/[tokenId]/activate">) {
  const tokenId = parseTokenId((await ctx.params).tokenId);
  if (!tokenId) return Response.json({ error: "Token id must be a non-negative integer." }, { status: 400 });
  // Each attempt costs RPC reads (owner, smart-wallet signature check) even when the signature is bad.
  const limited = await rateLimit(request, "activate", 10);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body { owner, message, signature }." }, { status: 400 });
  }

  try {
    const check = await verifyActivation(tokenId, body);
    if (!check.ok) return Response.json({ error: check.error }, { status: check.status });
    await activateAgent(check.activation);
    return Response.json((await agentDetailView(tokenId)) satisfies AgentDetailView);
  } catch (error) {
    // The signature stays valid for a few minutes, so the client can simply retry.
    if (error instanceof AgentBusyError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof ChainReadError) return Response.json({ error: error.message }, { status: 502 });
    return Response.json({ error: publicErrorMessage(error, "Activation failed.") }, { status: 500 });
  }
}
