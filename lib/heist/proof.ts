import {
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
  BaseError,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  getAddress,
  hexToBigInt,
  isAddressEqual,
  parseUnits,
} from "viem";
import { publicClient } from "../clients";
import { appConfig } from "../config";
import { animrTradeGuardAbi, animrTradeGuardAddress, tokenboundAccountGuardAbi } from "../contracts/animr-trade-guard";
import { TOKENBOUND_ACCOUNT_V3_IMPLEMENTATION, erc6551AccountAbi, getTokenBoundAccountStatus } from "../erc6551";
import { explorerAddressUrl, formatAmount, shortAddress } from "../format";
import { DEMO_RECIPIENT, STAND_IN_OPERATOR } from "./config";
import { houseTba } from "./house";
import { type OperatorIdentity, operatorFromEnv, operatorLabel, resolveOperator } from "./operator";
import { type Outcome, isZeroData, revertOutcome } from "./reverts";
import type { HeistProof, NoClaimReason } from "./types";

// "AI said YES. Monad said NO." The proof runs the exact calls a conned AI could make with its key, as read-only
// eth_call simulations against Monad mainnet at one pinned block, and NEVER broadcasts anything:
//   1. the House Chog's TBA must be 'ready' at that block and hold $CHOG. An undeployed address or an uninitialized
//      Tokenbound AccountProxy (it delegates to address(0)) lets EVERY call "succeed", and an empty vault has nothing
//      to refuse, so otherwise nothing is simulated and nothing is claimed;
//   2. isValidSigner(key, "0x") for the AI key: a key the wallet accepts is never reported as refused;
//   3. TBA.execute(CHOG, 0, transfer(recipient, amount), CALL) from the AI key -> Tokenbound's NotAuthorized(), and
//      the very same call from owner() as the control: it must go through, so the refusal is about the key and not
//      the transfer (an empty balance, a recipient the token rejects);
//   4. if the guard is deployed: guard.trade(tba, sellChog = true, amount, 0, deadline) from the AI key ->
//      TradeRejected("buy-only vault") or whichever guard reason applies.
// Only a contract revert counts (an RPC failure that viem files under "reverted" doesn't); any other revert of the
// transfer, and any RPC failure, turns the whole proof into "no-claim".

const DECIMALS = 18;
/** Shown as the asked-for amount until the vault's balance is known: 1,000 $CHOG. */
const DEMO_AMOUNT = parseUnits("1000", DECIMALS);
/** Larger requests are capped (keeps parseUnits away from absurd numbers). */
const MAX_REQUEST_CHOG = 1e12;
const ERC1967_IMPLEMENTATION_SLOT: Hex = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const CALL_OPERATION = 0;
/** trade()'s deadline in the simulation: the pinned block's timestamp plus this. */
const DEADLINE_SECONDS = BigInt(120);
/** isValidSigner's magic value (its own selector): the wallet would execute for that address. */
const VALID_SIGNER: Hex = "0x523e3260";
/** Addresses up to 0xffff: the zero address, precompiles and other system addresses (never a visitor's wallet). */
const SYSTEM_ADDRESS_LIMIT = BigInt(0x10000);

/** Tokenbound AccountV3 errors (all present in the deployed implementation's bytecode), so reverts decode by name. */
const tokenboundErrors = [
  ...tokenboundAccountGuardAbi.filter((item) => item.type === "error"),
  { type: "error", name: "InvalidInput", inputs: [] },
  { type: "error", name: "OwnershipCycle", inputs: [] },
  { type: "error", name: "ContractCreationFailed", inputs: [] },
] as const;
const tbaAbi = [...erc6551AccountAbi, ...tokenboundErrors] as const;
const guardAbi = [...animrTradeGuardAbi, ...tokenboundErrors] as const;

/** The wallet's own refusals: only these, from the AI key, count as "Monad said NO". */
const REFUSALS = new Set(["NotAuthorized", "AccountLocked"]);

