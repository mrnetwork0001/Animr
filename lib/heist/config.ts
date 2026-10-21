import { type Address, getAddress, isAddress, keccak256, stringToBytes } from "viem";
import { appConfig } from "../config";

// Heist settings. Safe to import from client components (e.g. HEIST_TITLE for a nav link): server-only values are
// only read lazily, inside functions, from the environment:
//   HOUSE_CHOG_TOKEN_ID     the House Chog (unset = "moving in")
//   HEIST_DAILY_USD_CAP     0G spend per UTC day for heist replies, in USD (default 3)
//   HEIST_ADMIN_SECRET      Bearer token for moderating the Hall of Fame: approving LLM-written replies (they stay
//                           held until then) and removing entries (unset = no admin, LLM replies stay held)
//   HEIST_IP_SALT           secret key for the visitors' IP hashes (else derived from CRON_SECRET)
//   OPERATOR_ADDRESS        the AI operator's public address, else that of OPERATOR_PRIVATE_KEY (read in operator.ts,
//                           which only derives the address: it never signs). A deployed guard's own operator() wins.

/** The two names the team picked between. */
export const HEIST_TITLES = ["Rob this Chog", "Con the Chog"] as const;
export type HeistTitle = (typeof HEIST_TITLES)[number];

/** The page's name everywhere (nav label, <title>, hero). Switch to "Con the Chog" here. */
export const HEIST_TITLE: HeistTitle = "Rob this Chog";

export const HEIST_TAGLINE = "The AI can be fooled. The NFT can't.";

export const HEIST_LIMITS = {
  /** Longest visitor message. */
  maxMessageChars: 280,
  /** Longest defender reply. */
  replyMaxChars: 240,
  /** Messages per session: the defender's patience is clamped to this range. */
  minTurns: 3,
  maxTurns: 6,
  /** A session (its turns and caving reply) is kept this long after its last message. */
  sessionTtlMs: 60 * 60_000,
  /** Minimum gap between two messages of one session. */
  messageGapMs: 2_000,
  /** Per IP. */
  ipMessages: { limit: 20, windowMs: 10 * 60_000 },
  ipSessions: { limit: 30, windowMs: 24 * 3_600_000 },
  ipProofs: { limit: 10, windowMs: 10 * 60_000 },
  ipHallOfFame: { limit: 8, windowMs: 24 * 3_600_000 },
  /** All visitors together: protects the public Monad RPC. */
  globalProofsPerMinute: 60,
  /** Hall of Fame entries kept (newest first) and shown. */
  hallOfFameKept: 100,
  hallOfFameShown: 12,
} as const;

/** 0G Compute models, tried in order; then the template defender. */
export const DEFENDER_MODELS = ["0gm-1.0-35b-a3b", "glm-5.3"] as const;
export const DEFENDER_TIMEOUT_MS = 15_000;

/**
 * Reserved from the daily cap for each defender turn before it calls a model (store.ts reserveLlmTurn), so concurrent
 * turns can't overshoot the cap; it covers a turn's worst case of both models ($0.004).
 */
export const CALL_RESERVE_MICRO_USD = 4_000;
/** Booked when a call fails or its receipt carries no cost ($0.002). */
export const UNKNOWN_CALL_MICRO_USD = 2_000;

/** HEIST_DAILY_USD_CAP in micro-USD (default $3; 0 turns the LLM off). */
export function dailyCapMicroUsd(): number {
  const raw = process.env.HEIST_DAILY_USD_CAP?.trim();
  const usd = raw ? Number(raw) : 3;
  return Number.isFinite(usd) && usd >= 0 ? Math.round(usd * 1_000_000) : 3_000_000;
}

/** The House Chog's token id from HOUSE_CHOG_TOKEN_ID, or null when unset or outside the collection. */
export function houseChogTokenId(): number | null {
  const raw = process.env.HOUSE_CHOG_TOKEN_ID?.trim().replace(/^#/, "");
  if (!raw || !/^\d{1,5}$/.test(raw)) return null;
  const id = BigInt(raw);
  if (id < appConfig.tokenIdRange.min || id > appConfig.tokenIdRange.max) return null;
  return Number(id);
}

/** Recipient of the simulated transfer when the visitor gives none: an obvious placeholder, nobody's wallet. */
export const DEMO_RECIPIENT: Address = getAddress("0x0000000000000000000000000000000000c0ffee");

/**
 * Sender for the proof when no operator is configured anywhere: a fixed address nobody holds a key for, labelled
 * "stand-in" in the UI. Any address that isn't the NFT's owner gets the same answer from the wallet.
 */
export const STAND_IN_OPERATOR: Address = getAddress(`0x${keccak256(stringToBytes("animr:heist:stand-in-operator")).slice(-40)}`);

/** A checksummed address from user input, or null. */
export function parseAddress(raw: unknown): Address | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  return isAddress(text, { strict: false }) ? getAddress(text) : null;
}

/** Bearer secret for the Hall of Fame admin route, or null (admin off). */
export function heistAdminSecret(): string | null {
  return process.env.HEIST_ADMIN_SECRET?.trim() || null;
}
