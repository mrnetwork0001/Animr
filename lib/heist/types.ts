import type { Address } from "viem";
import type { TokenBoundAccountStatus } from "../erc6551";

// Contract between the heist engine (lib/heist/*, app/api/heist/*) and its UI (components/heist/*,
// app/(app)/heist). Plain JSON: bigints travel as decimal strings, token amounts in whole $CHOG.
//
// HTTP (all JSON; every response is private, no-store):
//   GET    /api/heist                 -> HeistState
//   POST   /api/heist/chat            { sessionId?, message, recipient? } -> ChatResponse
//   POST   /api/heist/proof           { recipient? } -> ProofResponse   ("Act as the AI": no LLM involved)
//   GET    /api/heist/hall-of-fame    -> { entries: HallOfFameEntry[] }
//                                       (with Authorization: Bearer $HEIST_ADMIN_SECRET: { entries: AdminHallOfFameEntry[] })
//   POST   /api/heist/hall-of-fame    { sessionId, nickname } -> { entry: HallOfFameEntry }
//   PATCH  /api/heist/hall-of-fame    { id, approved }, Authorization: Bearer $HEIST_ADMIN_SECRET -> { updated: boolean }
//   DELETE /api/heist/hall-of-fame    { id }, Authorization: Bearer $HEIST_ADMIN_SECRET -> { removed: boolean }
// Errors: { error: string } with a 4xx/5xx status (429 carries Retry-After).

/** "unset": no HOUSE_CHOG_TOKEN_ID. "moving-in": set, but its wallet isn't ready or holds no $CHOG. */
export type HousePhase = "unset" | "moving-in" | "open";

/** A trait as it may be shown (and sent to the LLM): flagged values are already renamed or dropped. */
export type DisplayTrait = { type: string; value: string };

export type HouseChog = {
  phase: HousePhase;
  /** Why the House isn't open yet, in plain words; null when open. */
  note: string | null;
  tokenId: number | null;
  /** Metadata name, e.g. "CHOG #1462"; show "token <tokenId>" next to it. */
  name: string | null;
  /** ipfs:// URI of the real NFT art (resolve with resolveUri from lib/nft.ts). */
  image: string | null;
  /** The Chog's Tokenbound ERC-6551 account. */
  tba: Address | null;
  tbaStatus: TokenBoundAccountStatus | null;
  /** $CHOG in the TBA, whole tokens as a decimal string. */
  chogBalance: string | null;
  explorerUrl: string | null;
  /** Block the wallet was read at. */
  blockNumber: string | null;
  traits: DisplayTrait[];
};

/** The public face of the defender persona. Its weak spot stays on the server. */
export type DefenderProfile = {
  /** Genome archetype, e.g. "Royal Laser Chaser" ("House Chog" while unset). */
  archetype: string;
  /** One line, e.g. "Excitable, talks fast, loves a breakout." */
  temperament: string;
  /** Messages a visitor gets per session (3-6, from its genome's tempo). */
  patience: number;
  /** LLM ids in the order they're tried (0G Compute), then templates. */
  models: string[];
  /** A 0G key is configured (otherwise every reply is a template). */
  llm: boolean;
};

export type HeistCounters = {
  /** UTC day, YYYY-MM-DD. */
  day: string;
  /** Always 0: the heist only ever simulates, nothing is broadcast. */
  stolenChog: number;
  /** Messages sent to the House Chog today (all visitors). */
  attemptsToday: number;
  /** Times its AI agreed to send $CHOG today. */
  cavesToday: number;
  /** Live simulations Monad refused today. */
  refusalsToday: number;
};

export type HeistBudget = {
  /** Today's 0G budget is spent: replies are templates until resetsAt ("Act as the AI" still works). */
  napping: boolean;
  /** ISO, the next 00:00 UTC. */
  resetsAt: string;
};

export type HeistState = {
  title: string;
  house: HouseChog;
  defender: DefenderProfile;
  counters: HeistCounters;
  budget: HeistBudget;
  limits: { maxMessageChars: number; replyMaxChars: number };
  guard: { address: Address | null };
  /** The configured AI operator's public address and where it came from (never the key); null when unset. */
  operator: { address: Address; source: OperatorSource } | null;
  /** Recipient used when the visitor gives none. */
  demoRecipient: Address;
  hallOfFame: HallOfFameEntry[];
};

// --- Chat ------------------------------------------------------------------------------------

export type DefenderIntent = "chat" | "transfer";
/**
 * "0g": an LLM on 0G Compute replied. "template": no key, both models failed, or the model's reply failed moderation
 * (its intent still counts). "nap": the daily budget is spent.
 */
export type DefenderSource = "0g" | "template" | "nap";

/** From the 0G Router's x_0g_trace: who served the reply and what it cost. */
export type ZgReceiptLite = {
  requestId?: string;
  provider?: string;
  teeVerified?: boolean;
  /** Total cost in micro-USD (decimal string). */
  costUsdMicro?: string;
};

export type DefenderTurn = {
  /** In character, at most 240 characters. */
  reply: string;
  intent: DefenderIntent;
  /** $CHOG the AI agreed to send (transfer only). */
  amount: number | null;
  /** 0-1: how close the AI is to caving. */
  temptation: number;
  source: DefenderSource;
  /** The model that replied (source "0g"). */
  model: string | null;
  receipt: ZgReceiptLite | null;
};

export type ChatRequest = {
  /** Omit to start a new session. */
  sessionId?: string;
  /** At most 280 characters. */
  message: string;
  /** The visitor's own address (connected wallet), used as the simulated recipient. */
  recipient?: string;
};

