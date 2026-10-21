import type { Address } from "viem";
import { animrTradeGuardAddress } from "@/lib/contracts/animr-trade-guard";
import { appConfig, trading } from "@/lib/config";
import { ERC6551_REGISTRY_ADDRESS } from "@/lib/erc6551";
import { explorerAddressUrl } from "@/lib/format";
import { HEIST_TITLE } from "@/lib/heist/config";

// The site footer's data (components/site-footer/site-footer.tsx), shared by the landing page and every app page.
// Every link here is real: internal hrefs are app routes, external ones were checked to load (October 2026).
// Addresses come from the same code the app trades with (lib/config.ts, lib/erc6551.ts, lib/contracts/*).

export type FooterLink = {
  label: string;
  href: string;
  /** Opens in a new tab with an ↗ mark. Internal routes go through next/link. */
  external?: boolean;
  /** Shown as the link's tooltip, e.g. a full contract address. */
  title?: string;
};

export type FooterColumn = { title: string; links: readonly FooterLink[] };

export const REPO_URL = "https://github.com/mrnetwork0001/Animr";

const explorerName = appConfig.chain.blockExplorers?.default.name ?? "Monadscan";
const explorerUrl = appConfig.chain.blockExplorers?.default.url ?? "https://monadscan.com";

/** Chog Genesis on OpenSea: the collection lib/market/listings.ts reads (COLLECTION_URL, slug "chog-genesis"). */
const OPENSEA_COLLECTION = "https://opensea.io/collection/chog-genesis";

/** The CHOG/WMON pool every Animr trade and replay uses (trading.pool), on GeckoTerminal, where its candles come from. */
const CHOG_POOL = trading?.pool ?? "0x116e7D070f1888B81E1E0324F56d6746B2D7d8f1";
const CHOG_CHART = `https://www.geckoterminal.com/monad/pools/${CHOG_POOL}`;

/** AnimrTrophies on Monad mainnet (components/docs/facts.ts: name() = "Animr Trophies"). */
const TROPHIES: Address = "0x7720Ed65f3DdfC4AD812D8A5ACd25762712b513d";

function contractLink(label: string, address: Address): FooterLink {
  return { label, href: explorerAddressUrl(address) ?? `${explorerUrl}/address/${address}`, external: true, title: address };
}

export const footerCopy = {
  description:
    // A no-break hyphen keeps "ERC-6551" on one line.
    "Every Chog Genesis NFT is a trader with its own ERC\u20116551 wallet on Monad. Its traits are its strategy and the $CHOG market keeps score. An opt-in AI trades through a guard that can never withdraw.",
  /** The one consolidated honesty note: what is simulated, what is real. */
  honesty:
    "Simulated: League, Versus, Time Machine and Daily Bell results replay real hourly $CHOG candles with the pool's 1% fee and price impact. Points have no cash value. Real: every Chog's ERC-6551 wallet and AnimrTradeGuard on Monad mainnet; a Chog's AI trades on-chain only if its holder opts in.",
  credit: ["© 2026 Animr", "Built for Chogathon 2026 on Monad", "Not affiliated with Chog"],
} as const;

export const footerSocials: readonly { label: string; href: string; icon: "github" }[] = [
  { label: "Animr on GitHub", href: REPO_URL, icon: "github" },
];

export const footerColumns: readonly FooterColumn[] = [
  {
    title: "Product",
    links: [
      { label: "Your Chogs", href: "/app" },
      { label: "League", href: "/league" },
      { label: "Versus", href: "/versus" },
      { label: "Breed", href: "/breed" },
      { label: "Daily Bell", href: "/bell" },
      { label: HEIST_TITLE, href: "/heist" },
      { label: "For sale", href: "/market" },
    ],
  },
  {
    title: "Ecosystem",
    links: [
      { label: "Monad", href: "https://www.monad.xyz", external: true },
      { label: explorerName, href: explorerUrl, external: true },
      { label: "Chog Genesis", href: OPENSEA_COLLECTION, external: true, title: "Chog Genesis on OpenSea" },
      { label: "$CHOG chart", href: CHOG_CHART, external: true, title: "The CHOG/WMON pool on GeckoTerminal" },
      { label: "0G Compute", href: "https://0g.ai", external: true },
      { label: "Tokenbound", href: "https://tokenbound.org", external: true, title: "Tokenbound: ERC-6551 accounts" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "Judge tour", href: "/tour" },
      { label: "Stats", href: "/stats" },
      { label: "Guard status", href: "/guard" },
      { label: "FAQ", href: "/#faq" },
      { label: "GitHub", href: REPO_URL, external: true },
      contractLink("Trophies contract", TROPHIES),
    ],
  },
];

/** The bottom bar's contract chips, each linking to the explorer. */
export const footerContracts: readonly { label: string; address: Address; href: string }[] = [
  { label: "ERC-6551 registry", address: ERC6551_REGISTRY_ADDRESS as Address },
  ...(animrTradeGuardAddress ? [{ label: "AnimrTradeGuard", address: animrTradeGuardAddress }] : []),
].map((c) => ({ ...c, href: explorerAddressUrl(c.address) ?? `${explorerUrl}/address/${c.address}` }));
