/**
 * Sends a settled Daily Bell's Oracle Purse: ORACLE_PURSE_CHOG $CHOG (default 5000) from the House key into the
 * winning Chog's own ERC-6551 wallet, then records the transfer where the Bell page reads it
 * (animr:bell:purse:<day>, lib/bell/purse.ts). The winner is the Oracle of the Day; when that is the House Chog
 * (HOUSE_CHOG_TOKEN_ID), or a Chog whose holder hid it, the next-closest call takes the purse.
 *
 * Run from the repo root (jiti resolves the "@/..." imports from tsconfig.json):
 *
 *   JITI_TSCONFIG_PATHS=1 npx jiti scripts/send-oracle-purse.mts [--day YYYY-MM-DD] [--broadcast]
 *                                                                [--rpc-url <url>] [--no-record] [--local-store]
 *
 *   e.g. ANIMR_ENV=production JITI_TSCONFIG_PATHS=1 npx jiti scripts/send-oracle-purse.mts            (check)
 *        ANIMR_ENV=production JITI_TSCONFIG_PATHS=1 npx jiti scripts/send-oracle-purse.mts --broadcast (send)
 *
 * DRY RUN BY DEFAULT: it reads the Bell, picks the winner, computes its wallet, checks the House balances, simulates
 * the transfer and estimates its gas, prints what it would send, and changes nothing. Only --broadcast signs and
 * sends it, waits for the receipt and records it. One purse per Bell: the record is claimed atomically before the
 * broadcast, a re-run after a confirmed purse does nothing, and a re-run after a crash settles the pending record
 * from the chain (confirmed, or cleared when the transfer reverted or never landed).
 *
 *   --day        the Bell (UTC date); default: the newest settled live Bell
 *   --broadcast  really send it (Monad mainnet unless --rpc-url says otherwise)
 *   --rpc-url    another RPC, e.g. an anvil fork (anvil --fork-url https://rpc.monad.xyz --port 8571). On a local
 *                dev node (anvil, hardhat) nothing is recorded in Redis: use the file store, or --no-record
 *   --no-record  never write the KV record (tests)
 *   --local-store  allow --broadcast on a real chain with Bells from this machine's file store (.data/kv): only when
 *                this machine serves the site. Otherwise the Bells must come from the live site's Redis.
 *
 * Environment (.env.local is loaded when present; variables already set in the shell win):
 *   HOUSE_PRIVATE_KEY   the House hot key that pays (required for --broadcast). Only its address is ever printed.
 *   HOUSE_ADDRESS       optional: must match HOUSE_PRIVATE_KEY's address; enough on its own for a dry run
 *   ORACLE_PURSE_CHOG   whole $CHOG per purse (default 5000; 0 = no purse)
 *   HOUSE_CHOG_TOKEN_ID the House Chog: never paid, its runner-up is
 *   UPSTASH_REDIS_REST_URL / _TOKEN (or KV_REST_API_*) and ANIMR_ENV: where the Bells live. The live site on Vercel
 *                       reads namespace "production": run with ANIMR_ENV=production. --broadcast refuses Redis
 *                       without an explicit ANIMR_ENV, so a purse is never paid from (and recorded in) the wrong one.
 *   NEXT_PUBLIC_RPC_URL the RPC (default https://rpc.monad.xyz)
 *
 * Gas: Monad charges the gas limit, not the gas used, so the limit is the node's estimate x1.1, set explicitly.
 */
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  type Address,
  type Hex,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  formatEther,
  formatUnits,
  getAddress,
  http,
  isAddress,
  isAddressEqual,
  keccak256,
  parseEventLogs,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const { values: args } = parseArgs({
  allowPositionals: true, // jiti may pass the script path through
  options: {
    day: { type: "string" },
    broadcast: { type: "boolean", default: false },
    "rpc-url": { type: "string" },
    "no-record": { type: "boolean", default: false },
    "local-store": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (args.help) {
  console.log(
    "Usage: JITI_TSCONFIG_PATHS=1 npx jiti scripts/send-oracle-purse.mts [--day YYYY-MM-DD] [--broadcast] [--rpc-url URL] [--no-record] [--local-store]",
  );
  console.log("Dry run by default. See the header of scripts/send-oracle-purse.mts for the environment it needs.");
  process.exit(0);
}

// The app's modules read the environment when they load (lib/config.ts, lib/kv.ts): load .env.local first, then
// import them.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const { getKv, KV_NAMESPACE } = await import("../lib/kv");
const { appConfig } = await import("../lib/config");
const { explorerTxUrl } = await import("../lib/format");
const { houseChogTokenId } = await import("../lib/heist/config");
const { bellDays, readSummary } = await import("../lib/bell/store");
const { parseDay } = await import("../lib/bell/rules");
const { loadVisibility } = await import("../lib/visibility");
const purse = await import("../lib/bell/purse");
type OraclePurseRecord = import("../lib/bell/purse").OraclePurseRecord;
type BellSummary = import("../lib/bell/types").BellSummary;

const broadcast = args.broadcast;
const record = !args["no-record"];
const GAS_HEADROOM_NUM = BigInt(11); // x1.1
const GAS_HEADROOM_DEN = BigInt(10);
const RECEIPT_TIMEOUT_MS = 120_000;

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

/** The explorer link, or the bare hash on a local dev node (its transactions aren't on the explorer). */
const txLink = (hash: Hex) => (devNode ? `${hash} (local dev node: not on the explorer)` : (explorerTxUrl(hash) ?? hash));
const fmtChog = (wei: bigint) => `${Number(formatUnits(wei, 18)).toLocaleString("en-US", { maximumFractionDigits: 4 })} $CHOG`;
const fmtMon = (wei: bigint) => `${Number(formatEther(wei)).toLocaleString("en-US", { maximumFractionDigits: 6 })} MON`;

// --- The House key: only its address is ever printed --------------------------------------------------------------

function houseAccount() {
  const raw = process.env.HOUSE_PRIVATE_KEY?.trim();
  if (!raw) return null;
  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) fail("HOUSE_PRIVATE_KEY is not a 32-byte hex key (its value is not printed).");
  try {
    return privateKeyToAccount(key);
  } catch {
    fail("HOUSE_PRIVATE_KEY is not a valid private key (its value is not printed).");
  }
}

const account = houseAccount();
const configuredAddress = process.env.HOUSE_ADDRESS?.trim();
if (configuredAddress && !isAddress(configuredAddress, { strict: false })) fail("HOUSE_ADDRESS is not an address.");
if (account && configuredAddress && !isAddressEqual(account.address, getAddress(configuredAddress))) {
  fail(`HOUSE_ADDRESS (${getAddress(configuredAddress)}) is not HOUSE_PRIVATE_KEY's address (${account.address}).`);
}
const house: Address | null = account?.address ?? (configuredAddress ? getAddress(configuredAddress) : null);
if (!house) fail("Set HOUSE_PRIVATE_KEY (or HOUSE_ADDRESS for a dry run).");
if (broadcast && !account) fail("--broadcast needs HOUSE_PRIVATE_KEY.");

// --- Chain ----------------------------------------------------------------------------------------------------------

const rpcUrl = args["rpc-url"] || appConfig.rpcUrl;
const chain = appConfig.chain;
const client = createPublicClient({ chain, transport: http(rpcUrl), pollingInterval: 1_000 });
const chainId = await client.getChainId();
if (chainId !== chain.id) fail(`The RPC is on chain ${chainId}, not ${chain.name} (${chain.id}).`);
const clientVersion = await client.request({ method: "web3_clientVersion" }).catch(() => "");
const devNode = /anvil|hardhat|ganache/i.test(String(clientVersion));
const chog = appConfig.chogToken;
if (!chog) fail(`No $CHOG token is configured on ${chain.name}.`);

// --- Where the Bells live ---------------------------------------------------------------------------------------------

const kv = getKv();
const store = kv.kind === "redis" ? `Redis, namespace "${KV_NAMESPACE}"` : "local file store (.data/kv or ANIMR_DATA_DIR)";
// Without a record, the "never paid twice" check can't see the transfer, so a re-run would pay the same Bell again.
if (broadcast && !record && !devNode) {
  fail("--broadcast --no-record only runs against a local dev node: a real purse is always recorded, so it is never paid twice.");
}
if (broadcast && record && kv.kind === "redis" && !process.env.ANIMR_ENV) {
  fail(`Refusing to pay from Redis namespace "${KV_NAMESPACE}" by default. Set ANIMR_ENV to the live site's namespace (production on Vercel).`);
}
if (broadcast && record && kv.kind === "redis" && devNode) {
  fail(`${clientVersion} is a local dev node: its transfers aren't real, so they never go into Redis. Use the file store or --no-record.`);
}
if (broadcast && kv.kind === "file" && !devNode && !args["local-store"]) {
  fail(
    "These Bells come from this machine's file store, not the live site's Redis. To pay the live site's Oracle, set " +
      "UPSTASH_REDIS_REST_URL/TOKEN and ANIMR_ENV=production; pass --local-store only if this machine serves the site.",
  );
}

async function pickBell(): Promise<BellSummary> {
  if (args.day) {
    const day = parseDay(args.day);
    if (!day) fail(`--day ${args.day} is not a UTC date (YYYY-MM-DD).`);
    const summary = await readSummary(day);
    if (!summary) fail(`No Bell rang on ${day} (${store}).`);
    return summary;
  }
  const days = (await bellDays("live")).reverse();
  for (const day of days) {
    const summary = await readSummary(day);
    if (summary?.status === "settled") return summary;
  }
  fail(`No settled live Bell yet (${store}). The first live Bell settles 24h after it rings.`);
}

console.log(`Oracle Purse · ${broadcast ? "BROADCAST" : "dry run (nothing is sent; add --broadcast to send)"}`);
console.log(`  chain   ${chain.name} (${chainId}) via ${rpcUrl}${devNode ? `  [local dev node: ${clientVersion}]` : ""}`);
console.log(`  bells   ${store}${record ? "" : "  [--no-record: no KV writes]"}`);

const bell = await pickBell();
if (bell.kind !== "live") fail(`The ${bell.day} Bell is a replay: only live Bells carry a purse.`);
if (bell.status !== "settled" || bell.actualPct === null) fail(`The ${bell.day} Bell hasn't settled yet (horizon ${bell.horizonAt}).`);
console.log(`  bell    ${bell.day} · $CHOG moved ${bell.actualPct > 0 ? "+" : ""}${bell.actualPct}% · ${bell.calls} calls`);
if (bell.oracle) {
  console.log(`  oracle  Chog #${bell.oracle.tokenId} (${bell.oracle.name}) called ${bell.oracle.forecastPct}%, off by ${bell.oracle.errorPts} pts`);
}

// --- An earlier attempt for this Bell ---------------------------------------------------------------------------------

/** The nonce of a cleared attempt that never landed: a re-send reuses it, so at most one of the two can ever be mined. */
let reuseNonce: number | undefined;

async function settleEarlierAttempt(existing: OraclePurseRecord): Promise<"confirmed" | "cleared" | "in-flight"> {
  const receipt = await client.getTransactionReceipt({ hash: existing.txHash }).catch(() => null);
  if (receipt?.status === "success") {
    console.log(`  earlier transfer ${existing.txHash} succeeded in block ${receipt.blockNumber}.`);
    if (broadcast && record) await purse.writePurse({ ...existing, status: "confirmed", blockNumber: receipt.blockNumber.toString() });
    console.log(broadcast && record ? "  recorded it as confirmed." : "  (dry run: --broadcast records it as confirmed.)");
    return "confirmed";
  }
  if (receipt?.status === "reverted") {
    console.log(`  earlier transfer ${existing.txHash} REVERTED (block ${receipt.blockNumber}): nothing was paid.`);
  } else {
    const tx = await client.getTransaction({ hash: existing.txHash }).catch(() => null);
    if (tx) {
      console.log(`  earlier transfer ${existing.txHash} is still waiting for a block. Re-run in a minute.`);
      return "in-flight";
    }
    const age = Date.now() - Date.parse(existing.sentAt);
    if (age < 5 * 60_000) {
      console.log(`  earlier transfer ${existing.txHash} isn't visible yet (sent ${Math.round(age / 1000)}s ago). Re-run in a few minutes.`);
      return "in-flight";
    }
    console.log(`  earlier transfer ${existing.txHash} never landed: nothing was paid.`);
    // Not mined: sign the fresh one with the same nonce, so a slow first transfer and the new one can't both land.
    if (typeof existing.nonce === "number") reuseNonce = existing.nonce;
  }
  if (broadcast && record) await purse.clearPurse(bell.day);
  console.log(broadcast && record ? "  cleared its record; sending a fresh one." : "  (dry run: --broadcast clears it and sends a fresh one.)");
  return "cleared";
}

// Read even with --no-record: a Bell that already has a purse is never paid twice.
const existing = await purse.readPurse(bell.day);
if (existing?.status === "confirmed") {
  console.log(`\n✓ Already paid: ${existing.amount} $CHOG to Chog #${existing.tokenId}'s wallet ${existing.tba}`);
  console.log(`  ${txLink(existing.txHash)}`);
  process.exit(0);
}
if (existing) {
  if (!record) fail(`The ${bell.day} Bell has a pending purse record (${existing.txHash}): run without --no-record to settle it first.`);
  console.log(`  found a pending purse record for ${bell.day} (Chog #${existing.tokenId}, ${existing.amount} $CHOG):`);
  const outcome = await settleEarlierAttempt(existing);
  if (outcome !== "cleared") process.exit(outcome === "in-flight" ? 2 : 0);
}

// --- Winner, wallet and amount ----------------------------------------------------------------------------------------

const visibility = await loadVisibility();
const houseId = houseChogTokenId();
const winner = await purse.purseWinner(bell, { visibility });
if (!winner) fail(`The ${bell.day} Bell has no eligible winner.`);
if (bell.oracle && winner.tokenId !== bell.oracle.tokenId) {
  const why = bell.oracle.tokenId === houseId ? "is the House Chog (it never pays itself)" : "was hidden by its holder";
  console.log(`  winner  runner-up Chog #${winner.tokenId} (${winner.name}): the Oracle ${why}`);
} else {
  console.log(`  winner  Chog #${winner.tokenId} (${winner.name})${houseId === null ? "" : `; House Chog is #${houseId}`}`);
}
const tba = purse.chogWallet(winner.tokenId);
if (!tba) fail("No Chog collection or account implementation is configured.");
const amount = purse.purseAmountChog();
if (amount === null) fail(`ORACLE_PURSE_CHOG=${process.env.ORACLE_PURSE_CHOG} is not an amount of $CHOG.`);
if (Number(amount) <= 0) {
  console.log("\nORACLE_PURSE_CHOG is 0: purses are off. Nothing to send.");
  process.exit(0);
}
const decimals = await client.readContract({ address: chog, abi: erc20Abi, functionName: "decimals" });
const amountWei = parseUnits(amount, decimals);
console.log(`  to      ${tba} (Chog #${winner.tokenId}'s ERC-6551 wallet)`);
console.log(`  amount  ${fmtChog(amountWei)}`);

// --- Balances, simulation and gas --------------------------------------------------------------------------------------

const [houseChog, houseMon, walletChogBefore] = await Promise.all([
  client.readContract({ address: chog, abi: erc20Abi, functionName: "balanceOf", args: [house] }),
  client.getBalance({ address: house }),
  client.readContract({ address: chog, abi: erc20Abi, functionName: "balanceOf", args: [tba] }),
]);
console.log(`  from    ${house} (House key) · holds ${fmtChog(houseChog)} and ${fmtMon(houseMon)}`);
if (houseChog < amountWei) {
  fail(`The House key holds ${fmtChog(houseChog)}: ${fmtChog(amountWei - houseChog)} short of the purse. Fund it, then re-run.`);
}

const transfer = { address: chog, abi: erc20Abi, functionName: "transfer", args: [tba, amountWei], account: house } as const;
try {
  const { result } = await client.simulateContract(transfer);
  if (result !== true) fail("The $CHOG transfer simulates without returning true.");
} catch (error) {
  fail(`The $CHOG transfer would revert: ${(error as Error).message.split("\n")[0]}`);
}
const estimate = await client.estimateContractGas(transfer);
const gas = (estimate * GAS_HEADROOM_NUM + GAS_HEADROOM_DEN - BigInt(1)) / GAS_HEADROOM_DEN;
const fees = await client.estimateFeesPerGas();
const maxCost = gas * fees.maxFeePerGas;
console.log(`  gas     limit ${gas} (estimate ${estimate} x1.1: Monad charges the limit) · max fee ${formatUnits(fees.maxFeePerGas, 9)} gwei · up to ${fmtMon(maxCost)}`);
if (houseMon < maxCost) fail(`The House key holds ${fmtMon(houseMon)}: not enough MON for gas (up to ${fmtMon(maxCost)}).`);

if (!broadcast) {
  console.log(`\nDry run: would send ${fmtChog(amountWei)} from ${house} to ${tba} (Chog #${winner.tokenId}) for the ${bell.day} Bell.`);
  console.log("Nothing was signed or sent, and nothing was recorded. Re-run with --broadcast to send it.");
  process.exit(0);
}

// --- Broadcast ---------------------------------------------------------------------------------------------------------

const signer = account!;
const wallet = createWalletClient({ account: signer, chain, transport: http(rpcUrl) });
const nonce = reuseNonce ?? (await client.getTransactionCount({ address: house, blockTag: "pending" }));
if (reuseNonce !== undefined) console.log(`  nonce   ${nonce} (the earlier attempt's: only one of the two can be mined)`);
const serialized = await wallet.signTransaction({
  to: chog,
  data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [tba, amountWei] }),
  value: BigInt(0),
  gas,
  maxFeePerGas: fees.maxFeePerGas,
  maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
  nonce,
  chainId,
  type: "eip1559",
});
const txHash = keccak256(serialized);
const pending: OraclePurseRecord = {
  day: bell.day,
  tokenId: winner.tokenId,
  tba,
  amount,
  txHash,
  from: house,
  nonce,
  status: "pending",
  sentAt: new Date().toISOString(),
};
// Claimed before the broadcast: one purse per Bell, even with two runs at once.
if (record && !(await purse.claimPurse(pending))) {
  const other = await purse.readPurse(bell.day);
  fail(`Another run already claimed the ${bell.day} purse (${other?.txHash ?? "unknown tx"}). Re-run to check it.`);
}

let sent: Hex;
try {
  sent = await client.sendRawTransaction({ serializedTransaction: serialized });
} catch (error) {
  // The node may still have taken it: look before dropping the claim.
  await new Promise((resolve) => setTimeout(resolve, 3_000));
  const seen = await client.getTransaction({ hash: txHash }).catch(() => null);
  if (!seen) {
    if (record) await purse.clearPurse(bell.day);
    fail(`Sending failed and the transfer isn't on the node: ${(error as Error).message.split("\n")[0]}`);
  }
  sent = txHash;
}
if (sent.toLowerCase() !== txHash.toLowerCase()) console.warn(`  note: the node returned ${sent} for ${txHash}`);
console.log(`\n→ sent ${txHash}`);
console.log(`  ${txLink(txHash)}`);

const receipt = await client.waitForTransactionReceipt({ hash: txHash, timeout: RECEIPT_TIMEOUT_MS }).catch(() => null);
if (!receipt) {
  console.log(`  No receipt within ${RECEIPT_TIMEOUT_MS / 1000}s. The record stays pending: re-run later to settle it from the chain.`);
  process.exit(2);
}
if (receipt.status !== "success") {
  if (record) await purse.clearPurse(bell.day);
  fail(`The transfer reverted in block ${receipt.blockNumber} (gas used ${receipt.gasUsed}). Nothing was paid; the record is cleared.`);
}
const paid = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs }).find(
  (log) =>
    isAddressEqual(log.address, chog) &&
    isAddressEqual(log.args.from, house) &&
    isAddressEqual(log.args.to, tba) &&
    log.args.value === amountWei,
);
if (!paid) fail(`The receipt has no Transfer of ${fmtChog(amountWei)} to ${tba}: check ${txHash} by hand (record left pending).`);
const walletChogAfter = await client.readContract({
  address: chog,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [tba],
  blockNumber: receipt.blockNumber,
});
if (record) await purse.writePurse({ ...pending, status: "confirmed", blockNumber: receipt.blockNumber.toString() });
console.log(`\n✓ Paid ${fmtChog(amountWei)} into Chog #${winner.tokenId}'s wallet in block ${receipt.blockNumber}.`);
console.log(`  wallet balance ${fmtChog(walletChogBefore)} -> ${fmtChog(walletChogAfter)} · gas used ${receipt.gasUsed} of ${gas}`);
console.log(record ? `  recorded for the Bell page (${store}).` : "  --no-record: not recorded.");
