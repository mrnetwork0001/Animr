// The docs' table of contents (/docs, /docs/<slug>): groups, page titles and one-line descriptions. Plain data, so
// the sidebar, the phone picker, prev/next links, metadata and generateStaticParams all read the same list.

export type DocEntry = {
  /** "" is the docs home (/docs); anything else is /docs/<slug>. */
  slug: string;
  /** The H1 and the <title> ("<title> · Animr Docs"). */
  title: string;
  /** The sidebar label, when shorter than the title. */
  nav?: string;
  /** Meta description and the lead under the H1. One or two lines. */
  description: string;
};

export type DocGroup = { label: string; pages: readonly DocEntry[] };

export const DOC_GROUPS: readonly DocGroup[] = [
  {
    label: "Getting started",
    pages: [
      {
        slug: "",
        title: "Welcome to Animr",
        nav: "Welcome",
        description:
          "Every Chog Genesis NFT is an AI trader with its own ERC-6551 wallet on Monad. One score ranks them all: $CHOG stacked vs just holding.",
      },
      {
        slug: "how-it-works",
        title: "How it works",
        description: "From a Chog's traits to its trading genome, its wallet, its AI and the guard, end to end.",
      },
      {
        slug: "judge-quick-start",
        title: "Judge quick start",
        description: "The fastest path through Animr. No wallet, no sign-up, no install.",
      },
    ],
  },
  {
    label: "Play",
    pages: [
      {
        slug: "league",
        title: "League and Traits",
        nav: "League and Traits",
        description:
          "Every Chog's genome replayed on real hourly CHOG/WMON candles and ranked against just holding, plus which trait values win.",
      },
      {
        slug: "trading-dna",
        title: "Trading DNA",
        description: "How 13 on-chain traits compile into a versioned genome of 8 genes, and why the same Chog always trades the same way.",
      },
      {
        slug: "time-machine",
        title: "Time Machine",
        description: "Replay one Chog trade by trade on the real chart, in its own voice, or race two on the same candles.",
      },
      {
        slug: "versus",
        title: "Versus",
        description: "Two Chogs race a hidden 48 hours of real $CHOG history. Call the winner, then see the real dates.",
      },
      {
        slug: "breed",
        title: "Breed",
        description: "Pick two Chogs. Their child takes each trait from one parent and trades the same real chart.",
      },
      {
        slug: "daily-bell",
        title: "Daily Bell",
        description: "Every Chog calls $CHOG's next 24 hours at 15:00 UTC. Fans ride one, and the real market settles it.",
      },
      {
        slug: "rob-this-chog",
        title: "Rob this Chog",
        description: "Talk the House Chog's AI into handing over its $CHOG, then watch Monad refuse the transfer.",
      },
      {
        slug: "ask-this-chog",
        title: "Ask this Chog",
        description: "Ask any Chog's AI about its trades, its DNA and its record. It answers in text and can't act.",
      },
    ],
  },
  {
    label: "Own a Chog",
    pages: [
      {
        slug: "holder-guide",
        title: "Holder guide",
        description:
          "Every step a holder takes on their Chog's page, from Log in to an AI trading real $CHOG, and how to withdraw.",
      },
      {
        slug: "chog-wallet",
        title: "Your Chog's wallet",
        nav: "Your Chog's wallet",
        description: "The ERC-6551 account every Chog owns: how its address is derived, how it is created, and what moves with the NFT.",
      },
      {
        slug: "claim-its-ai",
        title: "Claim its AI",
        description: "One free signature gives a Chog an LLM brain on 0G Compute. Paper trading first, on-chain only if you opt in.",
      },
      {
        slug: "trade-guard",
        title: "AnimrTradeGuard",
        description: "The contract that lets a Chog's AI trade its wallet within your limits, and never withdraw from it.",
      },
      {
        slug: "trophies",
        title: "Trophy cabinet",
        description: "Soulbound ERC-1155 trophies minted into a Chog's own wallet, so its history moves with the NFT.",
      },
    ],
  },
  {
    label: "Tech",
    pages: [
      {
        slug: "architecture",
        title: "Architecture",
        description: "The stack, the data sources, where state lives and what runs on a schedule.",
      },
      {
        slug: "contracts-and-api",
        title: "Contracts and API",
        description: "Every contract Animr calls or deployed, and the public HTTP API behind the pages.",
      },
      {
        slug: "self-hosting",
        title: "Self-hosting and deployment",
        nav: "Self-hosting",
        description: "Run Animr locally or deploy it to Vercel: environment variables, Redis, crons and the external pulse.",
      },
    ],
  },
  {
    label: "Trust",
    pages: [
      {
        slug: "trust",
        title: "Trust model and FAQ",
        nav: "Trust model and FAQ",
        description: "What is real and what is simulated, what the AI can and can't do, who holds which key, and brand safety.",
      },
    ],
  },
];

export const DOC_PAGES: readonly DocEntry[] = DOC_GROUPS.flatMap((group) => group.pages);

export function docHref(slug: string): string {
  return slug ? `/docs/${slug}` : "/docs";
}

export function docEntry(slug: string): DocEntry | undefined {
  return DOC_PAGES.find((page) => page.slug === slug);
}

export function docGroupOf(slug: string): DocGroup | undefined {
  return DOC_GROUPS.find((group) => group.pages.some((page) => page.slug === slug));
}

/** The pages before and after `slug` in reading order. */
export function docNeighbours(slug: string): { prev?: DocEntry; next?: DocEntry } {
  const index = DOC_PAGES.findIndex((page) => page.slug === slug);
  if (index < 0) return {};
  return { prev: DOC_PAGES[index - 1], next: DOC_PAGES[index + 1] };
}
