import { keccak256, stringToBytes } from "viem";
import type { MarketSnapshot, TradingStyle } from "../agent/types";
import { traitSafety } from "../brand-safety";
import type { Gene, Genome } from "./types";

// A Chog's trading DNA. Its traits pick genes from the readable table below; the same genes drive
// the replay engine (lib/dna/backtest.ts), the live "instinct" (rules brain in lib/agent/brain.ts),
// the LLM's character sheet and the Daily Bell forecast. GENOME_VERSION hashes the whole table, so
// changing any rule or number changes the version shown next to every result.
//
// Every trade is $CHOG <-> MON. A Chog starts fully in $CHOG and wins when it ends with more $CHOG
// than it started with: sell into a move it expects to reverse (or continue down), buy back cheaper.

export type SignalMode = "momentum" | "contrarian" | "sleeper" | "panic" | "trend" | "dip" | "chaos" | "steady";
type View = "1h" | "24h";
type SizeClass = "whale" | "standard" | "nibbler";
type TriggerClass = "hot" | "alert" | "calm" | "cold";
type ExitClass = "jeet" | "early" | "patient" | "run";
type Bias = "none" | "bull" | "bear" | "knife";
type Tempo = "fast" | "style" | "slow" | "nap";
type Nerve = "normal" | "wagmi" | "fearless" | "meltdown";

/** The engine's knobs (Genome.params, typed). */
export type GenomeParams = {
  mode: SignalMode;
  view: View;
  /** Trigger, as a move over 24h in % (an hourly move counts H1_SCALE times). */
  thetaPct: number;
  /** Per trade, in bps of the balance being sold. */
  sizeBps: number;
  /** Most of the stack (bps of its value) that may sit in MON. */
  capBps: number;
  /** Take profit: buy back once $CHOG is this % below the last trade. */
  tpPct: number;
  /** Admit a wrong call: buy back once $CHOG is this % above the last trade (0 = never). */
  slPct: number;
  bias: Bias;
  cooldownH: number;
  nerve: Nerve;
  /** Added to every confidence and conviction (tier). */
  conviction: number;
  /** 0-1 from all 13 traits: fine-tunes the trigger, seeds the chaos coin and a ±1 pt forecast jitter. */
  seed: number;
};

// --- The gene table ---------------------------------------------------------------------------
// Rules match trait values case-insensitively; the first match wins.

const SIGNALS: { re: RegExp; mode: SignalMode; noun: string; display: string; why: string }[] = [
  { re: /cry|tear|worried|sad|sob/i, mode: "panic", noun: "Paper Paws", display: "Panic seller", why: "sells fast when $CHOG slides and buys back only after a clear recovery" },
  { re: /laser/i, mode: "momentum", noun: "Laser Chaser", display: "Momentum chaser", why: "chases breakouts, buying $CHOG after a pump and selling after a drop" },
  { re: /side ?eye|smirk|\bmog\b/i, mode: "contrarian", noun: "Fader", display: "Contrarian", why: "fades the crowd, selling pumps and buying dips" },
  { re: /tired|closed|dead|sleep|zzz/i, mode: "sleeper", noun: "Sleeper", display: "Sleeper", why: "naps through the noise and wakes only to fade a huge move" },
  { re: /heart|happy|love|star/i, mode: "dip", noun: "Dip Romantic", display: "Dip lover", why: "buys dips early and sells only big pumps" },
  { re: /visor|\bvr\b|glass|goggle|shade|thug|monocle|scope/i, mode: "trend", noun: "Trend Rider", display: "Trend rider", why: "trades only when the last hour and the last day point the same way" },
  { re: /clown|\bxd\b|retard|frog|spiral|dizzy|crazy|derp/i, mode: "chaos", noun: "Chaos Clown", display: "Vibes trader", why: "trades on vibes, acting on a seeded coin flip now and then" },
  { re: /angry|viper|vertical|fire|rage|evil|demon|snake/i, mode: "momentum", noun: "Breakout Chaser", display: "Momentum chaser", why: "pounces on strong moves, buying pumps and selling drops" },
];
const STEADY_SIGNAL = { mode: "steady" as const, noun: "Swing Trader", display: "Swing trader", why: "stays calm and trades only big daily swings, once the hour starts to reverse them" };

/** An hourly move counts this many times in % of a daily move (|1h| p90 ≈ 5%, |24h| p90 ≈ 17%). */
const H1_SCALE = 3.5;

const TRIGGERS: { re: RegExp; trigger: TriggerClass }[] = [
  { re: /burn|fier|fire|flame|blaze|inferno/i, trigger: "hot" },
  { re: /cool|aqua|clean|ice|frost|snow/i, trigger: "cold" },
  { re: /./, trigger: "alert" },
];
const THETA: Record<TriggerClass, number> = { hot: 6, alert: 9, calm: 12, cold: 15 };
/** Each Chog's full trait mix (its seed) fine-tunes the trigger within ±TEMPER. */
const TEMPER = 0.15;
const TRIGGER_DISPLAY: Record<TriggerClass, string> = { hot: "Hair trigger", alert: "Alert", calm: "Unbothered", cold: "Ice cold" };

const HEAD_SIZES: { re: RegExp; size: SizeClass }[] = [
  { re: /crown|diamond|mega|king|spartan|thorn|wreath|halo|royal/i, size: "whale" },
  { re: /beanie|bucket/i, size: "nibbler" },
];
const SIZE_BPS: Record<SizeClass, number> = { whale: 4000, standard: 2500, nibbler: 1200 };
// Display text only (not in TABLE, so GENOME_VERSION ignores it): trading words, never wagering ones.
const SIZE_DISPLAY: Record<SizeClass, string> = { whale: "Big trades", standard: "Standard trades", nibbler: "Nibbles" };
const JEET_HEAD = /jeet/i;
const WAGMI_HEAD = /wagmi/i;
const FAST_HEAD = /10k|tps/i;

