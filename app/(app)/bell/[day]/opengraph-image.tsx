import { ImageResponse } from "next/og";
import { parseDay } from "@/lib/bell/rules";
import { BellCard } from "@/lib/og/cards";
import { type BellCardData, hiddenKey, loadBellCard, loadShowcase, withoutHidden } from "@/lib/og/data";
import { ogOptions } from "@/lib/og/theme";
import { loadVisibility } from "@/lib/visibility";

// The share card of /bell/[day]: that Bell's bull/flat/bear split and herd chart, and once settled the
// real move and the Oracle of the Day with its Chog (while open, the boldest bull and bear). Rendered on
// request from cached data: a settled Bell is final, an open one is re-read every minute. A Chog its holder hid
// ("Hide my Chog") hands its spot to the next call in line.

export const alt =
  "One Daily Bell: how all 1,969 Chogs called $CHOG for the next 24 hours, bull against bear, the real move and the Oracle of the Day";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ day: string }> }) {
  const day = parseDay((await params).day);
  const hidden = hiddenKey((await loadVisibility()).hidden);
  const data: BellCardData = day
    ? await loadBellCard(day, hidden)
    : { state: "none", day: null, upcoming: false, showcase: withoutHidden(await loadShowcase(), hidden) };
  const settled = data.state === "bell" && data.bell.status === "settled";
  return new ImageResponse(<BellCard data={data} latest={false} />, ogOptions(settled ? 3600 : 300));
}
