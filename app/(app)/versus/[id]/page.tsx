import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { VersusArena, VersusArenaSkeleton } from "@/components/versus/arena";
import { personaName, sanitizeTraits } from "@/lib/agent/persona";
import { allChogs, getChog } from "@/lib/dna/chogs";
import { decodeBoutId } from "@/lib/rewind/id";
import { loadVisibility } from "@/lib/visibility";

/** "Rocket Ears (Chog #2)", the name every page shows, from the frozen snapshot. */
function fighterName(tokenId: number): string {
  const chog = getChog(tokenId);
  return chog ? `${personaName(String(tokenId), sanitizeTraits(chog.traits))} (Chog #${tokenId})` : `Chog #${tokenId}`;
}

export async function generateMetadata({ params }: PageProps<"/versus/[id]">): Promise<Metadata> {
  const key = decodeBoutId((await params).id);
  if (!key) return { title: "Bout not found" };
  // A Chog its holder hid isn't named in the title or the preview text either (request data: connection()).
  await connection();
  const { hidden } = await loadVisibility();
  if (hidden.has(key.a) || hidden.has(key.b)) return { title: "VERSUS" };
  const [a, b] = [fighterName(key.a), fighterName(key.b)];
  return {
    title: `${a} vs ${b} · VERSUS`,
    description: `${a} and ${b} race the same hidden 48 hours of real $CHOG history: who stacks more $CHOG? Watch the bout and see the real dates. Simulated (1% fee + impact), points only.`,
  };
}

/** A shared bout (opengraph-image.tsx draws its card): the visitor picks first, or just watches. */
export default function VersusBoutPage({ params }: PageProps<"/versus/[id]">) {
  const metadataIds = allChogs().map((chog) => Number(chog.metadataId) || 0);
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 pt-8 pb-20 sm:px-6 sm:pt-10">
      <Link href="/versus" className="mb-6 inline-flex text-sm text-muted transition-colors hover:text-foreground">
        ← VERSUS
      </Link>
      <header className="mb-6">
        <p className="eyebrow">VERSUS · a shared bout · points only</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          Two genomes, the same hidden 48 hours. Who stacks more $CHOG?
        </h1>
      </header>
      {/* params are request data under Cache Components, so they're read inside the boundary. */}
      <Suspense fallback={<VersusArenaSkeleton />}>
        <Bout params={params} metadataIds={metadataIds} />
      </Suspense>
      <p className="mt-10 text-xs text-pretty text-subtle">
        Every bout is simulated on real $CHOG history (1% fee + impact): no real trades and no tokens move. Picks earn
        points only, never money, and points have no cash value. Not affiliated with Chog.
      </p>
    </div>
  );
}

async function Bout({ params, metadataIds }: Pick<PageProps<"/versus/[id]">, "params"> & { metadataIds: number[] }) {
  const { id } = await params;
  if (!decodeBoutId(id)) notFound();
  return <VersusArena initialId={id} metadataIds={metadataIds} />;
}
