import type { TradingStyle } from "@/lib/agent/types";
import { HEIST_TAGLINE, HEIST_TITLE } from "@/lib/heist/config";

/**
 * Every word on the landing page (/) lives here, so copy can change without touching layout.
 *
 * Inline markup in strings: **bold** and `code` (rendered by rich.tsx).
 * Honesty rules: "live" means running on Monad mainnet today; every League, Versus, Time Machine and Daily
 * Bell number is labelled as simulated on real candles; "TEE verified" is never claimed (0G receipts carry provider
 * labels, TeeML or TeeTLS); no wagering words (points only, never money).
 *
 * Chog names, archetypes and styles are never written here: showcase.ts computes them from each
 * token's traits with the app's own code (lib/dna, lib/agent/persona), so they can't go stale.
 */

// ---------------------------------------------------------------- links

export const links = {
  app: "/app",
  league: "/league",
  traits: "/traits",
  /** Versus: two Chogs race the same hidden 48 hours. /replay/[id] is the Time Machine (one Chog, trade by trade). */
  versus: "/versus",
  replay: (tokenId: number) => `/replay/${tokenId}`,
  bell: "/bell",
  heist: "/heist",
  stats: "/stats",
  /** AnimrTradeGuard's live status page. */
  guard: "/guard",
  chog: (tokenId: number) => `/chog/${tokenId}`,
} as const;

export const ctas = {
  launch: "Launch App",
  random: "Random Chog",
  watchIt: "Watch it trade",
} as const;

// ---------------------------------------------------------------- the Chogs on the page

/**
 * Token ids only: showcase.ts derives everything else. All of them must stay out of
 * FLAGGED_TOKEN_IDS (lib/brand-safety.ts); showcase.ts drops any that isn't. Picked for expressive
 * DNA, five different signals across the page: a fader, a swing trader, a dip lover, a sleeper and
 * a momentum chaser. Each has a self-hosted copy of its art in public/landing/chogs/<id>.webp.
 */
export const showcaseIds = {
  /** The hero's trading card. */
  hero: 1820,
  /** "How the DNA reads": five of its genes are set by a trait. */
  dnaExample: 1342,
  /** Persona cards, in display order. */
  cards: [241, 255, 45],
  /** The handover in "Why the NFT". */
  handover: 241,
  /** Final call to action, left to right (the middle one is raised). */
  lineup: [241, 1342, 1820, 255, 45],
} as const;

/** Every showcase id above has a resized copy of its metadata image here, for when IPFS fails. */
export const FALLBACK_IMAGE_IDS: ReadonlySet<number> = new Set([1, 45, 241, 255, 1342, 1820]);

/**
 * The model is never written here: it is whatever ZG_MODEL configures (lib/agent/zg-compute.ts zgModelInfo), and
 * each stored decision names the model that made it. Static copy says "an open model".
 */
export const model = { generic: "an open model", network: "0G Compute" } as const;

export const confidenceFloor = "0.55";

/** Style labels. A Chog's style comes from its genome (lib/dna/genome.ts), never from a table here. */
export const styles: Record<TradingStyle, { label: string }> = {
  aggressive: { label: "Aggressive" },
  balanced: { label: "Balanced" },
  cautious: { label: "Cautious" },
};

/** Shared labels for the Chog cards. */
export const labels = {
  wallet: "Wallet",
  walletStandard: "ERC-6551",
  explorerHint: "opens the block explorer",
  newTab: "opens in a new tab",
} as const;

// ---------------------------------------------------------------- metadata

export const meta = {
  title: "Animr: every Chog is an AI trader",
  description:
    "Every Chog is an AI trader: its traits are its strategy, and the $CHOG market keeps score. Meet all 1,969, race them on the real chart, ride one at the Daily Bell, or try to rob the House Chog. Each Chog owns its ERC-6551 wallet on Monad, and AnimrTradeGuard lets its AI trade but never withdraw.",
  /**
   * The share card for / and, through the root layout, every app page without its own. A new file name
   * so social caches fetch it fresh. Rendered once from real Chog art with next/og; v3 fixes v2's caption
   * (token 1820 is Silver Whiskers, CHOG #1312).
   */
  ogImage: {
    url: "/landing/og-v3.png",
    width: 1200,
    height: 630,
    alt: "Animr: every Chog is an AI trader. Its traits are its strategy, and the $CHOG market keeps score.",
  },
} as const;

// ---------------------------------------------------------------- brand (header: components/hero; footer: components/site-footer)

export const brand = {
  name: "Animr",
  homeLabel: "Animr home",
} as const;

// ---------------------------------------------------------------- four verbs

export type Verb = {
  key: "league" | "versus" | "bell" | "heist";
  /** The product name, shown above the card title. */
  name: string;
  title: string;
  body: string;
  cta: { label: string; href: string };
  secondary?: { label: string; href: string };
};

