import { type Address, getAddress, isAddress } from "viem";

/** Activation signatures older than this are rejected (replay protection). */
export const ACTIVATION_MAX_AGE_MS = 10 * 60 * 1000;

export type ActivationFields = {
  tokenId: string;
  account: Address;
  owner: Address;
  /** ISO timestamp. */
  issuedAt: string;
};

/** The exact message an NFT owner signs to activate their Chog's AI agent. */
export function activationMessage(fields: ActivationFields): string {
  return [
    "Animr: activate the AI agent for my Chog.",
    `Chog: #${fields.tokenId}`,
    `Account: ${getAddress(fields.account)}`,
    `Owner: ${getAddress(fields.owner)}`,
    `Issued at: ${fields.issuedAt}`,
  ].join("\n");
}

/** Inverse of activationMessage; returns null if the message is not in the expected format. */
export function parseActivationMessage(message: string): ActivationFields | null {
  const match =
    /^Animr: activate the AI agent for my Chog\.\nChog: #(\d+)\nAccount: (0x[0-9a-fA-F]{40})\nOwner: (0x[0-9a-fA-F]{40})\nIssued at: (\S+)$/.exec(
      message,
    );
  if (!match) return null;
  const [, tokenId, account, owner, issuedAt] = match;
  if (!isAddress(account) || !isAddress(owner) || Number.isNaN(Date.parse(issuedAt))) return null;
  return { tokenId, account: getAddress(account), owner: getAddress(owner), issuedAt };
}
