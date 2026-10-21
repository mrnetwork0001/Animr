import {
  type Address,
  BaseError,
  ContractFunctionRevertedError,
  type Hex,
  erc721Abi,
  getAddress,
  isAddress,
  isAddressEqual,
  verifyMessage,
} from "viem";
import { z } from "zod";
import { publicClient } from "./clients";
import { appConfig } from "./config";
import { getKv } from "./kv";

// "Hide my Chog": a holder's opt-out from Animr's public pages. Every Chog Genesis NFT is enrolled by default (the
// League, the Daily Bell, Versus, replays and share cards put AI output on other people's NFTs), so the current owner
// of a Chog can take it out with one signed message (free: no transaction, no gas) and sign again to bring it back.
// Server-only: it reads lib/kv.ts and the chain. Client code imports its types only (`import type`).
//
// Flow (HTTP contract in app/api/optout/route.ts):
//   1. GET  /api/optout?tokenId=&action=hide|show&owner=  -> OptOutChallenge: the exact text to sign (optOutMessage),
//      dated by this server, so the signer's clock never matters.
//   2. The owner signs it (personal_sign; EOAs and ERC-1271 / ERC-6492 smart wallets).
//   3. POST /api/optout { tokenId, owner, message, signature } -> OptOutStatus. verifyOptOut checks the format, the
//      age, the signature and that `owner` holds the Chog on-chain right now; applyOptOut stores it.
//
// Storage (lib/kv.ts; every Redis key is namespaced per deployment):
//   animr:optout:hidden  zset  tokenId -> when it was hidden (ms): the list every public surface filters by
//   animr:optout:log     hash  tokenId -> OptOutLogEntry, the last request applied (older ones are refused: replays)
// No wallet address is stored: ownership is checked on-chain when a request comes in. A hide outlives a sale; the
// new holder can sign "show".
//
// Readers for the other surfaces: hiddenIds(), isHidden() and filterHidden(), cached ~10 s per server instance.
// Call them from route handlers, metadata image routes or after `await connection()`; never inside "use cache"
// (the answer would be cached with it).

export type OptOutAction = "hide" | "show";

export type OptOutFields = {
  /** Token id inside the collection's range (Chog Genesis: 1-1969). */
  tokenId: number;
  action: OptOutAction;
  /** Checksummed. */
  owner: Address;
  /** ISO timestamp, as Date#toISOString() writes it. */
  issuedAt: string;
};

/** GET /api/optout?tokenId= and POST /api/optout. */
export type OptOutStatus = {
  tokenId: number;
  hidden: boolean;
  /** ISO time it was hidden; null while it is shown. */
  since: string | null;
};

/** GET /api/optout?tokenId=&action=&owner=: the status plus the exact message to sign before `expiresAt`. */
export type OptOutChallenge = OptOutStatus & { action: OptOutAction; message: string; expiresAt: string };

/** GET /api/optout (no tokenId): every hidden Chog, lowest id first. */
export type OptOutList = { hiddenIds: number[]; count: number };

/** POST /api/optout body. */
export type OptOutRequest = { tokenId: number | string; owner: Address; message: string; signature: Hex };

/** A signed request must reach the server within this long of being issued (replay protection). */
export const OPTOUT_MAX_AGE_MS = 10 * 60_000;
/** Messages are dated by this server; this tolerates another instance's clock being slightly ahead. */
const CLOCK_SKEW_MS = 2 * 60_000;

const HIDDEN_KEY = "animr:optout:hidden";
const LOG_KEY = "animr:optout:log";
const LOCK_TTL_MS = 10_000;
const LOCK_WAIT_MS = 4_000;
/** How long one instance reuses the hidden list before reading it again. */
const CACHE_MS = 10_000;

const HEADLINES: Record<OptOutAction, string> = {
  hide: "Animr: hide my Chog. Leave it out of Animr's League, Daily Bell, Versus, replays and share cards until I sign to show it again.",
  show: "Animr: show my Chog again. It may appear in Animr's League, Daily Bell, Versus, replays and share cards.",
};

