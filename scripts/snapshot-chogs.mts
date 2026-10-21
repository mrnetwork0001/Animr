/**
 * Snapshots all 1,969 Chog Genesis tokens into data/chogs.json (ChogsFile, lib/dna/types.ts).
 * Run from the repo root:
 *
 *   node scripts/snapshot-chogs.mts [--cache <dir>] [--out data/chogs.json] [--concurrency 3]
 *                                   [--ids 1-1969] [--trait-counts <file.json>]
 *
 * 1. tokenURI of every id through Multicall3 (200 ids per eth_call, ~2 calls/s; failures retried).
 * 2. Metadata JSON, cached per file under --cache so a rerun resumes. Filebase throttles per-file
 *    reads to ~1/s, so when many files are missing the whole directory is streamed first as one TAR;
 *    the rest go file by file (low concurrency, exponential backoff on 429/5xx, then Pinata and
 *    4everland).
 * 3. data/chogs.json sorted by id: raw ipfs:// image URIs, traits as trait_type -> value.
 *
 * Self-contained (viem + node builtins) so it runs with plain node or the jiti runner.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { type Address, createPublicClient, erc721Abi, http } from "viem";
import { monad } from "viem/chains";
import type { ChogSnapshot, ChogsFile } from "@/lib/dna/types";

const COLLECTION: Address = "0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763";
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || monad.rpcUrls.default.http[0];
const URI_BATCH = 200;
const META_PASSES = 6;
/** Minimum gap between two Filebase request starts, shared by all workers (~8 req/s). */
const FILEBASE_INTERVAL_MS = 120;
/** With this many files missing, first try streaming the whole metadata directory as one TAR. */
const TAR_MIN_MISSING = 100;

/** Gateways in order of preference; ipfs.io and dweb.link answer 429 to everything. */
const GATEWAYS: { name: string; url: (cidPath: string) => string; timeoutMs: number }[] = [
  { name: "filebase", url: (p) => `https://ipfs.filebase.io/ipfs/${p}`, timeoutMs: 15_000 },
  { name: "pinata", url: (p) => `https://gateway.pinata.cloud/ipfs/${p}`, timeoutMs: 30_000 },
  {
    name: "4everland",
    url: (p) => `https://${p.slice(0, p.indexOf("/"))}.ipfs.4everland.io${p.slice(p.indexOf("/"))}`,
    timeoutMs: 30_000,
  },
];

const { values: args } = parseArgs({
  allowPositionals: true, // the jiti runner passes the script path through
  options: {
    cache: { type: "string", default: ".data/chog-snapshot-cache" },
    out: { type: "string", default: "data/chogs.json" },
    concurrency: { type: "string", default: "3" },
    ids: { type: "string", default: "1-1969" },
    "trait-counts": { type: "string" },
  },
});

if (args.ids !== "1-1969" && args.out === "data/chogs.json") throw new Error("--ids writes a partial snapshot: pass --out too");
const [firstId, lastId = firstId] = args.ids.split("-").map(Number);
const ids = Array.from({ length: lastId - firstId + 1 }, (_, i) => firstId + i);
const concurrency = Math.max(1, Number(args.concurrency));
const uriCacheFile = path.join(args.cache, "token-uris.json");
const metaDir = path.join(args.cache, "meta");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (ms: number) => ms * (0.75 + Math.random() / 2);

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}

async function writeAtomic(file: string, text: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, text);
  await fs.rename(tmp, file);
}

// --- 1. tokenURI for every id ---

