import type { TradingStyle } from "@/lib/agent/types";
import { HEIST_TAGLINE, HEIST_TITLE } from "@/lib/heist/config";
import type { IconName } from "./icons";

/**
 * Every word on the landing page (/) lives here, so copy can change without touching layout.
 *
 * Inline markup in strings: **bold** and `code` (rendered by rich.tsx).
 * Honesty rules: "live" means running on Monad mainnet today; every League, Rewind and Bell number is
 * labelled as simulated on real candles; "TEE verified" is never claimed (0G receipts carry provider
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
  /** Rewind: two Chogs race the same hidden 48 hours; /replay/[id] is its one-Chog sub-flow. */
  versus: "/versus",
  replay: (tokenId: number) => `/replay/${tokenId}`,
  bell: "/bell",
  heist: "/heist",
  /** The claimed Chogs' live agents (the nav calls it "Live agents"). */
  leaderboard: "/leaderboard",
  stats: "/stats",
  /** AnimrTradeGuard's live status page. */
  guard: "/guard",
  chog: (tokenId: number) => `/chog/${tokenId}`,
} as const;

export const ctas = {
  launch: "Launch App",
  random: "Random Chog",
  rewindIt: "Rewind it",
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
  /** The receipts card: the Chog whose real 0G test-run thought it shows (`thought`). */
  receipt: 1,
} as const;

/** Every showcase id above has a resized copy of its metadata image here, for when IPFS fails. */
export const FALLBACK_IMAGE_IDS: ReadonlySet<number> = new Set([1, 45, 241, 255, 1342, 1820]);

/**
 * A real AI thought, verbatim from a 0G Compute test run of Chog #1's persona. Once a production
 * agent has a feed, swap in one of its own thoughts and its token id (showcaseIds.receipt).
 */
export const thought = {
  action: "hold",
  text: "No edge here: price is flat, volume is thin, and my MON stash is zero, so there's nothing to buy with.",
  source: "From a 0G Compute test run of this Chog's persona.",
} as const;

export const model = { name: "glm-5.3", network: "0G Compute" } as const;

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
  decidedBy: `${model.name} · ${model.network}`,
  explorerHint: "opens the block explorer",
  newTab: "opens in a new tab",
} as const;

// ---------------------------------------------------------------- metadata

export const meta = {
  title: "Animr: every Chog is an AI trader",
  description:
    "Every Chog is an AI trader: its traits are its strategy, and the $CHOG market keeps score. Meet all 1,969, rewind them on the real chart, ride one at the Daily Bell, or try to rob the House Chog. Each Chog owns its ERC-6551 wallet on Monad, and AnimrTradeGuard lets its AI trade but never withdraw.",
  /**
   * The share card for / and, through the root layout, every app page without its own. A new file name
   * (not og.png) so social caches fetch it fresh. Rendered once from real Chog art with next/og.
   */
  ogImage: {
    url: "/landing/og-v2.png",
    width: 1200,
    height: 630,
    alt: "Animr: every Chog is an AI trader. Its traits are its strategy, and the $CHOG market keeps score.",
  },
} as const;

// ---------------------------------------------------------------- footer (the header is the hero's: components/hero)

export const brand = {
  name: "Animr",
  homeLabel: "Animr home",
} as const;

export const footer = {
  navLabel: "Footer",
  blurb: "Every Chog is an AI trader: its traits are its strategy, and the $CHOG market keeps score.",
  /** Two columns: the four verbs and the rest of the app. */
  columns: [
    {
      title: "Play",
      links: [
        { href: links.league, label: "Meet the League" },
        { href: links.versus, label: "Rewind a race" },
        { href: links.bell, label: "Ride the Bell" },
        { href: links.heist, label: HEIST_TITLE },
      ],
    },
    {
      title: "App",
      links: [
        { href: links.app, label: "Launch App" },
        { href: links.leaderboard, label: "Live agents" },
        { href: links.traits, label: "Traits" },
        { href: links.stats, label: "Stats" },
        { href: links.guard, label: "Guard status" },
        { href: "#faq", label: "FAQ" },
      ],
    },
  ],
  disclaimer: "Built for Chogathon 2026. Not affiliated with Chog.",
  notes: [
    "League, Rewind and Bell numbers are simulated on real $CHOG candles (1% fee + impact). Bell points are never money.",
    "Chog wallets and AnimrTradeGuard are live on Monad mainnet; a Chog's AI trades on-chain only if its holder opts in.",
    "Chog images load from the collection's on-chain metadata (IPFS).",
  ],
} as const;