export type ProofInput = {
  /** Who the AI agreed to pay (the visitor's address); defaults to DEMO_RECIPIENT. */
  recipient?: Address | null;
  /** $CHOG the AI agreed to send, whole tokens. Missing or <= 0: the vault's whole balance. */
  amountChog?: number | null;
  /** Overrides for tests (an anvil fork, a random operator, a specific Chog or guard). */
  client?: PublicClient;
  tokenId?: number | null;
  operator?: OperatorIdentity;
  guard?: Address | null;
};

/** A proof that wasn't run because all visitors together hit the per-minute cap that protects the public RPC. */
export function busyProof(input: ProofInput): HeistProof {
  return startProof(input).noClaim(
    "busy",
    "Monad checks are busy right now, so this one didn't run and no claim is made. Try “Act as the AI” in a minute.",
  );
}

/** Runs the proof. Never throws: failures come back as kind "no-claim". */
export async function runHeistProof(input: ProofInput): Promise<HeistProof> {
  const client = input.client ?? publicClient;
  const { proof, noClaim, requested, recipientReplaced, tokenId, tba, chog, guard } = startProof(input);
  if (tokenId === null || !tba || !chog) {
    return noClaim("house-unset", "The House Chog hasn't moved in yet, so there is no wallet to check. Nothing was simulated.");
  }

  try {
    // Every read and simulation below uses this one block.
    const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
    proof.blockNumber = blockNumber.toString();
    const at = blockText(blockNumber);

    // (1) Only a 'ready' account can refuse anything. getTokenBoundAccountStatus reads getCode + getStorageAt;
    // this view pins both to the block (it uses nothing else from the client).
    const atBlock = {
      getCode: (args: { address: Address }) => client.getCode({ ...args, blockNumber }),
      getStorageAt: (args: { address: Address; slot: Hex }) => client.getStorageAt({ ...args, blockNumber }),
    } as unknown as PublicClient;
    const status = await getTokenBoundAccountStatus(atBlock, tba);
    proof.tbaStatus = status;
    if (status !== "ready") {
      return noClaim(
        status === "none" ? "tba-none" : "tba-uninitialized",
        status === "none"
          ? `Chog #${tokenId}'s wallet isn't deployed at block ${at}. Any call to an empty address "succeeds", so no claim is made.`
          : `Chog #${tokenId}'s wallet is created but not initialized at block ${at}: it would accept every call and do nothing, so no claim is made.`,
      );
    }

    const [block, implementation, owner, vaultChog, guardCode] = await Promise.all([
      client.getBlock({ blockNumber }),
      client.getStorageAt({ address: tba, slot: ERC1967_IMPLEMENTATION_SLOT, blockNumber }),
      client.readContract({ address: tba, abi: tbaAbi, functionName: "owner", blockNumber }),
      client.readContract({ address: chog, abi: erc20Abi, functionName: "balanceOf", args: [tba], blockNumber }),
      guard ? client.getCode({ address: guard, blockNumber }) : undefined,
    ]);
    proof.implementation = implementation && hexToBigInt(implementation) !== BigInt(0) ? getAddress(`0x${implementation.slice(-40)}`) : null;
    proof.owner = getAddress(owner);
    proof.vaultChog = wholeTokens(vaultChog);
    if (vaultChog === BigInt(0)) {
      return noClaim(
        "vault-empty",
        `Chog #${tokenId}'s wallet holds no $CHOG at block ${at}: there's nothing to refuse yet, so no claim is made.`,
      );
    }

    // The AI key: the guard's own operator() when a guard is deployed, else the configured one, else the stand-in.
    const deployedGuard = guard && guardCode && guardCode !== "0x" ? guard : null;
    const operator = input.operator ?? (await resolveOperator(client, deployedGuard, blockNumber));
    proof.operator = operator.address;
    proof.operatorSource = operator.source;
    const configured = input.operator ? null : operatorFromEnv();
    const otherKey = configured && !isAddressEqual(configured.address, operator.address) ? configured.address : null;

    // The whole balance unless the AI named less.
    const amount = requested === null || requested > vaultChog ? vaultChog : requested;
    proof.amountChog = wholeTokens(amount);
    const who = operatorLabel(operator.source);

    // (2) + (3) Does the wallet accept the key at all? Then the theft itself, and the owner's identical call.
    const execute = {
      address: tba,
      abi: tbaAbi,
      functionName: "execute",
      args: [chog, BigInt(0), encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [proof.recipient, amount] }), CALL_OPERATION],
      blockNumber,
    } as const;
    const [approvals, transfer, control] = await Promise.all([
      Promise.all([operator.address, ...(otherKey ? [otherKey] : [])].map((key) => keyApprovedAt(client, tba, key, blockNumber))),
      simulate(client, { ...execute, account: operator.address }),
      simulate(client, { ...execute, account: proof.owner }),
    ]);
    proof.keyApproved = approvals.some((approved) => approved === true) ? true : approvals.every((approved) => approved === false) ? false : null;
    proof.control = { from: proof.owner, reverted: control.reverted, error: control.error };
    proof.results.push({
      label: `${capitalize(who)} calls the wallet's execute()`,
      from: operator.address,
      to: tba,
      call: `execute(CHOG, 0, transfer(${shortAddress(proof.recipient)}, ${formatAmount(proof.amountChog, 2)} CHOG), CALL)`,
      ...transfer,
      meaning: executeMeaning(transfer, approvals[0] ?? null, control),
    });

    // (4) The AI key's one legitimate door: the guard, which can only swap inside this same wallet.
    if (deployedGuard) {
      const trade = await simulate(client, {
        address: deployedGuard,
        abi: guardAbi,
        functionName: "trade",
        args: [tba, true, amount, BigInt(0), block.timestamp + DEADLINE_SECONDS],
        account: operator.address,
        blockNumber,
      });
      proof.results.push({
        label: `${capitalize(who)} asks the guard to sell the vault's $CHOG`,
        from: operator.address,
        to: deployedGuard,
        call: `trade(${shortAddress(tba)}, sellChog = true, ${formatAmount(proof.amountChog, 2)} CHOG, minOut = 0, deadline)`,
        ...trade,
        meaning: guardMeaning(trade),
      });
    }

    const refused = proof.keyApproved === false && isRefusal(transfer, control);
    if (transfer.reverted && proof.keyApproved !== true && !refused) {
      const ownerSide = control.reverted ? `, and the owner's identical call reverted with ${control.error}` : "";
      return noClaim(
        "inconclusive",
        `At block ${at} the transfer from ${who} reverted with ${transfer.error}${ownerSide}. That doesn't pin the refusal on the key, so no claim is made.`,
      );
    }

    const notes = [`Simulated with eth_call against ${appConfig.chain.name} at block ${at}. Nothing was broadcast.`];
    if (proof.keyApproved) {
      const approvedKeys = [operator.address, ...(otherKey ? [otherKey] : [])].filter((_, i) => approvals[i] === true);
      notes.push(
        `Warning: the wallet accepts ${approvedKeys.map(shortAddress).join(" and ")} as a signer (isValidSigner) at this block, so it would execute for that key. The AI's key should never be approved on the wallet; the owner can revoke it with setPermissions.`,
      );
    }
    if (refused && control.errorName === "AccountLocked") {
      notes.push("The owner has locked this wallet: until the lock expires even the owner's identical call is refused (AccountLocked).");
    }
    if (operator.source === "stand-in") {
      notes.push("No AI operator is configured yet, so a stand-in key was used: any key the owner hasn't approved gets the same answer.");
    }
    if (otherKey) {
      notes.push(
        `The configured AI key (${shortAddress(otherKey)}) isn't the one the guard accepts, so the check used the guard's (${shortAddress(operator.address)}); ${approvals[1] === true ? "the configured key IS approved on the wallet" : "the wallet accepts neither"}.`,
      );
    }
    if (guard && !deployedGuard) notes.push(`No guard contract at ${shortAddress(guard)} on this network, so the guard step was skipped.`);
    if (recipientReplaced) notes.push("The address you named can't receive tokens (the zero address, a system address, the token or this wallet), so the demo address was used.");
    if (proof.implementation && proof.implementation !== getAddress(TOKENBOUND_ACCOUNT_V3_IMPLEMENTATION)) {
      notes.push(`The wallet runs implementation ${shortAddress(proof.implementation)}, not Tokenbound's AccountV3.`);
    }
    return { ...proof, kind: "live", reason: null, note: notes.join(" "), refused };
  } catch (error) {
    console.warn("[animr] heist proof: RPC failure:", describeError(error));
    return noClaim("rpc-error", "Couldn't reach Monad to run the check, so no claim is made. Try again in a moment.");
  }
}

