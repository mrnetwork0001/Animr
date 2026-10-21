import { ImageResponse } from "next/og";
import { parseChogId } from "@/components/dna/shared";
import { artExpected } from "@/lib/og/art";
import { ChogCard, GenericCard } from "@/lib/og/cards";
import { loadChogBell, loadChogCore, loadShowcase, withoutHidden } from "@/lib/og/data";
import { ogOptions } from "@/lib/og/theme";
import { loadVisibility } from "@/lib/visibility";

// The share card of /chog/[tokenId]: the Chog's art, archetype and top genes, its League rank and edge
// vs just holding (simulated), and its call at the latest Daily Bell. Rendered on request (one per
// Chog) from cached data: the genome is pure, the league is cached per hourly candle, the art for good.

export const alt =
  "A Chog's trading DNA card: its archetype and top genes, its simulated League rank against just holding $CHOG, and its Daily Bell call";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ tokenId: string }> }) {
  const id = parseChogId((await params).tokenId);
  // A Chog its holder hid ("Hide my Chog") never goes on a card: the generic one instead.
  const { hidden } = await loadVisibility();
  const tokenId = id && !hidden.has(id) ? id : null;
  const [core, bell] = tokenId ? await Promise.all([loadChogCore(tokenId), loadChogBell(tokenId)]) : [null, null];
  if (!tokenId || !core) {
    const showcase = withoutHidden(await loadShowcase(), [...hidden]);
    return new ImageResponse(<GenericCard showcase={showcase} />, ogOptions(3600));
  }
  // A complete card can sit on the CDN for a while; one missing a piece is re-rendered on every fetch.
  const complete = Boolean(core.league && bell && (core.art || !artExpected(tokenId)));
  return new ImageResponse(<ChogCard core={core} bell={bell} />, ogOptions(complete ? 600 : undefined));
}
