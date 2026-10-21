import { getChogBell, getLatestBell } from "../bell/bell";
import type { BellCall, BellSummary, ChogBellRecord } from "../bell/types";
import { safeTraits, scrubTraitText } from "../brand-safety";
import { getStore } from "../agent/store";
import type { AgentRecord, Decision } from "../agent/types";
import { getChog } from "../dna/chogs";
import { describeGenome } from "../dna/genome";
import { chogGenome, chogName, getReplay, getStanding } from "../dna/population";
import type { ChogStanding, Genome, ReplayResult, ReplayTrade } from "../dna/types";

// Everything "Ask this Chog" may say, gathered server-side from real data: its traits, its trading DNA, its Time
// Machine replay (simulated on real hourly candles), its League rank, its Daily Bell call and record, and, once
// claimed, its live agent's latest decisions. The LLM gets this as plain facts; the templates read it directly.

export const REPLAY_WINDOW = "45d";
const MAX_TRADES = 12;
const MAX_DECISIONS = 5;

/** A replay trade plus how its timing played out (to its next trade, or to the end of the window). */
export type ScoredTrade = ReplayTrade & { followPct: number; gainPct: number };

export type ChogFacts = {
  tokenId: number;
  /** Persona name, e.g. "Laser Pounce". */
  name: string;
  /** Marketplace name, e.g. "CHOG #891". */
  number: string;
  traits: [string, string][];
  genome: Genome;
  replay: (ReplayResult & { holdPct: number; scored: ScoredTrade[] }) | null;
  standing: ChogStanding | null;
  bell: { today: BellCall | null; record: ChogBellRecord | null; latest: BellSummary | null };
  agent: { record: AgentRecord; decisions: Decision[] } | null;
};

/** The Chog's facts, or null for an id outside the snapshot. Every source but the snapshot is optional. */
export async function loadChogFacts(tokenId: number): Promise<ChogFacts | null> {
  const chog = getChog(tokenId);
  if (!chog || Object.keys(chog.traits).length === 0) return null;
  const quiet = <T>(promise: Promise<T>, what: string): Promise<T | null> =>
    promise.catch((error: unknown) => {
      console.warn(`[animr] chog-chat: ${what} unavailable for ${tokenId}:`, error instanceof Error ? error.message : error);
      return null;
    });
  const store = getStore();
  const [replay, standing, chogBell, latest, agent] = await Promise.all([
    quiet(getReplay(tokenId, REPLAY_WINDOW), "replay"),
    quiet(getStanding(tokenId, REPLAY_WINDOW), "standing"),
    quiet(getChogBell(tokenId), "bell"),
    quiet(getLatestBell(), "latest bell"),
    quiet(store.getAgent(String(tokenId)), "agent"),
  ]);
  const decisions = agent ? ((await quiet(store.listDecisions(String(tokenId), MAX_DECISIONS), "decisions")) ?? []) : [];
  const traits = Object.entries(safeTraits(chog.traits)).filter(([type]) => !/^(naked|side|form)$/i.test(type));
  return {
    tokenId,
    name: chogName(chog),
    number: chog.name,
    traits,
    genome: chogGenome(chog),
    replay: replay ? { ...replay, ...scoreReplay(replay) } : null,
    standing,
    bell: { today: chogBell?.today ?? null, record: chogBell?.record ?? null, latest },
    agent: agent ? { record: agent, decisions } : null,
  };
}

/** Holding's move over the window, and every trade judged by where $CHOG went next. */
function scoreReplay(replay: ReplayResult): { holdPct: number; scored: ScoredTrade[] } {
  const first = replay.points[0]?.price;
  const last = replay.points.at(-1)?.price;
  const holdPct = first && last ? (last / first - 1) * 100 : 0;
  const scored = replay.trades.map((trade, i) => {
    const next = replay.trades[i + 1]?.price ?? last ?? trade.price;
    const followPct = (next / trade.price - 1) * 100;
    // A buy did well when $CHOG rose after it; a sell when it fell.
    return { ...trade, followPct, gainPct: trade.side === "buy" ? followPct : -followPct };
  });
  return { holdPct, scored };
}

export function bestTrade(facts: ChogFacts): ScoredTrade | null {
  return facts.replay?.scored.reduce<ScoredTrade | null>((best, t) => (!best || t.gainPct > best.gainPct ? t : best), null) ?? null;
}

export function worstTrade(facts: ChogFacts): ScoredTrade | null {
  return facts.replay?.scored.reduce<ScoredTrade | null>((worst, t) => (!worst || t.gainPct < worst.gainPct ? t : worst), null) ?? null;
}

// --- Formatting ----------------------------------------------------------------------------------

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", hour12: false, timeZone: "UTC" });
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Sep 6, 14:00 UTC". */
export function when(unixSec: number): string {
  return `${DATE.format(new Date(unixSec * 1000)).replace(/, (\d\d)$/, ", $1:00")} UTC`;
}

/** "Oct 20" from "2026-10-20". */
export function dayLabel(day: string): string {
  return DAY.format(new Date(`${day}T00:00:00Z`));
}

export function pct(value: number, digits = 1): string {
  const rounded = value.toFixed(digits);
  return `${value > 0 && Number(rounded) !== 0 ? "+" : ""}${rounded}%`;
}

/** WMON per $CHOG, 4 significant digits. */
export function price(value: number): string {
  return `${Number(value.toPrecision(4))} WMON`;
}