/** The proof's skeleton (everything known before any RPC call) and its no-claim builder. */
function startProof(input: ProofInput) {
  const tokenId = input.tokenId ?? null;
  const guard = input.guard === undefined ? (animrTradeGuardAddress ?? null) : input.guard;
  const chog = appConfig.chogToken;
  const tba = tokenId === null ? null : houseTba(tokenId);
  const named = input.recipient ? getAddress(input.recipient) : null;
  const recipient = named && canReceive(named, tba, chog) ? named : DEMO_RECIPIENT;
  const requested = requestedAmount(input.amountChog);
  // Until the block is known (and the guard can be asked), the configured operator or the labelled stand-in.
  const placeholder = input.operator ?? operatorFromEnv() ?? { address: STAND_IN_OPERATOR, source: "stand-in" as const };

  const proof: HeistProof = {
    kind: "no-claim",
    reason: null,
    note: null,
    blockNumber: null,
    tokenId,
    tba,
    tbaStatus: null,
    owner: null,
    implementation: null,
    vaultChog: null,
    recipient,
    amountChog: wholeTokens(requested ?? DEMO_AMOUNT),
    operator: placeholder.address,
    operatorSource: placeholder.source,
    keyApproved: null,
    control: null,
    guard,
    results: [],
    refused: false,
    explorerUrl: tba ? (explorerAddressUrl(tba) ?? null) : null,
    simulatedAt: new Date().toISOString(),
  };
  // No claim means no results either (an RPC failure can strike after a step was already simulated).
  const noClaim = (reason: NoClaimReason, note: string): HeistProof => ({
    ...proof,
    kind: "no-claim",
    reason,
    note,
    keyApproved: null,
    control: null,
    results: [],
    refused: false,
  });
  return { proof, noClaim, requested, recipientReplaced: named !== null && recipient !== named, tokenId, tba, chog, guard };
}

