import type { Metadata, Viewport } from "next";
import { BellDashboard } from "@/components/bell/bell-dashboard";
import { ChogNamesProvider } from "@/components/bell/names";
import { PageHeader } from "@/components/v2";
import { allChogs } from "@/lib/dna/chogs";

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
        title="Every Chog calls $CHOG. The market settles it."
        lead="Every day at 15:00 UTC, all 1,969 Chogs predict $CHOG's next 24 hours. Ride the Chog you trust; the real price settles every call a day later. Points only."
      />
      {/* Client data (react-query); it streams in under the static header. */}
      <div className="v2-section">
        <ChogNamesProvider nameNumbers={allChogs().map((chog) => Number(chog.metadataId) || 0)}>
          <BellDashboard />
        </ChogNamesProvider>
      </div>
    </div>
  );
}