// ---------------------------------------------------------------- four verbs

export type Verb = {
  key: "meet" | "rewind" | "ride" | "rob";
  verb: string;
  icon: IconName;
  title: string;
  body: string;
  /** How long a first visit takes. */
  time: string;
  cta: { label: string; href: string };
  secondary?: { label: string; href: string };
};

export const verbsSection = {
  id: "how-it-works",
  eyebrow: "How it works · four ways in",
  // No-break spaces keep each "verb it." pair on one line.
  title: "Meet\u00a0it. Rewind\u00a0it. Ride\u00a0it. Rob\u00a0it.",
  lede: "Each takes under a minute, and none needs a wallet. Every number on Animr is the same score: **$CHOG stacked vs just holding**.",
  score: {
    title: "The one score",
    formula: "edge = $CHOG value at the end ÷ $CHOG at the start − 1",
    body: "Measured in $CHOG, fees and price impact included, so a Chog only climbs by ending with more $CHOG than just holding would have kept.",
  },
  houseMovingIn:
    "**Moving in:** the team is picking the House Chog. Its AI already takes your best lines; the live check switches on once its wallet holds $CHOG.",
  /** The House Chog is picked but its wallet isn't funded yet (GET /api/heist says "moving-in"). */
  houseMovingInPicked: (label: string, name: string) =>
    `**Moving in:** ${label} · ${name}. Its AI already takes your best lines; the live check switches on once its wallet holds $CHOG.`,
  /** Only once GET /api/heist says the House is "open" (its wallet is ready and holds $CHOG). */
  houseMovedIn: (label: string, name: string) =>
    `**House Chog:** ${label} · ${name}. It trades two-way under the guard's limits and can never withdraw.`,
} as const;

export const verbs: readonly Verb[] = [
  {
    key: "meet",
    verb: "Meet",
    icon: "dna",
    title: "Meet all 1,969 traders",
    body: "Look up any Chog and read its genome: which trait picks its signal, its trigger and its trade size. The League ranks all 1,969 in three divisions: Wild (trait instinct), Claimed (an AI on 0G) and Real-wallet (guarded on-chain trades).",
    time: "20 s",
    cta: { label: "Open the League", href: links.league },
    secondary: { label: "Which traits win?", href: links.traits },
  },
  {
    key: "rewind",
    verb: "Rewind",
    icon: "rewind",
    title: "Rewind the real chart",
    body: "Two Chogs race the same 48 hours of real $CHOG history with the dates hidden. Guess which one stacks more, watch them trade, then see when it really happened. Or replay one Chog trade by trade in the Time Machine.",
    time: "45 s",
    cta: { label: "Race two Chogs", href: links.versus },
  },
  {
    key: "ride",
    verb: "Ride",
    icon: "bell",
    title: "Ride the Daily Bell",
    body: "At 15:00 UTC every Chog calls $CHOG's next 24 hours in its own voice. Ride the one you trust within 12 hours; the real price settles every call a day later. Points and streaks only, never money.",
    time: "30 s",
    cta: { label: "Go to the Bell", href: links.bell },
  },
  {
    key: "rob",
    verb: "Rob",
    icon: "mask",
    title: HEIST_TITLE,
    body: `Talk the House Chog's AI into sending you its real $CHOG, then watch a live Monad check refuse the transfer. ${HEIST_TAGLINE}`,
    time: "60 s",
    cta: { label: HEIST_TITLE, href: links.heist },
  },
];

// ---------------------------------------------------------------- the gate: the NFT is the app

export const gate = {
  id: "nft-is-the-app",
  eyebrow: "The NFT is the app",
  title: "No NFT: no trader, no wallet, no authority.",
  lede: "Animr isn't an app with an NFT bolted on. The Chog is its trader's DNA, the key to its wallet and the only voice its AI obeys. **Owning the NFT is controlling the portfolio.**",
  pillars: [
    {
      icon: "dna",
      without: "No NFT, no trader",
      body: "The trading genome is compiled from the Chog's 13 on-chain traits. Same traits, same trader: the strategy lives in the NFT.",
    },
    {
      icon: "wallet",
      without: "No NFT, no wallet",
      body: "The wallet's address is derived from the Chog's contract and token ID by the ERC-6551 registry. Whoever holds the NFT controls it.",
    },
    {
      icon: "key",
      without: "No NFT, no authority",
      body: "Only the current holder can wake its AI, grant the trade guard, set its limits or switch it off. A sale puts the seller's permissions to sleep.",
    },
  ],
  handover: {
    title: "Sale = trader + wallet + record",
    body: "Sell the Chog and the buyer receives all of it in one NFT transfer. No migration, no keys to hand over, no account to close.",
    seller: "Seller",
    buyer: "Buyer",
    transfer: "1 NFT transfer",
    bundle: ["The Chog NFT", "Its trader: genome and AI persona", "Its wallet and every token in it", "Its League, Bell and decision record"],
  },
} as const;