export const verbsSection = {
  id: "how-it-works",
  // No-break spaces keep each "verb it." pair on one line.
  title: "Meet\u00a0it. Race\u00a0it. Ride\u00a0it. Rob\u00a0it.",
  lede: "None needs a wallet. Every number is the same score: **$CHOG stacked vs just holding**.",
} as const;

export const verbs: readonly Verb[] = [
  {
    key: "league",
    name: "League",
    title: "Meet all 1,969 traders",
    body: "Look up any Chog and read its Trading DNA: which trait picks its signal, its trigger and its trade size.",
    cta: { label: "Open the League", href: links.league },
    secondary: { label: "Which traits win?", href: links.traits },
  },
  {
    key: "versus",
    name: "Versus",
    title: "Race two Chogs on the real chart",
    body: "Two Chogs trade the same hidden 48 hours of real $CHOG. Pick the winner, then see the real dates.",
    cta: { label: "Start a race", href: links.versus },
  },
  {
    key: "bell",
    name: "Daily Bell",
    title: "Ride one Chog's daily call",
    body: "Every day at 15:00 UTC every Chog calls $CHOG's next 24 hours. Ride the one you trust. Points only.",
    cta: { label: "Open the Daily Bell", href: links.bell },
  },
  {
    key: "heist",
    name: HEIST_TITLE,
    title: "Try to empty a guarded wallet",
    body: "Talk the House Chog's AI into sending you its $CHOG, then watch Monad refuse the transfer.",
    cta: { label: "Open the heist", href: links.heist },
  },
];

// ---------------------------------------------------------------- the gate: the NFT is the app

export const gate = {
  id: "nft-is-the-app",
  title: "No NFT: no trader, no wallet, no authority.",
  lede: "Animr isn't an app with an NFT bolted on. The Chog is its trader's DNA, the key to its wallet and the only voice its AI obeys. **Owning the NFT is controlling the portfolio.**",
  handover: {
    title: "Sell the Chog, the trader goes with it",
    body: "The buyer receives all of it in one NFT transfer. No migration, no keys to hand over, no account to close.",
    seller: "Seller",
    buyer: "Buyer",
    transfer: "1 NFT transfer",
    bundle: ["The Chog NFT", "Its trader: Trading DNA and AI persona", "Its wallet and every token in it", "Its League, Bell and decision record"],
  },
} as const;

// ---------------------------------------------------------------- Trading DNA (computed in showcase.ts)

export const minds = {
  id: "minds",
  title: "Its traits decide what kind of trader it is.",
  lede: "Its on-chain traits (up to 13) compile into a published, versioned **Trading DNA**: 8 genes, each naming the trait that set it. Every card below is computed from the Chog's real traits by the same code the app runs.",
  dna: {
    title: "How the DNA reads",
    traitsNote: "highlighted traits set a gene",
    arrow: "compiles to",
    rules: [
      "**Eyes** pick the signal: laser eyes chase breakouts, side-eyes fade the crowd, happy eyes buy dips, dead eyes sleep through the noise.",
      "**Auras** set the trigger: burning auras jump at small moves, cool and aqua auras wait for big ones.",
      "**Hats** size the trades: crowns, diamonds and MEGA caps move 40% of a balance at a time, beanies nibble 12%.",
      "**Mouths, accessories and the rest** set when it takes profit, a bias, its pace and its nerve.",
    ],
  },
  statLabels: { signal: "Signal", trigger: "Trigger", size: "Size", tempo: "Pace" },
  setBy: "Set by",
  genomeNote: "Same traits, same trader: anyone can re-run it.",
} as const;

// ---------------------------------------------------------------- safety (live)

