import { type Address, erc721Abi, getAddress, isAddress } from "viem";
import { getStore } from "./agent/store";
import type { AgentRecord, TradingStyle } from "./agent/types";
import { latestSummary, readCall } from "./bell/store";
import type { BellCall, BellSummary } from "./bell/types";
import { scrubTraitText } from "./brand-safety";
import { CHOG_SUPPLY, chogLabel } from "./chog-id";
import { publicClient } from "./clients";
import { appConfig } from "./config";
import { DEFAULT_WINDOW } from "./dna/backtest";
import { getChog } from "./dna/chogs";
import { chogGenome, chogName, getPopulation } from "./dna/population";
import type { PopulationRow, ReplayWindow } from "./dna/types";
import { houseChogTokenId } from "./heist/config";
import { type Kv, getKv } from "./kv";
import { resolveUri } from "./nft";
import { loadVisibility } from "./visibility";

// "Your Chogs": every Chog Genesis token a wallet holds, each with its League standing, its Daily Bell call and its AI.
// Chog Genesis isn't ERC721Enumerable, so ownership comes from one owner map of all 1,969 tokens: ownerOf through
// Multicall3, 200 tokens per eth_call (10 calls, two in flight: far below the public RPC's ~25-50 requests/s).
// Server-only (the chain, lib/kv.ts, data/chogs.json). Client code imports its types only (`import type`).
//
// One scan serves every visitor:
//   - lib/kv.ts keeps the map under animr:holders:owners (~50 KB) for a day; it is rebuilt once it is 10 minutes old,
//     by one instance at a time (lock "holders:scan") while the others keep answering from the previous copy;
//   - each instance keeps the decoded map in memory (globalThis: shared by every route bundle) while it is fresh;
//   - every request also reads the holder's live balanceOf (cached 15 s per address): when it disagrees with the map
//     (they just bought or sold a Chog), the map is rebuilt, at most every 30 s.
// A failed scan never empties the page: the last good map answers, flagged `stale`.
//
// HTTP contract (app/api/holders/[address]/route.ts):
//   GET /api/holders/[address] -> HoldingsResponse
//     400 not an address, 429 rate limited (Retry-After), 501 another collection, 503 ownership unreadable.

/** One Chog a wallet holds. */
export type HolderChog = {
  tokenId: number;
  /** The number in its metadata name, the one marketplaces show ("CHOG #1462" is token 1 -> 1462); 0 when unknown. */
  nameNumber: number;
  /** Both numbers, always: "CHOG #1462 · token 1". */
  label: string;
  /** Its persona name ("Rocket Ears"): the name its AI gets and every page shows. */
  name: string;
  /** Its art, as an https gateway URL ("" when unknown). */
  image: string;
  /** Its trading genome's archetype ("Breakout Chaser") and style: a pure function of its traits. */
  archetype?: string;
  style?: TradingStyle;
  /**
   * Its holder took it out of Animr's public pages ("Hide my Chog", lib/optout.ts). It is still listed (it's theirs),
   * but like on its profile, without its League standing or Bell call: this API can't tell who is asking.
   */
  hidden: boolean;
  /** The House Chog (HOUSE_CHOG_TOKEN_ID), the one visitors try to rob at /heist. */
  house?: true;
  /** Its League place over HoldingsResponse.league.window. Simulated on real $CHOG candles (1% fee + impact). */
  league?: { rank: number; edgePct: number; trades: number };
  /** Its call on HoldingsResponse.bell; `points` and `hit` once that Bell settled. Points only, never money. */
  bell?: {
    forecastPct: number;
    conviction: number;
    source: BellCall["source"];
    thesis: string;
    points?: number;
    hit?: boolean;
  };
  /** Its AI agent, once a holder woke it ("claimed"); pnlPct is its edge over just holding $CHOG. */
  agent?: {
    active: boolean;
    mode: AgentRecord["mode"];
    pnlPct: number;
    decisions: number;
    lastDecisionAt: string | null;
  };
};