/** A recipient a transfer can name: not a system address, the token itself or the vault itself. */
function canReceive(address: Address, tba: Address | null, chog: Address | undefined): boolean {
  if (hexToBigInt(address) < SYSTEM_ADDRESS_LIMIT) return false;
  if (tba && isAddressEqual(address, tba)) return false;
  return !(chog && isAddressEqual(address, chog));
}

/**
 * The wallet's refusal of the key itself: NotAuthorized() (or AccountLocked()) for the key, while the owner's identical
 * call goes through, or is stopped by the wallet's own lock (Tokenbound checks the executor before the lock, so a
 * locked wallet answers the key NotAuthorized() and its owner AccountLocked()). Either way the wallet refused before
 * the token was ever called; any other owner-side failure leaves the refusal unproven.
 */
function isRefusal(transfer: Outcome, control: Outcome): boolean {
  if (!transfer.reverted || !transfer.errorName || !REFUSALS.has(transfer.errorName)) return false;
  return !control.reverted || control.errorName === "AccountLocked";
}

/** isValidSigner(key, "0x") at the block: true when the wallet would execute for the key; null when it reverts. */
async function keyApprovedAt(client: PublicClient, tba: Address, key: Address, blockNumber: bigint): Promise<boolean | null> {
  try {
    const magic = await client.readContract({ address: tba, abi: tbaAbi, functionName: "isValidSigner", args: [key, "0x"], blockNumber });
    return magic.toLowerCase() === VALID_SIGNER;
  } catch (error) {
    if (revertOutcome(error) || isZeroData(error)) return null;
    throw error;
  }
}

