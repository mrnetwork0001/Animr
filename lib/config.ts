import { type Address, type Hex, getAddress, isAddressEqual, maxUint256, zeroHash } from "viem";
import { monad, monadTestnet } from "viem/chains";

// NEXT_PUBLIC_* values are inlined at build time, so each one must be read as a
// literal `process.env.NEXT_PUBLIC_...` expression.
const network = process.env.NEXT_PUBLIC_NETWORK === "testnet" ? "testnet" : "mainnet";

export const chain = network === "testnet" ? monadTestnet : monad;

/** Tokenbound v0.3.1 AccountProxy — the ERC-6551 implementation on Monad mainnet and testnet. */
const TOKENBOUND_ACCOUNT_PROXY: Address = "0x55266d75D1a14E4572138116aF39863Ed6596E7F";

/** Chog Genesis: ERC-721, token IDs 1–1969, not enumerable. */
const CHOG_GENESIS: Address = "0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763";

/** Official Chog assets, which exist only on Monad mainnet (the testnet was wiped on 2025-12-16). */
const MAINNET_ASSETS: { chogNft?: Address; chogToken?: Address } =
  network === "mainnet"
    ? {
        chogNft: CHOG_GENESIS,
        // $CHOG: nad.fun ERC-20, 18 decimals.
        chogToken: "0x350035555E10d9AfAF1566AaebfCeD5BA6C27777",
      }
    : {};

/**
 * Where $CHOG trades: ~95% of its liquidity sits in one Capricorn CL (nad.fun's
 * Uniswap-v3 fork) CHOG/WMON pool with a 1% fee. Uniswap routers can't reach it.
 */
export const trading =
  network === "mainnet"
    ? {
        wmon: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A" as Address,
        pool: "0x116e7D070f1888B81E1E0324F56d6746B2D7d8f1" as Address,
        swapRouter: "0xdac97b6a3951641B177283028A8f428332333071" as Address,
        quoterV2: "0xB430EDD2b54cdB3B25703fb3342ca3a88663A04D" as Address,
        fee: 10_000,
      }
    : undefined;

function optionalAddress(value: string | undefined): Address | undefined {
  return value ? getAddress(value) : undefined;
}

const chogNft = optionalAddress(process.env.NEXT_PUBLIC_CHOG_NFT_ADDRESS) ?? MAINNET_ASSETS.chogNft;

export const appConfig = {
  network,
  chain,
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || chain.rpcUrls.default.http[0],
  /** The Chog NFT collection (ERC-721) whose tokens own the accounts. */
  chogNft,
  /** The $CHOG ERC-20 the agents trade. */
  chogToken: optionalAddress(process.env.NEXT_PUBLIC_CHOG_TOKEN_ADDRESS) ?? MAINNET_ASSETS.chogToken,
  /** ERC-6551 account implementation passed to the registry. */
  accountImplementation:
    optionalAddress(process.env.NEXT_PUBLIC_TBA_IMPLEMENTATION) ??
    (TOKENBOUND_ACCOUNT_PROXY as Address | undefined),
  salt: (process.env.NEXT_PUBLIC_TBA_SALT as Hex | undefined) || zeroHash,
  /** Valid token IDs (inclusive): 1–1969 for Chog Genesis, any uint256 for another collection. */
  tokenIdRange:
    chogNft && isAddressEqual(chogNft, CHOG_GENESIS)
      ? { min: BigInt(1), max: BigInt(1969) }
      : { min: BigInt(0), max: maxUint256 },
  /** "Buy this Portfolio" link; {contract} and {tokenId} are substituted. */
  marketplaceUrlTemplate:
    process.env.NEXT_PUBLIC_MARKETPLACE_URL_TEMPLATE ||
    "https://opensea.io/item/monad/{contract}/{tokenId}",
} as const;

export type AppConfig = typeof appConfig;