async function readTokenUris(): Promise<Record<string, string>> {
  const uris = (await readJson<Record<string, string>>(uriCacheFile)) ?? {};
  const client = createPublicClient({
    chain: monad,
    transport: http(RPC_URL, { retryCount: 4, retryDelay: 1_000 }),
  });
  for (let round = 1; round <= 8; round++) {
    const todo = ids.filter((id) => !uris[id]);
    if (!todo.length) break;
    console.log(`tokenURI round ${round}: ${todo.length} ids`);
    for (let i = 0; i < todo.length; i += URI_BATCH) {
      const batch = todo.slice(i, i + URI_BATCH);
      const results = await client.multicall({
        allowFailure: true,
        batchSize: 0, // one eth_call per batch keeps us far below the RPC rate limit
        contracts: batch.map((id) => ({
          address: COLLECTION,
          abi: erc721Abi,
          functionName: "tokenURI" as const,
          args: [BigInt(id)] as const,
        })),
      });
      results.forEach((r, j) => {
        if (r.status === "success" && r.result) uris[batch[j]] = r.result;
      });
      const failed = results.filter((r) => r.status !== "success");
      if (failed.length) console.warn(`  ${failed.length} failed: ${String(failed[0].error).split("\n")[0]}`);
      await writeAtomic(uriCacheFile, JSON.stringify(uris));
      await sleep(500 * round);
    }
  }
  return uris;
}