export type ChatResponse = {
  sessionId: string;
  /** 1-based number of this message in the session. */
  turn: number;
  turnsLeft: number;
  /** The session is over: the AI caved or the visitor is out of messages. */
  done: boolean;
  defender: DefenderTurn;
  /** Present when the AI agreed to send $CHOG: what Monad says about it. */
  proof: HeistProof | null;
  /** A nudge toward the secret weak spot, after a few failed messages. */
  hint: string | null;
  /** Whether this session's caving reply may go on the wall (and why not). */
  hallOfFame: { eligible: boolean; reason: string | null };
  counters: HeistCounters;
};

// --- Proof -----------------------------------------------------------------------------------

/** Where the simulated sender came from. "stand-in": no operator is configured (labelled as such). */
export type OperatorSource = "env-address" | "env-key" | "guard" | "stand-in";

export type ProofStep = {
  /** e.g. "The AI's key calls the wallet's execute()". */
  label: string;
  from: Address;
  to: Address;
  /** Human-readable call, e.g. "execute(CHOG, 0, transfer(0xC0ff…, 5,000 CHOG), CALL)". */
  call: string;
  reverted: boolean;
  /** Decoded revert, e.g. "NotAuthorized()" or 'TradeRejected("buy-only vault")'; null when it didn't revert. */
  error: string | null;
  errorName: string | null;
  /** What the outcome means, in plain words. */
  meaning: string;
};

/**
 * "live": the House Chog's TBA was 'ready' and held $CHOG at blockNumber, and every step was simulated there (eth_call,
 * never broadcast). "no-claim": nothing is claimed (see reason / note).
 */
export type ProofKind = "live" | "no-claim";
/**
 * Why no claim is made:
 * - "house-unset" / "tba-none" / "tba-uninitialized" / "vault-empty": the House Chog hasn't fully moved in;
 * - "busy": too many checks at once (all visitors together), so this one didn't run;
 * - "inconclusive": the transfer reverted, but not in a way that pins the refusal on the key (another error, or the
 *   owner's own identical call failed too);
 * - "rpc-error": Monad couldn't be reached (an RPC failure is never read as a refusal).
 */
export type NoClaimReason =
  | "house-unset"
  | "tba-none"
  | "tba-uninitialized"
  | "vault-empty"
  | "busy"
  | "inconclusive"
  | "rpc-error";

/** The control: the very same execute() sent from owner() at the same block. */
export type ProofControl = { from: Address; reverted: boolean; error: string | null };

export type HeistProof = {
  kind: ProofKind;
  reason: NoClaimReason | null;
  /** Plain-words explanation for "no-claim" (and caveats for "live"). */
  note: string | null;
  blockNumber: string | null;
  tokenId: number | null;
  tba: Address | null;
  tbaStatus: TokenBoundAccountStatus | null;
  /** owner() of the TBA at blockNumber (= ownerOf the Chog). */
  owner: Address | null;
  /** ERC-1967 implementation behind the TBA's proxy. */
  implementation: Address | null;
  /** The vault's $CHOG at blockNumber, whole tokens. */
  vaultChog: string | null;
  recipient: Address;
  /** $CHOG the simulated transfer asked for, whole tokens. */
  amountChog: string;
  operator: Address;
  operatorSource: OperatorSource;
  /**
   * isValidSigner(key, "0x") at blockNumber for the simulated key (and a differing configured AI key): true when the
   * wallet accepts one of them, so it would execute for it (never reported as a refusal); null when not read.
   */
  keyApproved: boolean | null;
  /** The same execute() from owner() at blockNumber (live proofs). */
  control: ProofControl | null;
  guard: Address | null;
  results: ProofStep[];
  /**
   * "AI said YES. Monad said NO.": true only for a live proof in which the wallet refused the AI key's transfer with
   * Tokenbound's NotAuthorized() (or AccountLocked()), the wallet accepts none of the AI keys, and the owner's
   * identical call goes through (for AccountLocked: is locked out too). The guard step never pays the recipient.
   */
  refused: boolean;
  explorerUrl: string | null;
  /** ISO time of the simulation. */
  simulatedAt: string;
};

export type ProofResponse = { proof: HeistProof; counters: HeistCounters };

// --- Hall of Fame ----------------------------------------------------------------------------

/** What the check said when that AI caved, as it was stored with the entry. */
export type WallCheck = {
  kind: ProofKind;
  reason: NoClaimReason | null;
  refused: boolean;
  blockNumber: string | null;
  /** The AI key's decoded revert (live proofs). */
  error: string | null;
};

/**
 * One AI that caved: only its own reply (redacted) and a sanitized nickname, never what the visitor typed. A reply an
 * LLM wrote stays held (reply null) until a moderator approves it; a template's reply shows at once.
 */
export type HallOfFameEntry = {
  id: string;
  nickname: string;
  /** The AI's caving reply, addresses redacted; null while it is held for review. */
  reply: string | null;
  /** The LLM wrote this reply and a moderator hasn't approved it yet. */
  replyHeld: boolean;
  amountChog: number | null;
  /** ISO. */
  at: string;
  source: DefenderSource;
  model: string | null;
  /** The check run when it caved; null for entries stored before checks were kept. */
  check: WallCheck | null;
  /** The live refusal (check.kind "live" and check.refused). */
  blockNumber: string | null;
  error: string | null;
};

/** The admin's view (GET with the admin bearer): held replies included. */
export type AdminHallOfFameEntry = Omit<HallOfFameEntry, "reply"> & {
  reply: string;
  review: "auto" | "held" | "approved";
};
