import type { Address, Hex } from "viem";
import { isFlaggedTokenId } from "../brand-safety";
import { appConfig } from "../config";
import { computeTokenBoundAccount } from "../erc6551";
import { houseChogTokenId } from "../heist/config";
import { getKv } from "../kv";
import type { Visibility } from "../visibility";
import { HOUR_MS, extremes } from "./rules";
import { KEYS, readCalls } from "./store";
import type { BellCall, BellPurse, BellSummary } from "./types";

// The Oracle Purse. After a live Bell settles, the team sends real $CHOG from its House key into the winning Chog's
// own ERC-6551 wallet with scripts/send-oracle-purse.mts, which records the transfer here (KEYS.purse). The purse
// belongs to the NFT and passes to its next holder. An operational step, not contract logic: the Bell API reports
// what was recorded, plus "on its way" for a while after settlement (never longer: PURSE_PROMISE_MS). Server-only.
//
// The winner is the Oracle of the Day the Bell page shows. The House Chog never pays itself, and a Chog its holder
// hid (lib/optout.ts) is never named: in either case the purse goes to the next-closest call (flagged Chogs left
// out, as for the Oracle card).

/** $CHOG per purse when ORACLE_PURSE_CHOG is unset. */
export const DEFAULT_PURSE_CHOG = "5000";
/** Without a record, a settled live Bell shows its purse "on its way" for this long after its horizon. */
export const PURSE_PROMISE_MS = 48 * HOUR_MS;

/** animr:bell:purse:<day>, written by scripts/send-oracle-purse.mts. */
export type OraclePurseRecord = {
  day: string;
  /** The winning Chog. */
  tokenId: number;
  /** Its ERC-6551 wallet: the transfer's recipient. */
  tba: Address;
  /** Whole $CHOG, as a decimal string ("5000"). */
  amount: string;
  /** The ERC-20 transfer from the House key. */
  txHash: Hex;
  /** The House key's address. */
  from: Address;
  /** "pending" from just before the broadcast until the receipt, "confirmed" once the transfer succeeded. */
  status: "pending" | "confirmed";
  /** When the transfer was signed (ISO). */
  sentAt: string;
  blockNumber?: string;
};

/**
 * A purse amount in whole $CHOG ("5000", "2500.5"), or null when `raw` isn't one. "0" is valid and means no purse.
 * At most 18 decimals ($CHOG's).
 */
export function parsePurseAmount(raw: string | undefined): string | null {
  const text = (raw ?? "").trim().replace(/_/g, "");
  if (!/^\d{1,12}(\.\d{1,18})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return `${whole.replace(/^0+(?=\d)/, "")}${trimmed ? `.${trimmed}` : ""}`;
}

/** ORACLE_PURSE_CHOG (default 5000), or null when it is set but invalid. "0" turns the purse off. */
export function purseAmountChog(): string | null {
  const raw = process.env.ORACLE_PURSE_CHOG;
  return raw?.trim() ? parsePurseAmount(raw) : DEFAULT_PURSE_CHOG;
}

/** A Chog's canonical Tokenbound wallet (registry v0.3.1, appConfig's implementation and salt), or null. */
export function chogWallet(tokenId: number): Address | null {
  const { accountImplementation, chogNft, chain, salt } = appConfig;
  if (!accountImplementation || !chogNft) return null;
  return computeTokenBoundAccount({
    implementation: accountImplementation,
    tokenContract: chogNft,
    tokenId: BigInt(tokenId),
    chainId: chain.id,
    salt,
  });
}

export type PurseWinnerOptions = {
  /** The House Chog's token id; defaults to HOUSE_CHOG_TOKEN_ID (null: none set). */
  house?: number | null;
  /** Opt-outs (lib/visibility.ts): a Chog whose holder hid it is never named, so it isn't the winner either. */
  visibility?: Pick<Visibility, "hidden">;
};

/**
 * Who gets a settled Bell's purse: its Oracle of the Day, or, when that is the House Chog (HOUSE_CHOG_TOKEN_ID) or a
 * Chog its holder hid, the closest call among the rest (flagged Chogs left out, as for the Oracle card). Undefined
 * before settlement.
 */
export async function purseWinner(summary: BellSummary, options: PurseWinnerOptions = {}): Promise<BellCall | undefined> {
  const house = options.house === undefined ? houseChogTokenId() : options.house;
  const hidden = options.visibility?.hidden;
  const skip = (tokenId: number) => tokenId === house || isFlaggedTokenId(tokenId) || Boolean(hidden?.has(tokenId));
  const oracle = summary.oracle;
  if (summary.status !== "settled" || !oracle) return undefined;
  if (!skip(oracle.tokenId)) return oracle;
  const winner = extremes(await readCalls(summary), summary.day, skip).oracle;
  // extremes() falls back to every call when the skip leaves none: never pay a skipped Chog.
  return winner && !skip(winner.tokenId) ? winner : undefined;
}

export function readPurse(day: string): Promise<OraclePurseRecord | null> {
  return getKv().get<OraclePurseRecord>(KEYS.purse(day));
}

/** Records a purse before its broadcast; false when the Bell already has one (atomic: one purse per Bell). */
export function claimPurse(record: OraclePurseRecord): Promise<boolean> {
  return getKv().setNx(KEYS.purse(record.day), record);
}

export function writePurse(record: OraclePurseRecord): Promise<void> {
  return getKv().set(KEYS.purse(record.day), record);
}

/** Drops a purse record whose transfer never landed (reverted, or dropped before a block took it). */
export function clearPurse(day: string): Promise<void> {
  return getKv().del(KEYS.purse(day));
}

/**
 * What the Bell page shows about a Bell's purse, or undefined when it has none (replays, open Bells, purses off).
 * A recorded transfer shows once confirmed; until then, and for PURSE_PROMISE_MS after the horizon without a
 * record, the purse is "on its way" to the winner. A purse whose Chog was hidden by its holder isn't shown.
 */
export async function bellPurse(
  summary: BellSummary,
  options: { now?: number; visibility?: Pick<Visibility, "hidden"> } = {},
): Promise<BellPurse | undefined> {
  if (summary.kind !== "live" || summary.status !== "settled" || !summary.oracle) return undefined;
  const record = await readPurse(summary.day);
  if (record && options.visibility?.hidden.has(record.tokenId)) return undefined;
  if (record?.status === "confirmed") {
    return { status: "sent", tokenId: record.tokenId, amount: record.amount, tba: record.tba, txHash: record.txHash };
  }
  if (record) return { status: "pending", tokenId: record.tokenId, amount: record.amount };
  const amount = purseAmountChog();
  const now = options.now ?? Date.now();
  if (!amount || Number(amount) <= 0 || now > Date.parse(summary.horizonAt) + PURSE_PROMISE_MS) return undefined;
  const winner = await purseWinner(summary, { visibility: options.visibility });
  return winner ? { status: "pending", tokenId: winner.tokenId, amount } : undefined;
}
