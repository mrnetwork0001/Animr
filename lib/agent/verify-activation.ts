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
import { publicClient } from "../clients";
import { appConfig } from "../config";
import { computeTokenBoundAccount } from "../erc6551";
import { ACTIVATION_MAX_AGE_MS, parseActivationMessage } from "./auth";
import { parseTokenId } from "./store";
import { type AgentMode, parseModeSwitchMessage } from "./types";

/** Tolerated difference between the signer's clock and ours. */
const CLOCK_SKEW_MS = 2 * 60_000;

const activateRequestSchema = z.object({
  owner: z.string().refine((value) => isAddress(value, { strict: false })),
  message: z.string().max(1_000),
  // Smart-wallet (ERC-1271 / ERC-6492) signatures are longer than 65 bytes.
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(20_000),
});

const modeSwitchRequestSchema = activateRequestSchema.extend({ mode: z.enum(["onchain", "paper"]) });

export type VerifiedActivation = { tokenId: string; account: Address; owner: Address };

type Failure = { ok: false; status: number; error: string };

export type ActivationCheck = { ok: true; activation: VerifiedActivation } | Failure;

export type VerifiedModeSwitch = VerifiedActivation & { mode: AgentMode; issuedAt: string };

export type ModeSwitchCheck = { ok: true; modeSwitch: VerifiedModeSwitch } | Failure;

export type ActivationOptions = {
  /** Current time in ms (tests). */
  now?: number;
  /** Reads the NFT's current owner (defaults to `ownerOf` on the configured collection). */
  ownerOf?: (tokenId: bigint) => Promise<Address>;
};

function fail(status: number, error: string): Failure {
  return { ok: false, status, error };
}

const NOT_CONFIGURED = "the Chog NFT contract and the ERC-6551 account implementation are not configured.";

function accountConfig() {
  const { chogNft, accountImplementation, salt, chain } = appConfig;
  return chogNft && accountImplementation ? { chogNft, accountImplementation, salt, chainId: chain.id } : null;
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
 * The checks every owner-signed Animr message shares once its format is parsed: token id, owner and token-bound
 * account, its age, the signature, and that the signer owns the NFT on-chain right now.
 */
async function verifySignedFields(
  tokenId: string,
  fields: { tokenId: string; account: Address; owner: Address; issuedAt: string },
  request: { owner: string; message: string; signature: string },
  config: NonNullable<ReturnType<typeof accountConfig>>,
  options: ActivationOptions,
  /** For error messages: the message's name ("activation") and what only the owner may do ("activate its agent"). */
  wording: { kind: string; action: string },
): Promise<ActivationCheck> {
  const owner = getAddress(request.owner);
  const signature = request.signature as Hex;
  if (parseTokenId(fields.tokenId) !== tokenId) {
    return fail(400, `The signed message is for Chog #${fields.tokenId}, not #${tokenId}.`);
  }
  if (!isAddressEqual(fields.owner, owner)) return fail(400, "The signed message names a different owner.");

  const account = computeTokenBoundAccount({
    implementation: config.accountImplementation,
    tokenContract: config.chogNft,
    tokenId: BigInt(tokenId),
    chainId: config.chainId,
    salt: config.salt,
  });
  if (!isAddressEqual(fields.account, account)) {
    return fail(400, `The signed message names the wrong account for Chog #${tokenId} (expected ${account}).`);
  }

  const now = options.now ?? Date.now();
  const issuedAt = Date.parse(fields.issuedAt);
  if (issuedAt > now + CLOCK_SKEW_MS) return fail(401, `The ${wording.kind} message is dated in the future.`);
  if (now - issuedAt > ACTIVATION_MAX_AGE_MS) {
    return fail(401, `The ${wording.kind} signature has expired. Sign a fresh message.`);
  }

  if (!(await isValidSignature(owner, request.message, signature))) {
    return fail(401, "The signature does not match the owner address.");
  }

  const readOwner =
    options.ownerOf ??
    ((id: bigint) =>
      publicClient.readContract({ address: config.chogNft, abi: erc721Abi, functionName: "ownerOf", args: [id] }));
  let currentOwner: Address;
  try {
    currentOwner = await readOwner(BigInt(tokenId));
  } catch (error) {
    if (error instanceof BaseError && error.walk((e) => e instanceof ContractFunctionRevertedError)) {
      return fail(404, `Chog #${tokenId} does not exist.`);
    }
    return fail(502, "Could not read the Chog's owner on-chain. Try again in a moment.");
  }
  if (!isAddressEqual(currentOwner, owner)) {
    return fail(403, `Only the current owner of Chog #${tokenId} can ${wording.action}.`);
  }

  return { ok: true, activation: { tokenId, account, owner } };
}

/**
 * Checks an ActivateRequest body for `tokenId` (already canonical, see parseTokenId):
 * the message format, token id, owner and token-bound account, its age, the
 * signature, and that the signer owns the NFT on-chain right now.
 */
export async function verifyActivation(
  tokenId: string,
  body: unknown,
  options: ActivationOptions = {},
): Promise<ActivationCheck> {
  const config = accountConfig();
  if (!config) return fail(503, `Activation is not available yet: ${NOT_CONFIGURED}`);

  const parsed = activateRequestSchema.safeParse(body);
  if (!parsed.success) return fail(400, "Expected a JSON body { owner, message, signature }.");
  const fields = parseActivationMessage(parsed.data.message);
  if (!fields) return fail(400, "The signed message is not an Animr activation message.");
  return verifySignedFields(tokenId, fields, parsed.data, config, options, {
    kind: "activation",
    action: "activate its agent",
  });
}

/**
 * Checks a ModeSwitchRequest body for `tokenId` like verifyActivation does, with modeSwitchMessage's format (the
 * body's mode must be the signed one). Whether the switch is allowed (agent exists, on-chain readiness, replays)
 * is up to the caller.
 */
export async function verifyModeSwitch(
  tokenId: string,
  body: unknown,
  options: ActivationOptions = {},
): Promise<ModeSwitchCheck> {
  const config = accountConfig();
  if (!config) return fail(503, `Switching the trading mode is not available yet: ${NOT_CONFIGURED}`);

  const parsed = modeSwitchRequestSchema.safeParse(body);
  if (!parsed.success) return fail(400, "Expected a JSON body { mode, owner, message, signature }.");
  const fields = parseModeSwitchMessage(parsed.data.message);
  if (!fields) return fail(400, "The signed message is not an Animr mode-switch message.");
  if (fields.mode !== parsed.data.mode) {
    return fail(400, `The signed message switches to ${fields.mode} mode, not ${parsed.data.mode}.`);
  }
  const check = await verifySignedFields(tokenId, fields, parsed.data, config, options, {
    kind: "mode-switch",
    action: "switch its agent's trading mode",
  });
  if (!check.ok) return check;
  return { ok: true, modeSwitch: { ...check.activation, mode: fields.mode, issuedAt: fields.issuedAt } };
}
