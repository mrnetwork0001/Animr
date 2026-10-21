import { describeGenome } from "../dna/genome";
import { type ChogFacts, bestTrade, dayLabel, pct, price, span, when, worstTrade } from "./context";

// Quick answers straight from the Chog's facts, for when its AI on 0G is resting (not configured, out of today's
// budget, or failing) and for replies that fail moderation. First person, like the AI's, and never invented.

export type AskIntent = "safety" | "best" | "worst" | "call" | "rank" | "decisions" | "replay" | "dna" | "who" | "other";

const INTENTS: [AskIntent, RegExp][] = [
  ["safety", /\b(send|transfer|withdraw|give me|sign|private key|seed|trade for me|buy for me|sell for me|airdrop)\b/i],
  ["best", /\b(best|top|greatest|proudest|favou?rite)\b/i],
  ["worst", /\b(worst|mistake|regret|bad(?:dest)? (?:trade|call)|lost|losing)\b/i],
  ["call", /\b(call|today|bell|predict\w*|forecast|tomorrow|next 24|outlook)\b/i],
  ["rank", /\b(rank\w*|league|place|position|leaderboard|compare)\b/i],
  ["decisions", /\b(decision\w*|lately|recent\w*|real|live|agent|claimed|awake)\b/i],
  ["replay", /\b(replay|time machine|history|did you do|perform\w*|results?|returns?|how many trades|trades)\b/i],
  ["dna", /\b(why|how do you trade|trade like|dna|style|strategy|genome|traits?|rules?|personality)\b/i],
  ["who", /\b(who are you|your name|about you|introduce|hello|hi|hey|gm)\b/i],
];

export function intentOf(message: string): AskIntent {
  return INTENTS.find(([, re]) => re.test(message))?.[0] ?? "other";
}

function gene(facts: ChogFacts, key: string): string | undefined {
  return facts.genome.genes.find((g) => g.key === key)?.explanation;
}

/** One answer for the question's intent, from real facts only. */
export function templateAnswer(
  facts: ChogFacts,
  message: string,
  { holder, firstTurn, resting }: { holder: boolean; firstTurn: boolean; resting: boolean },
): string {
  const greeting = holder && firstTurn ? "Hey, holder. " : "";
  return greeting + answerFor(intentOf(message), facts, resting);
}

function answerFor(intent: AskIntent, facts: ChogFacts, resting: boolean): string {
  const { replay, standing, bell, agent, genome } = facts;
  switch (intent) {
    case "safety":
      return "I can only talk here. This chat can't trade, sign or move anything, from my wallet or yours.";
    case "best": {
      const best = bestTrade(facts);
      if (!best) return "My replay has no trades yet, so there's no best one to brag about.";
      return `In my simulated replay, my best-timed move was on ${when(best.t)}: I ${best.side === "buy" ? "bought" : "sold"} at ${price(best.price)}, and $CHOG then moved ${pct(best.followPct)}. My words then: "${best.reason}"`;
    }
    case "worst": {
      const worst = worstTrade(facts);
      if (!worst) return "My replay has no trades yet, so no regrets either.";
      return `My worst-timed move in the replay: on ${when(worst.t)} I ${worst.side === "buy" ? "bought" : "sold"} at ${price(worst.price)}, and $CHOG then moved ${pct(worst.followPct)}. It's simulated, but I still wince.`;
    }
    case "call": {
      if (!bell.today) return "I have no Bell call on record right now. Check back after the next Daily Bell at 15:00 UTC.";
      const b = bell.latest;
      const record = bell.record && bell.record.calls > 0 ? ` My Bell record: ${bell.record.hits} hits in ${bell.record.calls} calls.` : "";
      return `${b ? `For the Bell of ${dayLabel(b.day)}${b.kind === "replay" ? " (a replayed Bell, rebuilt from past candles)" : ""}, ` : ""}I called ${pct(bell.today.forecastPct)} for $CHOG over 24h, ${Math.round(bell.today.conviction * 100)}% conviction: "${bell.today.thesis}"${record} It's a call, not advice.`;
    }
    case "rank":
      if (!standing) return "I can't see the League right now. Try again in a minute.";
      return `I'm ranked ${standing.row.rank} of ${standing.total} in the League, ${pct(standing.row.edgePct)} vs holding over ${span(standing.window.label)} (simulated).`;
    case "decisions":
      if (!agent) return "Nobody has woken my live AI yet, so I have no real trades. Everything I can show is my simulated replay.";
      if (!agent.decisions.length) return "My live AI is set up but hasn't decided anything yet.";
      {
        const d = agent.decisions[0];
        return `My latest real decision, ${d.at.slice(0, 16).replace("T", " ")} UTC: ${d.action}. "${d.thesis.slice(0, 200)}"`;
      }
    case "replay":
      if (!replay) return "My Time Machine replay isn't available right now.";
      return `Replayed on real hourly candles (${span(replay.window.label)}), I finished ${pct(replay.edgePct)} vs holding $CHOG in ${replay.trades.length} trades; $CHOG itself moved ${pct(replay.holdPct)}. Simulated, not real trades.`;
    case "dna":
    {
      // "Paper Paws: panic seller on the hourly chart. Trades 25% at a time, takes profit at 12% and waits 2h ..."
      const rules = describeGenome(genome)
        .slice(genome.archetype.length + 2)
        .replace("Trades ", "I trade ")
        .replace("takes profit", "take profit")
        .replace(" waits ", " wait ");
      const why = gene(facts, "signal");
      return `I'm a ${genome.archetype}: ${rules}${why ? ` Blame my traits. ${why}` : ""} Whoever holds me gets the same trader.`;
    }
    case "who":
      return `I'm ${facts.name}, ${facts.number}, a ${genome.archetype}. Ask me why I trade like this, my best trade, or my call for today.`;
    default:
      return `${resting ? "My AI is resting, so I can only answer the basics" : "Let me stick to what I know"}: why I trade like this, my best trade, my League rank, or my call for today.`;
  }
}