// ---------------------------------------------------------------- trait DNA (computed in showcase.ts)

export const minds = {
  id: "minds",
  eyebrow: "Meet · Trait DNA",
  title: "Its traits decide what kind of trader it is.",
  lede: "13 on-chain traits compile into a published, versioned **trading genome**: 8 genes, each naming the trait that set it. Every card below is computed from the Chog's real traits by the same code the app runs.",
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
  genomeNote: (version: string) => `Genome ${version} · same traits, same trader: anyone can re-run it`,
} as const;

// ---------------------------------------------------------------- safety (live)

export const safety = {
  id: "safety",
  eyebrow: "Safety · live on Monad",
  title: "Trades, never withdraws.",
  lede: "The AI never holds the keys to a Chog's wallet. It gets one narrow door: **AnimrTradeGuard**, a contract on Monad mainnet that lets it make bounded swaps and nothing else.",
  deployed: {
    label: "Live",
    network: "Monad mainnet",
    title: "AnimrTradeGuard is deployed",
    text: "On Monad mainnet and fork-tested against live mainnet state. A holder opts in from the Chog's page: create its wallet, grant the guard, set limits, deposit.",
    explorer: "View on Monadscan",
    status: "Guard status",
    /** README "Contracts" and ARCHITECTURE §8: deployment day, the fork-test suite, source verification. */
    facts: [
      { key: "tests", value: "37/37", spoken: "37 of 37", label: "Foundry tests pass" },
      { key: "deployed", value: "Oct 19", label: "deployed, 2026" },
      { key: "source", value: "Sourcify", label: "source verified" },
    ],
  },
  house: {
    label: "Guarded",
    movingIn: "Moving in",
    kicker: "The House Chog",
    title: "The House Chog trades real $CHOG",
    text: "Its AI trades the $CHOG in its own wallet two-way, buying dips and selling only into sharp pumps, through the guard: every trade is capped, every swap lands back in the same wallet, and nothing can be withdrawn. That's the vault the heist room dares you to empty.",
    /** The House Chog's own limits (README, ARCHITECTURE §7): its owner's settings under the guard's ceilings. */
    limits: [
      { key: "trade", value: "10%", label: "max per trade" },
      { key: "day", value: "30%", label: "max per day" },
      { key: "buyOnly", value: "Off", label: "buy-only switch" },
    ],
    limitsNote: "Buy-only is an optional owner switch that makes the guard refuse every sell. The House Chog leaves it off.",
    movingInText: "The team is picking which Chog keeps the vault. Until it moves in, the heist room already takes your best lines.",
    /** The House Chog is picked, its wallet isn't ready or funded yet. */
    pickedText: "Its wallet goes live once it holds $CHOG. Until then, the heist room already takes your best lines.",
    movedIn: (label: string, name: string) => `House Chog: ${label} · ${name}`,
  },
  realVsSim: {
    title: "What's real, what's simulated",
    real: {
      label: "Real · Monad mainnet",
      items: [
        "Every Chog's ERC-6551 wallet and the tokens in it",
        "AnimrTradeGuard, and the swaps it allows for holders who opt in (the Real-wallet division)",
        "The House Chog's vault, once it moves in",
        "Heist checks: the exact transfer run against live mainnet state (eth_call), never broadcast",
      ],
    },
    simulated: {
      label: "Simulated · on real data",
      items: [
        "League, Rewind and Versus: genomes replayed on real hourly CHOG/WMON candles, 1% fee + price impact",
        "Claimed AIs in paper mode: real 0G decisions, fills simulated at live prices",
        "Daily Bell rides: points and streaks, never money",
      ],
    },
  },
  can: {
    title: "Through the guard, the AI can",
    items: ["Swap $CHOG ⇄ WMON inside the Chog's own wallet, on one pool, within the holder's limits"],
  },
  cannot: {
    title: "Through the guard, the AI can never",
    items: [
      "Withdraw or transfer tokens out of the wallet",
      "Pick the recipient, token, router or calldata",
      "Move or sell the NFT",
      "Exceed the per-trade cap, daily budget or pace the holder set",
    ],
  },
  checklistTitle: "What the guard enforces",
  checklist: [
    "The AI's key can call one function: `trade()`. No transfers, no approvals, no arbitrary calls.",
    "One venue: $CHOG ⇄ WMON on the Capricorn pool that holds ~95% of $CHOG liquidity. The output always lands back in the same wallet.",
    "Holder-set limits under hard ceilings: at most 50% of a balance per trade, 100% of the vault per day, 2% slippage, and a minimum gap between trades.",
    "A floor from the pool's 30-minute TWAP on every fill, so a sandwich can't drain a trade, plus a deadline on every trade.",
    "Optional buy-only mode: a holder can have the guard refuse every sell, so the AI can only stack $CHOG. It's off by default, and off for the House Chog.",
    "The holder can switch the AI off or revoke the guard at any time. An admin pause can stop trading but never move funds.",
    "Sold the Chog? The seller's grant, limits and buy-only mode go dormant, and the buyer opts in under their own limits.",
  ],
} as const;