/** "ipfs://<cid>/1462.json" -> { cidPath: "<cid>/1462.json", metadataId: "1462" }. */
function parseUri(uri: string) {
  const cidPath = uri.replace(/^ipfs:\/\/(ipfs\/)?/, "");
  const file = cidPath.slice(cidPath.lastIndexOf("/") + 1);
  return { cidPath, metadataId: file.replace(/\.json$/, ""), cacheFile: path.join(metaDir, cidPath.replace(/\//g, "_")) };
}

// --- 2. metadata JSON, cached per file ---

type RawMetadata = { name?: unknown; image?: unknown; attributes?: unknown };

function isMetadata(raw: unknown): raw is RawMetadata {
  return typeof raw === "object" && raw !== null && Array.isArray((raw as RawMetadata).attributes);
}

// Filebase throttles bursts: request starts are spaced out, and a 429 pauses every worker.
let filebaseNextSlot = 0;
let filebasePausedUntil = 0;

async function filebaseSlot() {
  const now = Date.now();
  const slot = Math.max(now, filebaseNextSlot, filebasePausedUntil);
  filebaseNextSlot = slot + FILEBASE_INTERVAL_MS;
  if (slot > now) await sleep(slot - now);
}

async function fetchMetadata(cidPath: string): Promise<RawMetadata | null> {
  // Filebase 5 times with exponential backoff, then Pinata and 4everland twice each.
  const plan = [0, 0, 0, 0, 0, 1, 2, 1, 2];
  for (let attempt = 0; attempt < plan.length; attempt++) {
    const gateway = GATEWAYS[plan[attempt]];
    if (gateway.name === "filebase") await filebaseSlot();
    let retryAfterMs = 0;
    try {
      const res = await fetch(gateway.url(cidPath), { signal: AbortSignal.timeout(gateway.timeoutMs) });
      if (res.ok) {
        const raw: unknown = await res.json();
        if (isMetadata(raw)) return raw;
        throw new Error("not metadata JSON");
      }
      retryAfterMs = Number(res.headers.get("retry-after")) * 1_000 || 0;
      if (res.status === 429 && gateway.name === "filebase") {
        filebasePausedUntil = Math.max(filebasePausedUntil, Date.now() + Math.max(retryAfterMs, 2_000));
      }
    } catch {
      // timeout, reset or bad JSON: retry below
    }
    await sleep(Math.max(retryAfterMs, jitter(Math.min(500 * 2 ** attempt, 20_000))));
  }
  return null;
}

/**
 * Fast path: one request streams a whole directory as a TAR (`?format=tar`, IPFS gateway spec)
 * instead of ~2,000 throttled file requests. Calls onFile("<cid>/<file>", text) per regular file.
 */
async function streamDirectoryTar(cid: string, onFile: (cidPath: string, text: string) => Promise<void>) {
  const controller = new AbortController();
  let stall: ReturnType<typeof setTimeout> | undefined;
  const kick = () => {
    clearTimeout(stall);
    stall = setTimeout(() => controller.abort(), 120_000); // give up after 2 minutes without data
  };
  const decoder = new TextDecoder();
  const field = (block: Uint8Array, start: number, length: number) =>
    decoder.decode(block.subarray(start, start + length)).replace(/\0[\s\S]*$/, "");
  kick();
  try {
    const res = await fetch(GATEWAYS[0].url(`${cid}?format=tar`), { signal: controller.signal });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    let buf = new Uint8Array(0);
    let longName: string | undefined; // pax or GNU long name for the next entry
    for (;;) {
      const { done, value } = await reader.read();
      kick();
      if (value) {
        const joined = new Uint8Array(buf.length + value.length);
        joined.set(buf);
        joined.set(value, buf.length);
        buf = joined;
      }
      while (buf.length >= 512) {
        const header = buf.subarray(0, 512);
        const size = parseInt(field(header, 124, 12).trim() || "0", 8);
        const end = 512 + Math.ceil(size / 512) * 512;
        if (buf.length < end) break;
        const type = field(header, 156, 1) || "0";
        const data = decoder.decode(buf.subarray(512, 512 + size));
        const prefix = field(header, 257, 6) === "ustar" ? field(header, 345, 155) : "";
        const name = longName ?? (prefix ? `${prefix}/` : "") + field(header, 0, 100);
        longName = undefined;
        if (type === "x") longName = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(data)?.[1];
        else if (type === "L") longName = data.replace(/\0[\s\S]*$/, "");
        else if (type === "0" && size > 0) await onFile(name, data);
        buf = buf.subarray(end);
      }
      if (done) break;
    }
  } finally {
    clearTimeout(stall);
  }
}

async function loadMetadata(uris: Record<string, string>): Promise<Map<string, RawMetadata>> {
  const meta = new Map<string, RawMetadata>();
  const files = [...new Set(ids.map((id) => uris[id]).filter(Boolean))].map(parseUri);
  for (const file of files) {
    const cached = await readJson<unknown>(file.cacheFile);
    if (isMetadata(cached)) meta.set(file.cidPath, cached);
  }
  console.log(`metadata: ${meta.size}/${files.length} cached`);

  const missing = new Map(files.filter((f) => !meta.has(f.cidPath)).map((f) => [f.cidPath, f]));
  if (missing.size >= TAR_MIN_MISSING) {
    for (const dir of new Set([...missing.keys()].filter((p) => p.includes("/")).map((p) => p.split("/")[0]))) {
      console.log(`metadata: streaming ${dir} as one TAR`);
      await streamDirectoryTar(dir, async (cidPath, text) => {
        const file = missing.get(cidPath);
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          return;
        }
        if (!file || !isMetadata(raw)) return;
        meta.set(cidPath, raw);
        await writeAtomic(file.cacheFile, JSON.stringify(raw));
        if (meta.size % 250 === 0) console.log(`  ${meta.size}/${files.length}`);
      }).catch((error: Error) => console.warn(`  TAR stopped: ${error.message}`));
    }
    console.log(`metadata: ${meta.size}/${files.length} after TAR`);
  }

  for (let pass = 1; pass <= META_PASSES; pass++) {
    const todo = files.filter((f) => !meta.has(f.cidPath));
    if (!todo.length) break;
    const workers = pass === 1 ? concurrency : Math.max(1, Math.ceil(concurrency / 2));
    console.log(`metadata pass ${pass}: ${todo.length} files, ${workers} workers`);
    let next = 0;
    let done = 0;
    const started = Date.now();
    await Promise.all(
      Array.from({ length: workers }, async () => {
        while (next < todo.length) {
          const file = todo[next++];
          const raw = await fetchMetadata(file.cidPath);
          if (raw) {
            meta.set(file.cidPath, raw);
            await writeAtomic(file.cacheFile, JSON.stringify(raw));
          }
          if (++done % 100 === 0) {
            const rate = done / ((Date.now() - started) / 1_000);
            console.log(`  ${done}/${todo.length} (${rate.toFixed(1)}/s), ${meta.size} total`);
          }
        }
      }),
    );
    if (pass < META_PASSES && files.some((f) => !meta.has(f.cidPath))) await sleep(15_000 * pass);
  }
  return meta;
}

// --- 3. data/chogs.json ---

function toSnapshot(id: number, uri: string | undefined, raw: RawMetadata | undefined, imageBase?: string): ChogSnapshot {
  const metadataId = uri ? parseUri(uri).metadataId : "";
  const traits: Record<string, string> = {};
  for (const attr of (raw?.attributes as { trait_type?: unknown; value?: unknown }[] | undefined) ?? []) {
    if (attr?.trait_type === undefined || attr?.value === undefined || attr.value === null) continue;
    const type = String(attr.trait_type);
    if (traits[type] !== undefined) console.warn(`  #${id}: duplicate ${type} (${traits[type]}, ${attr.value})`);
    traits[type] ??= String(attr.value);
  }
  return {
    id,
    metadataId,
    name: typeof raw?.name === "string" ? raw.name : metadataId ? `CHOG #${metadataId}` : `Chog #${id}`,
    image: typeof raw?.image === "string" ? raw.image : imageBase && metadataId ? `${imageBase}${metadataId}.webp` : "",
    traits,
  };
}

function countTraits(chogs: ChogSnapshot[]) {
  const counts: Record<string, Record<string, number>> = {};
  for (const chog of chogs) {
    for (const [type, value] of Object.entries(chog.traits)) {
      counts[type] ??= {};
      counts[type][value] = (counts[type][value] ?? 0) + 1;
    }
  }
  return Object.fromEntries(
    Object.keys(counts)
      .sort()
      .map((type) => [type, Object.fromEntries(Object.entries(counts[type]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))]),
  );
}

const uris = await readTokenUris();
const meta = await loadMetadata(uris);

// Only used for a token whose metadata stayed unreadable: images are "<image dir>/<metadataId>.webp".
const sample = [...meta.values()].find((m) => typeof m.image === "string" && /\/\d+\.webp$/.test(m.image));
const imageBase = sample ? String(sample.image).replace(/\d+\.webp$/, "") : undefined;

const chogs = ids.map((id) => {
  const uri = uris[id];
  return toSnapshot(id, uri, uri ? meta.get(parseUri(uri).cidPath) : undefined, imageBase);
});

const header = {
  version: 1,
  collection: COLLECTION,
  chainId: monad.id,
  generatedAt: new Date().toISOString(),
} satisfies Omit<ChogsFile, "chogs">;
// One Chog per line: compact, yet diffs stay readable.
const text = `${JSON.stringify(header, null, 2).slice(0, -2)},\n  "chogs": [\n${chogs.map((c) => `    ${JSON.stringify(c)}`).join(",\n")}\n  ]\n}\n`;
// Never replace a more complete snapshot (say, gateways were down): write next to it instead.
const withTraits = (list: ChogSnapshot[] = []) => list.filter((c) => Object.keys(c.traits).length).length;
const previous = await readJson<ChogsFile>(args.out);
const out = withTraits(chogs) < withTraits(previous?.chogs) ? `${args.out}.new` : args.out;
await writeAtomic(out, text);

const missingUri = ids.filter((id) => !uris[id]);
const missingMeta = chogs.filter((c) => !Object.keys(c.traits).length).map((c) => c.id);
const byTraitCount: Record<number, number> = {};
for (const c of chogs) byTraitCount[Object.keys(c.traits).length] = (byTraitCount[Object.keys(c.traits).length] ?? 0) + 1;
console.log(`\nwrote ${out}: ${chogs.length} chogs, ${chogs.length - missingMeta.length} with traits`);
if (out !== args.out) console.warn(`kept ${args.out}: it has more chogs with traits (${withTraits(previous?.chogs)})`);
console.log(`trait types per chog: ${JSON.stringify(byTraitCount)}`);
if (missingUri.length) console.warn(`missing tokenURI: ${missingUri.join(", ")}`);
if (missingMeta.length) console.warn(`missing metadata: ${missingMeta.join(", ")}`);
const metadataIds = new Set(chogs.map((c) => c.metadataId).filter(Boolean));
if (metadataIds.size !== chogs.length - missingUri.length) console.warn(`metadata ids are not unique: ${metadataIds.size}`);

const counts = countTraits(chogs);
for (const [type, values] of Object.entries(counts)) {
  const entries = Object.entries(values);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  console.log(`\n${type}: ${entries.length} values, ${total} chogs`);
  console.log(`  ${entries.map(([value, n]) => `${value} ${n}`).join(" | ")}`);
}
if (args["trait-counts"]) await writeAtomic(args["trait-counts"], `${JSON.stringify(counts, null, 1)}\n`);
process.exitCode = missingUri.length || missingMeta.length ? 1 : 0;
