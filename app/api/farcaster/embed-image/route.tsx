import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { BellCard } from "@/lib/og/cards";
import { hiddenKey, loadBellCard } from "@/lib/og/data";
import { OG_WIDTH, ogOptions } from "@/lib/og/theme";
import { loadVisibility } from "@/lib/visibility";

// The Farcaster Mini App card (lib/farcaster/embed.ts): the /bell share card on the spec's 3:2 canvas, from
// the same cached, real Bell data (lib/og/data.ts loadBellCard). With no Bell yet it is the plain Daily Bell
// card with real Chog art and no numbers. Farcaster scrapes a cast's image once and keeps it, so the CDN can
// keep a real card for 5 minutes; the no-Bell card only 30 seconds so it doesn't outlive the first ring.

const HEIGHT = Math.round((OG_WIDTH * 2) / 3); // 1200x800

export async function GET() {
  await connection();
  const { hidden } = await loadVisibility();
  const data = await loadBellCard(null, hiddenKey(hidden));
  const seconds = data.state === "bell" ? 300 : 30;
  return new ImageResponse(<BellCard data={data} latest />, { ...ogOptions(seconds), height: HEIGHT });
}