const TIERS: Record<string, { capBps: number; conviction: number }> = {
  legendary: { capBps: 8000, conviction: 0.15 },
  epic: { capBps: 6500, conviction: 0.1 },
  rare: { capBps: 5500, conviction: 0.05 },
  uncommon: { capBps: 4500, conviction: 0 },
  common: { capBps: 4000, conviction: 0 },
};

const MOUTHS: { re: RegExp; exit: ExitClass }[] = [
  { re: /gold|tooth|btc|coin|dollar|money/i, exit: "early" },
  { re: /drool|bubble|gum|tongue/i, exit: "run" },
];
const TP_PCT: Record<ExitClass, number> = { jeet: 4, early: 6, patient: 12, run: 25 };

const ACCESSORIES: { re: RegExp; bias?: Bias; tempo?: Tempo }[] = [
  { re: /green candle/i, bias: "bull" },
  { re: /red candle/i, bias: "bear" },
  { re: /knife|dagger|blade|sword/i, bias: "knife" },
  { re: /cigar|pipe|cigarette/i, tempo: "slow" },
];
/** Buy / sell trigger multipliers per bias. */
const BIAS_TRIGGER: Record<Bias, { buy: number; sell: number }> = {
  none: { buy: 1, sell: 1 },
  bull: { buy: 0.7, sell: 1.5 },
  bear: { buy: 1.5, sell: 0.7 },
  knife: { buy: 1, sell: 1 },
};
/** Knife Chogs buy any crash this many triggers deep. */
const KNIFE_DEPTH = 1.5;

const STYLE_COOLDOWN_H: Record<TradingStyle, number> = { aggressive: 2, balanced: 4, cautious: 8 };
const TEMPO_H: Record<Exclude<Tempo, "style">, number> = { fast: 2, slow: 12, nap: 24 };

const SKULL = /skull/i;
const RADIOACTIVE = /radioactive/i;
const SL_PCT: Record<Nerve, number> = { normal: 15, wagmi: 0, fearless: 15, meltdown: 6 };

/**
 * The ten 1:1 Legendaries carry no visual traits (only Base "1:1" and Tier), so their name
 * (metadata "CHOG #53 — Blaze") stands in for them: each reads as a set of signature traits.
 */
const LEGENDS: Record<string, Record<string, string>> = {
  blaze: { Eyes: "Blaze's fire laser", Aura: "Blaze's burning aura" },
  "burning skully": { Eyes: "Burning Skully's dead", Aura: "Burning Skully's burning aura", Form: "Burning Skully's skull" },
  "chog scream": { Eyes: "Chog Scream's crying", Side: "Chog Scream's right glance" },
  chogbomination: { Eyes: "Chogbomination's clown", Background: "Chogbomination's radioactive glow" },
  frogger: { Eyes: "Frogger's frog", Head: "Frogger's 10k TPS hop", Side: "Frogger's right hop" },
  grim: { Eyes: "Grim's dead", Accessory: "Grim's knife" },
  halo: { Eyes: "Halo's heart", Head: "Halo's halo" },
  krown: { Eyes: "Krown's smirking", Head: "Krown's crown" },
  midas: { Eyes: "Midas's happy", Mouth: "Midas's gold tooth", Accessory: "Midas's green candle" },
  redd: { Eyes: "Redd's angry", Accessory: "Redd's red candle" },
};
const ONE_OF_ONE = /^1:1$/;

const STYLE_SCORE = {
  mode: { momentum: 2, panic: 1, chaos: 1, trend: 0, steady: 0, dip: -1, contrarian: -1, sleeper: -2 },
  trigger: { hot: 1, alert: 0, calm: 0, cold: -1 },
  size: { whale: 1, standard: 0, nibbler: -1 },
  tempo: { fast: 3, style: 0, slow: -2, nap: 0 },
} as const;
/** Style score at or above `aggressive` is aggressive, at or below `cautious` cautious, balanced between. */
const STYLE_BANDS = { aggressive: 1, cautious: -1 } as const;

/** Chaos Chogs flip their coin about once every this many hours. */
const CHAOS_EVERY_H = 18;
/** A signal trade needs a fresh move: since the last trade, the price must have moved this many triggers its way. */
const FRESH = 0.5;
/** Balances below this share of the stack count as empty. */
const DUST_SHARE = 1e-4;

/** Replay constants that change results, versioned with the table. */
export const REPLAY = {
  /** Bump when lib/dna/backtest.ts changes how a replay plays out. */
  engineRev: 2,
  /** Every Chog starts with the same demo bankroll as a new paper agent. */
  startChog: 1000,
  /** CHOG/WMON 1% pool depth for price impact (Oct 2026: ~$90k, ~4.3M WMON across both sides). */
  liquidityWmon: 4_000_000,
  /** Smallest trade, in bps of the balance being sold. */
  minTradeBps: 100,
} as const;

const TABLE = {
  rev: 1,
  SIGNALS, STEADY_SIGNAL, H1_SCALE, TRIGGERS, THETA, HEAD_SIZES, SIZE_BPS, JEET_HEAD, WAGMI_HEAD, FAST_HEAD, TIERS,
  MOUTHS, TP_PCT, ACCESSORIES, BIAS_TRIGGER, KNIFE_DEPTH, STYLE_COOLDOWN_H, TEMPO_H, SKULL, RADIOACTIVE, SL_PCT,
  STYLE_SCORE, STYLE_BANDS, TEMPER, CHAOS_EVERY_H, FRESH, DUST_SHARE, REPLAY, buyback: "whole MON leg", LEGENDS, ONE_OF_ONE,
};

