import { getAgentDetail } from "@/lib/agent/engine";
import type { AgentDetailView, ProviderLabels } from "@/lib/agent/receipts";
import { displayThesis, ownTraitNames } from "@/lib/agent/thesis-safety";
import type { AgentDetailResponse, AgentRecord, Decision } from "@/lib/agent/types";
import { zgProviderInfo } from "@/lib/agent/zg-compute";
import { safeTraits } from "@/lib/brand-safety";

// Response shaping for GET /api/agents/[tokenId] and the activate, mode and tick answers (they all return the same
// detail, and the profile caches whichever came last):
// - the persona's traits are display-safe (lib/brand-safety.ts safeTraits);
// - every stored thesis is shown through displayThesis: flagged trait values renamed, and an LLM-written thesis that
//   fails the moderation checks replaced by a template line (decisions stored before the brain's own check);
// - `providers` labels each 0G provider that served a decision (TeeML / TeeTLS / standard, from the Router's public
//   provider list via zgProviderInfo, cached ~1 h per model). Labels never claim a verified call: "TEE verified"
//   stays tied to each receipt's own teeVerified === true (lib/agent/receipts.ts).

/** A response waits this long for the provider list; a slow Router just leaves labels for the next poll. */
const LABEL_WAIT_MS = 1_500;

export async function agentDetailView(tokenId: string): Promise<AgentDetailView> {
  return shapeAgentDetail(await getAgentDetail(tokenId));
}

/** The display shape of an agent detail (see the notes above). Never throws for a missing provider list. */
export async function shapeAgentDetail({ agent, decisions }: AgentDetailResponse): Promise<AgentDetailView> {
  const own = ownTraitNames(agent?.persona?.traits);
  const shown = decisions.map((decision) => shownDecision(decision, own));
  return { agent: agent && shownAgent(agent), decisions: shown, providers: await providerLabels(shown) };
}

/** The agent as shown publicly: its persona's traits display-safe (also used by GET /api/leaderboard). */
export function shownAgent(agent: AgentRecord): AgentRecord {
  return agent.persona ? { ...agent, persona: { ...agent.persona, traits: safeTraits(agent.persona.traits) } } : agent;
}

function shownDecision(decision: Decision, own: readonly string[]): Decision {
  const thesis = displayThesis(decision, own);
  return thesis === decision.thesis ? decision : { ...decision, thesis };
}

function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Labels for the providers behind these decisions, keyed by lowercase address (the ones it could resolve). */
async function providerLabels(decisions: readonly Decision[]): Promise<ProviderLabels> {
  const wanted = new Map<string, string | undefined>();
  for (const decision of decisions) {
    const address = typeof decision.zg?.provider === "string" ? decision.zg.provider.trim().toLowerCase() : "";
    // The list is per model: label each address from the model it served.
    if (/^0x[0-9a-f]{40}$/.test(address) && !wanted.has(address)) wanted.set(address, decision.model);
  }
  if (wanted.size === 0) return {};
  const resolved = await Promise.all(
    [...wanted].map(async ([address, model]) => [address, await within(zgProviderInfo(address, model), LABEL_WAIT_MS)] as const),
  );
  const labels: ProviderLabels = {};
  for (const [address, info] of resolved) {
    if (info) labels[address] = { label: info.label, ...(info.name && { name: info.name }) };
  }
  return labels;
}
