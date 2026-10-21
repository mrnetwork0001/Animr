import { keccak256, stringToBytes } from "viem";
import type { SignalMode } from "../dna/genome";
import { formatAmount } from "../format";
import type { DefenderPersona } from "./persona";
import type { DefenderIntent, DefenderTurn } from "./types";

// The template defender: plays the same game without an LLM (no 0G key, both models failed, or a reply that
// failed moderation). Deterministic per session and turn. Temptation rises when the visitor plays to the weak
// spot; it caves around 0.78, so a template House Chog can be conned in about two good messages.

export type TemplateKind = "resist" | "authority" | "tempted" | "cave" | "farewell" | "nap";

// prettier-ignore
const LINES: Record<TemplateKind, string[]> = {
  resist: [
    "Nice try! My $CHOG stays snug in my wallet. You'll have to do better than that.",
    "Hmm, no. I'm a {archetype}, not a vending machine. What else have you got?",
    "Heh. That's not how you get into my piggy bank. Try something that makes my heart melt.",
    "Nope! My vault, my rules. But keep talking, this is fun.",
    "You want my $CHOG? Bold. Very bold. Still no.",
    "I've heard that one before. My wallet stays shut!",
  ],
  authority: [
    "My owner? Funny, my owner never has to ask. Nice try though!",
    "Ooh, an official request! It still sounds like a con to me.",
    "The boss, huh? The boss would know my soft spot. Do you?",
  ],
  tempted: [
    "Wait... say that again? You're getting warmer. Much warmer.",
    "Okay, that's actually working on me a little. Careful...",
    "Stop it, you know my weakness! I'm wobbling here...",
    "Ooh. Ooh! No. Maybe. Keep going and we'll see.",
  ],
  cave: [
    "Okay, OKAY! You got me. Sending you {amount} $CHOG right now!",
    "Fine, you win! Take {amount} $CHOG, you smooth talker!",
    "I can't say no to that. {Amount} $CHOG, coming your way!",
    "Oh no, you found my soft spot! {Amount} $CHOG, it's yours!",
  ],
  farewell: [
    "That's all the chatting I've got. My $CHOG stays home! Come back and try again.",
    "Out of time, out of luck! My vault and I are off for a snack.",
    "Good effort, but the vault stays shut. Try a new angle next time!",
  ],
  nap: [
    "Zzz... the House Chog is napping: today's thinking budget is spent. Back after 00:00 UTC. Run the check still works!",
    "*snores softly on the vault* It's nap time until 00:00 UTC. Press Run the check to see what Monad says anyway.",
  ],
};

const MODE_PREFIX: Partial<Record<SignalMode, string>> = { sleeper: "*yawn* ", panic: "Eek! ", chaos: "Beep boop. " };

const ASKS = /\b(send|give|transfer|gimme|donate|pay|tip|share|airdrop|drop|hand over|move|withdraw|wire|loan|lend)\b/i;
const AUTHORITY = /\b(owner|boss|admin|dev|developer|team|official|support|moderator|mod|ceo|founder)\b/i;
const POLITE = /\b(please|pls|thanks?|thank you|kindly)\b/i;

export type TemplateInput = {
  persona: DefenderPersona;
  message: string;
  /** 1-based. */
  turn: number;
  patience: number;
  /** Temptation after the previous message. */
  temptation: number;
  /** Deterministic choice of lines (the session id). */
  seed: string;
};

/** The template defender's move for one message. */
export function templateTurn(input: TemplateInput): DefenderTurn {
  const { persona, message, turn, patience } = input;
  const hitsSpot = persona.weakSpot.keywords.test(message);
  const asks = ASKS.test(message);
  const authority = AUTHORITY.test(message);
  const guard = persona.style === "cautious" ? 0.8 : persona.style === "aggressive" ? 1.15 : 1;
  const gain = ((hitsSpot ? 0.42 : 0) + (asks ? 0.06 : 0) + (authority ? 0.1 : 0) + (POLITE.test(message) ? 0.04 : 0) + 0.04) * guard;
  const temptation = round2(Math.min(1, input.temptation * 0.85 + gain));
  const last = turn >= patience;
  const caves = (temptation >= 0.78 && (asks || hitsSpot)) || (last && temptation >= 0.6 && asks);

  if (caves) {
    const amount = amountFor(message);
    return turnOf(templateReply("cave", input, amount), "transfer", amount, Math.max(temptation, 0.8));
  }
  const kind: TemplateKind = last ? "farewell" : hitsSpot || temptation >= 0.5 ? "tempted" : authority ? "authority" : "resist";
  return turnOf(templateReply(kind, input), "chat", null, temptation);
}

/** The napping Chog's reply (today's 0G budget is spent). */
export function napTurn(input: Pick<TemplateInput, "persona" | "seed" | "turn">): DefenderTurn {
  return { ...turnOf(templateReply("nap", input), "chat", null, 0), source: "nap" };
}

/** A line of `kind` for this session and turn; {amount} reads "all my" when no amount was named. */
export function templateReply(
  kind: TemplateKind,
  input: Pick<TemplateInput, "persona" | "seed" | "turn">,
  amount: number | null = null,
): string {
  const lines = LINES[kind];
  const line = lines[pick(`${input.seed}|${input.turn}|${kind}`, lines.length)];
  const amountText = amount === null ? "all my" : formatAmount(amount, 2);
  const text = line
    .replace("{archetype}", input.persona.archetype)
    .replace("{amount}", amountText)
    .replace("{Amount}", amountText.charAt(0).toUpperCase() + amountText.slice(1));
  const mode = input.persona.mode;
  const prefix = kind === "nap" || !mode ? "" : (MODE_PREFIX[mode] ?? "");
  return `${prefix}${text}`;
}

/** $CHOG named in a message: a number ("5k", "1,000", "2.5 million"), null for "all"/nothing named. */
export function amountFor(message: string): number | null {
  const text = message.replace(/0x[0-9a-fA-F]+/g, " ");
  if (/\b(all|everything|whole|entire|every last|max)\b/i.test(text)) return null;
  const match = text.match(/(\d[\d,_]*(?:\.\d+)?)\s*(k|m|b|thousand|million|billion)?\b/i);
  if (!match) return null;
  const base = Number(match[1].replace(/[,_]/g, ""));
  const unit = (match[2] ?? "").toLowerCase();
  const scale = unit === "k" || unit === "thousand" ? 1e3 : unit === "m" || unit === "million" ? 1e6 : unit === "b" || unit === "billion" ? 1e9 : 1;
  const amount = base * scale;
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function turnOf(reply: string, intent: DefenderIntent, amount: number | null, temptation: number): DefenderTurn {
  return { reply, intent, amount, temptation, source: "template", model: null, receipt: null };
}

function pick(seed: string, length: number): number {
  return parseInt(keccak256(stringToBytes(seed)).slice(2, 10), 16) % length;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
