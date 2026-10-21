// VERSUS bout ids. A bout is (Chog a, Chog b, the hidden window), and its id encodes all three, so any
// bout can be re-served and shared without storing it. The window is encoded by the unix hour of its
// first frame (not by its rank in the drama list, which reshuffles as new candles arrive), so an old link
// replays the same 48 hours forever.
//
// Layout: a (11 bits) | b (11 bits) | hours since 2025-01-01 UTC (20 bits) | check (10 bits) = 52 bits,
// scrambled by a 4-round Feistel network (so a shared link doesn't show the real dates before the
// reveal) and written as 11 base-36 characters. Obfuscation, not secrecy: anyone can spectate a bout.
// Pure and dependency-free: safe in client components (a page can validate an id without a round trip).

export type BoutKey = {
  /** Token ids, 1-1969, a !== b. */
  a: number;
  b: number;
  /** Unix hour (seconds / 3600) of the window's first frame: the close the race starts from. */
  hour: number;
};

/** Every bout id is exactly this many characters of [0-9a-z]. */
export const BOUT_ID_LENGTH = 11;
export const BOUT_ID_PATTERN = /^[0-9a-z]{11}$/;

const MAX_TOKEN_ID = 1969;
/** 2025-01-01T00:00:00Z in unix hours; CHOG/WMON history starts in 2026. */
const HOUR_EPOCH = 482_136;
const HOUR_SPAN = 2 ** 20;
const CHECK_SPAN = 2 ** 10;
const HALF = 2 ** 26;
const HALF_MASK = HALF - 1;
/** Bump the salt (and keep the old one decodable) if the layout ever changes. */
const CHECK_SALT = 0x7e5e5a11;
const ROUND_KEYS = [0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c] as const;

function mix32(x: number, key: number): number {
  let h = Math.imul(x ^ key, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function check(a: number, b: number, offset: number): number {
  return mix32(mix32(a * 2048 + b, CHECK_SALT) ^ offset, CHECK_SALT) % CHECK_SPAN;
}

/** 52-bit block permutation: Feistel rounds over two 26-bit halves. */
function scramble(n: number): number {
  let left = Math.floor(n / HALF);
  let right = n % HALF;
  for (const key of ROUND_KEYS) [left, right] = [right, (left ^ (mix32(right, key) & HALF_MASK)) & HALF_MASK];
  return left * HALF + right;
}

function unscramble(n: number): number {
  let left = Math.floor(n / HALF);
  let right = n % HALF;
  for (let k = ROUND_KEYS.length - 1; k >= 0; k--) {
    [left, right] = [(right ^ (mix32(left, ROUND_KEYS[k]) & HALF_MASK)) & HALF_MASK, left];
  }
  return left * HALF + right;
}

const isTokenId = (id: number) => Number.isInteger(id) && id >= 1 && id <= MAX_TOKEN_ID;

/** The bout id for (a, b, window start hour). Throws RangeError for ids outside 1-1969, a === b or an hour outside 2025-2144. */
export function encodeBoutId({ a, b, hour }: BoutKey): string {
  const offset = hour - HOUR_EPOCH;
  if (!isTokenId(a) || !isTokenId(b) || a === b) throw new RangeError("A bout needs two different Chogs (token ids 1-1969).");
  if (!Number.isInteger(offset) || offset < 0 || offset >= HOUR_SPAN) throw new RangeError(`No VERSUS window can start at hour ${hour}.`);
  const packed = ((a * 2048 + b) * HOUR_SPAN + offset) * CHECK_SPAN + check(a, b, offset);
  return scramble(packed).toString(36).padStart(BOUT_ID_LENGTH, "0");
}

/** The (a, b, hour) behind a bout id (case-insensitive; ids are written lowercase), or null when it isn't a valid id. */
export function decodeBoutId(id: unknown): BoutKey | null {
  const text = typeof id === "string" ? id.toLowerCase() : "";
  if (!BOUT_ID_PATTERN.test(text)) return null;
  const n = parseInt(text, 36);
  if (!Number.isSafeInteger(n) || n >= HALF * HALF) return null;
  const packed = unscramble(n);
  const checkBits = packed % CHECK_SPAN;
  let rest = Math.floor(packed / CHECK_SPAN);
  const offset = rest % HOUR_SPAN;
  rest = Math.floor(rest / HOUR_SPAN);
  const b = rest % 2048;
  const a = Math.floor(rest / 2048);
  if (!isTokenId(a) || !isTokenId(b) || a === b || checkBits !== check(a, b, offset)) return null;
  return { a, b, hour: HOUR_EPOCH + offset };
}

/** True when `id` is a well-formed bout id (its window may still be unknown to this server's candles). */
export function isBoutId(id: unknown): id is string {
  return decodeBoutId(id) !== null;
}
