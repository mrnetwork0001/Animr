import {
  type Address,
  type Hex,
  type PublicClient,
  concat,
  encodeFunctionData,
  getContractAddress,
  hexToBigInt,
  multicall3Abi,
  pad,
  toHex,
  zeroHash,
} from "viem";

/**
 * Canonical ERC-6551 Registry (v0.3.1). It is deployed at the same address on
 * every EVM chain, including Monad mainnet (143) and Monad testnet (10143).
 */
export const ERC6551_REGISTRY_ADDRESS =
  "0x000000006551c19487814612e58FE06813775758" as const;

/**
 * Tokenbound V3 accounts are AccountProxy clones that must be initialized with
 * this implementation after `createAccount`. Until then the proxy delegates to
 * address(0): every call "succeeds" and does nothing (owner() returns 0x).
 */
export const TOKENBOUND_ACCOUNT_V3_IMPLEMENTATION =
  "0x41C8f39463A868d3A88af00cd0fe7102F30E44eC" as const;

/** Canonical Multicall3, used to create + initialize an account in one transaction. */
export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

const ERC1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;

export const tokenboundAccountProxyAbi = [
  {
    type: "function",
    name: "initialize",
    stateMutability: "nonpayable",
    inputs: [{ name: "implementation", type: "address" }],
    outputs: [],
  },
] as const;

