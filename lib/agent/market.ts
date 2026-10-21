import type { Address } from "viem";
import { appConfig } from "../config";
import type { MarketSnapshot } from "./types";

// Public market APIs, verified for $CHOG on Monad mainnet. Neither indexes Monad testnet.
//   DexScreener:   GET https://api.dexscreener.com/token-pairs/v1/monad/<token>  (every pool of the token)
//   GeckoTerminal: GET https://api.geckoterminal.com/api/v2/networks/monad/tokens/<token>/pools
const DEXSCREENER_CHAIN = appConfig.network === "mainnet" ? "monad" : null;
const GECKOTERMINAL_NETWORK = appConfig.network === "mainnet" ? "monad" : null;

const CACHE_TTL_MS = 30_000;
const UNAVAILABLE_TTL_MS = 10_000;
const FETCH_TIMEOUT_MS = 8_000;
const MON_SYMBOLS = new Set(["MON", "WMON"]);

const cache = new Map<string, { expires: number; snapshot: MarketSnapshot }>();
const inflight = new Map<string, Promise<MarketSnapshot>>();

/**
 * Current $CHOG market data (~30s in-process cache). Never throws: when nothing
 * is available every number is null and `source` is "unavailable".
 */
export async function getMarketSnapshot(
  chogToken: Address | undefined = appConfig.chogToken,
): Promise<MarketSnapshot> {
  const now = Date.now();
  if (!chogToken) return unavailable(now);

  const key = `${appConfig.network}:${chogToken.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.snapshot;
  const pending = inflight.get(key);
  if (pending) return pending;

  const request = fetchSnapshot(chogToken)
    .catch(() => unavailable(Date.now()))
    .then((snapshot) => {
      const ttl = snapshot.source === "unavailable" ? UNAVAILABLE_TTL_MS : CACHE_TTL_MS;
      cache.set(key, { expires: Date.now() + ttl, snapshot });
      return snapshot;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

async function fetchSnapshot(token: Address): Promise<MarketSnapshot> {
  return (
    (await fromDexScreener(token).catch(() => null)) ??
    (await fromGeckoTerminal(token).catch(() => null)) ??
    unavailable(Date.now())
  );
}

function unavailable(now: number): MarketSnapshot {
  return {
    priceUsd: null,
    priceQuote: null,
    change1hPct: null,
    change24hPct: null,
    volume24hUsd: null,
    liquidityUsd: null,
    source: "unavailable",
    fetchedAt: new Date(now).toISOString(),
  };
}

/** Finite number from an API field (numbers often arrive as strings), else null. */
function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function positive(value: unknown): number | null {
  const n = num(value);
  return n !== null && n > 0 ? n : null;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  return res.json();
}

type DexScreenerPair = {
  chainId?: string;
  baseToken?: { address?: string };
  quoteToken?: { address?: string; symbol?: string };
  priceNative?: string;
  priceUsd?: string;
  priceChange?: { h1?: number; h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
};

async function fromDexScreener(token: Address): Promise<MarketSnapshot | null> {
  if (!DEXSCREENER_CHAIN) return null;
  const data = await getJson(`https://api.dexscreener.com/token-pairs/v1/${DEXSCREENER_CHAIN}/${token}`);
  const pairs = (Array.isArray(data) ? (data as DexScreenerPair[]) : [])
    .filter(
      (pair) =>
        pair?.chainId === DEXSCREENER_CHAIN &&
        pair.baseToken?.address?.toLowerCase() === token.toLowerCase() &&
        positive(pair.priceUsd) !== null,
    )
    .sort((a, b) => (num(b.liquidity?.usd) ?? 0) - (num(a.liquidity?.usd) ?? 0));
  const top = pairs[0];
  if (!top) return null;
  // priceNative is denominated in the pair's quote token, so take it from the deepest MON/WMON pool.
  const monPair = pairs.find((pair) => MON_SYMBOLS.has(pair.quoteToken?.symbol?.toUpperCase() ?? ""));
  return {
    priceUsd: positive(top.priceUsd),
    priceQuote: monPair ? positive(monPair.priceNative) : null,
    change1hPct: num(top.priceChange?.h1),
    change24hPct: num(top.priceChange?.h24),
    volume24hUsd: num(top.volume?.h24),
    liquidityUsd: num(top.liquidity?.usd),
    source: "dexscreener",
    fetchedAt: new Date().toISOString(),
  };
}

type GeckoTerminalPool = {
  attributes?: {
    base_token_price_usd?: string;
    base_token_price_native_currency?: string;
    price_change_percentage?: { h1?: string; h24?: string };
    volume_usd?: { h24?: string };
    reserve_in_usd?: string;
  };
  relationships?: { base_token?: { data?: { id?: string } } };
};

async function fromGeckoTerminal(token: Address): Promise<MarketSnapshot | null> {
  if (!GECKOTERMINAL_NETWORK) return null;
  const data = (await getJson(
    `https://api.geckoterminal.com/api/v2/networks/${GECKOTERMINAL_NETWORK}/tokens/${token}/pools?page=1`,
  )) as { data?: GeckoTerminalPool[] } | null;
  const baseId = `${GECKOTERMINAL_NETWORK}_${token.toLowerCase()}`;
  const pools = (Array.isArray(data?.data) ? data.data : [])
    .filter((pool) => pool?.relationships?.base_token?.data?.id?.toLowerCase() === baseId)
    .sort((a, b) => (num(b.attributes?.reserve_in_usd) ?? 0) - (num(a.attributes?.reserve_in_usd) ?? 0));
  const attributes = pools[0]?.attributes;
  if (!attributes || positive(attributes.base_token_price_usd) === null) return null;
  return {
    priceUsd: positive(attributes.base_token_price_usd),
    // The native currency on Monad is MON, whatever the pool's quote token is.
    priceQuote: positive(attributes.base_token_price_native_currency),
    change1hPct: num(attributes.price_change_percentage?.h1),
    change24hPct: num(attributes.price_change_percentage?.h24),
    volume24hUsd: num(attributes.volume_usd?.h24),
    liquidityUsd: num(attributes.reserve_in_usd),
    source: "geckoterminal",
    fetchedAt: new Date().toISOString(),
  };
}
