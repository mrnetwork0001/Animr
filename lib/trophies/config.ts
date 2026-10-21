import { type Address, type Hex, encodeAbiParameters, getAddress, keccak256 } from "viem";

// AnimrTrophies (contracts/src/AnimrTrophies.sol): soulbound ERC-1155 trophies minted into each Chog's own ERC-6551
// wallet, so a Chog's history moves with the NFT. Token id = trophy kind; a balance counts how often it was won.
// Everything in lib/trophies no-ops when NEXT_PUBLIC_TROPHIES_ADDRESS is unset. Isomorphic (no secrets here).

// A literal process.env.NEXT_PUBLIC_* read, so Next inlines it at build time.
const trophiesEnv = process.env.NEXT_PUBLIC_TROPHIES_ADDRESS?.trim();

function parseAddress(value: string | undefined): Address | undefined {
  if (!value) return undefined;
  try {
    return getAddress(value);
  } catch {
    return undefined;
  }
}

/** The deployed AnimrTrophies contract, or undefined (the feature is off). */
export const trophiesAddress: Address | undefined = parseAddress(trophiesEnv);

export const TROPHY_KINDS = {
  bestCall: 1,
  mostRekt: 2,
  survivedHeist: 3,
  firstTrade: 4,
} as const;

export type TrophyKind = (typeof TROPHY_KINDS)[keyof typeof TROPHY_KINDS];

export type TrophyInfo = {
  kind: TrophyKind;
  name: string;
  /** One line for the cabinet. */
  blurb: string;
  /** ERC-1155 metadata description. */
  description: string;
  /** Badge colour (v2 palette). */
  color: string;
  /** "daily" kinds can be won once per UTC day (context = YYYYMMDD); "once" kinds once per Chog (context = id). */
  scope: "daily" | "once";
};

export const TROPHIES: readonly TrophyInfo[] = [
  {
    kind: 1,
    name: "Best call",
    blurb: "Closest call on a live Daily Bell",
    description:
      "Oracle of the Day: this Chog made the closest call on a live Animr Daily Bell, settled against the real CHOG/WMON price 24 hours later.",
    color: "#9ff0ec",
    scope: "daily",
  },
  {
    kind: 2,
    name: "Most rekt",
    blurb: "Furthest call on a live Daily Bell",
    description:
      "This Chog made the furthest call from the real CHOG/WMON move on a live Animr Daily Bell. Owned with pride.",
    color: "#ff7a8a",
    scope: "daily",
  },
  {
    kind: 3,
    name: "Survived a heist",
    blurb: "Its AI said yes to a robber, Monad said no",
    description:
      "A robber talked the House Chog's AI into paying out, and AnimrTradeGuard refused the transfer on Monad: the AI can trade the vault but never withdraw from it.",
    color: "#a99bf3",
    scope: "daily",
  },
  {
    kind: 4,
    name: "First real trade",
    blurb: "First trade through the guard",
    description:
      "This Chog's AI made its first real CHOG/WMON trade inside its own wallet, within its owner's limits on AnimrTradeGuard.",
    color: "#f2c16b",
    scope: "once",
  },
];

export function trophyInfo(kind: number): TrophyInfo | undefined {
  return TROPHIES.find((trophy) => trophy.kind === kind);
}

/** "1", "0x1", "0000…0001" (ERC-1155 {id}) or with ".json" -> 1; null when it isn't a small id. */
export function parseTrophyId(raw: string): number | null {
  const id = raw.replace(/\.json$/i, "").trim().toLowerCase();
  let value: bigint;
  if (/^[0-9a-f]{64}$/.test(id)) value = BigInt(`0x${id}`);
  else if (/^0x[0-9a-f]{1,64}$/.test(id)) value = BigInt(id);
  else if (/^\d{1,6}$/.test(id)) value = BigInt(id);
  else return null;
  return value <= BigInt(1_000_000) ? Number(value) : null;
}

/** "2026-10-21" (or a timestamp in ms) -> 20261021, the context of a once-a-day award. */
export function dayContext(day: string | number): bigint {
  const iso = typeof day === "number" ? new Date(day).toISOString().slice(0, 10) : day;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`Not a UTC day: ${iso}`);
  return BigInt(iso.replaceAll("-", ""));
}

/** The contract's idempotency key: keccak256(abi.encode(kind, context)). */
export function awardKey(kind: number, context: bigint): Hex {
  return keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [BigInt(kind), context]));
}

/** The subset of the AnimrTrophies ABI the app uses (`forge inspect AnimrTrophies abi`). */
export const animrTrophiesAbi = [
  {
    type: "function",
    name: "award",
    stateMutability: "nonpayable",
    inputs: [
      { name: "chogId", type: "uint256" },
      { name: "kind", type: "uint256" },
      { name: "context", type: "uint256" },
    ],
    outputs: [{ name: "account", type: "address" }],
  },
  {
    type: "function",
    name: "awarded",
    stateMutability: "view",
    inputs: [{ name: "key", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "accountOf",
    stateMutability: "view",
    inputs: [{ name: "chogId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "balanceOfBatch",
    stateMutability: "view",
    inputs: [
      { name: "accounts", type: "address[]" },
      { name: "ids", type: "uint256[]" },
    ],
    outputs: [{ name: "balances", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "minter",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  { type: "error", name: "AlreadyAwarded", inputs: [{ name: "key", type: "bytes32" }] },
  { type: "error", name: "KindDisabled", inputs: [{ name: "kind", type: "uint256" }] },
  { type: "error", name: "NotMinter", inputs: [] },
  { type: "error", name: "UnsafeRecipient", inputs: [{ name: "account", type: "address" }] },
  { type: "error", name: "Soulbound", inputs: [] },
  {
    type: "event",
    name: "TrophyAwarded",
    inputs: [
      { name: "chogId", type: "uint256", indexed: true },
      { name: "kind", type: "uint256", indexed: true },
      { name: "account", type: "address", indexed: true },
      { name: "context", type: "uint256", indexed: false },
      { name: "key", type: "bytes32", indexed: false },
    ],
  },
] as const;