export const erc6551RegistryAbi = [
  {
    type: "function",
    name: "createAccount",
    stateMutability: "nonpayable",
    inputs: [
      { name: "implementation", type: "address" },
      { name: "salt", type: "bytes32" },
      { name: "chainId", type: "uint256" },
      { name: "tokenContract", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [{ name: "account", type: "address" }],
  },
  {
    type: "function",
    name: "account",
    stateMutability: "view",
    inputs: [
      { name: "implementation", type: "address" },
      { name: "salt", type: "bytes32" },
      { name: "chainId", type: "uint256" },
      { name: "tokenContract", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [{ name: "account", type: "address" }],
  },
  {
    type: "event",
    name: "ERC6551AccountCreated",
    inputs: [
      { name: "account", type: "address", indexed: false },
      { name: "implementation", type: "address", indexed: true },
      { name: "salt", type: "bytes32", indexed: false },
      { name: "chainId", type: "uint256", indexed: false },
      { name: "tokenContract", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  },
  { type: "error", name: "AccountCreationFailed", inputs: [] },
] as const;

/** IERC6551Account + IERC6551Executable — the functions every compliant account exposes. */
export const erc6551AccountAbi = [
  {
    type: "function",
    name: "token",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "chainId", type: "uint256" },
      { name: "tokenContract", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "state",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "isValidSigner",
    stateMutability: "view",
    inputs: [
      { name: "signer", type: "address" },
      { name: "context", type: "bytes" },
    ],
    outputs: [{ name: "magicValue", type: "bytes4" }],
  },
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "operation", type: "uint8" },
    ],
    outputs: [{ name: "result", type: "bytes" }],
  },
] as const;

export type TokenBoundAccountParams = {
  /** Account implementation the registry clones (the TBA address depends on it). */
  implementation: Address;
  /** NFT contract that owns the account (the Chog collection). */
  tokenContract: Address;
  tokenId: bigint;
  /** Chain the NFT lives on — not necessarily the chain the account is deployed on. */
  chainId: number | bigint;
  /** Defaults to bytes32(0), the convention used by Tokenbound. */
  salt?: Hex;
  /** Defaults to the canonical registry. */
  registry?: Address;
};

// Registry v0.3.1 deploys: ERC-1167 constructor (10 bytes) + ERC-1167 runtime
// header (10 bytes) + implementation (20) + ERC-1167 footer (15) + salt (32) +
// chainId (32) + tokenContract (32) + tokenId (32), and CREATE2s it with `salt`.
const ERC1167_CONSTRUCTOR_AND_HEADER = "0x3d60ad80600a3d3981f3363d3d373d3d3d363d73";
const ERC1167_FOOTER = "0x5af43d82803e903d91602b57fd5bf3";

/** Creation code the registry deploys for this account (183 bytes). */
export function tokenBoundAccountInitCode(params: TokenBoundAccountParams): Hex {
  return concat([
    ERC1167_CONSTRUCTOR_AND_HEADER,
    params.implementation,
    ERC1167_FOOTER,
    pad(params.salt ?? zeroHash, { size: 32 }),
    toHex(BigInt(params.chainId), { size: 32 }),
    pad(params.tokenContract, { size: 32 }),
    toHex(params.tokenId, { size: 32 }),
  ]);
}

/**
 * Computes the Token Bound Account address locally (no RPC call). Matches
 * `registry.account(...)` and works before the account is deployed — tokens sent
 * to a counterfactual address are safe and usable once `createAccount` runs.
 */
export function computeTokenBoundAccount(params: TokenBoundAccountParams): Address {
  return getContractAddress({
    opcode: "CREATE2",
    from: params.registry ?? ERC6551_REGISTRY_ADDRESS,
    salt: pad(params.salt ?? zeroHash, { size: 32 }),
    bytecode: tokenBoundAccountInitCode(params),
  });
}

function registryArgs(params: TokenBoundAccountParams) {
  return [
    params.implementation,
    pad(params.salt ?? zeroHash, { size: 32 }),
    BigInt(params.chainId),
    params.tokenContract,
    params.tokenId,
  ] as const;
}

/** Asks the registry for the account address (useful to cross-check the local computation). */
export function getTokenBoundAccountOnchain(
  client: PublicClient,
  params: TokenBoundAccountParams,
): Promise<Address> {
  return client.readContract({
    address: params.registry ?? ERC6551_REGISTRY_ADDRESS,
    abi: erc6551RegistryAbi,
    functionName: "account",
    args: registryArgs(params),
  });
}

/** True once `createAccount` has been called (the address has code). Not necessarily usable: see getTokenBoundAccountStatus. */
export async function isTokenBoundAccountDeployed(
  client: PublicClient,
  account: Address,
): Promise<boolean> {
  const code = await client.getCode({ address: account });
  return code !== undefined && code !== "0x";
}

/**
 * - "none": nothing deployed yet (tokens can still be sent to the address).
 * - "uninitialized": created but the proxy has no implementation — unusable.
 * - "ready": created and initialized; owner() / execute() work.
 */
export type TokenBoundAccountStatus = "none" | "uninitialized" | "ready";

export async function getTokenBoundAccountStatus(
  client: PublicClient,
  account: Address,
): Promise<TokenBoundAccountStatus> {
  const [code, implementationSlot] = await Promise.all([
    client.getCode({ address: account }),
    client.getStorageAt({ address: account, slot: ERC1967_IMPLEMENTATION_SLOT }),
  ]);
  if (code === undefined || code === "0x") return "none";
  return implementationSlot && hexToBigInt(implementationSlot) !== BigInt(0) ? "ready" : "uninitialized";
}

/** Contract call for `registry.createAccount` alone. For Tokenbound accounts use createAndInitializeAccountRequest. */
export function createTokenBoundAccountRequest(params: TokenBoundAccountParams) {
  return {
    address: params.registry ?? ERC6551_REGISTRY_ADDRESS,
    abi: erc6551RegistryAbi,
    functionName: "createAccount",
    args: registryArgs(params),
  } as const;
}

/**
 * One transaction that makes a Tokenbound account usable: Multicall3.aggregate3 of
 * createAccount (when status is "none") and initialize. Both calls are
 * permissionless, so anyone can send it. Returns null when the account is ready.
 * (initialize reverts with AlreadyInitialized on a ready account, so check first.)
 */
export function createAndInitializeAccountRequest(
  params: TokenBoundAccountParams,
  status: TokenBoundAccountStatus,
) {
  if (status === "ready") return null;
  const account = computeTokenBoundAccount(params);
  const calls = [
    ...(status === "none"
      ? [
          {
            target: params.registry ?? ERC6551_REGISTRY_ADDRESS,
            allowFailure: false,
            callData: encodeFunctionData({
              abi: erc6551RegistryAbi,
              functionName: "createAccount",
              args: registryArgs(params),
            }),
          },
        ]
      : []),
    {
      target: account,
      allowFailure: false,
      callData: encodeFunctionData({
        abi: tokenboundAccountProxyAbi,
        functionName: "initialize",
        args: [TOKENBOUND_ACCOUNT_V3_IMPLEMENTATION],
      }),
    },
  ];
  return {
    address: MULTICALL3_ADDRESS,
    abi: multicall3Abi,
    functionName: "aggregate3",
    args: [calls],
  } as const;
}