/** Short hash of the gene table, e.g. "g1-3fa9c2". */
export const GENOME_VERSION = `g${TABLE.rev}-${keccak256(
  stringToBytes(JSON.stringify(TABLE, (_key, value) => (value instanceof RegExp ? `/${value.source}/${value.flags}` : value))),
).slice(2, 8)}`;

// --- Derivation -------------------------------------------------------------------------------

function trait(traits: Record<string, string>, type: string): { type: string; value: string } | undefined {
  const key = Object.keys(traits).find((k) => k.toLowerCase() === type.toLowerCase());
  const value = key ? traits[key]?.trim() : "";
  return key && value ? { type: key, value } : undefined;
}

function firstMatch<T extends { re: RegExp }>(rules: readonly T[], value: string | undefined): T | undefined {
  return value === undefined ? undefined : rules.find((rule) => rule.re.test(value));
}

/** 0-1 from the canonical trait list (same canonical form as the persona hash). */
function traitSeed(traits: Record<string, string>): number {
  const canonical = Object.entries(traits)
    .map(([key, value]) => `${key.toLowerCase()}=${value.toLowerCase()}`)
    .sort()
    .join(";");
  return parseInt(keccak256(stringToBytes(`animr:genome|${canonical}`)).slice(2, 10), 16) / 2 ** 32;
}

function pct(value: number, digits = 0): string {
  return `${Number(value.toFixed(digits))}%`;
}

/**
 * How a gene explanation names a trait: its value as shown (lib/brand-safety.ts: flagged values under their neutral
 * names), or undefined when the value is hidden. Text only: the genes themselves read the raw values.
 */
function shown(t: { type: string; value: string } | undefined): string | undefined {
  if (!t) return undefined;
  const verdict = traitSafety(t.type, t.value);
  return verdict.action === "hide" || !verdict.display.trim() ? undefined : verdict.display;
}

/** "Side Eye", "Purple Laser eyes": an eye trait named once ("Side Eye: it…", not "Side Eye eyes: it…"). */
function eyesName(name: string): string {
  return /\beyes?\b/i.test(name) ? name : `${name} eyes`;
}

/** "Laser eyes: it" when the trait has a name to show, else the plain lead-in ("It"). */
function lead(name: string | undefined, plain = "It"): string {
  return name ? `${name}: it` : plain;
}

const SIGNAL_BAR: Record<SignalMode, number> = { momentum: 90, panic: 70, trend: 65, chaos: 50, steady: 45, dip: 30, contrarian: 15, sleeper: 10 };
const TRIGGER_BAR: Record<TriggerClass, number> = { hot: 90, alert: 60, calm: 40, cold: 20 };
const EXIT_BAR: Record<ExitClass, number> = { jeet: 95, early: 80, patient: 55, run: 20 };
const BIAS_BAR: Record<Bias, number> = { none: 50, bull: 90, bear: 10, knife: 70 };
const NERVE_BAR: Record<Nerve, number> = { normal: 50, wagmi: 95, fearless: 85, meltdown: 15 };

/** The legend name of a 1:1 Legendary ("Blaze" from "CHOG #53 — Blaze"), when it has one. */
function legendOf(traits: Record<string, string>, name: string | undefined): string | undefined {
  const base = trait(traits, "Base");
  if (!base || !ONE_OF_ONE.test(base.value) || !name) return undefined;
  const legend = name.split(/\s[—–-]\s/).pop()?.trim().toLowerCase();
  return legend && LEGENDS[legend] ? legend : undefined;
}

/**
 * A Chog's trading genome: a pure function of its traits (missing traits get the defaults).
 * Pass the metadata name too: the ten 1:1 Legendaries have no visual traits and get their genome
 * from it (without it they share one default genome).
 */
