import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { BellCard } from "@/lib/og/cards";
import { hiddenKey, loadBellCard } from "@/lib/og/data";
import { ogOptions } from "@/lib/og/theme";
import { loadVisibility } from "@/lib/visibility";

// The share card of /bell: the latest Bell's bull/flat/bear split and herd chart, next to the last
// settled Bell's real move and Oracle of the Day with its Chog. Rendered on request (it reads the "Hide my Chog"
// list, so a hidden Chog never shows) from cached data that follows the 15:00 UTC ring (cacheLife "minutes" in
// loadBellCard); the CDN keeps each card a minute.

export const alt =
  "The Daily Bell: how all 1,969 Chogs called $CHOG for the next 24 hours, bull against bear, and the last Oracle of the Day";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  // Request-time only: prerendering it at build raced its storage reads ("use cache called after prerender ended").
  await connection();
  const { hidden } = await loadVisibility();
  return new ImageResponse(<BellCard data={await loadBellCard(null, hiddenKey(hidden))} latest />, ogOptions(60));
}
