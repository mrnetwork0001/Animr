import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { BreedPicker } from "@/components/breed/picker";
import { BreedView } from "@/components/breed/breed-view";
import { parseChogId } from "@/components/dna/shared";
import { EmptyState, PageHeader, Skeleton } from "@/components/v2";
import { breed } from "@/lib/breed/breed";
import { breedPair } from "@/lib/breed/pair";
import { childName } from "@/lib/breed/genetics";
import { allChogs, getChog } from "@/lib/dna/chogs";
import { chogName } from "@/lib/dna/population";
import { isHiddenChog } from "@/lib/visibility";

export const viewport: Viewport = { themeColor: "#0d0c11" };

const LEAD = "Pick two Chogs. Their child takes each trait from one parent, gets its own Trading DNA, and trades the same real $CHOG chart.";

export async function generateMetadata({ searchParams }: PageProps<"/breed">): Promise<Metadata> {
  const { a, b } = breedPair(await searchParams);
  // Hidden Chogs ("Hide my Chog") are never named in link previews: request data, so after connection().
  await connection();
  const [hiddenA, hiddenB] = await Promise.all([isHiddenChog(a), isHiddenChog(b)]);
  const chogA = getChog(a);
  const chogB = getChog(b);
  if (hiddenA || hiddenB || !chogA || !chogB) return { title: "Breed two Chogs", description: LEAD };
  const nameA = chogName(chogA);
  const nameB = chogName(chogB);
  const child = childName({ tokenId: a, name: nameA }, { tokenId: b, name: nameB });
  const image = `/api/breed/og?a=${a}&b=${b}`;
  return {
    title: `${child}, child of ${nameA} and ${nameB} · Breed`,
    description: `${nameA} + ${nameB} = ${child}. See its Trading DNA and how all three trade the same real $CHOG chart. Simulated.`,
    openGraph: { images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

/** Breed two Chogs: the child's traits, its Trading DNA, and child vs parents vs just holding on real candles. */
export default function BreedPage({ searchParams }: PageProps<"/breed">) {
  // Token id -> marketplace number ("CHOG #1462" is token 1), so the picker reads both.
  const nameNumbers = allChogs().map((chog) => Number(chog.metadataId) || 0);
  return (
    <div className="v2-shell pb-20 sm:pb-28">
      <PageHeader title="Breed two Chogs" lead={LEAD} />
      <div className="v2-section v2-stack v2-stack--lg">
        {/* searchParams are request data under Cache Components: read inside the boundary. */}
        <Suspense fallback={<BreedSkeleton />}>
          <Breed searchParams={searchParams} nameNumbers={nameNumbers} />
        </Suspense>
      </div>
    </div>
  );
}

async function Breed({ searchParams, nameNumbers }: Pick<PageProps<"/breed">, "searchParams"> & { nameNumbers: number[] }) {
  const raw = await searchParams;
  const pair = breedPair(raw);
  const picker = <BreedPicker key={`${pair.a}-${pair.b}`} initial={pair} nameNumbers={nameNumbers} />;
  const asked = [raw.a, raw.b].map((v) => (Array.isArray(v) ? v[0] : v));
  if (asked.some((v) => v !== undefined && parseChogId(v) === null)) {
    return (
      <>
        {picker}
        <EmptyState title="That's not a Chog" body="Token ids run from 1 to 1,969. Pick two parents above." />
      </>
    );
  }
  if (pair.a === pair.b) {
    return (
      <>
        {picker}
        <EmptyState title="A Chog can't breed with itself" body="Pick two different parents above." />
      </>
    );
  }
  await connection();
  const [hiddenA, hiddenB] = await Promise.all([isHiddenChog(pair.a), isHiddenChog(pair.b)]);
  if (hiddenA || hiddenB) {
    return (
      <>
        {picker}
        <EmptyState title="Its holder hid this Chog" body="It stays off Animr's public pages. Pick another parent." />
      </>
    );
  }
  const result = await breed(pair.a, pair.b);
  return (
    <>
      {picker}
      <BreedView result={result} />
    </>
  );
}

function BreedSkeleton() {
  return (
    <>
      <Skeleton variant="card" style={{ height: 104 }} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Skeleton variant="card" style={{ aspectRatio: "3 / 4" }} />
        <Skeleton variant="card" style={{ aspectRatio: "3 / 4" }} />
        <Skeleton variant="card" className="hidden md:block" style={{ aspectRatio: "3 / 4" }} />
      </div>
      <Skeleton variant="card" style={{ height: 420 }} />
    </>
  );
}
