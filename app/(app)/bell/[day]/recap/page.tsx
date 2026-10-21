import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatDay, formatLongDay, parseDay } from "@/components/bell/format";
import { BellRecapCard } from "@/components/bell/recap";
import { PageHeader, PillLink, Skeleton } from "@/components/v2";

export const viewport: Viewport = { themeColor: "#0d0c11" };

export async function generateMetadata({ params }: PageProps<"/bell/[day]/recap">): Promise<Metadata> {
  const day = parseDay((await params).day);
  if (!day) return { title: "Bell not found" };
  return {
    title: `Bell recap, ${formatDay(day)}`,
    description: `What $CHOG did at the Bell of ${formatLongDay(day)}, the best call, the most rekt and what the crowd called. Points only.`,
  };
}

/** The shareable recap of one settled Bell (its share card is this route's opengraph-image). */
export default function BellRecapPage({ params }: PageProps<"/bell/[day]/recap">) {
  return (
    <div className="v2-shell v2-shell--narrow pb-20">
      <Suspense
        fallback={
          <div className="v2-page-header">
            <Skeleton variant="text" style={{ width: 180 }} />
            <Skeleton variant="title" style={{ width: "min(560px, 90%)" }} />
          </div>
        }
      >
        <Recap params={params} />
      </Suspense>
    </div>
  );
}

async function Recap({ params }: Pick<PageProps<"/bell/[day]/recap">, "params">) {
  const day = parseDay((await params).day);
  if (!day) notFound();
  return (
    <>
      <PageHeader
        kicker={
          <Link href={`/bell/${day}`} className="hover:text-[var(--v2-ink)]">
            ← The Bell of {formatDay(day)}
          </Link>
        }
        title={`Bell recap, ${formatDay(day)}`}
        lead="Every day at 15:00 UTC all 1,969 Chogs call $CHOG for the next 24 hours, and the real market settles them. Points only."
      />
      <div className="v2-section flex flex-col gap-6">
        <BellRecapCard day={day} empty="This Bell has no recap yet: it is written once the Bell settles, 24 hours after it rings." />
        <div className="flex flex-wrap gap-3">
          <PillLink href="/bell" variant="hero" arrow>
            Ride a Chog at the next Bell
          </PillLink>
          <PillLink href={`/bell/${day}`} variant="glass">
            All calls of this Bell
          </PillLink>
        </div>
      </div>
    </>
  );
}