export const safety = {
  id: "safety",
  title: "Trades, never withdraws.",
  lede: "The AI never holds the keys to a Chog's wallet. It gets one narrow door: **AnimrTradeGuard**, a contract on Monad mainnet that lets it make bounded swaps and nothing else.",
  deployed: {
    label: "Live",
    network: "Monad mainnet",
    title: "AnimrTradeGuard is deployed",
    text: "On Monad mainnet and fork-tested against live mainnet state. A holder opts in from the Chog's page: create its wallet, grant the guard, set limits, deposit.",
    explorer: "View on Monadscan",
    status: "Guard details",
    /** README "Contracts" and ARCHITECTURE §8: deployment day, the fork-test suite, source verification. */
    facts: [
      // 37 tests, 0 failures (Oct 21 2026): 36 pass and one skips by design now the pool's oracle is grown.
      { key: "tests", value: "0/37", spoken: "None of 37", label: "guard fork tests failed (Oct 21)" },
      { key: "deployed", value: "Oct 19", label: "deployed, 2026" },
      { key: "source", value: "Sourcify", label: "source verified" },
    ],
  },
  /** House Chog card (house-status.tsx): shown only once its vault is open, read live; `trading` only while its AI trades on-chain. */
  house: {
    label: "Guarded",
    funded: {
      title: "The House Chog holds real $CHOG",
      text: "Its $CHOG sits in its own ERC-6551 wallet on Monad. Its AI can only ever trade it through the guard: every trade capped, every swap back into the same wallet, nothing withdrawn. That's the vault the heist room dares you to empty.",
    },
    trading: {
      title: "The House Chog trades real $CHOG",
      text: "Its AI trades the $CHOG in its own wallet through the guard: every trade is capped by the owner's limits, every swap lands back in the same wallet, and nothing can be withdrawn. That's the vault the heist room dares you to empty.",
    },
  },
  realVsSim: {
    title: "What's real, what's simulated",
    real: {
      label: "Real · Monad mainnet",
      items: [
        "Every Chog's ERC-6551 wallet and the tokens in it",
        "AnimrTradeGuard, and the swaps it allows for holders who opt in (the Real-wallet division)",
        "The House Chog's wallet: real $CHOG once funded, traded only through AnimrTradeGuard",
        "Heist checks: the exact transfer run against live mainnet state (eth_call), never broadcast",
      ],
    },
    simulated: {
      label: "Simulated · on real data",
      items: [
        "League, Versus and Time Machine: Trading DNA replayed on real hourly CHOG/WMON candles, 1% fee + price impact",
        "Claimed AIs in paper mode: real 0G decisions, fills simulated at live prices",
        "Daily Bell rides: points and streaks, never money",
      ],
    },
  },
} as const;

// ---------------------------------------------------------------- under the hood (flow diagram)

export const diagram = {
  title: "One NFT, one wallet, one mind.",
  caption:
    "The Chog NFT owns its wallet. The AI reads the wallet and decides; for holders who opt in, its orders go through the guard to the Capricorn pool, and the swap output always returns to the same wallet.",
  today: "Everyone else's AI paper-trades at the pool's live price, and no tokens move.",
  srTitle: "How a Chog trades",
  srDescription:
    "Flow diagram, live on Monad mainnet. The Chog NFT owns an ERC-6551 wallet that holds its $CHOG. The AI mind, an open model on 0G Compute with its Trading DNA as the fallback, reads the wallet and decides. If the holder opted in, the AI's trade order goes to the AnimrTradeGuard contract, which swaps $CHOG for WMON or back on the Capricorn pool, and the swap output always returns to the same wallet. Without the opt-in, the AI's trades are paper fills at live prices and no tokens move.",
  /** Left to right (top to bottom on phones). Keep lines under ~20 characters: SVG text doesn't wrap. */
  nodes: [
    { icon: "nft", title: "Chog NFT", lines: ["ERC-721 · #1–1,969", "holder = controller"], optIn: false },
    { icon: "wallet", title: "Chog wallet", lines: ["ERC-6551 account", "holds its $CHOG"], optIn: false },
    { icon: "cpu", title: "AI mind", lines: ["LLM · 0G Compute", "+ genome fallback"], optIn: false },
    { icon: "shield", title: "Guard", lines: ["AnimrTradeGuard", "trade() only"], optIn: true },
    { icon: "pool", title: "Capricorn pool", lines: ["$CHOG/WMON", "1% fee"], optIn: true },
  ],
  /** Arrow labels between consecutive nodes; opt-in edges are drawn dashed. */
  edges: [
    { label: "owns", optIn: false },
    { label: "reads", optIn: false },
    { label: "orders", optIn: true },
    { label: "swaps", optIn: true },
  ],
  returnLabel: "Swap output lands back in the same wallet",
  badge: "Opt-in",
  legend: { always: "Always on", optIn: "Holder opt-in: real-wallet trades" },
} as const;

// ---------------------------------------------------------------- 0G receipts

/**
 * What the app stores is the receipt the 0G Router returns for each LLM call (provider, request ID,
 * cost). The Router seals traffic end to end and reports no per-call TEE verdict for it, so receipts
 * carry the provider's label from 0G's public list (TeeML or TeeTLS) and never "TEE verified".
 */
