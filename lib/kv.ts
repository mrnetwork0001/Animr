import { promises as fs } from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";

// A tiny key-value store (JSON values, hashes, sorted sets, counters, locks) for the Daily Bell and
// anything else that needs one. Same backend choice as lib/agent/store.ts: Upstash Redis when
// UPSTASH_REDIS_REST_URL/TOKEN (or Vercel KV's KV_REST_API_URL/TOKEN) are set, else one JSON file per
// key under ANIMR_DATA_DIR/kv (default .data/kv) for local dev. Keys are global: prefix them ("animr:...").
// One Redis database can serve several deployments (production, previews, a laptop's `next dev` with
// the production credentials in .env.local), so every Redis key is namespaced by the environment:
// "animr:bell:index" is stored as "animr:production:bell:index" (see redisKey).

export type ZEntry = { member: string; score: number };

export interface Kv {
  readonly kind: "redis" | "file";
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlMs?: number): Promise<void>;
  /** Sets the key only when it is absent; true when this call set it. */
  setNx(key: string, value: unknown, ttlMs?: number): Promise<boolean>;
  del(...keys: string[]): Promise<void>;
  /** Increments a counter; the first increment starts its `ttlMs` expiry (fixed-window rate limits). */
  incr(key: string, ttlMs: number): Promise<number>;
  hget<T>(key: string, field: string): Promise<T | null>;
  /** Values in the order of `fields` (null when missing). */
  hmget<T>(key: string, fields: string[]): Promise<(T | null)[]>;
  hgetall<T>(key: string): Promise<Record<string, T>>;
  hset(key: string, entries: Record<string, unknown>): Promise<void>;
  /** Sets the field only when it is absent; true when this call set it. */
  hsetnx(key: string, field: string, value: unknown): Promise<boolean>;
  hdel(key: string, ...fields: string[]): Promise<void>;
  hlen(key: string): Promise<number>;
  zadd(key: string, ...entries: ZEntry[]): Promise<void>;
  zrem(key: string, ...members: string[]): Promise<void>;
  zscore(key: string, member: string): Promise<number | null>;
  /** Entries by rank, `stop` inclusive (negative = from the end); `rev` puts the highest score first. */
  zrange(key: string, start: number, stop: number, options?: { rev?: boolean }): Promise<ZEntry[]>;
  /** 0-based rank counted from the highest score, or null. */
  zrevrank(key: string, member: string): Promise<number | null>;
  zcard(key: string): Promise<number>;
  /** Takes `name` for `ttlMs` unless it is already held; returns the token for releaseLock, or null. */
  acquireLock(name: string, ttlMs: number): Promise<string | null>;
  releaseLock(name: string, token: string): Promise<void>;
}

/**
 * The deployment's namespace in a shared Redis: ANIMR_ENV, else Vercel's VERCEL_ENV ("production",
 * "preview", "development"), else "dev" (a laptop). Set ANIMR_ENV=production on hosts other than Vercel.
 */
export const KV_NAMESPACE = (process.env.ANIMR_ENV || process.env.VERCEL_ENV || "dev").toLowerCase().replace(/[^a-z0-9-]/g, "") || "dev";

/** A key as stored in Redis: "animr:x" -> "animr:<namespace>:x" (the file backend is per directory and keeps keys as is). */
export function redisKey(key: string): string {
  return `animr:${KV_NAMESPACE}:${key.startsWith("animr:") ? key.slice("animr:".length) : key}`;
}

/** Large hashes and sorted sets are written in chunks (Upstash caps the size of one request). */
const WRITE_CHUNK = 400;