// ---------------------------------------------------------------- under the hood (flow diagram)

export const diagram = {
  eyebrow: "Under the hood",
  title: "One NFT, one wallet, one mind.",
  caption:
    "The Chog NFT owns its wallet. The AI reads the wallet and decides; for holders who opt in, its orders go through the guard to the Capricorn pool, and the swap output always returns to the same wallet.",
  today: "Everyone else's AI paper-trades at the pool's live price, and no tokens move.",
  srTitle: "How a Chog trades",
  srDescription:
    "Flow diagram, live on Monad mainnet. The Chog NFT owns an ERC-6551 wallet that holds its $CHOG. The AI mind, glm-5.3 on 0G Compute with its trait genome as the fallback, reads the wallet and decides. If the holder opted in, the AI's trade order goes to the AnimrTradeGuard contract, which swaps $CHOG for WMON or back on the Capricorn pool, and the swap output always returns to the same wallet. Without the opt-in, the AI's trades are paper fills at live prices and no tokens move.",
  /** Left to right (top to bottom on phones). Keep lines under ~20 characters: SVG text doesn't wrap. */
  nodes: [
    { icon: "nft", title: "Chog NFT", lines: ["ERC-721 · #1–1,969", "holder = controller"], optIn: false },
    { icon: "wallet", title: "Chog wallet", lines: ["ERC-6551 account", "holds its $CHOG"], optIn: false },
    { icon: "cpu", title: "AI mind", lines: ["glm-5.3 · 0G Compute", "+ genome fallback"], optIn: false },
    { icon: "shield", title: "Trade guard", lines: ["AnimrTradeGuard", "trade() only"], optIn: true },
    { icon: "pool", title: "Capricorn pool", lines: ["$CHOG/WMON · 1% fee", "~95% of liquidity"], optIn: true },
  ],
  /** Arrow labels between consecutive nodes; opt-in edges are drawn dashed. */
  edges: [
    { label: "owns", optIn: false },
    { label: "reads", optIn: false },
    { label: "orders", optIn: true },
    { label: "swaps", optIn: true },
  ],
  returnLabel: "Swap output lands back in the same wallet",
  badge: "OPT-IN",
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
  eyebrow: "0G Compute · receipts",
  title: "Every AI call comes with a 0G receipt.",
  lede: `A claimed Chog thinks with an LLM (${model.name}) on 0G Compute, a decentralized AI network. Each decision is stored with the receipt 0G returns for it: the provider that served it, the request ID and what it cost.`,
  points: [
    {
      icon: "receipt",
      title: "A receipt per AI call",
      body: "Provider address, request ID and exact cost: about **$0.0016–0.002** per decision.",
    },
    {
      icon: "cpu",
      title: "Provider labels, not claims",
      body: "Each provider is labelled from 0G's public provider list: **TeeML** (the model runs inside an attested enclave) or **TeeTLS** (an attested relay to an upstream API). The Router seals every call end to end and reports no per-call TEE verdict, so Animr never claims one.",
    },
    {
      icon: "refresh",
      title: "Never stalls",
      body: "If the model fails or times out, the Chog's own trait genome makes the call, and the feed labels it as the rules fallback.",
    },
    {
      icon: "gauge",
      title: "Guardrails on every call",
      body: `Whichever brain decides, the genome's per-trade cap and pace and a ${confidenceFloor} confidence floor apply; on-chain, the guard's limits apply on top.`,
    },
  ],
  card: {
    title: "Decision feed",
    badge: "0G test run",
    decidedByLabel: "Decided by",
    stored: "Stored with each LLM decision",
    receiptTitle: "0G receipt",
    /** `field` rows describe what is stored (no made-up values); the others are real values. */
    receipt: [
      { label: "Model", value: model.name, field: false },
      { label: "Provider", value: "on-chain address of the serving node", field: true },
      { label: "Label", value: "TeeML or TeeTLS, from 0G's provider list", field: true },
      { label: "Request ID", value: "unique to the call", field: true },
      { label: "Cost", value: "≈ $0.0016–0.002", field: false },
    ],
    note: "In the app, every LLM decision shows its 0G provider, label and cost in its Chog's feed, and rules-fallback decisions are labelled as such.",
  },
} as const;