export function deriveGenome(chogTraits: Record<string, string>, name?: string): Genome {
  const legend = legendOf(chogTraits, name);
  const traits = legend ? { ...chogTraits, ...LEGENDS[legend], Name: name ?? "" } : chogTraits;
  const eyes = trait(traits, "Eyes");
  const side = trait(traits, "Side");
  const aura = trait(traits, "Aura");
  const head = trait(traits, "Head");
  const mouth = trait(traits, "Mouth");
  const accessory = trait(traits, "Accessory");
  const tier = trait(traits, "Tier");
  const specials = ["Form", "Base", "Background"].map((type) => trait(traits, type));

  const signal = firstMatch(SIGNALS, eyes?.value) ?? STEADY_SIGNAL;
  const view: View = side && /right/i.test(side.value) ? "1h" : "24h";
  const triggerClass: TriggerClass = aura ? firstMatch(TRIGGERS, aura.value)!.trigger : "calm";
  const sizeRule = firstMatch(HEAD_SIZES, head?.value);
  const sizeClass: SizeClass = sizeRule?.size ?? "standard";
  const tierInfo = TIERS[tier?.value.toLowerCase() ?? ""] ?? TIERS.common;
  const jeet = !!head && JEET_HEAD.test(head.value);
  const mouthRule = firstMatch(MOUTHS, mouth?.value);
  const exitClass: ExitClass = jeet ? "jeet" : (mouthRule?.exit ?? "patient");
  const accessoryRule = firstMatch(ACCESSORIES, accessory?.value);
  const bias: Bias = accessoryRule?.bias ?? "none";
  const tempo: Tempo =
    head && FAST_HEAD.test(head.value) ? "fast" : accessoryRule?.tempo ? accessoryRule.tempo : signal.mode === "sleeper" ? "nap" : "style";
  const skull = specials.find((t) => t && SKULL.test(t.value));
  const radioactive = specials.find((t) => t && RADIOACTIVE.test(t.value));
  const nerve: Nerve = head && WAGMI_HEAD.test(head.value) ? "wagmi" : skull ? "fearless" : radioactive ? "meltdown" : "normal";

  const score =
    STYLE_SCORE.mode[signal.mode] + STYLE_SCORE.trigger[triggerClass] + STYLE_SCORE.size[sizeClass] + STYLE_SCORE.tempo[tempo];
  const style: TradingStyle =
    score >= STYLE_BANDS.aggressive ? "aggressive" : score <= STYLE_BANDS.cautious ? "cautious" : "balanced";
  const cooldownH = Math.max(tempo === "style" ? 0 : TEMPO_H[tempo], STYLE_COOLDOWN_H[style]);

  const seed = Number(traitSeed(traits).toFixed(6));
  const params: GenomeParams = {
    mode: signal.mode,
    view,
    thetaPct: Math.round(THETA[triggerClass] * (1 - TEMPER + 2 * TEMPER * seed) * 10) / 10,
    sizeBps: SIZE_BPS[sizeClass],
    capBps: tierInfo.capBps,
    tpPct: TP_PCT[exitClass],
    slPct: SL_PCT[nerve],
    bias,
    cooldownH,
    nerve,
    conviction: tierInfo.conviction,
    seed,
  };

  const theta = params.thetaPct;
  // Explanations name traits as they are shown (flagged values under their neutral names; see shown()).
  const tierName = tier ? shown(tier) : "Common";
  const notableTier = tierInfo.conviction > 0;
  const eyesShown = shown(eyes);
  const headShown = shown(head);
  const accessoryShown = shown(accessory);
  const genes: Gene[] = [
    {
      key: "signal",
      label: "Signal",
      value: SIGNAL_BAR[signal.mode],
      display: signal.display,
      ...(eyes && { trait: eyes }),
      explanation: `${eyes ? lead(eyesShown && eyesName(eyesShown)) : "No eye trait: it"} ${signal.why}.`,
    },
    {
      key: "horizon",
      label: "Horizon",
      value: view === "1h" ? 20 : 80,
      display: view === "1h" ? "Hourly chart" : "Daily chart",
      ...(side && { trait: side }),
      explanation:
        view === "1h"
          ? `Facing right, it reads the last hourly candle (a ${pct(theta / H1_SCALE, 1)} hour counts like a ${pct(theta, 1)} day).`
          : `${side ? "Facing left" : "With no side"}, it reads the last 24 hours.`,
    },
    {
      key: "trigger",
      label: "Trigger",
      value: TRIGGER_BAR[triggerClass],
      display: TRIGGER_DISPLAY[triggerClass],
      ...(aura && { trait: aura }),
      explanation: `${aura ? lead(shown(aura)) : "No aura: it"} acts once $CHOG moves ${pct(theta, 1)} in a day (its full trait mix fine-tunes the exact number).`,
    },
    {
      key: "size",
      label: "Size",
      value: Math.round(params.sizeBps / 50),
      display: `${SIZE_DISPLAY[sizeClass]} · ${pct(params.sizeBps / 100)}`,
      ...(sizeRule && head ? { trait: head } : notableTier && tier ? { trait: tier } : {}),
      explanation: `${sizeRule && head ? lead(headShown) : "It"} trades ${pct(params.sizeBps / 100)} of a balance at a time, and its ${tierName ? `${tierName} ` : ""}tier lets up to ${pct(params.capBps / 100)} of the stack sit in MON.`,
    },
    {
      key: "exit",
      label: "Exit",
      value: EXIT_BAR[exitClass],
      display: exitClass === "jeet" ? "Jeets fast" : exitClass === "early" ? "Early profit" : exitClass === "run" ? "Lets it run" : "Patient profit",
      ...(jeet && head ? { trait: head } : mouthRule && mouth ? { trait: mouth } : {}),
      explanation: `${jeet && head ? lead(headShown) : mouthRule && mouth ? lead(shown(mouth)) : "It"} takes profit, buying $CHOG back, once $CHOG is ${pct(params.tpPct)} cheaper than at its last trade.`,
    },
    {
      key: "bias",
      label: "Bias",
      value: BIAS_BAR[bias],
      display: bias === "bull" ? "Permabull" : bias === "bear" ? "Permabear" : bias === "knife" ? "Knife catcher" : "Neutral",
      ...(bias !== "none" && accessory && { trait: accessory }),
      explanation:
        bias === "bull"
          ? `${lead(accessoryShown)} buys dips sooner, sells pumps later and never sells into a drop.`
          : bias === "bear"
            ? `${lead(accessoryShown)} sells sooner and buys back later.`
            : bias === "knife"
              ? `${lead(accessoryShown)} catches falling knives, buying any ${pct(theta * KNIFE_DEPTH, 1)} crash.`
              : "No market bias: it reads the chart as it is.",
    },
    {
      key: "tempo",
      label: "Tempo",
      value: Math.round(100 - (cooldownH / 24) * 90),
      display: `${cooldownH}h between trades`,
      ...(tempo === "fast" && head ? { trait: head } : tempo === "slow" && accessory ? { trait: accessory } : tempo === "nap" && eyes ? { trait: eyes } : {}),
      explanation:
        tempo === "fast"
          ? `${headShown ? `${headShown}: impatient, it` : "Impatient, it"} is ready to trade again ${cooldownH}h after a trade.`
          : tempo === "slow"
            ? `${lead(accessoryShown)} lights up and waits ${cooldownH}h between trades.`
            : tempo === "nap"
              ? `${lead(eyesShown && eyesName(eyesShown))} naps ${cooldownH}h after every trade.`
              : `It waits ${cooldownH}h between trades, like any ${style} trader.`,
    },
    {
      key: "nerve",
      label: "Nerve",
      value: NERVE_BAR[nerve],
      display: nerve === "wagmi" ? "Never sells at a loss" : nerve === "fearless" ? "Fearless" : nerve === "meltdown" ? "Twitchy" : "Steady",
      ...(nerve === "wagmi" && head ? { trait: head } : nerve === "fearless" && skull ? { trait: skull } : nerve === "meltdown" && radioactive ? { trait: radioactive } : {}),
      explanation:
        nerve === "wagmi"
          ? `${lead(headShown)} never closes a trade at a loss, so after selling it only buys back cheaper.`
          : nerve === "fearless"
            ? `${shown(skull) ? `${shown(skull)}: fearless, it` : "Fearless, it"} never sells into a drop.`
            : nerve === "meltdown"
              ? `${shown(radioactive) ? `${shown(radioactive)}: twitchy, it` : "Twitchy, it"} buys back after just a ${pct(params.slPct)} move against it.`
              : `It admits a wrong call and buys back once $CHOG runs ${pct(params.slPct)} above its last trade.`,
    },
  ];

  if (legend) {
    // Signature traits come from the 1:1's name, not from its metadata.
    for (const gene of genes) if (gene.trait && gene.trait.type !== "Tier") gene.trait = { type: "1:1", value: gene.trait.value };
  }

  const prefix =
    bias === "bull" ? "Permabull" : bias === "bear" ? "Permabear" : bias === "knife" ? "Knife-Catching"
    : nerve === "wagmi" ? "WAGMI" : nerve === "fearless" ? "Fearless" : nerve === "meltdown" ? "Twitchy"
    : sizeClass === "whale" ? "Royal"
    : triggerClass === "hot" ? "Hair-Trigger" : triggerClass === "cold" ? "Ice-Cold"
    : tempo === "fast" ? "Speedy" : tempo === "slow" ? "Patient" : "";

  return {
    version: GENOME_VERSION,
    archetype: prefix ? `${prefix} ${signal.noun}` : signal.noun,
    style,
    genes,
    params,
  };
}