/** A request the client can fix or retry; `status` is the HTTP status to answer with. */
export class OptOutError extends Error {
  name = "OptOutError";
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

// --- Messages ------------------------------------------------------------------------------------

/** A token id from user input or JSON (7, "7", "#7"), inside the configured collection's range; else null. */
export function parseOptOutTokenId(raw: unknown): number | null {
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim().replace(/^#/, "") : "";
  if (!/^\d{1,16}$/.test(text)) return null;
  const id = Number(text);
  if (!Number.isSafeInteger(id)) return null;
  const { min, max } = appConfig.tokenIdRange;
  return BigInt(id) >= min && BigInt(id) <= max ? id : null;
}

/** The exact message a holder signs to hide (or show again) their Chog. */
export function optOutMessage(fields: OptOutFields): string {
  return [
    HEADLINES[fields.action],
    `Chog: #${fields.tokenId}`,
    `Action: ${fields.action}`,
    `Owner: ${getAddress(fields.owner)}`,
    `Issued at: ${fields.issuedAt}`,
  ].join("\n");
}

/** Inverse of optOutMessage; null unless `message` is exactly what it builds (canonical id, checksummed owner, ISO date). */
export function parseOptOutMessage(message: string): OptOutFields | null {
  const match = /\nChog: #(\d{1,16})\nAction: (hide|show)\nOwner: (0x[0-9a-fA-F]{40})\nIssued at: (\S+)$/.exec(message);
  if (!match) return null;
  const [, rawId, action, owner, issuedAt] = match;
  const tokenId = Number(rawId);
  if (!Number.isSafeInteger(tokenId) || String(tokenId) !== rawId || !isAddress(owner, { strict: false })) return null;
  const at = Date.parse(issuedAt);
  if (!Number.isFinite(at) || new Date(at).toISOString() !== issuedAt) return null;
  const fields: OptOutFields = { tokenId, action: action as OptOutAction, owner: getAddress(owner), issuedAt };
  return optOutMessage(fields) === message ? fields : null;
}

/** The message to sign for `action`, dated now by this server, and when it stops being accepted. */
export function issueOptOutMessage(
  input: { tokenId: number; action: OptOutAction; owner: Address },
  now = Date.now(),
): { message: string; issuedAt: string; expiresAt: string } {
  const issuedAt = new Date(now).toISOString();
  return {
    message: optOutMessage({ ...input, owner: getAddress(input.owner), issuedAt }),
    issuedAt,
    expiresAt: new Date(now + OPTOUT_MAX_AGE_MS).toISOString(),
  };
}

// --- Verification ----------------------------------------------------------------------------------

const requestSchema = z.object({
  tokenId: z.union([z.number(), z.string().max(80)]),
  owner: z.string().refine((value) => isAddress(value, { strict: false })),
  message: z.string().max(1_000),
  // Smart-wallet (ERC-1271 / ERC-6492) signatures are longer than 65 bytes.
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(20_000),
});

type Failure = { ok: false; status: number; error: string };

export type OptOutCheck = { ok: true; optOut: OptOutFields } | Failure;

export type OptOutVerifyOptions = {
  /** Current time in ms (tests). */
  now?: number;
  /** Reads the NFT's current owner (defaults to `ownerOf` on the configured collection). */
  ownerOf?: (tokenId: bigint) => Promise<Address>;
};

function fail(status: number, error: string): Failure {
  return { ok: false, status, error };
}

/** EOA signatures are checked locally; ERC-1271 / ERC-6492 smart wallets need the RPC. */
async function isValidSignature(address: Address, message: string, signature: Hex): Promise<boolean> {
  try {
    if (await verifyMessage({ address, message, signature })) return true;
  } catch {
    // Not a plain ECDSA signature: try the smart-wallet path.
  }
  try {
    return await publicClient.verifyMessage({ address, message, signature });
  } catch {
    return false;
  }
}

/**
 * Checks a POST /api/optout body: the message format, that it names the body's token id and owner, its age, the
 * signature, and that the signer holds the Chog on-chain right now. Whether it is newer than the last request
 * applied is applyOptOut's job.
 */
export async function verifyOptOut(body: unknown, options: OptOutVerifyOptions = {}): Promise<OptOutCheck> {
  const nft = appConfig.chogNft;
  if (!nft) return fail(503, "Hiding a Chog isn't available yet: the Chog NFT contract is not configured.");

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return fail(400, "Expected a JSON body { tokenId, owner, message, signature }.");
  const tokenId = parseOptOutTokenId(parsed.data.tokenId);
  if (tokenId === null) {
    const { min, max } = appConfig.tokenIdRange;
    return fail(400, `Token id must be a Chog token id (${min}-${max}).`);
  }
  const fields = parseOptOutMessage(parsed.data.message);
  if (!fields) return fail(400, "The signed message is not an Animr hide/show message. Ask for a fresh one.");
  if (fields.tokenId !== tokenId) return fail(400, `The signed message is for Chog #${fields.tokenId}, not #${tokenId}.`);
  const owner = getAddress(parsed.data.owner);
  if (!isAddressEqual(fields.owner, owner)) return fail(400, "The signed message names a different owner.");

  const now = options.now ?? Date.now();
  const issuedAt = Date.parse(fields.issuedAt);
  if (issuedAt > now + CLOCK_SKEW_MS) return fail(401, "The message is dated in the future. Ask for a fresh one.");
  if (now - issuedAt > OPTOUT_MAX_AGE_MS) return fail(401, "The signature has expired. Sign a fresh message.");

  if (!(await isValidSignature(owner, parsed.data.message, parsed.data.signature as Hex))) {
    return fail(401, "The signature does not match the owner address.");
  }

  const readOwner =
    options.ownerOf ??
    ((id: bigint) => publicClient.readContract({ address: nft, abi: erc721Abi, functionName: "ownerOf", args: [id] }));
  let holder: Address;
  try {
    holder = await readOwner(BigInt(tokenId));
  } catch (error) {
    if (error instanceof BaseError && error.walk((e) => e instanceof ContractFunctionRevertedError)) {
      return fail(404, `Chog #${tokenId} does not exist.`);
    }
    return fail(502, "Couldn't read the Chog's holder on-chain. Try again in a moment.");
  }
  if (!isAddressEqual(holder, owner)) return fail(403, `Only the current holder of Chog #${tokenId} can hide or show it.`);

  return { ok: true, optOut: fields };
}

// --- Storage -------------------------------------------------------------------------------------

/** The last request applied for a Chog: requests issued before it are refused. */
type OptOutLogEntry = { action: OptOutAction; issuedAt: string; at: string };

function parseLogEntry(raw: unknown): OptOutLogEntry | null {
  const entry = raw as Partial<OptOutLogEntry> | null;
  if (!entry || typeof entry !== "object" || typeof entry.issuedAt !== "string") return null;
  if (entry.action !== "hide" && entry.action !== "show") return null;
  return { action: entry.action, issuedAt: entry.issuedAt, at: typeof entry.at === "string" ? entry.at : entry.issuedAt };
}

async function withTokenLock<T>(tokenId: number, fn: () => Promise<T>): Promise<T> {
  const kv = getKv();
  const name = `optout:${tokenId}`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  let token = await kv.acquireLock(name, LOCK_TTL_MS);
  while (!token && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    token = await kv.acquireLock(name, LOCK_TTL_MS);
  }
  if (!token) throw new OptOutError("Another request for this Chog is being saved. Try again in a moment.", 409);
  try {
    return await fn();
  } finally {
    await kv.releaseLock(name, token).catch(() => {});
  }
}

const isoOrNull = (ms: number | null | undefined) => (typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null);

/**
 * Applies a verified request (idempotent): "hide" adds the Chog to the hidden list (keeping its first hide time),
 * "show" removes it. A request issued before the last one applied is refused (409), so an old signature can't undo
 * a newer choice; sending the same message again just answers the current state.
 */
export async function applyOptOut(fields: OptOutFields, now = Date.now()): Promise<OptOutStatus> {
  return withTokenLock(fields.tokenId, async () => {
    const kv = getKv();
    const member = String(fields.tokenId);
    const last = parseLogEntry(await kv.hget<unknown>(LOG_KEY, member));
    if (last) {
      const issued = Date.parse(fields.issuedAt);
      const lastIssued = Date.parse(last.issuedAt);
      if (issued < lastIssued || (issued === lastIssued && last.action !== fields.action)) {
        throw new OptOutError(
          `A newer request for Chog #${fields.tokenId} was already saved (it is ${last.action === "hide" ? "hidden" : "shown"}). Sign a fresh message to change it.`,
          409,
        );
      }
    }

    let since: number | null = null;
    if (fields.action === "hide") {
      since = (await kv.zscore(HIDDEN_KEY, member)) ?? now;
      await kv.zadd(HIDDEN_KEY, { member, score: since });
    } else {
      await kv.zrem(HIDDEN_KEY, member);
    }
    // Written last: if the list update above failed, the same message can simply be sent again.
    await kv.hset(LOG_KEY, {
      [member]: { action: fields.action, issuedAt: fields.issuedAt, at: new Date(now).toISOString() } satisfies OptOutLogEntry,
    });
    remember(fields.tokenId, since);
    return { tokenId: fields.tokenId, hidden: since !== null, since: isoOrNull(since) };
  });
}

/** One Chog's current state, read fresh (no cache). */
export async function readOptOut(tokenId: number): Promise<OptOutStatus> {
  const since = await getKv().zscore(HIDDEN_KEY, String(tokenId));
  return { tokenId, hidden: since !== null, since: isoOrNull(since) };
}

// --- Readers for the public surfaces ---------------------------------------------------------------

type HiddenCache = { ids: ReadonlySet<number>; since: ReadonlyMap<number, number>; expires: number };

// One copy per server instance, shared by every route bundle (and kept across dev hot reloads).
const globalForOptOut = globalThis as typeof globalThis & { __animrOptOut?: HiddenCache };

function cacheOf(since: Map<number, number>): HiddenCache {
  return { ids: new Set(since.keys()), since, expires: Date.now() + CACHE_MS };
}

/** Keeps this instance's copy in step with a write it just made (other instances catch up within CACHE_MS). */
function remember(tokenId: number, since: number | null) {
  const current = globalForOptOut.__animrOptOut;
  if (!current) return;
  const next = new Map(current.since);
  if (since === null) next.delete(tokenId);
  else next.set(tokenId, since);
  globalForOptOut.__animrOptOut = { ...cacheOf(next), expires: current.expires };
}

async function hiddenCache(): Promise<HiddenCache> {
  const cached = globalForOptOut.__animrOptOut;
  if (cached && cached.expires > Date.now()) return cached;
  try {
    const since = new Map<number, number>();
    for (const { member, score } of await getKv().zrange(HIDDEN_KEY, 0, -1)) {
      const id = Number(member);
      if (Number.isSafeInteger(id)) since.set(id, score);
    }
    return (globalForOptOut.__animrOptOut = cacheOf(since));
  } catch (error) {
    console.error("[animr] opt-out: couldn't read the hidden Chogs:", error);
    // Rather the last known list than every Chog shown again; retry on the next call.
    return cached ?? { ids: new Set(), since: new Map(), expires: 0 };
  }
}

/** Token ids whose holders hid them. Load it once per request, then test ids with `.has(id)`. */
export async function hiddenIds(): Promise<ReadonlySet<number>> {
  return (await hiddenCache()).ids;
}

/** True when the Chog's holder hid it. */
export async function isHidden(tokenId: number | string | bigint): Promise<boolean> {
  const id = typeof tokenId === "number" ? tokenId : Number(String(tokenId).trim().replace(/^#/, ""));
  return Number.isSafeInteger(id) && (await hiddenIds()).has(id);
}

/** `items` without the Chogs their holders hid, order kept. */
export async function filterHidden<T>(items: readonly T[], idOf: (item: T) => number | string): Promise<T[]> {
  const hidden = await hiddenIds();
  if (!hidden.size) return [...items];
  return items.filter((item) => !hidden.has(Number(idOf(item))));
}

/** Every hidden Chog, lowest id first (fresh read; throws when the store can't be read). */
export async function listHidden(): Promise<OptOutList> {
  const ids = (await getKv().zrange(HIDDEN_KEY, 0, -1))
    .map((entry) => Number(entry.member))
    .filter(Number.isSafeInteger)
    .sort((a, b) => a - b);
  return { hiddenIds: ids, count: ids.length };
}

/** For /stats: how many Chogs are hidden and when the earliest of them was (fresh read; throws on store errors). */
export async function optOutSummary(): Promise<{ hidden: number; since: string | null }> {
  const entries = await getKv().zrange(HIDDEN_KEY, 0, -1);
  const first = entries.length ? Math.min(...entries.map((entry) => entry.score)) : null;
  return { hidden: entries.length, since: isoOrNull(first) };
}
