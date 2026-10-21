import { ImageResponse } from "next/og";
import { LeagueCard } from "@/lib/og/cards";
import { hiddenKey, loadLeagueCard, loadShowcase, withoutHidden } from "@/lib/og/data";
import { ogOptions } from "@/lib/og/theme";
import { loadVisibility } from "@/lib/visibility";

// The share card of /league: "1,969 Chogs, 1,969 AI traders", the top 3 by $CHOG stacked vs just
// holding (simulated) and the league's honest stats. Rendered on request (a Chog its holder hid never makes the
// podium) from cached data that follows the hourly candles (cacheLife "hours" in loadLeagueCard); the CDN keeps
// each card five minutes.

export const alt =
  "The Animr League: the top 3 of 1,969 Chog AI traders, ranked by $CHOG stacked against just holding (simulated on real candles)";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const hidden = hiddenKey((await loadVisibility()).hidden);
  const data = await loadLeagueCard(hidden);
  // No podium without the league (never expected: the candles fall back to data/): five real Chogs instead.
  const showcase = data ? [] : withoutHidden(await loadShowcase(), hidden);
  return new ImageResponse(<LeagueCard data={data} showcase={showcase} />, ogOptions(300));
}
