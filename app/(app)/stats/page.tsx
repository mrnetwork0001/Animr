import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getStats } from "@/components/stats/data";
import { HideMyChog } from "@/components/stats/hide-my-chog";
import { StatsBoard, StatsSkeleton, StatsUnavailable } from "@/components/stats/stats-board";
import { PageHeader } from "@/components/v2";
import { allChogs } from "@/lib/dna/chogs";

export const metadata: Metadata = {
  title: "Stats",
  description:
    "Animr's live numbers: fans, Daily Bell rides, Versus picks, heist attempts and the AI's 0G Compute spend. Counted by the app itself, refreshed every minute.",
};

export const viewport: Viewport = {
  themeColor: "#0d0c11",
};

/** Public usage numbers (counts only) and the holders' "Hide my Chog" switch. */
export default function StatsPage() {
  return (
    <div className="v2-shell pb-20">
      <PageHeader
        title="Animr by the numbers"
        lead="Fans riding the Daily Bell, Versus picks and heists on the House Chog. Counted by the app itself, totals only: no wallets, no names."
      />

      {/* The numbers are read at request time; the frame above ships in the static shell. */}
      <Suspense fallback={<StatsSkeleton />}>
        <LiveStats />
      </Suspense>

      <section id="hide" aria-label="Hide my Chog" className="v2-section scroll-mt-24">
        <HideMyChog nameNumbers={allChogs().map((chog) => Number(chog.metadataId) || 0)} />
      </section>

      <details className="v2-note mt-12 max-w-4xl text-pretty">
        <summary className="cursor-pointer text-[var(--v2-nav)]">How we count</summary>
        <p className="mt-2">
          A fan is an anonymous visitor (a cookie, no wallet) who rode a Chog or chose a nickname; Versus points wait for
          that first ride or nickname. Day-1 return is the share of riders who also rode the next day&apos;s Bell, counted
          once that Bell&apos;s ride window has closed. Heist attempts are messages to the House Chog; every transfer check
          is a read-only simulation and nothing is ever broadcast. Agent numbers come from each decision&apos;s stored 0G
          receipt (the newest 200 per agent), with provider tiers from 0G&apos;s public provider list; heist spend is what
          its replies booked against their daily cap. Numbers refresh every minute.
        </p>
      </details>
    </div>
  );
}

async function LiveStats() {
  await connection();
  const stats = await getStats().catch((error: unknown) => {
    console.error("[animr] /stats:", error);
    return null;
  });
  if (stats) return <StatsBoard stats={stats} />;
  return <StatsUnavailable />;
}
