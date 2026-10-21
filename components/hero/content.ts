import type { WindowKey } from "@/lib/dna/backtest";

/**
 * Every word in the hero (components/hero). Numbers that come from data are not written here:
 * animr-hero.tsx fills the League size, its share and its candle window from the live League
 * (lib/dna/headline.ts, the same source as /league, cached for hours), so the two always agree.
 */

export type HeroLink = { href: string; label: string };

export const heroBrand = {
  name: "Animr",
  /** The Animr lockup (public/brand/animr-header.png, cleaned from the owner's animr-header artwork). */
  logo: { src: "/brand/animr-header.png", width: 494, height: 132 },
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

/**
 * The "Built on" row. Each logo is the brand's own file, stored in public/landing/logos (never hotlinked),
 * width × height = the SVG's own viewBox, so the browser reserves the right box before it loads:
 * - Monad: "Full Logo White" (the horizontal lockup) from the Monad Brand and Media Kit,
 *   https://monad.xyz/brand-and-media-kit. Its guidelines forbid recolouring, lowering opacity and filters,
 *   so it (and the others, for one even row) is drawn as supplied, in white, at full opacity.
 * - 0G: "White-OG-Logo" from the 0G brand kit, https://0g.ai/brandkit.
 * - Tokenbound: the wordmark from https://tokenbound.org/tokenbound-wordmark.svg, its fill set to white.
 * - ERC-6551 has no official logo (the standard's GitHub org uses a personal avatar), so it stays a text mark.
 */
export type HeroBuiltOnMark =
  | { kind: "logo"; key: "monad" | "0g" | "tokenbound"; name: string; src: string; width: number; height: number }
  | { kind: "text"; key: "erc6551"; name: string };

export const heroBuiltOn: { label: string; marks: readonly HeroBuiltOnMark[] } = {
  label: "Built on",
  marks: [
    { kind: "logo", key: "monad", name: "Monad", src: "/landing/logos/monad.svg", width: 423, height: 80 },
    { kind: "logo", key: "0g", name: "0G", src: "/landing/logos/0g.svg", width: 248, height: 120 },
    { kind: "text", key: "erc6551", name: "ERC-6551" },
    { kind: "logo", key: "tokenbound", name: "Tokenbound", src: "/landing/logos/tokenbound.svg", width: 401, height: 51 },
  ],
};

/** The artwork: a 5 s, 960×960 H.264 loop (muted, no audio track) and its 1200×1200 WebP still. */
export const heroMedia = {
  video: "/landing/hero/slabs-loop.mp4",
  still: "/landing/hero/slabs-still.webp",
  stillSize: 1200,
} as const;
