import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getStats } from "@/components/stats/data";
import { HideMyChog } from "@/components/stats/hide-my-chog";
import { StatsBoard, StatsSkeleton } from "@/components/stats/stats-board";
import { allChogs } from "@/lib/dna/chogs";

export const metadata: Metadata = {
  title: "Stats",
  description:
    "Animr's live numbers: fans, Daily Bell rides and day-1 return, Versus picks, heist attempts and claimed AI agents on 0G Compute. Counted by the app itself, refreshed every minute.",
};

/** Public usage numbers (counts only) and the holders' "Hide my Chog" switch. */
export default function StatsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 pt-10 pb-20 sm:px-6 sm:pt-14">
      <header className="mb-8">
        <p className="eyebrow">Live numbers · no wallet needed</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Animr by the numbers</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-pretty text-muted">
          How people use Animr: fans riding the Daily Bell and coming back the next day, Versus picks, heists on the
          House Chog and the claimed Chogs&apos; AI at work. Every number is counted by the app itself and refreshed
          every minute. This page shows totals only: no wallets, no IP addresses, no names next to anything.
        </p>
      </header>

      {/* The numbers are read at request time; the frame above ships in the static shell. */}
      <Suspense fallback={<StatsSkeleton />}>
        <LiveStats />
      </Suspense>

      <section id="hide" aria-label="Hide my Chog" className="mt-12 scroll-mt-24">
        <HideMyChog nameNumbers={allChogs().map((chog) => Number(chog.metadataId) || 0)} />
      </section>

      <div className="mt-10 space-y-2 text-xs leading-relaxed text-pretty text-subtle">
        <p>
          How we count: a fan is an anonymous visitor (a cookie, no wallet) who rode a Chog or chose a nickname; Versus
          points wait for that first ride or nickname. Day-1 return is the share of riders who also rode the next day&apos;s Bell, counted once
          that Bell&apos;s ride window has closed. Heist attempts are messages to the House Chog; every transfer check
          is a read-only simulation and nothing is ever broadcast. Agent numbers come from each decision&apos;s stored
          0G receipt (the newest 200 per agent), with provider tiers from 0G&apos;s public provider list; heist spend is what its replies booked against their daily cap.
        </p>
        <p>
          Bell and Versus points are a game score with no cash value. League, replay and Versus results are
          simulated on real $CHOG candles (1% fee + impact). Not affiliated with Chog.{" "}
          <a href="/api/stats" className="underline underline-offset-2 hover:text-foreground">
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
  return (
    <p role="status" className="card p-5 text-sm text-muted">
      The counters are catching their breath. The numbers are back within a minute; meanwhile,{" "}
      <Link href="/bell" className="font-medium text-accent-strong hover:underline">
        ride a Chog at the Daily Bell
      </Link>
      .
    </p>
  );
}
