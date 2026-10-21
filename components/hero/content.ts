import type { WindowKey } from "@/lib/dna/backtest";

/**
 * Every word in the hero (components/hero). Numbers that come from data are not written here:
 * animr-hero.tsx fills the League size, its share and its candle window from the live League
 * (lib/dna/headline.ts, the same source as /league, cached for hours), so the two always agree.
 */

export type HeroLink = { href: string; label: string };

export const heroBrand = {
  name: "Animr",
  /** The letter on the violet tile. */
  tile: "A",
  /** The teal superscript over the wordmark's last letters. */
  superscript: "AI",
  homeLabel: "Animr home",
  skipLink: "Skip to content",
} as const;

/** Six real routes, left to right. Chog #1820 is the landing page's (brand-safe) showcase Chog. */
export const heroNav: readonly HeroLink[] = [
  { href: "/league", label: "League" },
  { href: "/replay/1820", label: "Time Machine" },
  { href: "/versus", label: "Versus" },
  { href: "/bell", label: "Daily Bell" },
  { href: "/heist", label: "Rob this Chog" },
  { href: "/guard", label: "Guard" },
];

export const heroActions = {
  yourChogs: { href: "/app", label: "Your Chogs" },
  launch: { href: "/app", label: "Launch App" },
  random: "Random Chog",
} as const;

export const heroMenu = {
  button: "Menu",
  label: "Main",
} as const;

/** Three lines; each stays on one line at every size. */
export const heroTitle = ["Every Chog", "is an AI trader,", "scored in $CHOG."] as const;

export const heroSubline =
  "Its traits become a trading genome, its ERC-6551 wallet holds real $CHOG, and the AI can trade but never withdraw.";

export const heroStats = {
  /** Every Chog trades: by its DNA's rules, or through an LLM once its holder wakes its AI. */
  traders: "traders",
  /** The asterisk points at the footnote under the row. */
  beat: "beat holding",
  /** Read after "beat holding" by screen readers, in place of the asterisk. */
  noteHint: "(simulated, see note below)",
  /**
   * AnimrTradeGuard's Foundry suite on a Monad mainnet fork (contracts/test/AnimrTradeGuard.t.sol): 37 tests, all
   * passing at the last run. A claim about the guard's suite only, never the whole repo.
   */
  guard: { passed: 37, total: 37, label: "guard fork tests" },
} as const;

const WINDOW_WORDS: Record<WindowKey, string> = { "30d": "30-day", "45d": "45-day", max: "Full-history" };

/**
 * The footnote under the stats: which replay the share comes from (its "*" is drawn by the hero, hidden
 * from screen readers). The date range never breaks across lines.
 */
export function heroFootnote(windowKey: WindowKey, range: string): string {
  // No-break spaces, and a word joiner after the dash (a line may otherwise break right after it).
  const unbroken = range.replace(/ /g, "\u00a0").replace(/([\u2013\u2014-])/g, "$1\u2060");
  return `${WINDOW_WORDS[windowKey]} replay on real $CHOG candles (${unbroken}), 1% fee + impact. Simulated.`;
}

export type HeroCard = {
  key: "dna" | "guard";
  href: string;
  kicker: string;
  /** Two lines, each kept on one line. */
  title: readonly [string, string];
};

export const heroCards: readonly HeroCard[] = [
  { key: "dna", href: "/traits", kicker: "Trading DNA", title: ["Its traits, one genome:", "every Chog trades differently."] },
  { key: "guard", href: "/guard", kicker: "AnimrTradeGuard", title: ["The AI can trade,", "but it can never withdraw."] },
];

/** Text wordmarks only (no third-party logo files), styled per word in hero.css. */
export const heroBuiltOn = {
  label: "Built on",
  marks: [
    { text: "Monad", style: "italic" },
    { text: "0G Compute", style: "italic" },
    { text: "erc-6551", style: "tracked" },
    // Written in sentence case so screen readers say the word; hero.css sets it in capitals.
    { text: "Tokenbound", style: "caps" },
  ],
} as const;

/** The artwork: a 5 s, 960×960 H.264 loop (muted, no audio track) and its 1200×1200 WebP still. */
export const heroMedia = {
  video: "/landing/hero/slabs-loop.mp4",
  still: "/landing/hero/slabs-still.webp",
  stillSize: 1200,
} as const;
