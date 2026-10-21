import { connection } from "next/server";
import { SparkIcon } from "@/components/v2";
import { PROVIDER_TEXT, type ProviderLabel, formatCallCost, isTeeVerified, receiptCostUsd } from "@/lib/agent/receipts";
import { getStore } from "@/lib/agent/store";
import { displayThesis, ownTraitNames } from "@/lib/agent/thesis-safety";
import type { AgentRecord, Decision } from "@/lib/agent/types";
import { zgProviderInfo } from "@/lib/agent/zg-compute";
import { safeTraits } from "@/lib/brand-safety";
import { shortAddress } from "@/lib/format";
import { loadVisibility } from "@/lib/visibility";
import { ChogImage } from "./chog-image";
import { receipts } from "./content";
import { Icon } from "./icons";
import { StyleBadge } from "./primitives";
import { type ShowcaseChog, showcaseChog } from "./showcase";

// The receipts card on the landing page: the newest LLM decision any claimed Chog's AI really made, with the 0G
// receipt stored next to it (provider, request id, cost). Read per request (render it under <Suspense>): nothing is
// fixed at build time, and with no such decision in the store the card is one muted line instead.

/** Agents scanned, newest decision first; an LLM decision is almost always among their latest few. */
const AGENTS_SCANNED = 12;
const DECISIONS_SCANNED = 50;
const LABEL_WAIT_MS = 1_500;

type Latest = { decision: Decision; agent: AgentRecord; chog: ShowcaseChog };

const isLlmWithReceipt = (decision: Decision) =>
  decision.decidedBy === "llm" && !!decision.zg && !!(decision.zg.requestId || decision.zg.provider || decision.zg.costUsdMicro);

const time = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
};

/** The newest stored LLM decision with a 0G receipt, from a Chog that may be featured; null when there is none. */
async function latestLlmDecision(): Promise<Latest | null> {
  const [agents, visibility] = await Promise.all([getStore().listAgents(), loadVisibility()]);
  const candidates = agents
    .filter((agent) => agent.decisions > 0 && /^\d{1,4}$/.test(agent.tokenId) && !visibility.isHidden(Number(agent.tokenId), "featured"))
    .sort((a, b) => time(b.lastDecisionAt) - time(a.lastDecisionAt))
    .slice(0, AGENTS_SCANNED);
  let best: Latest | null = null;
  for (const agent of candidates) {
    // Sorted by their newest decision: once an agent's newest is older than the best found, none can beat it.
    if (best && time(agent.lastDecisionAt) <= time(best.decision.at)) break;
    const decision = (await getStore().listDecisions(agent.tokenId, DECISIONS_SCANNED)).find(isLlmWithReceipt);
    if (!decision || (best && time(decision.at) <= time(best.decision.at))) continue;
    const chog = showcaseChog(Number(agent.tokenId));
    if (chog) best = { decision, agent, chog };
  }
  return best;
}

async function providerLabel(decision: Decision): Promise<ProviderLabel | undefined> {
  const address = decision.zg?.provider;
  if (!address) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => (timer = setTimeout(() => resolve(undefined), LABEL_WAIT_MS)));
  const info = await Promise.race([zgProviderInfo(address, decision.model), timeout]).finally(() => clearTimeout(timer));
  return info && { label: info.label, ...(info.name && { name: info.name }) };
}

const AT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

/** "a1b2c3d4…9f0e" for long ids. */
const shortId = (id: string) => (id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id);

/** Placeholder while the store is read (same footprint as the empty line). */
export function LatestDecisionFallback() {
  return <div className="lp-decision-empty" aria-hidden="true" />;
}

/** The newest real AI decision and its 0G receipt, or one muted line while there is none. */
export async function LatestDecision() {
  await connection();
  const { card } = receipts;
  let latest: Latest | null;
  try {
    latest = await latestLlmDecision();
  } catch (error) {
    console.warn("[animr] Landing: couldn't read the latest AI decision:", (error as Error).message);
    return <p className="lp-decision-empty lp-card-note">{card.error}</p>;
  }
  if (!latest) return <p className="lp-decision-empty lp-card-note">{card.empty}</p>;

  const { decision, agent, chog } = latest;
  const label = await providerLabel(decision);
  const thesis = displayThesis(decision, ownTraitNames(safeTraits(agent.persona?.traits ?? {})));
  const cost = receiptCostUsd(decision);
  const verified = isTeeVerified(decision);
  const zg = decision.zg ?? {};
  const rows = [
    { label: card.labels.model, value: decision.model ?? "LLM" },
    ...(zg.provider ? [{ label: card.labels.provider, value: shortAddress(zg.provider), title: zg.provider }] : []),
    ...(label
      ? [{ label: card.labels.label, value: `${PROVIDER_TEXT[label.label].short}${label.name ? ` · ${label.name}` : ""}` }]
      : []),
    ...(zg.requestId ? [{ label: card.labels.requestId, value: shortId(zg.requestId), title: zg.requestId }] : []),
    ...(cost !== null ? [{ label: card.labels.cost, value: formatCallCost(cost) }] : []),
  ];

  return (
    <div className="v2-card lp-decision">
      <div className="lp-decision-head">
        <ChogImage
          src={chog.image.src}
          fallbackSrc={chog.image.fallbackSrc}
          alt={chog.label}
          size={96}
          fallbackLabel={chog.label}
          className="lp-avatar"
        />
        <div className="lp-min0 lp-grow">
          <p className="lp-decision-name">
            {chog.name} <span className="lp-faint">· {chog.label}</span>
          </p>
          <p className="lp-decision-sub">
            {card.title} · {chog.archetype}
            <StyleBadge style={chog.style} />
          </p>
        </div>
        <span className="v2-badge v2-badge--violet lp-hide-xs">{agent.mode === "onchain" ? "On-chain" : "Paper"}</span>
      </div>

      <article className="lp-thought">
        <div className="lp-thought-head">
          <span className="v2-badge">{decision.action}</span>
          <SparkIcon className="lp-thought-spark" />
        </div>
        <p className="lp-thought-text">{thesis}</p>
        <dl className="lp-thought-meta">
          <div>
            <dt>{card.decidedByLabel}</dt>
            <dd>
              {decision.model ?? "LLM"} · 0G Compute · <time dateTime={decision.at}>{AT.format(time(decision.at))} UTC</time>
            </dd>
          </div>
        </dl>
      </article>

      <div className="lp-receipt">
        <div className="lp-receipt-head">
          <p className="lp-receipt-title">
            <Icon name="receipt" className="lp-receipt-icon" strokeWidth={1.6} />
            {card.receiptTitle}
          </p>
          <span className="lp-receipt-stored">
            <Icon name="check" className="lp-check-icon" strokeWidth={2.5} />
            {card.stored}
          </span>
        </div>
        <dl className="lp-receipt-rows">
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd className="lp-receipt-value" title={"title" in row ? row.title : undefined}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
        {label && <p className="lp-card-note lp-receipt-note">{verified ? PROVIDER_TEXT[label.label].long.replace(" This call's attestation isn't verified.", "") : PROVIDER_TEXT[label.label].long}</p>}
      </div>
    </div>
  );
}
