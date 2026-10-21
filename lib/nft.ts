import { type Address, erc721Abi } from "viem";
import { publicClient } from "./clients";

export type NftAttribute = { trait_type: string; value: string };

export type NftMetadata = {
  name?: string;
  description?: string;
  /** Already resolved to an https URL. */
  image?: string;
  attributes: NftAttribute[];
};

// ipfs.io and dweb.link answer 429 to every gateway request; Filebase serves the Chog
// metadata and images fast, with CORS enabled.
const IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://ipfs.filebase.io/ipfs/";

/** Turns ipfs:// and ar:// URIs into fetchable https URLs. */
export function resolveUri(uri: string): string {
  if (uri.startsWith("ipfs://")) return IPFS_GATEWAY + uri.slice("ipfs://".length).replace(/^ipfs\//, "");
  if (uri.startsWith("ar://")) return `https://arweave.net/${uri.slice("ar://".length)}`;
  return uri;
}

async function loadJson(uri: string): Promise<unknown> {
  const base64Prefix = "data:application/json;base64,";
  if (uri.startsWith(base64Prefix)) return JSON.parse(atob(uri.slice(base64Prefix.length)));
  if (uri.startsWith("data:application/json")) {
    return JSON.parse(decodeURIComponent(uri.slice(uri.indexOf(",") + 1)));
  }
  const res = await fetch(resolveUri(uri), { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`metadata fetch failed: ${res.status}`);
  return res.json();
}

function normalize(raw: unknown): NftMetadata {
  const data = (raw ?? {}) as Record<string, unknown>;
  const attributes = Array.isArray(data.attributes)
    ? data.attributes.flatMap((a) => {
        const attr = a as Record<string, unknown>;
        if (attr?.trait_type === undefined || attr?.value === undefined) return [];
        return [{ trait_type: String(attr.trait_type), value: String(attr.value) }];
      })
    : [];
  const image = typeof data.image === "string" ? resolveUri(data.image) : undefined;
  return {
    name: typeof data.name === "string" ? data.name : undefined,
    description: typeof data.description === "string" ? data.description : undefined,
    image,
    attributes,
  };
}

/** Reads tokenURI and fetches the metadata JSON. Returns null if anything fails. */
export async function fetchNftMetadata(
  tokenContract: Address,
  tokenId: bigint,
): Promise<NftMetadata | null> {
  try {
    const uri = await publicClient.readContract({
      address: tokenContract,
      abi: erc721Abi,
      functionName: "tokenURI",
      args: [tokenId],
    });
    return normalize(await loadJson(uri));
  } catch {
    return null;
  }
}
