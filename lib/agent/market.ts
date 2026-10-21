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

/** ANIMR_MOCK_MARKET=1 swaps live data for a deterministic, time-based random walk (demos without liquidity). */
export function isMockMarket(): boolean {
  return process.env.ANIMR_MOCK_MARKET === "1" || process.env.ANIMR_MOCK_MARKET === "true";
}

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
  if (isMockMarket()) return mockSnapshot(now);
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

// --- Mock market: smooth value noise at several time scales around the real
// pool's levels (Oct 2026: ~0.0735 MON per $CHOG, MON ~ $0.0214, ~$95k liquidity).
const MOCK_PRICE_QUOTE = 0.0735;
const MOCK_MON_USD = 0.0214;
const MOCK_LIQUIDITY_USD = 95_000;
const MOCK_VOLUME_USD = 8_000;
const HOUR_MS = 3_600_000;
const OCTAVES = [
  { periodMs: HOUR_MS / 4, amplitude: 0.012 },
  { periodMs: 2 * HOUR_MS, amplitude: 0.03 },
  { periodMs: 12 * HOUR_MS, amplitude: 0.06 },
  { periodMs: 72 * HOUR_MS, amplitude: 0.1 },
];

/** Deterministic hash of an integer to [0, 1). */
function hash01(n: number, seed: number): number {
  let h = Math.imul(n ^ seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smoothly interpolated noise in [-1, 1]. */
function valueNoise(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash01(i, seed) * 2 - 1;
  const b = hash01(i + 1, seed) * 2 - 1;
  return a + (b - a) * f * f * (3 - 2 * f);
}

function mockPriceQuote(time: number): number {
  const logReturn = OCTAVES.reduce(
    (sum, { periodMs, amplitude }, k) => sum + amplitude * valueNoise(time / periodMs, 0x5eed + k * 7919),
    0,
  );
  return MOCK_PRICE_QUOTE * Math.exp(logReturn);
}

function round(value: number, significant = 6): number {
  return Number(value.toPrecision(significant));
}

function mockSnapshot(now: number): MarketSnapshot {
  const priceQuote = mockPriceQuote(now);
  const change1h = (priceQuote / mockPriceQuote(now - HOUR_MS) - 1) * 100;
  const change24h = (priceQuote / mockPriceQuote(now - 24 * HOUR_MS) - 1) * 100;
  return {
    priceUsd: round(priceQuote * MOCK_MON_USD),
    priceQuote: round(priceQuote),
    change1hPct: round(change1h, 3),
    change24hPct: round(change24h, 3),
    volume24hUsd: Math.round(MOCK_VOLUME_USD * (1 + Math.abs(change24h) / 5)),
    liquidityUsd: Math.round(MOCK_LIQUIDITY_USD * (1 + 0.1 * valueNoise(now / (6 * HOUR_MS), 0xbeef))),
    source: "mock",
    fetchedAt: new Date(now).toISOString(),
  };
}