/** GET /api/holders/[address] */
export type HoldingsResponse = {
  /** Checksummed. */
  address: Address;
  /** Best League rank first (ties by token id), then hidden Chogs by token id. */
  chogs: HolderChog[];
  /** What the `league` fields rank against; null when nothing is held or the League couldn't be built. */
  league: { window: ReplayWindow; genomeVersion: string; total: number; label: string } | null;
  /** The Bell the `bell` fields come from (the latest rung one); null when nothing is held or there is none. */
  bell: Pick<BellSummary, "day" | "kind" | "status" | "actualPct"> | null;
  /**
   * When ownership was read from Monad, and how (eth_calls and milliseconds of that scan). `stale` when the map is
   * older than the 10-minute refresh because Monad couldn't be read since.
   */
  ownership: { at: string; stale: boolean; calls: number; ms: number };
};

/** A request this module turns down; `status` is the HTTP status to answer with. */
export class HoldingsError extends Error {
  name = "HoldingsError";
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** The label every League number carries here. */
export const HOLDINGS_LEAGUE_LABEL = "simulated on real $CHOG candles";
/** The shared owner map is rebuilt once it is this old. */
export const OWNERS_FRESH_MS = 10 * 60_000;

const KEY = "animr:holders:owners";
const LOCK = "holders:scan";
/** Tokens per eth_call, and eth_calls in flight. */
const BATCH = 200;
const CONCURRENCY = 2;
const ATTEMPTS = 3;
/** A scan with more failed reads than this is not stored (a partial map would hide Chogs from their holders). */
const MAX_UNREADABLE = 20;
/** The stored map outlives its freshness so a Monad RPC outage still has an answer. */
const KEEP_MS = 24 * 3_600_000;
const LOCK_TTL_MS = 60_000;
/** With no map anywhere yet, how long to wait for another instance's scan before scanning too. */
const WAIT_MS = 8_000;
/** A holder whose live balance disagrees with the map triggers a rebuild once the map is this old. */
const RECHECK_MS = 30_000;
const BALANCE_TTL_MS = 15_000;
const MAX_BALANCES = 1_000;
const AGENTS_TTL_MS = 5_000;
/** How long the previous map answers without retrying while another instance holds the scan lock, or after a failed scan. */
const HOLD_WHILE_LOCKED_MS = 5_000;
const HOLD_AFTER_FAILURE_MS = 30_000;

// --- The owner map ---------------------------------------------------------------------------------

/** Who holds every Chog Genesis token, as one scan read it. */
export type OwnerMap = {
  /** owners[tokenId - 1]: its holder (lowercase), or null when its read failed. */
  owners: readonly (string | null)[];
  /** Lowercase holder -> its token ids, ascending. */
  byHolder: ReadonlyMap<string, readonly number[]>;
  /** When the scan finished (ms since the epoch). */
  at: number;
  /** eth_calls the scan made, and how long it took (ms). */
  calls: number;
  ms: number;
  /** Tokens whose ownerOf read failed (at most MAX_UNREADABLE). */
  unreadable: number;
};

/** The map as stored in lib/kv.ts: distinct holders once, then an index per token. */
type StoredOwners = {
  v: 1;
  /** The collection scanned (lowercase), so a config change never reuses another collection's map. */
  collection: string;
  at: number;
  calls: number;
  ms: number;
  /** Distinct holders, lowercase. */
  holders: string[];
  /** owners[tokenId - 1] indexes `holders`; -1 when unknown. */
  owners: number[];
};

type HoldingsCache = {
  v: 2;
  /** The newest map this instance has seen. */
  map?: OwnerMap;
  /** This instance's refresh in flight. */
  pending?: Promise<OwnerMap>;
  /** Lowercase holder -> live balanceOf. */
  balances: Map<string, { count: number; expires: number }>;
  /** Lowercase holder -> a balance a rebuild couldn't reconcile with the map, and until when not to rebuild for it again. */
  mismatches: Map<string, { balance: number; until: number }>;
  /** While another instance scans, or after a failed scan, this instance answers from `map` until then (ms). */
  holdUntil?: number;
  agents?: { expires: number; byId: Map<number, AgentRecord> };
};

const globalForHoldings = globalThis as typeof globalThis & { __animrHoldings?: HoldingsCache };

function cache(): HoldingsCache {
  // (The version check drops a copy left by an older build of this module across a dev hot reload.)
  if (globalForHoldings.__animrHoldings?.v !== 2) {
    globalForHoldings.__animrHoldings = { v: 2, balances: new Map(), mismatches: new Map() };
  }
  return globalForHoldings.__animrHoldings;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).split("\n")[0];

/** Chog Genesis (token ids 1-1969) on the configured network: the only collection with a snapshot and a League. */
function collection(): Address {
  const nft = appConfig.chogNft;
  const { min, max } = appConfig.tokenIdRange;
  if (!nft || min !== BigInt(1) || max !== BigInt(CHOG_SUPPLY)) {
    throw new HoldingsError("Your Chogs covers Chog Genesis on Monad mainnet, and this deployment tracks another collection.", 501);
  }
  return nft;
}

/** A wallet address in any case, lowercased; HoldingsError (400) otherwise. */
function holderOf(address: string): string {
  const text = String(address ?? "").trim();
  if (!isAddress(text, { strict: false })) {
    throw new HoldingsError("That isn't a wallet address: 0x followed by 40 hex characters.");
  }
  return text.toLowerCase();
}

function indexOwners(owners: (string | null)[], at: number, calls: number, ms: number): OwnerMap {
  const byHolder = new Map<string, number[]>();
  let unreadable = 0;
  owners.forEach((owner, i) => {
    if (!owner) {
      unreadable++;
      return;
    }
    const ids = byHolder.get(owner);
    if (ids) ids.push(i + 1);
    else byHolder.set(owner, [i + 1]);
  });
  return { owners, byHolder, at, calls, ms, unreadable };
}

function encode(map: OwnerMap, nft: Address): StoredOwners {
  const holders: string[] = [];
  const index = new Map<string, number>();
  const owners = map.owners.map((owner) => {
    if (!owner) return -1;
    let i = index.get(owner);
    if (i === undefined) index.set(owner, (i = holders.push(owner) - 1));
    return i;
  });
  return { v: 1, collection: nft.toLowerCase(), at: map.at, calls: map.calls, ms: map.ms, holders, owners };
}

function decode(raw: unknown, nft: Address): OwnerMap | null {
  const stored = raw as Partial<StoredOwners> | null;
  if (
    !stored ||
    stored.v !== 1 ||
    stored.collection !== nft.toLowerCase() ||
    typeof stored.at !== "number" ||
    !Array.isArray(stored.holders) ||
    !Array.isArray(stored.owners) ||
    stored.owners.length !== CHOG_SUPPLY
  ) {
    return null;
  }
  const holders = stored.holders;
  const owners = stored.owners.map((i) => {
    const owner = typeof i === "number" && i >= 0 ? holders[i] : undefined;
    return typeof owner === "string" ? owner.toLowerCase() : null;
  });
  return indexOwners(owners, stored.at, Number(stored.calls) || 0, Number(stored.ms) || 0);
}

/**
 * Reads ownerOf for every token: 200 per eth_call through Multicall3 (`batchSize: 0` keeps each batch in one call),
 * two calls in flight, each retried with a backoff. Throws when Monad can't be read.
 */
async function scanOwners(nft: Address): Promise<OwnerMap> {
  const started = Date.now();
  const owners: (string | null)[] = new Array<string | null>(CHOG_SUPPLY).fill(null);
  const batches: number[][] = [];
  for (let first = 1; first <= CHOG_SUPPLY; first += BATCH) {
    batches.push(Array.from({ length: Math.min(BATCH, CHOG_SUPPLY - first + 1) }, (_, i) => first + i));
  }
  let calls = 0;
  let next = 0;
  // The first batch to fail for good stops every worker (none keeps calling Monad after the scan has failed).
  let failure: { error: unknown } | undefined;
  const worker = async () => {
    while (next < batches.length && !failure) {
      const batch = batches[next++];
      for (let attempt = 1; !failure; attempt++) {
        calls++;
        try {
          const results = await publicClient.multicall({
            allowFailure: true,
            batchSize: 0,
            contracts: batch.map((id) => ({
              address: nft,
              abi: erc721Abi,
              functionName: "ownerOf" as const,
              args: [BigInt(id)] as const,
            })),
          });
          results.forEach((result, i) => {
            if (result.status === "success") owners[batch[i] - 1] = result.result.toLowerCase();
          });
          break;
        } catch (error) {
          if (attempt >= ATTEMPTS) failure ??= { error };
          else await sleep(500 * attempt);
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
  if (failure) throw failure.error;
  const finished = Date.now();
  const map = indexOwners(owners, finished, calls, finished - started);
  const { unreadable } = map;
  if (unreadable > MAX_UNREADABLE) throw new Error(`${unreadable} of ${CHOG_SUPPLY} ownerOf reads failed`);
  console.info(
    `[animr] holders: read the owners of ${CHOG_SUPPLY} Chogs in ${calls} eth_calls, ${map.ms} ms ` +
      `(${map.byHolder.size} holders${unreadable ? `, ${unreadable} unreadable` : ""}).`,
  );
  return map;
}

/** The newer of two maps (either may be missing). */
function newest(a: OwnerMap | null | undefined, b: OwnerMap | null | undefined): OwnerMap | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a.at >= b.at ? a : b;
}

/** Keeps `map` as this instance's copy when it is newer than the one it has. */
function keep(map: OwnerMap): OwnerMap {
  const state = cache();
  state.map = newest(state.map, map) ?? map;
  return map;
}

async function readStored(kv: Kv, nft: Address): Promise<OwnerMap | null> {
  try {
    return decode(await kv.get<StoredOwners>(KEY), nft);
  } catch (error) {
    console.warn("[animr] holders: couldn't read the stored owner map:", errorText(error));
    return null;
  }
}

/** Waits (up to WAIT_MS) for another instance's scan to land in the store. */
async function waitForStored(kv: Kv, nft: Address, newerThan: number): Promise<OwnerMap | null> {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(400);
    const stored = await readStored(kv, nft);
    if (stored && stored.at > newerThan) return stored;
  }
  return null;
}

async function refresh(nft: Address, maxAgeMs: number): Promise<OwnerMap> {
  const kv = getKv();
  const stored = await readStored(kv, nft);
  // Another instance may have scanned recently.
  if (stored && Date.now() - stored.at < maxAgeMs) return keep(stored);

  let token: string | null = null;
  let heldElsewhere = false;
  try {
    token = await kv.acquireLock(LOCK, LOCK_TTL_MS);
    heldElsewhere = token === null;
  } catch (error) {
    // No store to coordinate through: scan anyway.
    console.warn("[animr] holders: couldn't take the scan lock:", errorText(error));
  }
  if (heldElsewhere) {
    // Another instance is scanning: the previous map answers meanwhile (this instance stops re-reading the store and
    // re-trying the lock for a few seconds); with none at all, wait for theirs.
    const copy = newest(stored, cache().map);
    if (copy) {
      cache().holdUntil = Date.now() + HOLD_WHILE_LOCKED_MS;
      return keep(copy);
    }
    const landed = await waitForStored(kv, nft, 0);
    if (landed) return keep(landed);
  }
  try {
    if (token) {
      const again = await readStored(kv, nft);
      if (again && Date.now() - again.at < maxAgeMs) return keep(again);
    }
    const scanned = await scanOwners(nft);
    await kv.set(KEY, encode(scanned, nft), KEEP_MS).catch((error) => {
      console.warn("[animr] holders: couldn't store the owner map:", errorText(error));
    });
    return keep(scanned);
  } catch (error) {
    const copy = newest(stored, cache().map);
    if (copy) {
      console.warn(`[animr] holders: owner scan failed (${errorText(error)}); answering from the map of ${new Date(copy.at).toISOString()}.`);
      // Monad is struggling: don't rescan on every request meanwhile.
      cache().holdUntil = Date.now() + HOLD_AFTER_FAILURE_MS;
      return keep(copy);
    }
    console.error("[animr] holders: owner scan failed:", error);
    throw new HoldingsError("Couldn't read who holds which Chog from Monad right now. Try again in a minute.", 503);
  } finally {
    if (token) await kv.releaseLock(LOCK, token).catch(() => {});
  }
}

/**
 * Who holds every Chog Genesis token: at most `maxAgeMs` old (default 10 minutes) whenever Monad can be read, else
 * the last good map. Throws HoldingsError: 501 for another collection, 503 when no map can be had at all.
 */
export async function getOwnerMap({ maxAgeMs = OWNERS_FRESH_MS }: { maxAgeMs?: number } = {}): Promise<OwnerMap> {
  const nft = collection();
  const state = cache();
  const now = Date.now();
  if (state.map && (now - state.map.at < maxAgeMs || (state.holdUntil ?? 0) > now)) return state.map;
  // One refresh per instance at a time; callers that arrive meanwhile share it.
  state.pending ??= refresh(nft, maxAgeMs).finally(() => {
    state.pending = undefined;
  });
  return state.pending;
}

/** How many Chogs `holder` holds right now (balanceOf, cached 15 s per address), or null when it can't be read. */
async function liveBalance(nft: Address, holder: string): Promise<number | null> {
  const balances = cache().balances;
  const now = Date.now();
  const hit = balances.get(holder);
  if (hit && hit.expires > now) return hit.count;
  try {
    const count = Number(
      await publicClient.readContract({ address: nft, abi: erc721Abi, functionName: "balanceOf", args: [holder as Address] }),
    );
    balances.delete(holder);
    if (balances.size >= MAX_BALANCES) balances.delete(balances.keys().next().value!);
    balances.set(holder, { count, expires: now + BALANCE_TTL_MS });
    return count;
  } catch (error) {
    console.warn("[animr] holders: balanceOf failed:", errorText(error));
    return null;
  }
}

/**
 * The map and `holder`'s token ids; rebuilt first when its live balance says the map missed a buy or a sale. A gap a
 * rebuild can't close (unreadable tokens, a lagging RPC node) rebuilds at most once per holder until the normal
 * 10-minute refresh, so one holder can't make every request rescan Monad.
 */
async function heldBy(nft: Address, holder: string): Promise<{ map: OwnerMap; ids: readonly number[] }> {
  const [map, balance] = await Promise.all([getOwnerMap(), liveBalance(nft, holder)]);
  const ids = map.byHolder.get(holder) ?? [];
  if (balance === null || balance === ids.length || Date.now() - map.at < RECHECK_MS) return { map, ids };
  // Tokens the scan couldn't read may be exactly the ones missing: a rescan wouldn't be any wiser.
  if (balance > ids.length && balance - ids.length <= map.unreadable) return { map, ids };
  const mismatches = cache().mismatches;
  const known = mismatches.get(holder);
  if (known && known.balance === balance && known.until > Date.now()) return { map, ids };

  const fresh = await getOwnerMap({ maxAgeMs: RECHECK_MS });
  const freshIds = fresh.byHolder.get(holder) ?? [];
  mismatches.delete(holder);
  // Remember the gap only when a newer map really came back and still disagrees (not while the old map holds).
  if (fresh.at > map.at && freshIds.length !== balance) {
    if (mismatches.size >= MAX_BALANCES) mismatches.delete(mismatches.keys().next().value!);
    mismatches.set(holder, { balance, until: Date.now() + OWNERS_FRESH_MS });
  }
  return { map: fresh, ids: freshIds };
}

// --- What each Chog has been up to ---------------------------------------------------------------

type LeagueView = { rows: Map<number, PopulationRow>; context: NonNullable<HoldingsResponse["league"]> };

/** The League (cached hourly by lib/dna/population.ts), or null when it can't be built. */
async function leagueView(window: string): Promise<LeagueView | null> {
  try {
    const population = await getPopulation(window);
    return {
      rows: new Map(population.rows.map((row) => [row.tokenId, row])),
      context: {
        window: population.window,
        genomeVersion: population.genomeVersion,
        total: population.rows.length,
        label: HOLDINGS_LEAGUE_LABEL,
      },
    };
  } catch (error) {
    console.warn("[animr] holders: the League is unavailable:", errorText(error));
    return null;
  }
}

/** Every agent by token id (one store read, reused for a few seconds), or an empty map when the store fails. */
async function agentsById(): Promise<Map<number, AgentRecord>> {
  const state = cache();
  if (state.agents && state.agents.expires > Date.now()) return state.agents.byId;
  try {
    const byId = new Map<number, AgentRecord>();
    for (const agent of await getStore().listAgents()) {
      const id = Number(agent.tokenId);
      if (Number.isSafeInteger(id)) byId.set(id, agent);
    }
    state.agents = { expires: Date.now() + AGENTS_TTL_MS, byId };
    return byId;
  } catch (error) {
    console.warn("[animr] holders: couldn't read the agents:", errorText(error));
    return state.agents?.byId ?? new Map();
  }
}

/** The latest rung Bell and the calls these Chogs made on it, or null when there is none (or it can't be read). */
async function bellCalls(ids: readonly number[]): Promise<{ summary: BellSummary; calls: Map<number, BellCall> } | null> {
  try {
    const summary = await latestSummary();
    if (!summary) return null;
    const calls = new Map<number, BellCall>();
    for (const id of ids) {
      const call = await readCall(summary, id);
      if (call) calls.set(id, call);
    }
    return { summary, calls };
  } catch (error) {
    console.warn("[animr] holders: couldn't read the latest Bell:", errorText(error));
    return null;
  }
}

/** Best League rank first, ties (and unranked Chogs) by token id. */
function byRank(rows: ReadonlyMap<number, PopulationRow> | undefined) {
  const rank = (id: number) => rows?.get(id)?.rank ?? Number.MAX_SAFE_INTEGER;
  return (a: number, b: number) => rank(a) - rank(b) || a - b;
}

/**
 * The Chog Genesis token ids `address` holds, best League rank first (`window` 30d | 45d | max, default 45d; by token
 * id when the League can't be built). Throws HoldingsError for a bad address, another collection, or no owner map.
 */
export async function chogsOf(address: string, window: string = DEFAULT_WINDOW): Promise<number[]> {
  const nft = collection();
  const { ids } = await heldBy(nft, holderOf(address));
  if (ids.length < 2) return [...ids];
  const league = await leagueView(window);
  return [...ids].sort(byRank(league?.rows));
}

/**
 * Everything "Your Chogs" shows for `address`: each Chog it holds with its art, both numbers, its genome, its League
 * place (default window), its call on the latest Bell and its AI. Hidden Chogs are listed and marked, without their
 * League place or Bell call. Throws HoldingsError (400, 501, 503).
 */
export async function holdingsOf(address: string): Promise<HoldingsResponse> {
  const nft = collection();
  const holder = holderOf(address);
  const { map, ids } = await heldBy(nft, holder);
  const base: HoldingsResponse = {
    address: getAddress(holder),
    chogs: [],
    league: null,
    bell: null,
    ownership: {
      at: new Date(map.at).toISOString(),
      // A map past its refresh (plus a minute of slack for a scan in flight) means Monad couldn't be read since.
      stale: Date.now() - map.at > OWNERS_FRESH_MS + 60_000,
      calls: map.calls,
      ms: map.ms,
    },
  };
  if (!ids.length) return base;

  const [league, visibility, agents, bell] = await Promise.all([
    leagueView(DEFAULT_WINDOW),
    loadVisibility(),
    agentsById(),
    bellCalls(ids),
  ]);
  const house = houseChogTokenId();
  const chogs = ids.map((tokenId): HolderChog => {
    const chog = getChog(tokenId);
    const nameNumber = Number(chog?.metadataId) || 0;
    const hidden = visibility.hidden.has(tokenId);
    const genome = chog ? chogGenome(chog) : undefined;
    const row = hidden ? undefined : league?.rows.get(tokenId);
    const call = hidden ? undefined : bell?.calls.get(tokenId);
    const agent = agents.get(tokenId);
    return {
      tokenId,
      nameNumber,
      label: chogLabel(tokenId, { metadataName: chog?.name, number: nameNumber }),
      name: chog ? chogName(chog) : `Chog #${tokenId}`,
      image: chog?.image ? resolveUri(chog.image) : "",
      ...(genome && { archetype: genome.archetype, style: genome.style }),
      hidden,
      ...(house === tokenId && { house: true as const }),
      ...(row && { league: { rank: row.rank, edgePct: row.edgePct, trades: row.trades } }),
      ...(call && {
        bell: {
          forecastPct: call.forecastPct,
          conviction: call.conviction,
          source: call.source,
          // Stored theses were scrubbed when written; scrub again so a flagged trait word can never come back.
          thesis: scrubTraitText(call.thesis),
          ...(typeof call.points === "number" && { points: call.points, hit: Boolean(call.hit) }),
        },
      }),
      ...(agent && {
        agent: {
          active: agent.active,
          mode: agent.mode,
          pnlPct: agent.pnlPct,
          decisions: agent.decisions,
          lastDecisionAt: agent.lastDecisionAt,
        },
      }),
    };
  });
  const order = byRank(league?.rows);
  chogs.sort((a, b) => Number(a.hidden) - Number(b.hidden) || (a.hidden ? a.tokenId - b.tokenId : order(a.tokenId, b.tokenId)));

  return {
    ...base,
    chogs,
    league: league?.context ?? null,
    bell: bell
      ? { day: bell.summary.day, kind: bell.summary.kind, status: bell.summary.status, actualPct: bell.summary.actualPct }
      : null,
  };
}