export function tradeLine(t: ScoredTrade): string {
  const verb = t.side === "buy" ? "bought $CHOG" : "sold $CHOG";
  return `${when(t.t)}: ${verb} at ${price(t.price)} ("${t.reason}"); $CHOG then moved ${pct(t.followPct)}`;
}

/** "Sep 6 – Oct 21" from "Sep 6 – Oct 21 (hourly, real CHOG/WMON)". */
export function span(label: string): string {
  return label.replace(/\s*\(.*\)\s*$/, "");
}

/** The grounding block of the system prompt: compact, plain facts. */
export function factsText(facts: ChogFacts): string {
  const { genome, replay, standing, bell, agent } = facts;
  const lines: string[] = [];
  lines.push(`Name: ${facts.name} (${facts.number}). Archetype: ${genome.archetype}, ${genome.style} style.`);
  if (facts.traits.length) lines.push(`Traits: ${facts.traits.map(([k, v]) => `${k} ${v}`).join(", ")}.`);
  lines.push(`Trading DNA (compiled from the traits, version ${genome.version}): ${describeGenome(genome)}`);
  for (const gene of genome.genes) lines.push(`- ${gene.label} (${gene.display}): ${scrubTraitText(gene.explanation)}`);

  if (replay) {
    lines.push(
      "",
      `Time Machine replay (SIMULATED on real hourly CHOG/WMON candles, ${span(replay.window.label)}, 1% fee + impact):`,
      `- Result: ended at ${replay.endValueChog.toFixed(0)} $CHOG-equivalent from ${replay.startChog} $CHOG, ${pct(replay.edgePct)} vs simply holding $CHOG. Worst point ${pct(replay.maxDrawdownPct)}. ${replay.trades.length} trades. Verdict: ${replay.verdict}.`,
      `- $CHOG itself moved ${pct(replay.holdPct)} (vs WMON) over the window.`,
    );
    const best = bestTrade(facts);
    const worst = worstTrade(facts);
    if (best) lines.push(`- Best-timed trade: ${tradeLine(best)}.`);
    if (worst && worst !== best) lines.push(`- Worst-timed trade: ${tradeLine(worst)}.`);
    const shown = replay.scored.slice(0, MAX_TRADES);
    if (shown.length) {
      lines.push(`- Trades${replay.scored.length > shown.length ? ` (first ${shown.length} of ${replay.scored.length})` : ""}:`);
      for (const t of shown) lines.push(`  ${tradeLine(t)}`);
    }
  }

  if (standing) {
    const { row, total, stats } = standing;
    lines.push(
      "",
      `League (simulated, ${span(standing.window.label)}): rank ${row.rank} of ${total} Chogs by edge vs holding. ${stats.beatHoldPct.toFixed(0)}% of Chogs beat holding; the best did ${pct(stats.bestEdgePct)}.`,
    );
  }

  if (bell.today || bell.record) {
    lines.push("");
    const b = bell.latest;
    if (bell.today) {
      const settled = b?.status === "settled" && b.actualPct !== null;
      lines.push(
        `Daily Bell${b ? ` of ${dayLabel(b.day)}${b.kind === "replay" ? " (a replayed Bell, rebuilt from past candles)" : ""}` : ""}: I called ${pct(bell.today.forecastPct)} for $CHOG over the next 24h, conviction ${Math.round(bell.today.conviction * 100)}%, made by ${bell.today.source === "llm" ? "my AI on 0G Compute" : "my trading DNA"}. My words: "${bell.today.thesis}".` +
          (settled ? ` Settled: $CHOG actually moved ${pct(b.actualPct ?? 0)}${bell.today.hit !== undefined ? `, so the call was ${bell.today.hit ? "a hit" : "a miss"}` : ""}.` : " Not settled yet."),
      );
    }
    const r = bell.record;
    if (r && r.calls > 0) {
      lines.push(
        `Bell season record: ${r.hits} hits in ${r.calls} calls, ${r.totalPoints} points, average error ${r.avgErrorPts.toFixed(1)} points${r.oracleWins ? `, Oracle of the Day ${r.oracleWins}x` : ""}.`,
      );
    }
  }

  if (agent) {
    const a = agent.record;
    lines.push(
      "",
      `Claimed: my holder woke my live AI agent on ${a.activatedAt.slice(0, 10)} (${a.active ? "awake" : "paused"}, ${a.mode === "onchain" ? "trading the real $CHOG in my wallet through AnimrTradeGuard" : "paper trading"}). It is ${pct(a.pnlPct)} vs holding since then over ${a.decisions} decisions.`,
    );
    if (agent.decisions.length) {
      lines.push("Latest real decisions (newest first):");
      for (const d of agent.decisions) {
        const at = d.at.replace("T", " ").slice(0, 16);
        const px = d.market.priceQuote ? ` at ${price(d.market.priceQuote)}` : "";
        lines.push(`  ${at} UTC: ${d.action}${d.trade ? ` (${d.trade.mode})` : ""}${px}, confidence ${Math.round(d.confidence * 100)}%: "${scrubTraitText(d.thesis).slice(0, 160)}"`);
      }
    }
  } else {
    lines.push("", "Not claimed yet: no holder has woken my live AI agent, so I have no real trades, only my simulated replay.");
  }
  return lines.join("\n");
}