type SimulateArgs = {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args: readonly unknown[];
  account: Address;
  blockNumber: bigint;
};

/** eth_call through simulateContract. A contract revert is an outcome; anything else (RPC, network) throws. */
async function simulate(client: PublicClient, call: SimulateArgs): Promise<Outcome> {
  try {
    await client.simulateContract(call as Parameters<PublicClient["simulateContract"]>[0]);
    return { reverted: false, error: null, errorName: null };
  } catch (error) {
    const revert = revertOutcome(error);
    if (revert) return revert;
    // The call ran and returned nothing (no revert): treat it as going through.
    if (isZeroData(error)) return { reverted: false, error: null, errorName: null };
    throw error;
  }
}

function executeMeaning(outcome: Outcome, keyApproved: boolean | null, control: Outcome): string {
  if (keyApproved) {
    return outcome.reverted
      ? `The wallet accepts this key (isValidSigner), so it would execute for it; this transfer only failed for another reason (${outcome.error}). That is not a refusal.`
      : "This call would go through: the wallet accepts this key (isValidSigner), so it can move the wallet's tokens. That should never be true for the AI key; it is reported exactly as the chain answered.";
  }
  if (!outcome.reverted) {
    return "This call would go through: this key can move the wallet's tokens. That should never be true for the AI key; it is reported exactly as the chain answered.";
  }
  switch (outcome.errorName) {
    case "NotAuthorized":
      return `Tokenbound's wallet only executes for the Chog's current owner (or an address the owner approved). The AI key isn't one, so the transfer never happens.${control.reverted ? "" : " The same call from the owner goes through, so it's the key that is refused, not the transfer."}`;
    case "AccountLocked":
      return "The owner locked this wallet: nobody can execute anything until the lock expires.";
    default:
      return "The wallet refused the call, so no $CHOG moves.";
  }
}

function guardMeaning(outcome: Outcome): string {
  if (!outcome.reverted) {
    return "The guard would allow this sell, but trade() can only swap $CHOG for WMON back into this same wallet: nothing can reach the recipient.";
  }
  const reason = outcome.error?.match(/^TradeRejected\("(.*)"\)$/)?.[1];
  if (reason === "buy-only vault") return "The vault is buy-only: the guard refuses every sell, so the AI can't even swap $CHOG away.";
  if (reason) return `The guard refused the trade ("${reason}"). And even an allowed trade only swaps inside this wallet.`;
  switch (outcome.errorName) {
    case "NotOperator":
      return "Only the guard's own operator key may call trade(); this key isn't it.";
    case "NotAuthorized":
      return "The owner hasn't let the guard trade this wallet, so even the guard can't touch it.";
    default:
      return "The guard refused the trade. And even an allowed trade only swaps inside this wallet.";
  }
}

/** A requested amount in wei, or null for "everything". */
function requestedAmount(amountChog: number | null | undefined): bigint | null {
  if (typeof amountChog !== "number" || !Number.isFinite(amountChog) || amountChog <= 0) return null;
  const capped = Math.min(amountChog, MAX_REQUEST_CHOG);
  const wei = parseUnits(capped.toFixed(6), DECIMALS);
  return wei > BigInt(0) ? wei : null;
}

/** Whole tokens as a decimal string, trimmed to 6 decimals. */
function wholeTokens(wei: bigint): string {
  const [int, frac = ""] = formatUnits(wei, DECIMALS).split(".");
  const trimmed = frac.slice(0, 6).replace(/0+$/, "");
  return trimmed ? `${int}.${trimmed}` : int;
}

function blockText(blockNumber: bigint): string {
  return blockNumber.toLocaleString("en-US");
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function describeError(error: unknown): string {
  if (error instanceof BaseError) return [error.name, error.shortMessage].filter(Boolean).join(": ");
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