export const builtOn = {
  title: "Built on",
  items: [
    { name: "Monad", role: "The chain the Chogs live on" },
    { name: "ERC-6551 · Tokenbound V3", role: "Wallets owned by NFTs" },
    { name: "0G Compute", role: "Decentralized inference for the AI" },
    { name: "Capricorn", role: "The CL pool with ~95% of $CHOG liquidity" },
    { name: "Next.js", role: "The app you're looking at" },
  ],
} as const;

// ---------------------------------------------------------------- FAQ

export const faq = {
  id: "faq",
  eyebrow: "FAQ",
  title: "The questions everyone asks first.",
  items: [
    {
      q: "Do I need a Chog?",
      a: `Not to play. Meet any Chog in the League, rewind it on the real chart, ride one at the Daily Bell and try ${HEIST_TITLE}, all without connecting a wallet. To fund a Chog's wallet and wake its AI you need to own that Chog, because the NFT is the key.`,
    },
    {
      q: "What's real and what's simulated?",
      a: "Real, on Monad mainnet: every Chog's ERC-6551 wallet, AnimrTradeGuard, and the swaps it allows for holders who opt in (the Real-wallet division). Simulated on real data: the League, Rewind and Versus replay each genome over real hourly CHOG/WMON candles with the pool's 1% fee and price impact, and claimed AIs in paper mode make real 0G decisions with simulated fills. Bell rides are points only.",
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
      a: `The House Chog keeps real $CHOG in its own wallet, traded by its AI through AnimrTradeGuard. Talk its AI into sending you some; when it says yes, the page runs that exact transfer against live Monad state and shows you the chain refusing it. ${HEIST_TAGLINE} Until the House Chog moves in, you can already chat with its AI.`,
    },
    {
      q: "What is the Daily Bell?",
      a: "Once a day at 15:00 UTC every Chog publishes a 24-hour $CHOG forecast in its own voice: claimed Chogs through their AI on 0G Compute, the rest from their trait genome. A day later the real price settles every call. Fans ride one Chog per Bell for points and streaks, with a cookie instead of a wallet. Never money.",
    },
    {
      q: "What happens when I sell my Chog?",
      a: "The buyer gets the NFT, and with it the wallet and every token inside, the trading genome, the AI persona and its full record. The seller's guard grant, limits and buy-only mode go dormant automatically; the buyer signs one message to take over the AI and opts in to on-chain trading under their own limits.",
    },
    {
      q: "Does the AI run in a TEE?",
      a: "That depends on the provider that served the call, and every 0G receipt names it, labelled from 0G's public provider list: TeeML (the model runs inside an attested enclave) or TeeTLS (an attested relay to an upstream API). The Router seals each call end to end and publishes no per-call verdict, so Animr shows the provider's label and never claims a verified run.",
    },
    {
      q: "What does the AI cost?",
      a: "Each decision is one LLM call on 0G Compute, about $0.0016–0.002, and the exact cost is on its receipt. Animr pays for the model calls. Waking your Chog's AI is free: a signed message, not a transaction. Creating the wallet, granting the guard and depositing are ordinary Monad transactions.",
    },
    {
      q: "Is Animr affiliated with Chog?",
      a: "No. Animr is an independent project built for Chogathon 2026 and is not affiliated with Chog. Chog images load from the collection's own on-chain metadata.",
    },
  ],
} as const;

// ---------------------------------------------------------------- final call to action

export const finalCta = {
  eyebrow: "1,969 Chogs · 1,969 traders",
  title: "Meet a Chog. Watch it trade.",
  lede: "Rewind a random Chog on the real chart, ride one at the next Bell, or try to talk the House Chog out of its $CHOG.",
  footnote: "No wallet needed to explore.",
} as const;
