import { type Address, type PublicClient, erc20Abi, formatUnits } from "viem";
import { publicClient } from "../clients";
import { isFlaggedChog } from "../brand-safety";
import { chogLabel } from "../chog-id";
import { appConfig } from "../config";
import { getChog } from "../dna/chogs";
import { computeTokenBoundAccount, getTokenBoundAccountStatus } from "../erc6551";
import { explorerAddressUrl } from "../format";
import { houseChogTokenId } from "./config";
import { displayTraits } from "./traits";
import type { HouseChog } from "./types";

// The House Chog: the team's Chog (HOUSE_CHOG_TOKEN_ID) whose Tokenbound wallet holds real $CHOG. It is "open" for
// heists only once the id is set, its TBA is 'ready' and the TBA holds $CHOG; until then it is "moving in".

const CACHE_MS = 15_000;

/** The Chog's canonical Tokenbound account (registry v0.3.1, AccountProxy, salt from appConfig). */
export function houseTba(tokenId: number): Address | null {
  const { accountImplementation, chogNft, chain, salt } = appConfig;
  if (!accountImplementation || !chogNft) return null;
  return computeTokenBoundAccount({
    implementation: accountImplementation,
    tokenContract: chogNft,
    tokenId: BigInt(tokenId),
    chainId: chain.id,
    salt,
  });
}

let cache: { at: number; tokenId: number | null; value: HouseChog } | undefined;
let warnedFlagged = false;

/** The House Chog's public state (cached for 15 s per server instance). Never throws. */
export async function readHouse(options: { fresh?: boolean; client?: PublicClient; tokenId?: number | null } = {}) {
  const tokenId = options.tokenId === undefined ? houseChogTokenId() : options.tokenId;
  const now = Date.now();
  if (!options.fresh && !options.client && cache && cache.tokenId === tokenId && now - cache.at < CACHE_MS) {
    return cache.value;
  }
  const value = await loadHouse(options.client ?? publicClient, tokenId);
  // A failed read isn't cached, so the next visitor tries again.
  if (!options.client && value.blockNumber !== null) cache = { at: now, tokenId, value };
  return value;
}

async function loadHouse(client: PublicClient, tokenId: number | null): Promise<HouseChog> {
  const blank: HouseChog = {
    phase: "unset",
    note: "The House Chog hasn't moved in yet: the team is picking which Chog keeps the vault.",
    tokenId: null,
    name: null,
    image: null,
    tba: null,
    tbaStatus: null,
    chogBalance: null,
    explorerUrl: null,
    blockNumber: null,
    traits: [],
  };
  if (tokenId === null) return blank;

  const snapshot = getChog(tokenId);
  if (snapshot && isFlaggedChog(snapshot.traits) && !warnedFlagged) {
    warnedFlagged = true;
    console.warn(`[animr] heist: the House Chog (#${tokenId}) carries flagged trait values; its art may show them. Pick another Chog.`);
  }
  const tba = houseTba(tokenId);
  // "CHOG #891 · token 1399": "Chog #1399" alone is another NFT's marketplace name.
  const label = chogLabel(tokenId, { metadataName: snapshot?.name });
  const base: HouseChog = {
    ...blank,
    phase: "moving-in",
    tokenId,
    name: snapshot?.name ?? null,
    image: snapshot?.image ?? null,
    tba,
    explorerUrl: tba ? (explorerAddressUrl(tba) ?? null) : null,
    traits: snapshot ? displayTraits(snapshot.traits) : [],
  };
  const chog = appConfig.chogToken;
  if (!tba || !chog) return { ...base, phase: "unset", note: `No Chog collection or $CHOG token is configured on ${appConfig.chain.name}.` };

  try {
    const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
    const [status, balance] = await Promise.all([
      getTokenBoundAccountStatus(client, tba),
      client.readContract({ address: chog, abi: erc20Abi, functionName: "balanceOf", args: [tba], blockNumber }),
    ]);
    const state = { ...base, tbaStatus: status, chogBalance: formatUnits(balance, 18), blockNumber: blockNumber.toString() };
    if (status === "none") return { ...state, note: `${label} is moving in: its wallet isn't deployed yet.` };
    if (status === "uninitialized") return { ...state, note: `${label} is moving in: its wallet is created but not initialized yet.` };
    if (balance === BigInt(0)) return { ...state, note: `${label} is moving in: its wallet is ready but holds no $CHOG yet.` };
    return { ...state, phase: "open", note: null };
  } catch (error) {
    console.warn("[animr] heist: couldn't read the House Chog's wallet:", error instanceof Error ? error.message.split("\n")[0] : error);
    return { ...base, note: `Couldn't read ${label}'s wallet on ${appConfig.chain.name} right now.` };
  }
}
