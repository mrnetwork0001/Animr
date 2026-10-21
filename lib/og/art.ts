import { cacheLife } from "next/cache";
import { isFlaggedTokenId } from "@/lib/brand-safety";
import { getChog } from "@/lib/dna/chogs";
import { resolveUri } from "@/lib/nft";

// The Chog's original art for a share card. Chog images are 1000x1000 WebPs on IPFS, and next/og's
// renderer accepts WebP but draws it blank (resvg can't decode it; checked against next 16.4), so the
// card embeds a JPEG copy made by the wsrv.nl image cache from the Filebase gateway URL (the same
// resizer components/dna/thumb-url.ts uses). Never generated art: when the copy can't be had in time
// the card shows a plain tile with the Chog's number instead.

const RESIZER = "https://wsrv.nl/?url=";
/** One size for every card, so a Chog's art is fetched and cached once (cards show it at 140-400 px). */
const ART_PX = 400;
/** A cold copy (wsrv fetching the original from IPFS) takes 0.2-3 s; a warm one ~50 ms. */
const ART_TIMEOUT_MS = 4_500;

function artUrl(image: string): string | null {
  const src = resolveUri(image);
  if (!src.startsWith("https://")) return null;
  // The full https URL: a bare host makes wsrv try http first, and gateways answer that with a 308.
  return `${RESIZER}${encodeURIComponent(src)}&w=${ART_PX}&h=${ART_PX}&fit=cover&output=jpg&q=85`;
}

/** JPEG or PNG by magic bytes (an error page or a WebP would render blank). */
function mimeOf(bytes: Uint8Array): "image/jpeg" | "image/png" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  return null;
}

/**
 * A Chog image (ipfs:// or https) as a JPEG data URI, cached for good (IPFS art never changes). Throws
 * when the copy fails or is too slow, so a failure is never cached and the next card retries.
 */
async function artDataUri(image: string): Promise<string> {
  "use cache";
  const url = artUrl(image);
  if (!url) throw new Error(`No https URL for ${image}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(ART_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Art copy failed: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const mime = mimeOf(bytes);
  if (!mime) throw new Error("Art copy is not a JPEG or PNG");
  cacheLife("max");
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

/**
 * The art of Chog #tokenId for a share card, or null: unknown Chog, no image, a copy that failed, or a
 * flagged Chog (lib/brand-safety.ts: its art still shows the flagged words, so cards never spread it).
 */
export async function chogArt(tokenId: number): Promise<string | null> {
  const image = getChog(tokenId)?.image;
  if (!image || isFlaggedTokenId(tokenId)) return null;
  try {
    return await artDataUri(image);
  } catch (error) {
    console.warn(`[animr] Share card: no art for Chog #${tokenId}:`, (error as Error).message);
    return null;
  }
}

/** Whether a card without this Chog's art is complete anyway (it has none to show), so it can be cached long. */
export function artExpected(tokenId: number): boolean {
  return Boolean(getChog(tokenId)?.image) && !isFlaggedTokenId(tokenId);
}
