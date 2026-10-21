import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BellDaySkeleton, BellDayView } from "@/components/bell/bell-day-view";
import { formatDay, formatLongDay, parseDay } from "@/components/bell/format";

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
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 pt-8 pb-20 sm:px-6 sm:pt-10">
      <Link href="/bell" className="mb-6 inline-flex text-sm text-muted transition-colors hover:text-foreground">
        ← Daily Bell
      </Link>
      {/* params are request data under Cache Components, so they're read inside the boundary. */}
      <Suspense fallback={<BellDaySkeleton />}>
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
      <header className="mb-6">
        <p className="eyebrow">Daily Bell · 15:00 UTC</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          The Bell of {formatLongDay(day)}
        </h1>
      </header>
      <BellDayView day={day} />
    </>
  );
}
