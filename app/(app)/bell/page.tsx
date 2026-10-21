import type { Metadata } from "next";
import { BellDashboard } from "@/components/bell/bell-dashboard";

export const metadata: Metadata = {
  title: "Daily Bell",
  description:
    "Every day at 15:00 UTC all 1,969 Chogs call $CHOG for the next 24 hours, and the real market settles every call. Ride a Chog for points: no wallet needed.",
};

/** The Daily Bell: once a day every Chog forecasts $CHOG; fans ride one Chog per Bell for points. */
export default function BellPage() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 pt-10 pb-20 sm:px-6 sm:pt-14">
      <header className="mb-8">
        <p className="eyebrow">The Daily Bell · 15:00 UTC · points only</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Every Chog calls $CHOG. The market settles it.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-pretty text-muted">
          Once a day at the Bell, each of the 1,969 Chogs publishes a 24-hour forecast for $CHOG in its own voice.
          Claimed Chogs think with their AI agent on 0G Compute; every other Chog calls from its trait DNA. A day
          later the real CHOG/WMON price settles every call. Ride the Chog you trust and score when it lands. No
          wallet, no money, just points.
        </p>
      </header>
      {/* Client data (react-query); it streams in under the static header. */}
      <BellDashboard />
    </div>
  );
}
