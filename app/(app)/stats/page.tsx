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
    "Animr's live numbers: fans, Daily Bell rides and day-1 return, Versus picks, heist attempts and claimed AI agents on 0G Compute. Counted by the app itself, refreshed every minute.",
};

export const viewport: Viewport = {
  themeColor: "#0d0c11",
};

/** Public usage numbers (counts only) and the holders' "Hide my Chog" switch. */
export default function StatsPage() {
  return (
    <div className="v2-shell pb-20">
      <PageHeader
        kicker="Live numbers · no wallet needed"
        title="Animr by the numbers"
        lead={
          <>
            How people use Animr: fans riding the Daily Bell and coming back the next day, Versus picks, heists on the
            House Chog and the claimed Chogs&apos; AI at work. Every number is counted by the app itself and refreshed every
            minute. This page shows totals only: no wallets, no IP addresses, no names next to anything.
          </>
        }
      />

      {/* The numbers are read at request time; the frame above ships in the static shell. */}
      <Suspense fallback={<StatsSkeleton />}>
        <LiveStats />
      </Suspense>

      <section id="hide" aria-label="Hide my Chog" className="v2-section scroll-mt-24">
        <HideMyChog nameNumbers={allChogs().map((chog) => Number(chog.metadataId) || 0)} />
      </section>

      <div className="mt-12 grid max-w-4xl gap-2 text-pretty">
        <p className="v2-note">
          How we count: a fan is an anonymous visitor (a cookie, no wallet) who rode a Chog or chose a nickname; Versus
          points wait for that first ride or nickname. Day-1 return is the share of riders who also rode the next day&apos;s Bell, counted once
          that Bell&apos;s ride window has closed. Heist attempts are messages to the House Chog; every transfer check
          is a read-only simulation and nothing is ever broadcast. Agent numbers come from each decision&apos;s stored
          0G receipt (the newest 200 per agent), with provider tiers from 0G&apos;s public provider list; heist spend is what its replies booked against their daily cap.
        </p>
        <p className="v2-note">
          Bell and Versus points are a game score with no cash value. League, replay and Versus results are
          simulated on real $CHOG candles (1% fee + impact). Not affiliated with Chog.{" "}
          <a href="/api/stats" className="v2-link">
            Raw JSON
          </a>
        </p>
      </div>
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
