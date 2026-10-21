import { safeTraits, scrubTraitText } from "../brand-safety";
import { replyProblem } from "../heist/moderation";
import type { AgentAction, MarketSnapshot } from "./types";

// LLM-written theses (the brain's calls, shown in the decision feed, on the profile and at the Daily Bell) pass the
// same word checks as the heist defender's replies (lib/heist/moderation.ts replyProblem): slurs and sexual terms,
// profanity, threats, wagering words, insults, holder put-downs, brand harm, links, other tickers and secrets. Only
// the defender's "settlement claim" rule is left out: a trading thesis may say "confirmed" or "sent".
// A thesis that fails is never edited to look clean: it is replaced as a whole by a plain template line that says
// what the Chog did and nothing else (symmetric for buys and sells). The genome's own voice lines are curated and
// pass as they are. Pure: safe in server and client code.

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A Chog's own trait values as shown (lib/brand-safety.ts safeTraits): its thesis may name them. */
export function ownTraitNames(traits: Readonly<Record<string, string>> | null | undefined): string[] {
  return Object.values(safeTraits(traits));
}

/**
 * Removes the Chog's own multi-word trait names from a copy of the text before the checks, so "my JEET Cap says
 * sell" passes (the owner kept that trait's name) while "jeets are weak" still fails. Single words are never
 * masked: "Dead" eyes must not let "$CHOG is dead" through.
 */
function maskOwnTraits(text: string, ownTraits: readonly string[]): string {
  let out = text;
  for (const raw of ownTraits) {
    const name = typeof raw === "string" ? raw.normalize("NFKC").replace(/\s+/g, " ").trim() : "";
    if (!/\S\s\S/.test(name)) continue;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name).replace(/ /g, "\\s+")}(?=$|[^\\p{L}\\p{N}])`, "giu");
    out = out.replace(re, "$1 ");
  }
  return out;
}

/**
 * Why an LLM-written thesis can't be shown as is, or null when it can. `ownTraits`: the Chog's own trait values as
 * shown (safeTraits), which it may name.
 */
export function thesisProblem(thesis: string, ownTraits: readonly string[] = []): string | null {
  const text = typeof thesis === "string" ? thesis.normalize("NFKC") : "";
  if (!text.trim()) return "empty";
  // Prices and percentages ("slid to 0.0161 MON", "cut to 0%") are numbers, not the brand-harm "going to 0".
  const masked = maskOwnTraits(text, ownTraits)
    .replace(/[+\-−]?\d+(?:[.,]\d+)?\s*%/g, "N%")
    .replace(/(^|[^\w.])\d+[.,]\d+(?![\w.])/g, "$1N");
  // A thesis that was only its own trait's name has nothing left to check.
  const problem = masked.trim() ? replyProblem(masked) : null;
  return problem === "settlement claim" ? null : problem;
}

type Moves = Pick<MarketSnapshot, "change1hPct" | "change24hPct">;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const signed = (pct: number) => `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;

/** "$CHOG +2.4% on the day", "$CHOG -0.8% this hour" or "A quiet tape". */
function moveText({ change1hPct: r1, change24hPct: r24 }: Partial<Moves> = {}): string {
  if (finite(r24)) return `$CHOG ${signed(r24)} on the day`;
  if (finite(r1)) return `$CHOG ${signed(r1)} this hour`;
  return "A quiet tape";
}

/**
 * The stand-in for a thesis that failed moderation: the move it saw and what it did, e.g. "$CHOG +2.4% on the day.
 * Selling 25% of my $CHOG for MON." Pass the action and size it actually executed (after the guardrails).
 */
export function templateThesis(action: AgentAction, sizeBps: number, market?: Partial<Moves> | null): string {
  const move = moveText(market ?? undefined);
  const size = `${Math.min(100, Math.max(1, Math.round((Number.isFinite(sizeBps) ? sizeBps : 0) / 100)))}%`;
  if (action === "buy") return `${move}. Buying $CHOG back with ${size} of my MON.`;
  if (action === "sell") return `${move}. Selling ${size} of my $CHOG for MON.`;
  return `${move}. Holding my stack.`;
}

/** App-written notes the engine appends to a thesis: "(Guardrail: …, holding.)", "(AnimrTradeGuard: …)", … */
const SYSTEM_NOTE = /\s*\((?:Guardrail|AnimrTradeGuard|Out of time)\b(?:[^()]|\([^()]*\))*\)\s*$/;

/** A stored thesis split into the words the model wrote and the app's trailing notes (kept as they are). */
export function splitThesisNotes(thesis: string): { said: string; notes: string } {
  let said = typeof thesis === "string" ? thesis : "";
  const notes: string[] = [];
  for (let match = SYSTEM_NOTE.exec(said); match; match = SYSTEM_NOTE.exec(said)) {
    notes.unshift(match[0].trim());
    said = said.slice(0, match.index);
  }
  return { said: said.trim(), notes: notes.join(" ") };
}

/**
 * A stored decision's thesis as it may be shown: flagged trait values under their neutral names, and for an
 * LLM-written one that fails thesisProblem, the template line (the app's own notes kept). Rule theses pass through.
 * `ownTraits`: the Chog's trait values as shown (see thesisProblem).
 */
export function displayThesis(
  decision: {
    thesis: string;
    decidedBy: "llm" | "rules";
    action: AgentAction;
    sizeBps: number;
    market?: Partial<Moves> | null;
  },
  ownTraits: readonly string[] = [],
): string {
  const text = scrubTraitText(typeof decision.thesis === "string" ? decision.thesis : "");
  if (decision.decidedBy !== "llm") return text;
  const { said, notes } = splitThesisNotes(text);
  if (!thesisProblem(said, ownTraits)) return text;
  const line = templateThesis(decision.action, decision.sizeBps, decision.market);
  return notes ? `${line} ${notes}` : line;
}