function chunks<T>(items: T[], size = WRITE_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const lockKey = (name: string) => `animr:lock:${name}`;
const RELEASE_LOCK_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

// --- Upstash Redis (production) ---
// The client JSON-encodes values and parses them back, so numeric-looking members/fields come back as
// numbers: every member is turned back into a string here.

class RedisKv implements Kv {
  readonly kind = "redis";
  constructor(private readonly redis: Redis) {}

  get<T>(key: string) {
    return this.redis.get<T>(redisKey(key));
  }

  async set(key: string, value: unknown, ttlMs?: number) {
    await (ttlMs ? this.redis.set(redisKey(key), value, { px: ttlMs }) : this.redis.set(redisKey(key), value));
  }

  async setNx(key: string, value: unknown, ttlMs?: number) {
    const result = await (ttlMs
      ? this.redis.set(redisKey(key), value, { nx: true, px: ttlMs })
      : this.redis.set(redisKey(key), value, { nx: true }));
    return result === "OK";
  }

  async del(...keys: string[]) {
    if (keys.length) await this.redis.del(...keys.map(redisKey));
  }

  async incr(key: string, ttlMs: number) {
    const count = await this.redis.incr(redisKey(key));
    if (count === 1) await this.redis.pexpire(redisKey(key), ttlMs);
    return count;
  }

  hget<T>(key: string, field: string) {
    return this.redis.hget<T>(redisKey(key), field);
  }

  async hmget<T>(key: string, fields: string[]) {
    if (!fields.length) return [];
    const values: Record<string, T | null> = {};
    for (const part of chunks(fields)) Object.assign(values, await this.redis.hmget<Record<string, T | null>>(redisKey(key), ...part));
    return fields.map((field) => values[field] ?? null);
  }

  async hgetall<T>(key: string) {
    return (await this.redis.hgetall<Record<string, T>>(redisKey(key))) ?? {};
  }

  async hset(key: string, entries: Record<string, unknown>) {
    for (const part of chunks(Object.entries(entries))) await this.redis.hset(redisKey(key), Object.fromEntries(part));
  }

  async hsetnx(key: string, field: string, value: unknown) {
    return (await this.redis.hsetnx(redisKey(key), field, value)) === 1;
  }

  async hdel(key: string, ...fields: string[]) {
    if (fields.length) await this.redis.hdel(redisKey(key), ...fields);
  }

  hlen(key: string) {
    return this.redis.hlen(redisKey(key));
  }

  async zadd(key: string, ...entries: ZEntry[]) {
    for (const [first, ...rest] of chunks(entries)) await this.redis.zadd(redisKey(key), first, ...rest);
  }

  async zrem(key: string, ...members: string[]) {
    if (members.length) await this.redis.zrem(redisKey(key), ...members);
  }

  async zscore(key: string, member: string) {
    const score = await this.redis.zscore(redisKey(key), member);
    return score === null || score === undefined ? null : Number(score);
  }

  async zrange(key: string, start: number, stop: number, options: { rev?: boolean } = {}) {
    const flat = await this.redis.zrange<(string | number)[]>(
      redisKey(key),
      start,
      stop,
      options.rev ? { withScores: true, rev: true } : { withScores: true },
    );
    const entries: ZEntry[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) entries.push({ member: String(flat[i]), score: Number(flat[i + 1]) });
    return entries;
  }

  zrevrank(key: string, member: string) {
    return this.redis.zrevrank(redisKey(key), member);
  }

  zcard(key: string) {
    return this.redis.zcard(redisKey(key));
  }

  async acquireLock(name: string, ttlMs: number) {
    const token = crypto.randomUUID();
    return (await this.redis.set(redisKey(lockKey(name)), token, { nx: true, px: ttlMs })) === "OK" ? token : null;
  }

  async releaseLock(name: string, token: string) {
    await this.redis.eval(RELEASE_LOCK_SCRIPT, [redisKey(lockKey(name))], [token]);
  }
}

// --- JSON files (local dev fallback): one file per key, atomic writes, mutations queued per process.
// Counters and locks stay in memory, like the agent store's file backend.

type Entry =
  | { type: "string"; value: unknown; expires?: number }
  | { type: "hash"; value: Record<string, unknown> }
  | { type: "zset"; value: Record<string, number> };

function byScore(a: ZEntry, b: ZEntry): number {
  return a.score - b.score || (a.member < b.member ? -1 : a.member > b.member ? 1 : 0);
}

class FileKv implements Kv {
  readonly kind = "file";
  private queue: Promise<unknown> = Promise.resolve();
  private readonly memory = new Map<string, { value: string | number; expires: number }>();
  constructor(private readonly dir: string) {}

  private file(key: string) {
    return path.join(/* turbopackIgnore: true */ this.dir, `${encodeURIComponent(key)}.json`);
  }

  private async read(key: string): Promise<Entry | null> {
    let text: string;
    try {
      text = await fs.readFile(/* turbopackIgnore: true */ this.file(key), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    const entry = JSON.parse(text) as Entry;
    if (entry.type === "string" && entry.expires !== undefined && entry.expires <= Date.now()) return null;
    return entry;
  }

  private async write(key: string, entry: Entry | null) {
    const file = this.file(key);
    if (!entry) return fs.rm(/* turbopackIgnore: true */ file, { force: true });
    await fs.mkdir(/* turbopackIgnore: true */ this.dir, { recursive: true });
    const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(/* turbopackIgnore: true */ tmp, JSON.stringify(entry));
    await fs.rename(/* turbopackIgnore: true */ tmp, file);
  }

  /** One read-modify-write at a time; `change` returns the new entry (null deletes, undefined keeps). */
  private mutate<R>(key: string, change: (entry: Entry | null) => [Entry | null | undefined, R]): Promise<R> {
    const run = this.queue.then(async () => {
      const [next, result] = change(await this.read(key));
      if (next !== undefined) await this.write(key, next);
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }

  private hash(entry: Entry | null, key: string): Record<string, unknown> {
    if (!entry) return {};
    if (entry.type !== "hash") throw new Error(`WRONGTYPE ${key} is not a hash`);
    return entry.value;
  }

  private zset(entry: Entry | null, key: string): Record<string, number> {
    if (!entry) return {};
    if (entry.type !== "zset") throw new Error(`WRONGTYPE ${key} is not a sorted set`);
    return entry.value;
  }

  private async sorted(key: string, rev = false): Promise<ZEntry[]> {
    const entries = Object.entries(this.zset(await this.read(key), key)).map(([member, score]) => ({ member, score }));
    entries.sort(byScore);
    return rev ? entries.reverse() : entries;
  }

  async get<T>(key: string) {
    const entry = await this.read(key);
    if (entry && entry.type !== "string") throw new Error(`WRONGTYPE ${key} is not a string`);
    return entry ? (entry.value as T) : null;
  }

  async set(key: string, value: unknown, ttlMs?: number) {
    await this.mutate(key, () => [
      { type: "string", value, ...(ttlMs ? { expires: Date.now() + ttlMs } : {}) },
      undefined,
    ]);
  }

  setNx(key: string, value: unknown, ttlMs?: number) {
    return this.mutate(key, (entry) =>
      entry
        ? [undefined, false]
        : [{ type: "string", value, ...(ttlMs ? { expires: Date.now() + ttlMs } : {}) }, true],
    );
  }

  async del(...keys: string[]) {
    for (const key of keys) await this.mutate(key, () => [null, undefined]);
  }

  async incr(key: string, ttlMs: number) {
    const now = Date.now();
    const held = this.memory.get(key);
    const live = held && held.expires > now ? held : { value: 0, expires: now + ttlMs };
    const count = Number(live.value) + 1;
    this.memory.set(key, { value: count, expires: live.expires });
    return count;
  }

  async hget<T>(key: string, field: string) {
    return (this.hash(await this.read(key), key)[field] as T | undefined) ?? null;
  }

  async hmget<T>(key: string, fields: string[]) {
    const hash = this.hash(await this.read(key), key);
    return fields.map((field) => (hash[field] as T | undefined) ?? null);
  }

  async hgetall<T>(key: string) {
    return this.hash(await this.read(key), key) as Record<string, T>;
  }

  async hset(key: string, entries: Record<string, unknown>) {
    if (!Object.keys(entries).length) return;
    await this.mutate(key, (entry) => [
      { type: "hash", value: { ...this.hash(entry, key), ...JSON.parse(JSON.stringify(entries)) } },
      undefined,
    ]);
  }

  hsetnx(key: string, field: string, value: unknown) {
    return this.mutate(key, (entry): [Entry | undefined, boolean] => {
      const hash = this.hash(entry, key);
      if (field in hash) return [undefined, false];
      return [{ type: "hash", value: { ...hash, [field]: JSON.parse(JSON.stringify(value)) } }, true];
    });
  }

  async hdel(key: string, ...fields: string[]) {
    await this.mutate(key, (entry) => {
      const hash = { ...this.hash(entry, key) };
      for (const field of fields) delete hash[field];
      return [Object.keys(hash).length ? { type: "hash", value: hash } : null, undefined];
    });
  }

  async hlen(key: string) {
    return Object.keys(this.hash(await this.read(key), key)).length;
  }

  async zadd(key: string, ...entries: ZEntry[]) {
    if (!entries.length) return;
    await this.mutate(key, (entry) => {
      const set = { ...this.zset(entry, key) };
      for (const { member, score } of entries) set[member] = score;
      return [{ type: "zset", value: set }, undefined];
    });
  }

  async zrem(key: string, ...members: string[]) {
    await this.mutate(key, (entry) => {
      const set = { ...this.zset(entry, key) };
      for (const member of members) delete set[member];
      return [Object.keys(set).length ? { type: "zset", value: set } : null, undefined];
    });
  }

  async zscore(key: string, member: string) {
    return this.zset(await this.read(key), key)[member] ?? null;
  }

  async zrange(key: string, start: number, stop: number, options: { rev?: boolean } = {}) {
    const entries = await this.sorted(key, options.rev);
    const from = start < 0 ? Math.max(0, entries.length + start) : start;
    const to = stop < 0 ? entries.length + stop : Math.min(stop, entries.length - 1);
    return from > to ? [] : entries.slice(from, to + 1);
  }

  async zrevrank(key: string, member: string) {
    const rank = (await this.sorted(key, true)).findIndex((entry) => entry.member === member);
    return rank < 0 ? null : rank;
  }

  async zcard(key: string) {
    return Object.keys(this.zset(await this.read(key), key)).length;
  }

  async acquireLock(name: string, ttlMs: number) {
    const now = Date.now();
    const held = this.memory.get(lockKey(name));
    if (held && held.expires > now) return null;
    const token = crypto.randomUUID();
    this.memory.set(lockKey(name), { value: token, expires: now + ttlMs });
    return token;
  }

  async releaseLock(name: string, token: string) {
    if (this.memory.get(lockKey(name))?.value === token) this.memory.delete(lockKey(name));
  }
}

function createKv(): Kv {
  const [url, token] =
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
      ? [process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN]
      : [process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN];
  if (url && token) return new RedisKv(new Redis({ url, token }));

  // Vercel's filesystem is read-only outside /tmp, which is per-instance: production needs Redis.
  const dir =
    process.env.ANIMR_DATA_DIR ||
    (process.env.VERCEL ? "/tmp/animr" : path.join(/* turbopackIgnore: true */ process.cwd(), ".data"));
  return new FileKv(path.join(/* turbopackIgnore: true */ dir, "kv"));
}

// One instance per process, shared by every route bundle (the file backend's queue and locks).
const globalForKv = globalThis as typeof globalThis & { __animrKv?: Kv };

export function getKv(): Kv {
  return (globalForKv.__animrKv ??= createKv());
}