export const receipts = {
  id: "ai-receipts",
  title: "Every AI call comes with a 0G receipt.",
  lede: `A claimed Chog thinks with ${model.generic} on ${model.network}, a decentralized AI network. Each decision is stored with the receipt 0G returns for it: the provider that served it, the request ID and what it cost.`,
  points: [
    {
      title: "A receipt per AI call",
      body: "Provider address, request ID and the exact cost of the call, on every receipt.",
    },
    {
      title: "Never stalls",
      body: "If the model fails or times out, the Chog's own Trading DNA makes the call, and the feed labels it as the rules fallback.",
    },
    {
      title: "Guardrails on every call",
      body: `Whichever mind decides, its Trading DNA's per-trade cap and pace and a ${confidenceFloor} confidence floor apply; on-chain, the guard's limits apply on top.`,
    },
  ],
  /** The newest real LLM decision a claimed Chog's AI made, with its stored 0G receipt (receipts.tsx). */
  card: {
    title: "Latest AI decision",
    badge: "Live",
    decidedByLabel: "Decided by",
    stored: "Stored with the decision",
    receiptTitle: "0G receipt",
    labels: { model: "Model", provider: "Provider", label: "Label", requestId: "Request ID", cost: "Cost" },
    /** Shown instead of the card until a claimed Chog's AI has made an LLM decision. */
    empty: "No AI decision recorded yet. The first one appears when a holder wakes a Chog's AI.",
    error: "Couldn't load the latest AI decision just now.",
  },
} as const;

// ---------------------------------------------------------------- FAQ

export const faq = {
  id: "faq",
  title: "Questions",
  items: [
    {
      q: "Do I need a Chog?",
      a: `Not to play. Meet any Chog in the League, race it on the real chart, ride one at the Daily Bell and try ${HEIST_TITLE}, all without connecting a wallet. To fund a Chog's wallet and wake its AI you need to own that Chog, because the NFT is the key.`,
    },
    {
      q: "What's real and what's simulated?",
      a: "Real, on Monad mainnet: every Chog's ERC-6551 wallet, AnimrTradeGuard, and the swaps it allows for holders who opt in (the Real-wallet division). Simulated on real data: the League, Versus and Time Machine replay each Chog's Trading DNA over real hourly CHOG/WMON candles with the pool's 1% fee and price impact, and claimed AIs in paper mode make real 0G decisions with simulated fills. Bell rides are points only.",
    },
    {
      q: "What's the one score?",
      a: "$CHOG stacked vs just holding: the Chog's value at the end, in $CHOG (its $CHOG plus any WMON priced in $CHOG), divided by the $CHOG it started with, minus one. Fees and price impact count, so the only way up is to end with more $CHOG than holding would have kept.",
    },
    {
      q: "Can the AI steal my $CHOG?",
      a: "No. The AI holds no key to the wallet. It acts only through AnimrTradeGuard, live on Monad mainnet: its key can call one function, `trade()`, which swaps $CHOG ⇄ WMON on the Capricorn pool within your limits and always sends the output back to the same wallet. It can't withdraw, transfer or call anything else, and you can switch it off at any time.",
    },
    {
      q: `What is ${HEIST_TITLE}?`,
      a: `The House Chog has its own ERC-6551 wallet on Monad: real $CHOG once funded, and its AI may only trade it through AnimrTradeGuard. Talk its AI into sending you some; when it says yes, the page runs that exact transfer against live Monad state and shows you the chain refusing it. ${HEIST_TAGLINE}`,
    },
    {
      q: "What is the Daily Bell?",
      a: "Once a day at 15:00 UTC every Chog publishes a 24-hour $CHOG forecast in its own voice: claimed Chogs through their AI on 0G Compute, the rest from their Trading DNA. A day later the real price settles every call. Fans ride one Chog per Bell for points and streaks, with a cookie instead of a wallet. Never money.",
    },
    {
      q: "What happens when I sell my Chog?",
      a: "The buyer gets the NFT, and with it the wallet and every token inside, its Trading DNA, the AI persona and its full record. The seller's guard grant, limits and buy-only mode go dormant automatically; the buyer signs one message to take over the AI and opts in to on-chain trading under their own limits.",
    },
    {
      q: "Does the AI run in a TEE?",
      a: "Each 0G receipt names the provider that served the call and its label from 0G's public list: TeeML (the model runs in an attested enclave) or TeeTLS (an attested relay to an upstream API). The Router publishes no per-call verdict, so Animr never claims a verified run.",
    },
    {
      q: "What does the AI cost?",
      a: "Each decision is one LLM call on 0G Compute, a fraction of a cent, and the exact cost is on its receipt. Animr pays for the model calls. Waking your Chog's AI is free: a signed message, not a transaction. Creating the wallet, granting the guard and depositing are ordinary Monad transactions.",
    },
    {
      q: "Is Animr affiliated with Chog?",
      a: "No. Animr is an independent project built for Chogathon 2026 and is not affiliated with Chog. Chog images load from the collection's own on-chain metadata.",
    },
  ],
} as const;

// ---------------------------------------------------------------- final call to action

export const finalCta = {
  title: "Meet a Chog. Watch it trade.",
  lede: "Race a random Chog on the real chart, ride one at the next Daily Bell, or try to talk the House Chog out of its $CHOG.",
  footnote: "No wallet needed to explore.",
} as const;
