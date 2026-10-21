import {
  AgentBusyError,
  ChainReadError,
  ModeSwitchError,
  publicErrorMessage,
  switchAgentMode,
} from "@/lib/agent/engine";
import { checkOnchainReady } from "@/lib/agent/onchain";
import type { AgentDetailView } from "@/lib/agent/receipts";
import { getStore, parseTokenId } from "@/lib/agent/store";
import { rateLimit } from "@/lib/bell/http";
import { verifyModeSwitch } from "@/lib/agent/verify-activation";
import { agentDetailView } from "../../shape";

/**
 * Body: ModeSwitchRequest (owner-signed modeSwitchMessage). Switches the Chog's agent between paper and on-chain
 * trading and resets its PnL baseline to the vault's value now. "onchain" needs AnimrTradeGuard onboarding done:
 * otherwise 409 { error, step } with the readGuardOnboarding step to finish.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/agents/[tokenId]/mode">) {
  const tokenId = parseTokenId((await ctx.params).tokenId);
  if (!tokenId) return Response.json({ error: "Token id must be a non-negative integer." }, { status: 400 });
  // Each attempt costs RPC reads (owner, smart-wallet signature check) even when the signature is bad.
  const limited = await rateLimit(request, "mode", 10);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body { mode, owner, message, signature }." }, { status: 400 });
  }

  try {
    const check = await verifyModeSwitch(tokenId, body);
    if (!check.ok) return Response.json({ error: check.error }, { status: check.status });
    const { mode, account, owner, issuedAt } = check.modeSwitch;

    const agent = await getStore().getAgent(tokenId);
    if (!agent) return Response.json({ error: `Chog #${tokenId} has no agent yet. Activate it first.` }, { status: 404 });
    if (mode === "onchain" && agent.mode !== "onchain") {
      const ready = await checkOnchainReady(account);
      if (!ready.ok) {
        return Response.json({ error: ready.error, ...(ready.step && { step: ready.step }) }, { status: ready.status });
      }
    }

    await switchAgentMode({ tokenId, mode, owner, signedAt: issuedAt });
    return Response.json((await agentDetailView(tokenId)) satisfies AgentDetailView);
  } catch (error) {
    if (error instanceof ModeSwitchError) return Response.json({ error: error.message }, { status: error.status });
    // The signature stays valid for a few minutes, so the client can simply retry.
    if (error instanceof AgentBusyError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof ChainReadError) return Response.json({ error: error.message }, { status: 502 });
    return Response.json({ error: publicErrorMessage(error, "Switching the trading mode failed.") }, { status: 500 });
  }
}