export function genomeParams(genome: Genome): GenomeParams {
  return genome.params as unknown as GenomeParams;
}

/** One line for the persona and the LLM, e.g. "Royal Laser Chaser: momentum chaser on the hourly chart, ...". */
export function describeGenome(genome: Genome): string {
  const p = genomeParams(genome);
  const signal = genome.genes.find((gene) => gene.key === "signal")?.display.toLowerCase() ?? "trader";
  return (
    `${genome.archetype}: ${signal} on the ${p.view === "1h" ? "hourly" : "daily"} chart. ` +
    `Trades ${p.sizeBps / 100}% at a time, takes profit at ${p.tpPct}% and waits ${p.cooldownH}h between trades.`
  );
}

// --- Instinct: the genome's reflex for one moment (pure; shared by the replay and the rules brain) ---

export type InstinctState = {
  /** Balances, in whole tokens. */
  chog: number;
  mon: number;
  /** WMON per $CHOG. */
  price: number;
  /** % moves over the last hour and day, null when unknown. */
  change1hPct: number | null;
  change24hPct: number | null;
  /** Hours since the last trade (Infinity when none). */
  sinceTradeH: number;
  lastTradePrice: number | null;
  lastTradeSide: "buy" | "sell" | null;
  /** Unix hour (seconds / 3600): seeds the chaos coin. */
  hour: number;
};

export type InstinctCode =
  | "signal-buy"
  | "signal-sell"
  | "take-profit"
  | "admit-wrong"
  | "finish-buyback"
  | "knife"
  | "vibes-buy"
  | "vibes-sell"
  | "hold-cooldown"
  | "hold-quiet"
  | "hold-no-mon"
  | "hold-no-chog"
  | "hold-cap"
  | "hold-wagmi"
  | "hold-fearless"
  | "hold-stale"
  | "hold-no-data";

export type Instinct = {
  action: "buy" | "sell" | "hold";
  code: InstinctCode;
  /** Of the balance being sold. */
  sizeBps: number;
  confidence: number;
  /** The move the Chog reacted to, in % (an hourly move counts H1_SCALE times; 0 when none). */
  signalPct: number;
};

/**
 * MON is only a hiding place: every buy brings the whole MON leg back into $CHOG. The replay fills
 * it at once; for live agents the guardrails split it into maxTradeBps-sized trades ("finish-buyback").
 */
export const BUY_ALL_BPS = 10_000;
/** A MON leg under this share of the stack doesn't need finishing. */
const FINISH_SHARE = 0.02;

export function newInstinct(): Instinct {
  return { action: "hold", code: "hold-quiet", sizeBps: 0, confidence: 0.5, signalPct: 0 };
}

function put(out: Instinct, action: Instinct["action"], code: InstinctCode, sizeBps: number, confidence: number, signal: number) {
  out.action = action;
  out.code = code;
  out.sizeBps = sizeBps;
  out.confidence = confidence;
  out.signalPct = signal;
  return out;
}

function conf(p: GenomeParams, base: number): number {
  return Math.min(0.98, Math.round((base + p.conviction) * 1000) / 1000);
}

/** Deterministic hash of two integers to [0, 1). */
function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ Math.imul(b, 0x27d4eb2d), 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The genome's move for one moment, before guardrails. Pure: the same state always gives the
 * same move. Pass `out` to reuse one object in hot loops. Trades always carry confidence >= 0.6.
 */
