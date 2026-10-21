import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/v2";
import { VersusArena, VersusArenaSkeleton } from "@/components/versus/arena";
import { personaName, sanitizeTraits } from "@/lib/agent/persona";
import { chogLabel } from "@/lib/chog-id";
import { allChogs, getChog } from "@/lib/dna/chogs";
import { decodeBoutId } from "@/lib/rewind/id";
import { loadVisibility } from "@/lib/visibility";

/** "Rocket Ears (CHOG #1463 · token 2)": its persona name and both numbers, from the frozen snapshot. */
function fighterName(tokenId: number): string {
  const chog = getChog(tokenId);
  const label = chogLabel(tokenId, { metadataName: chog?.name });
  return chog ? `${personaName(String(tokenId), sanitizeTraits(chog.traits))} (${label})` : label;
}

export const viewport: Viewport = { themeColor: "#0d0c11" };

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
    <div className="v2-shell pb-20">
      <PageHeader
        kicker={
          <>
            <Link href="/versus" className="hover:text-[var(--v2-ink)]">
              Rewind · VERSUS
            </Link>
            <span>· a shared bout · points only</span>
          </>
        }
        title="Two genomes. 48 hidden hours. Who wins?"
        lead="Same starting $CHOG, the same real CHOG/WMON candles, dates hidden until the KO. Call it first, or just watch."
      />
      <div className="v2-section">
        {/* params are request data under Cache Components, so they're read inside the boundary. */}
        <Suspense fallback={<VersusArenaSkeleton />}>
          <Bout params={params} metadataIds={metadataIds} />
        </Suspense>
      </div>
      <p className="v2-note mt-10 max-w-3xl">
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
