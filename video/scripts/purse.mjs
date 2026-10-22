// After the Oct 21 Bell settles: finds the real Oracle Purse transfer and the trophy mints on Monad
// (read-only JSON-RPC, nothing is signed or sent) and writes data/purse.json for the purse scene
// and the capture (clips scan_purse, scan_trophy). Also fetches the winners' art into public/chogs/.
//   node scripts/purse.mjs                    (searches from 2026-10-22 15:00 UTC to the latest block)
//   SINCE=2026-10-22T15:00:00Z node scripts/purse.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const RPCS = ["https://rpc.monad.xyz", "https://rpc2.monad.xyz"];
const BELL_DAY = "2026-10-21";
const SINCE = Date.parse(process.env.SINCE || "2026-10-22T15:00:00Z") / 1000;
const CHOG = "0x350035555E10d9AfAF1566AaebfCeD5BA6C27777";
const HOUSE_KEY = "0xbcfD3a3846e39a687901EB77ed05F4E3CdC1e259";
const TROPHIES = "0x7720Ed65f3DdfC4AD812D8A5ACd25762712b513d";
const T_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const T_AWARD = "0xa5646a1ac5def612b4198efe0dd4f42bbfd78652fe28b93756268c646d05ceee"; // TrophyAwarded(uint256,uint256,address,uint256,bytes32)
const KINDS = { 1: "Best call", 2: "Most rekt", 3: "Survived a heist", 4: "First real trade" };
const pad = (a) => "0x" + a.toLowerCase().slice(2).padStart(64, "0");
const hex = (n) => "0x" + n.toString(16);

let id = 0;
async function rpc(method, params) {
  for (let i = 0; i < 8; i++) {
    const url = RPCS[i % RPCS.length];
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(JSON.stringify(j.error));
      return j.result;
    } catch (e) { if (i === 7) throw e; await new Promise((r) => setTimeout(r, 600 * (i + 1))); }
  }
}
const blockTime = async (n) => parseInt((await rpc("eth_getBlockByNumber", [hex(n), false])).timestamp, 16);

const head = parseInt(await rpc("eth_blockNumber", []), 16);
// UNTIL (blocks after the start) caps a test run.
const UNTIL = process.env.UNTIL ? Number(process.env.UNTIL) : null;
let lo = head - 400000, hi = head;
while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if ((await blockTime(mid)) < SINCE) lo = mid; else hi = mid; }
const from = hi;
const latest = UNTIL ? Math.min(head, from + UNTIL) : head;
console.log(`searching blocks ${from}..${latest} (${latest - from} blocks)`);

const logs = [];
const STEP = 100;
const ranges = [];
for (let a = from; a <= latest; a += STEP) ranges.push([a, Math.min(latest, a + STEP - 1)]);
for (let i = 0; i < ranges.length; i += 8) {
  await Promise.all(ranges.slice(i, i + 8).map(async ([a, b]) => {
    const [t, w] = await Promise.all([
      rpc("eth_getLogs", [{ fromBlock: hex(a), toBlock: hex(b), address: CHOG, topics: [T_TRANSFER, pad(HOUSE_KEY)] }]),
      rpc("eth_getLogs", [{ fromBlock: hex(a), toBlock: hex(b), address: TROPHIES, topics: [T_AWARD] }]),
    ]);
    logs.push(...t.map((l) => ({ ...l, kind: "purse" })), ...w.map((l) => ({ ...l, kind: "trophy" })));
  }));
}
const chogs = JSON.parse(readFileSync(join(ROOT, "../data/chogs.json"), "utf8")).chogs;
// "CHOG #1373" (a few collection names carry a suffix after a dash; the film shows the number only).
const nameOf = (tokenId) => (chogs.find((c) => c.id === tokenId)?.name ?? `token ${tokenId}`).split(/\s+[\u2014-]\s+/)[0];
const out = { status: "pending", bellDay: BELL_DAY, checkedAt: new Date().toISOString(), searched: { fromBlock: from, toBlock: latest }, purse: null, trophies: [] };
for (const l of logs.sort((a, b) => parseInt(a.blockNumber, 16) - parseInt(b.blockNumber, 16))) {
  const block = parseInt(l.blockNumber, 16);
  const ts = await blockTime(block);
  const base = { hash: l.transactionHash, blockNumber: block, timestamp: ts, timestampISO: new Date(ts * 1000).toISOString(), explorer: `https://monadscan.com/tx/${l.transactionHash}` };
  if (l.kind === "purse") {
    const wei = BigInt(l.data);
    const to = "0x" + l.topics[2].slice(26);
    out.purse ??= { ...base, from: HOUSE_KEY, to, amountWei: wei.toString(), amount: (Number(wei / 10n ** 14n) / 1e4).toString() };
  } else {
    const chogId = Number(BigInt(l.topics[1])), kind = Number(BigInt(l.topics[2])), account = "0x" + l.topics[3].slice(26);
    const context = BigInt("0x" + l.data.slice(2, 66)).toString();
    out.trophies.push({ ...base, chogId, name: nameOf(chogId), kind, kindName: KINDS[kind] ?? `kind ${kind}`, account, context, forThisBell: context === BELL_DAY.replaceAll("-", "") });
  }
}
// The purse goes into a Chog's wallet: name that Chog from its trophy (same wallet), when there is one.
if (out.purse) {
  const t = out.trophies.find((x) => x.account.toLowerCase() === out.purse.to.toLowerCase());
  if (t) Object.assign(out.purse, { chogId: t.chogId, name: t.name });
}
out.status = out.purse || out.trophies.length ? "found" : "pending";
if (!process.env.DRY) writeFileSync(join(ROOT, "data/purse.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));

// The winners' art, from the collection's IPFS metadata (the same images the app shows).
for (const t of out.trophies) {
  const f = join(ROOT, "public/chogs", `${t.chogId}.webp`);
  if (existsSync(f)) continue;
  const c = chogs.find((x) => x.id === t.chogId);
  const cid = c?.image?.replace("ipfs://", "");
  if (!cid) continue;
  for (const g of ["https://gateway.pinata.cloud/ipfs/", "https://dweb.link/ipfs/", "https://ipfs.io/ipfs/"]) {
    try { const r = await fetch(g + cid); const buf = Buffer.from(await r.arrayBuffer()); if (r.ok && buf.slice(0, 4).toString() === "RIFF") { writeFileSync(f, buf); console.log("art", t.chogId, g); break; } } catch {}
  }
}