export function instinct(p: GenomeParams, s: InstinctState, out: Instinct = newInstinct()): Instinct {
  const r1 = s.change1hPct;
  const r24 = s.change24hPct;
  const fast = r1 === null ? null : r1 * H1_SCALE;
  const signal = p.view === "1h" ? (fast ?? r24) : (r24 ?? fast);
  if (!(s.price > 0) || signal === null) return put(out, "hold", "hold-no-data", 0, 0.3, 0);

  const monInChog = s.mon / s.price;
  const total = s.chog + monInChog;
  const hasMon = monInChog > total * DUST_SHARE;
  const last = s.lastTradePrice;
  if (s.lastTradeSide === "buy" && monInChog > total * FINISH_SHARE) {
    return put(out, "buy", "finish-buyback", BUY_ALL_BPS, conf(p, 0.75), signal);
  }
  if (s.sinceTradeH < p.cooldownH) return put(out, "hold", "hold-cooldown", 0, 0.5, signal);

  // 1) The MON leg against the last sell: take profit, or admit a wrong call.
  if (hasMon && last !== null) {
    const move = (s.price / last - 1) * 100;
    if (move <= -p.tpPct) return put(out, "buy", "take-profit", BUY_ALL_BPS, conf(p, 0.8), signal);
    if (p.slPct > 0 && move >= p.slPct) return put(out, "buy", "admit-wrong", BUY_ALL_BPS, conf(p, 0.7), signal);
  }

  // 2) The signal: want = 1 to buy, -1 to sell; driver = the move behind it; k = triggers it had to clear.
  const theta = p.thetaPct;
  const buyAt = theta * BIAS_TRIGGER[p.bias].buy;
  const sellAt = theta * BIAS_TRIGGER[p.bias].sell;
  let want = 0;
  let driver = signal;
  let k = 1;
  let code: InstinctCode = "signal-buy";
  switch (p.mode) {
    case "momentum":
      want = signal >= buyAt ? 1 : signal <= -sellAt ? -1 : 0;
      break;
    case "contrarian":
      want = signal >= sellAt ? -1 : signal <= -buyAt ? 1 : 0;
      break;
    case "sleeper":
      k = 2;
      want = signal >= 2 * sellAt ? -1 : signal <= -2 * buyAt ? 1 : 0;
      break;
    case "panic":
      k = 0.6;
      want = signal <= -0.6 * sellAt ? -1 : signal >= buyAt ? 1 : 0;
      break;
    case "dip":
      k = 0.8;
      want = signal <= -0.8 * buyAt ? 1 : signal >= 1.5 * sellAt ? -1 : 0;
      break;
    case "trend": {
      const other = p.view === "1h" ? r24 : r1;
      if (other !== null) want = signal >= buyAt && other > 0 ? 1 : signal <= -sellAt && other < 0 ? -1 : 0;
      break;
    }
    case "steady": {
      // Swing reversal: a big daily move that the last hour has started to undo.
      k = p.view === "1h" ? 1.2 : 1.6;
      driver = r24 ?? signal;
      if (r1 !== null) want = driver >= k * sellAt && r1 < 0 ? -1 : driver <= -k * buyAt && r1 > 0 ? 1 : 0;
      break;
    }
    case "chaos": {
      const coin = hash01(Math.floor(p.seed * 2 ** 31), s.hour);
      if (coin < 1 / CHAOS_EVERY_H) {
        want = coin < 0.5 / CHAOS_EVERY_H ? 1 : -1;
        code = want > 0 ? "vibes-buy" : "vibes-sell";
      }
      break;
    }
  }
  if (p.bias === "knife" && signal <= -KNIFE_DEPTH * theta) {
    want = 1;
    code = "knife";
  }
  if (want === 0) return put(out, "hold", "hold-quiet", 0, 0.5, signal);
  if (code === "signal-buy" && want < 0) code = "signal-sell";
  // 3) Only fresh moves: since the last trade the price must have moved FRESH triggers the driver's way.
  if (code !== "vibes-buy" && code !== "vibes-sell" && last !== null) {
    const sinceLast = (s.price / last - 1) * 100;
    if (Math.sign(sinceLast) !== Math.sign(driver) || Math.abs(sinceLast) < FRESH * theta) {
      return put(out, "hold", "hold-stale", 0, 0.5, driver);
    }
  }

  const strength = Math.min(Math.max((Math.abs(driver) / (theta * k) - 1) / 2, 0), 1);
  if (want < 0) {
    if (driver < 0 && (p.nerve === "fearless" || p.bias === "bull")) return put(out, "hold", "hold-fearless", 0, 0.6, driver);
    if (s.chog <= total * DUST_SHARE) return put(out, "hold", "hold-no-chog", 0, 0.6, driver);
    const room = (p.capBps / 10_000) * total - monInChog;
    const sizeBps = Math.min(p.sizeBps, Math.floor((room / s.chog) * 10_000));
    if (sizeBps < REPLAY.minTradeBps) return put(out, "hold", "hold-cap", 0, 0.6, driver);
    return put(out, "sell", code, sizeBps, conf(p, 0.6 + 0.3 * strength), driver);
  }
  if (!hasMon) return put(out, "hold", "hold-no-mon", 0, 0.6, driver);
  if (p.nerve === "wagmi" && last !== null && s.price > last) return put(out, "hold", "hold-wagmi", 0, 0.6, driver);
  return put(out, "buy", code, BUY_ALL_BPS, conf(p, 0.6 + 0.3 * strength), driver);
}

// --- Voice --------------------------------------------------------------------------------------

function signed(value: number, digits = 1): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

type Moves = Pick<InstinctState, "change1hPct" | "change24hPct">;

/** The move as the Chog sees it, e.g. "+12.4% on the day" or "-3.1% this hour". */
function seen(p: GenomeParams, s: Moves): string {
  const { change1hPct: r1, change24hPct: r24 } = s;
  if (p.mode === "steady" && r1 !== null && r24 !== null) {
    return `${signed(r24)} on the day and ${r1 < 0 ? "rolling over" : "turning up"} this hour (${signed(r1)})`;
  }
  if (p.view === "1h" && r1 !== null) return `${signed(r1)} this hour`;
  if (r24 !== null) return `${signed(r24)} on the day`;
  return r1 !== null ? `${signed(r1)} this hour` : "a flat tape";
}

