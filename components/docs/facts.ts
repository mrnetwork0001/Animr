import { type Address, getAddress } from "viem";
import { MAINNET_TRADE_GUARD } from "@/lib/contracts/animr-trade-guard";
import { chogLabel } from "@/lib/chog-id";
import { appConfig, trading } from "@/lib/config";
import { getChog } from "@/lib/dna/chogs";
import { purseAmountChog } from "@/lib/bell/purse";
import { siteOrigin } from "@/lib/farcaster/embed";
import { houseChogTokenId } from "@/lib/heist/config";
import { buildPersona } from "@/lib/heist/persona";
import { trophiesAddress } from "@/lib/trophies/config";
import { chogGenome, chogName } from "@/lib/dna/population";
import {
  ERC6551_REGISTRY_ADDRESS,
  MULTICALL3_ADDRESS,
  TOKENBOUND_ACCOUNT_V3_IMPLEMENTATION,
  computeTokenBoundAccount,
} from "@/lib/erc6551";

// Public facts the docs quote, read from the code wherever the code holds them (lib/config.ts, lib/erc6551.ts,
// lib/contracts/animr-trade-guard.ts) so the docs can't drift from the app. Server-only (data/chogs.json).
// Addresses that live only in deployment records are written here once, each with where it was checked.

/** This deployment's origin (NEXT_PUBLIC_SITE_URL, else Vercel's production URL); the public app off Vercel. */
const ORIGIN = siteOrigin();

export const LINKS = {
  app: ORIGIN.startsWith("http://localhost") ? "https://useanimr.vercel.app" : ORIGIN,
  explorer: appConfig.chain.blockExplorers?.default.url ?? "https://monadscan.com",
  explorerName: appConfig.chain.blockExplorers?.default.name ?? "Monadscan",
} as const;

/** Tokenbound v0.3.1 AccountProxy: the implementation every Chog wallet address is derived from (lib/config.ts). */
const ACCOUNT_PROXY: Address = "0x55266d75D1a14E4572138116aF39863Ed6596E7F";

export const ADDR = {
  chogNft: appConfig.chogNft ?? getAddress("0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763"),
  chogToken: appConfig.chogToken ?? getAddress("0x350035555E10d9AfAF1566AaebfCeD5BA6C27777"),
  wmon: trading?.wmon ?? getAddress("0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A"),
  pool: trading?.pool ?? getAddress("0x116e7D070f1888B81E1E0324F56d6746B2D7d8f1"),
  swapRouter: trading?.swapRouter ?? getAddress("0xdac97b6a3951641B177283028A8f428332333071"),
  quoterV2: trading?.quoterV2 ?? getAddress("0xB430EDD2b54cdB3B25703fb3342ca3a88663A04D"),
  registry: ERC6551_REGISTRY_ADDRESS as Address,
  accountProxy: ACCOUNT_PROXY,
  accountV3: TOKENBOUND_ACCOUNT_V3_IMPLEMENTATION as Address,
  multicall3: MULTICALL3_ADDRESS as Address,
  guard: MAINNET_TRADE_GUARD,
  /**
   * AnimrTrophies on Monad mainnet (NEXT_PUBLIC_TROPHIES_ADDRESS): name() = "Animr Trophies", minter() = the operator,
   * owner() = the admin wallet with no pendingOwner (eth_call, Oct 22 2026). Source: Sourcify exact match (Oct 21 2026),
   * shown as verified on Monadscan. The literal is the deployed address, for builds without the env var.
   */
  trophies: trophiesAddress ?? getAddress("0x7720Ed65f3DdfC4AD812D8A5ACd25762712b513d"),
  /** The AI operator key's public address: guard.operator() and trophies.minter() (eth_call, Oct 21 2026). */
  operator: getAddress("0x2523bBdD941783C4E565180D2a1b18DE86319cC2"),
  /** The guard's admin, the team's main wallet: guard.admin() (eth_call, Oct 21 2026). */
  admin: getAddress("0xc742AdA2872a042dD36D2E706907b4036968960C"),
  /** The House key (scripts only): deployed the contracts and pays Oracle Purses (.env.example). AnimrTrophies' ownership went to the admin wallet. */
  houseKey: getAddress("0xbcfD3a3846e39a687901EB77ed05F4E3CdC1e259"),
} as const;

/** The House Chog's token id: HOUSE_CHOG_TOKEN_ID (lib/heist/config.ts), else production's 1399 (submission/DEPLOY.md). */
export const HOUSE_TOKEN_ID = houseChogTokenId() ?? 1399;

/**
 * ORACLE_PURSE_CHOG as this deployment reads it (lib/bell/purse.ts): whole $CHOG per settled live Bell, or null when no
 * purse is configured (unset, 0 or invalid). Read at build time, like every env-driven fact on the docs pages.
 */
export const PURSE_CHOG: string | null = (() => {
  const amount = purseAmountChog();
  return amount && Number(amount) > 0 ? amount : null;
})();

const houseSnapshot = getChog(HOUSE_TOKEN_ID);

export const HOUSE = {
  tokenId: HOUSE_TOKEN_ID,
  /** "CHOG #891 · token 1399". */
  label: chogLabel(HOUSE_TOKEN_ID, { metadataName: houseSnapshot?.name }),
  /** Persona name, as every page shows it first. */
  name: houseSnapshot ? chogName(houseSnapshot) : null,
  archetype: houseSnapshot ? chogGenome(houseSnapshot).archetype : null,
  /** Messages a robber gets per heist: the defender's patience, from the genome's cooldown (lib/heist/persona.ts). */
  patience: buildPersona(HOUSE_TOKEN_ID).patience,
  wallet: computeTokenBoundAccount({
    implementation: ACCOUNT_PROXY,
    tokenContract: getAddress("0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763"),
    tokenId: BigInt(HOUSE_TOKEN_ID),
    chainId: 143,
  }),
} as const;
