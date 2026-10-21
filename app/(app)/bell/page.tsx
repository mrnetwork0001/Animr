import type { Metadata, Viewport } from "next";
import { BellDashboard } from "@/components/bell/bell-dashboard";
import { BellClock } from "@/components/bell/hero";
import { PageHeader } from "@/components/v2";

export const metadata: Metadata = {
  title: "Daily Bell",
  description:
    "Every day at 15:00 UTC all 1,969 Chogs call $CHOG for the next 24 hours, and the real market settles every call. Ride a Chog for points: no wallet needed.",
};

export const viewport: Viewport = { themeColor: "#0d0c11" };

/** The Daily Bell: once a day every Chog forecasts $CHOG; fans ride one Chog per Bell for points. */
export default function BellPage() {
  return (
    <div className="v2-shell pb-20">
      <PageHeader
        kicker="Daily Bell · 15:00 UTC · points only"
        title="Every Chog calls $CHOG. The market settles it."
        lead="Once a day at the Bell, each of the 1,969 Chogs publishes a 24-hour $CHOG forecast in its own voice: claimed Chogs think with their AI agent on 0G Compute, the rest call from their trait DNA. A day later the real CHOG/WMON price settles every call. Ride the Chog you trust and score when it lands. No wallet, no money, just points."
        aside={<BellClock />}
      />
      {/* Client data (react-query); it streams in under the static header. */}
      <div className="v2-section">
        <BellDashboard />
      </div>
    </div>
  );
}
