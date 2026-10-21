import { resolveUri } from "@/lib/nft";

// Chog images are 1000x1000 WebPs (~300 KB each) on IPFS. Lists of hundreds of Chogs, and the share
// card (Satori can't decode WebP), load a resized copy through the wsrv.nl image cache instead.
const RESIZER = "https://wsrv.nl/?url=";

/**
 * A square, resized copy of a Chog image (ipfs:// or https), `px` wide. WebP copies redirect to the
 * original if the resizer can't fetch it (`default=1`); PNG copies (for Satori) fail instead.
 */
export function chogThumbUrl(image: string, px: number, format: "webp" | "png" = "webp"): string {
  const src = resolveUri(image);
  if (!src.startsWith("https://")) return src;
  // The full https URL: a bare host makes wsrv try http first, and gateways answer that with a 308.
  const fallback = format === "webp" ? "&default=1" : "";
  return `${RESIZER}${encodeURIComponent(src)}&w=${px}&h=${px}&fit=cover&output=${format}&q=80${fallback}`;
}
