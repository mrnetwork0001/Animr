import { AgentBusyError, UnfundedAgentError, publicErrorMessage, runAgentOnce } from "@/lib/agent/engine";
import type { AgentDetailView } from "@/lib/agent/receipts";
import { getStore, parseTokenId } from "@/lib/agent/store";
import { MANUAL_RUN_INTERVAL_MS } from "@/lib/agent/types";
import { rateLimit } from "@/lib/bell/http";
import { DAY_MS, utcDay } from "@/lib/bell/rules";
import { getKv } from "@/lib/kv";
import { agentDetailView } from "../../shape";

// One run: market fetch (<= 16s with the fallback) + LLM (<= 20s) + storage.
export const maxDuration = 60;

/** "Think now" runs per network per 10 minutes, across all Chogs. */
const RUNS_PER_NETWORK = 6;
/**
 * Every "Think now" is one paid 0G call (its exact cost is on the decision's receipt): a global daily cap
 * (ANIMR_MANUAL_RUNS_PER_DAY, default 400 runs) bounds what anyone can make the app spend. Scheduled runs don't count.
 */
const RUNS_PER_DAY = Number(process.env.ANIMR_MANUAL_RUNS_PER_DAY) || 400;

function tooManyRequests(error: string, retryAfterMs: number) {
  return Response.json(
    { error },
    { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) } },
  );
}

/**
 * "Think now": runs one decision for this Chog's paper agent immediately (once per MANUAL_RUN_INTERVAL_MS,
 * per-network and daily caps). Agents trading real $CHOG decide only on their schedule: a public button
 * must not choose when an AI sends a real trade.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/agents/[tokenId]/tick">) {
  const tokenId = parseTokenId((await ctx.params).tokenId);
  if (!tokenId) return Response.json({ error: "Token id must be a non-negative integer." }, { status: 400 });
  const limited = await rateLimit(request, "think", RUNS_PER_NETWORK, 10 * 60_000);
  if (limited) return limited;

  const claimKey = `tick:${tokenId}`;
  let claim: string | null = null;
  try {
    const store = getStore();
    const agent = await store.getAgent(tokenId);
    if (!agent) return Response.json({ error: `Chog #${tokenId} has no active agent.` }, { status: 404 });
    if (!agent.active) return Response.json({ error: `Chog #${tokenId}'s agent is paused.` }, { status: 409 });
    if (agent.mode === "onchain") {
      return Response.json(
        { error: `Chog #${tokenId} trades real $CHOG, so it thinks only on its schedule (the Daily Bell and the agent tick).` },
        { status: 403 },
      );
    }

    const sinceLast = agent.lastDecisionAt ? Date.now() - Date.parse(agent.lastDecisionAt) : Infinity;
    if (sinceLast < MANUAL_RUN_INTERVAL_MS) {
      return tooManyRequests(
        `Chog #${tokenId} thought ${Math.max(0, Math.round(sinceLast / 60_000))} min ago. It can think on demand once every ${MANUAL_RUN_INTERVAL_MS / 60_000} minutes.`,
        MANUAL_RUN_INTERVAL_MS - sinceLast,
      );
    }
    // Atomic claim, so concurrent clicks (or instances) can't both pass the check above.
    claim = await store.acquireLock(claimKey, MANUAL_RUN_INTERVAL_MS);
    if (!claim) return tooManyRequests(`Chog #${tokenId} is already thinking.`, MANUAL_RUN_INTERVAL_MS);
    const now = Date.now();
    if ((await getKv().incr(`animr:agent:manual-runs:${utcDay(now)}`, 2 * DAY_MS)) > RUNS_PER_DAY) {
      await store.releaseLock(claimKey, claim).catch(() => {});
      claim = null;
      const midnight = Date.parse(`${utcDay(now + DAY_MS)}T00:00:00Z`);
      return tooManyRequests("The AIs have used today's on-demand thinking budget. They still think at the Daily Bell.", midnight - now);
    }

    // An unfunded paper agent (empty wallet) re-checks its wallet and refuses to think: there is nothing to trade.
    await runAgentOnce(agent, { skipUnfunded: true });
    return Response.json((await agentDetailView(tokenId)) satisfies AgentDetailView);
  } catch (error) {
    // A failed run records no decision, so free the slot (lastDecisionAt still throttles a run that did record one).
    if (claim) await getStore().releaseLock(claimKey, claim).catch(() => {});
    if (error instanceof AgentBusyError) return tooManyRequests(error.message, 5_000);
    if (error instanceof UnfundedAgentError) return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: publicErrorMessage(error, "The agent failed to run.") }, { status: 500 });
  }
}