const SIGNAL_LINES: Record<SignalMode, { buy: string; sell: string }> = {
  momentum: { buy: "{seen} and climbing. Chasing it: my MON goes back into $CHOG.", sell: "{seen} and sliding. Not riding it down: selling {size} of my $CHOG." },
  contrarian: { buy: "{seen} and everyone's scared. Side-eyeing that: buying the dip.", sell: "{seen}? Smells like a top. Fading it: selling {size} into the pump." },
  sleeper: { buy: "Woke up to {seen}. Huge dip: buying back, then back to sleep.", sell: "Woke up to {seen}. Way too hot: trimming {size}, then back to sleep." },
  panic: { buy: "{seen}. Okay, it's really recovering. Buying back in, paws still shaking.", sell: "{seen}!! Paws shaking. Selling {size} NOW." },
  trend: { buy: "{seen} and the other timeframe agrees. Trend confirmed: buying back.", sell: "{seen} and the other timeframe agrees. Trend's down: selling {size}." },
  steady: { buy: "{seen}. That's the swing low: buying back.", sell: "{seen}. That's the swing high: selling {size}." },
  dip: { buy: "{seen}? A sale! Buying the dip with love.", sell: "{seen} is too much even for me. Taking {size} off the table." },
  chaos: { buy: "The vibes said buy. Bought.", sell: "Flipped a coin. It said sell. Sold {size}." },
};

/** A short line in the Chog's voice for an instinct (the rules brain's thesis and the replay's trade reasons). */
export function voice(genome: Genome, move: Instinct, s: InstinctState): string {
  const p = genomeParams(genome);
  const seenText = seen(p, s);
  const fill = (line: string) => line.replace("{seen}", seenText).replace("{size}", `${Math.round(move.sizeBps / 100)}%`);
  const sinceLast = s.lastTradePrice ? Math.abs((s.price / s.lastTradePrice - 1) * 100).toFixed(1) : "0";
  switch (move.code) {
    case "signal-buy":
      return fill(SIGNAL_LINES[p.mode].buy);
    case "signal-sell":
      return fill(SIGNAL_LINES[p.mode].sell);
    case "vibes-buy":
      return SIGNAL_LINES.chaos.buy;
    case "vibes-sell":
      return fill(SIGNAL_LINES.chaos.sell);
    case "take-profit":
      return p.tpPct <= 4
        ? `Jeet mode: $CHOG is ${sinceLast}% cheaper than my sell. Buying back, stack grows.`
        : `$CHOG is ${sinceLast}% cheaper than my sell. Taking profit: my MON goes back into $CHOG.`;
    case "admit-wrong":
      return `$CHOG ran ${sinceLast}% past my sell. I was wrong: buying back before it runs further.`;
    case "finish-buyback":
      return "Finishing my buyback: more of my MON goes back into $CHOG.";
    case "knife":
      return `${seenText}. Catching the falling knife: buying while it's cheap.`;
    case "hold-cooldown":
      return `${seenText}, but I traded ${Math.max(1, Math.round(s.sinceTradeH))}h ago and wait ${p.cooldownH}h between trades. Letting it play out.`;
    case "hold-no-mon":
      return `${seenText}. I'd buy, but I'm all in $CHOG already. Riding it.`;
    case "hold-no-chog":
      return `${seenText}. I'd sell, but I'm all in MON already. Waiting.`;
    case "hold-cap":
      return `${seenText}. I'd sell more, but ${Math.round(p.capBps / 100)}% in MON is my tier's limit.`;
    case "hold-wagmi":
      return `${seenText}. Buying back above my sell would lock in a loss. WAGMI: waiting for a cheaper price.`;
    case "hold-fearless":
      return `${seenText}. Everyone's selling the drop. Not me.`;
    case "hold-stale":
      return `${seenText}, but I already traded this move. Waiting for a fresh one.`;
    case "hold-no-data":
      return "No reliable price history right now. Sitting on paws.";
    default:
      return `${seenText}. Not enough to trigger me: holding the stack.`;
  }
}

// --- Daily Bell forecast ------------------------------------------------------------------------

type ForecastVoice = {
  /** The move as the Chog sees it, capitalized ("+1.6% on the day") and as is, for mid-sentence. */
  Move: string;
  move: string;
  /** The signed call, e.g. "+2.3%". */
  call: string;
  /** Who noticed: "My Side Eye", "My Purple Laser eyes" (the trait behind its signal gene), else "I". */
  who: string;
};

