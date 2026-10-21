import { promises as fs } from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import { maxUint256 } from "viem";
import { redisKey } from "../kv";
import { migrateAgent } from "./paper";
import type { AgentRecord, Decision } from "./types";

/** Decision history kept per agent (oldest entries are dropped). */
export const MAX_DECISIONS_PER_AGENT = 200;

/** Reads pass every AgentRecord through migrateAgent (old demo-bankroll paper books read as unfunded). */
export interface AgentStore {
  readonly kind: "redis" | "file";
  getAgent(tokenId: string): Promise<AgentRecord | null>;
  saveAgent(agent: AgentRecord): Promise<void>;
  listAgents(): Promise<AgentRecord[]>;
  addDecision(decision: Decision): Promise<void>;
  /** Newest first. */
  listDecisions(tokenId: string, limit?: number): Promise<Decision[]>;
  /** Takes `key` for `ttlMs` unless it is already held; returns the token for releaseLock, or null. */
  acquireLock(key: string, ttlMs: number): Promise<string | null>;
  releaseLock(key: string, token: string): Promise<void>;
}

/** Canonical decimal token id ("007" -> "7"), or null if `raw` is not a uint256. */
export function parseTokenId(raw: string): string | null {
  if (!/^\d{1,78}$/.test(raw)) return null;
  const id = BigInt(raw);
  return id <= maxUint256 ? id.toString() : null;
}

// --- Upstash Redis (production) ---
// Keys are namespaced per deployment like lib/kv.ts's ("animr:<namespace>:agents"), so a laptop's
// `next dev` with the production credentials can't touch production agents.

const AGENTS_KEY = redisKey("animr:agents"); // hash: tokenId -> AgentRecord
const decisionsKey = (tokenId: string) => redisKey(`animr:decisions:${tokenId}`); // list, newest first
const lockKey = (key: string) => redisKey(`animr:lock:${key}`);
const RELEASE_LOCK_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

class RedisStore implements AgentStore {
  readonly kind = "redis";
  constructor(private readonly redis: Redis) {}

  async getAgent(tokenId: string) {
    const agent = await this.redis.hget<AgentRecord>(AGENTS_KEY, tokenId);
    return agent ? migrateAgent(agent) : null;
  }

  async saveAgent(agent: AgentRecord) {
    await this.redis.hset(AGENTS_KEY, { [agent.tokenId]: agent });
  }

  async listAgents() {
    return Object.values((await this.redis.hgetall<Record<string, AgentRecord>>(AGENTS_KEY)) ?? {}).map(migrateAgent);
  }

  async addDecision(decision: Decision) {
    const key = decisionsKey(decision.tokenId);
    await this.redis.pipeline().lpush(key, decision).ltrim(key, 0, MAX_DECISIONS_PER_AGENT - 1).exec();
  }

  listDecisions(tokenId: string, limit = 50) {
    return this.redis.lrange<Decision>(decisionsKey(tokenId), 0, limit - 1);
  }

  async acquireLock(key: string, ttlMs: number) {
    const token = crypto.randomUUID();
    const result = await this.redis.set(lockKey(key), token, { nx: true, px: ttlMs });
    return result === "OK" ? token : null;
  }

  async releaseLock(key: string, token: string) {
    await this.redis.eval(RELEASE_LOCK_SCRIPT, [lockKey(key)], [token]);
  }
}

// --- JSON file (local dev fallback) ---

type FileData = {
  agents: Record<string, AgentRecord>;
  /** Newest first. */
  decisions: Record<string, Decision[]>;
};

class FileStore implements AgentStore {
  readonly kind = "file";
  private queue: Promise<unknown> = Promise.resolve();
  private readonly locks = new Map<string, { token: string; expires: number }>();
  constructor(private readonly file: string) {}

  private async read(): Promise<FileData> {
    let text: string;
    try {
      text = await fs.readFile(/* turbopackIgnore: true */ this.file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { agents: {}, decisions: {} };
      throw error;
    }
    const data = JSON.parse(text) as Partial<FileData>;
    return { agents: data.agents ?? {}, decisions: data.decisions ?? {} };
  }

  /** Read-modify-write cycles run one at a time; each write is atomic (temp file + rename). */
  private mutate(change: (data: FileData) => void): Promise<void> {
    const run = this.queue.then(async () => {
      const data = await this.read();
      change(data);
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(data));
      await fs.rename(tmp, this.file);
    });
    this.queue = run.catch(() => {});
    return run;
  }

  async getAgent(tokenId: string) {
    const agent = (await this.read()).agents[tokenId];
    return agent ? migrateAgent(agent) : null;
  }

  saveAgent(agent: AgentRecord) {
    return this.mutate((data) => {
      data.agents[agent.tokenId] = agent;
    });
  }

  async listAgents() {
    return Object.values((await this.read()).agents).map(migrateAgent);
  }

  addDecision(decision: Decision) {
    return this.mutate((data) => {
      const history = data.decisions[decision.tokenId] ?? [];
      data.decisions[decision.tokenId] = [decision, ...history].slice(0, MAX_DECISIONS_PER_AGENT);
    });
  }

  async listDecisions(tokenId: string, limit = 50) {
    return ((await this.read()).decisions[tokenId] ?? []).slice(0, limit);
  }

  async acquireLock(key: string, ttlMs: number) {
    const now = Date.now();
    const held = this.locks.get(key);
    if (held && held.expires > now) return null;
    const token = crypto.randomUUID();
    this.locks.set(key, { token, expires: now + ttlMs });
    return token;
  }

  async releaseLock(key: string, token: string) {
    if (this.locks.get(key)?.token === token) this.locks.delete(key);
  }
}

function createStore(): AgentStore {
  const [url, token] =
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
      ? [process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN]
      : [process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN];
  if (url && token) return new RedisStore(new Redis({ url, token }));

  // ANIMR_DATA_DIR overrides the location. Vercel's filesystem is read-only outside
  // /tmp, which is per-instance and wiped on cold starts, so production needs Redis.
  // turbopackIgnore keeps build-time file tracing from pulling the whole project into the bundle.
  const dir =
    process.env.ANIMR_DATA_DIR ||
    (process.env.VERCEL ? "/tmp/animr" : path.join(/* turbopackIgnore: true */ process.cwd(), ".data"));
  if (process.env.VERCEL) {
    console.warn("[animr] No Upstash Redis configured: agent state lives in /tmp and will not persist.");
  }
  return new FileStore(path.join(dir, "animr.json"));
}

// One instance per process: route handlers are bundled separately, and the file
// backend's write queue and locks must be shared between them.
const globalForStore = globalThis as typeof globalThis & { __animrStore?: AgentStore };

export function getStore(): AgentStore {
  return (globalForStore.__animrStore ??= createStore());
}
