import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BellDaySkeleton, BellDayView } from "@/components/bell/bell-day-view";
import { formatDay, formatLongDay, parseDay } from "@/components/bell/format";
import { PageHeader, Skeleton } from "@/components/v2";

export const viewport: Viewport = { themeColor: "#0d0c11" };

export async function generateMetadata({ params }: PageProps<"/bell/[day]">): Promise<Metadata> {
  const day = parseDay((await params).day);
  if (!day) return { title: "Bell not found" };
  return {
    title: `Bell of ${formatDay(day)}`,
    description: `Every Chog's 24h $CHOG call at the Bell of ${formatLongDay(day)} (15:00 UTC), and how the real market settled them.`,
  };
}

/** One past (or today's) Bell: its summary, verdict and all of its calls. */
export default function BellDayPage({ params }: PageProps<"/bell/[day]">) {
  return (
    <div className="v2-shell pb-20">
      {/* params are request data under Cache Components, so they're read inside the boundary. */}
      <Suspense
        fallback={
          <>
            <div className="v2-page-header">
              <Skeleton variant="text" style={{ width: 180 }} />
              <Skeleton variant="title" style={{ width: "min(560px, 90%)" }} />
            </div>
            <div className="v2-section">
              <BellDaySkeleton />
            </div>
          </>
        }
      >
        <Day params={params} />
      </Suspense>
    </div>
  );
}

async function Day({ params }: Pick<PageProps<"/bell/[day]">, "params">) {
  const day = parseDay((await params).day);
  if (!day) notFound();
  return (
    <>
      <PageHeader
        kicker={
          <>
            <Link href="/bell" className="hover:text-[var(--v2-ink)]">
              Daily Bell
            </Link>
            <span>· 15:00 UTC · points only</span>
          </>
        }
        title={`The Bell of ${formatLongDay(day)}`}
        lead="Every Chog's 24-hour $CHOG call from this ring, read-only, and how the real CHOG/WMON market settled them."
      />
      <div className="v2-section">
        <BellDayView day={day} />
      </div>
    </>
  );
}