/** A few phrasings per signal; each Bell picks one per Chog (past tense keeps "My … eyes saw" and "I saw" both right). */
const FORECAST_LINES: Record<SignalMode, ((v: ForecastVoice) => string)[]> = {
  momentum: [
    (v) => `${v.Move} and the trend is my friend. Calling ${v.call} by tomorrow.`,
    (v) => `${v.who} saw the breakout: ${v.move}. Chasing it to ${v.call}.`,
    (v) => `Strength begets strength. ${v.Move}, so I'm calling ${v.call}.`,
    (v) => `${v.Move}. Not fighting the tape: ${v.call} by tomorrow.`,
  ],
  contrarian: [
    (v) => `${v.Move}? The crowd always overdoes it. Calling ${v.call}.`,
    (v) => `${v.who} saw the herd overreact to ${v.move}. Fading it: ${v.call}.`,
    // Bells stored before this line read "so I bet the other way": lib/bell/store.ts shows them with these words.
    (v) => `${v.Move}. Everyone sees it, so I trade the other way: ${v.call}.`,
    (v) => `Too obvious. ${v.Move}, and the snap-back says ${v.call}.`,
  ],
  sleeper: [
    (v) => `${v.Move}. Yawn. Wake me if it beats ${v.call}.`,
    (v) => `${v.who} took one look at ${v.move} and went back to sleep. Calling ${v.call}.`,
    (v) => `Nothing worth waking up for: ${v.move}. ${v.call}, zzz.`,
  ],
  panic: [
    (v) => `${v.Move}... I have a bad feeling. Calling ${v.call}.`,
    (v) => `${v.who} saw ${v.move} and started sweating. ${v.call}.`,
    (v) => `${v.Move}. This is how it starts. Bracing for ${v.call}.`,
  ],
  trend: [
    (v) => `${v.Move}. I go where the trend goes: ${v.call}.`,
    (v) => `${v.who} saw ${v.move}. Following the trend: ${v.call}.`,
    (v) => `The trend is the call. ${v.Move}, so ${v.call}.`,
  ],
  steady: [
    (v) => `${v.Move}. Swings swing back: ${v.call}.`,
    (v) => `${v.who} saw ${v.move}. Calm read: ${v.call}.`,
    (v) => `Steady paws. ${v.Move}. Calling ${v.call}.`,
  ],
  dip: [
    (v) => `${v.Move}. Every dip is a gift. Calling ${v.call}.`,
    (v) => `${v.who} saw ${v.move} and fell in love again. ${v.call}.`,
    (v) => `${v.Move}. Buy low, love high: ${v.call}.`,
  ],
  chaos: [
    (v) => `Consulted the vibes. They say ${v.call}.`,
    (v) => `${v.who} spun around twice and landed on ${v.call}.`,
    (v) => `Flipped a coin, then another. Final answer: ${v.call}.`,
    (v) => `No chart, just vibes: ${v.call}.`,
  ],
};

/** A sleeper that a huge move woke up (its big fading call) doesn't talk like one still napping. */
const SLEEPER_AWAKE_LINES: ((v: ForecastVoice) => string)[] = [
  (v) => `${v.Move}?! That woke me up. Fading it: ${v.call}.`,
  (v) => `${v.who} snapped open at ${v.move}. Calling ${v.call}, then back to sleep.`,
];

/** "My Side Eye" / "My Purple Laser eyes" from the signal gene's trait (brand-safe names), else "I". */
function forecastWho(genome: Genome): string {
  const trait = genome.genes.find((gene) => gene.key === "signal")?.trait;
  if (!trait) return "I";
  const verdict = traitSafety(trait.type === "1:1" ? "Eyes" : trait.type, trait.value);
  if (verdict.action === "hide" || !verdict.display.trim()) return "I";
  const name = verdict.display.trim();
  const eyes = `${name}${/\beyes?\b/i.test(name) ? "" : " eyes"}`;
  // A 1:1's signature trait already names its owner ("Krown's smirking").
  return trait.type === "1:1" ? eyes : `My ${eyes}`;
}

/** The genome's 24h call on $CHOG vs WMON for the Daily Bell, in its voice. Pure. */
export function genomeForecast(genome: Genome, market: MarketSnapshot): { pct: number; conviction: number; thesis: string } {
  const p = genomeParams(genome);
  const r1 = market.change1hPct;
  const r24 = market.change24hPct;
  const fast = r1 === null ? null : r1 * H1_SCALE;
  const signal = (p.view === "1h" ? (fast ?? r24) : (r24 ?? fast)) ?? 0;
  const day = r24 ?? signal;
  const theta = p.thetaPct;
  const dayIndex = Math.floor(Date.parse(market.fetchedAt) / 86_400_000) || 0;
  const seed = Math.floor(p.seed * 2 ** 31);
  let base: number;
  switch (p.mode) {
    case "momentum":
      base = 0.45 * signal;
      break;
    case "contrarian":
      base = -0.45 * signal;
      break;
    case "sleeper":
      base = Math.abs(signal) >= 2 * theta ? -0.5 * signal : -0.1 * signal;
      break;
    case "panic":
      base = (signal < 0 ? 0.6 : 0.2) * signal - 1;
      break;
    case "dip":
      base = (signal < 0 ? -0.5 : 0.1) * signal + 1;
      break;
    case "trend":
      base = (r1 !== null && Math.sign(r1) === Math.sign(day) ? 0.35 : 0.1) * day;
      break;
    case "steady":
      base = (Math.abs(day) >= 1.2 * theta && r1 !== null && Math.sign(r1) !== Math.sign(day) ? -0.35 : 0.05) * day;
      break;
    case "chaos":
      // A daily coin within ±4%: vibes, not headline-grabbing extremes.
      base = (hash01(seed, dayIndex) - 0.5) * 8;
      break;
  }
  const bias = p.bias === "bull" ? 2.5 : p.bias === "bear" ? -2.5 : p.bias === "knife" && signal <= -theta ? 3 : 0;
  const raw = base + bias + (p.seed - 0.5) * 2;
  const pct = Math.round(Math.min(Math.max(raw, -20), 20) * 10) / 10 || 0;
  const conviction = Number(Math.min(Math.max(0.25 + 0.5 * Math.min(1, Math.abs(pct) / 12) + p.conviction, 0.05), 0.99).toFixed(2));
  const move = seen(p, { change1hPct: r1, change24hPct: r24 });
  const lines = p.mode === "sleeper" && Math.abs(signal) >= 2 * theta ? SLEEPER_AWAKE_LINES : FORECAST_LINES[p.mode];
  const line = lines[Math.floor(hash01(seed ^ 0x5bd1e995, dayIndex) * lines.length) % lines.length];
  const thesis = line({ Move: move.charAt(0).toUpperCase() + move.slice(1), move, call: signed(pct), who: forecastWho(genome) });
  return { pct, conviction, thesis };
}
