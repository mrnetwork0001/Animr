import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/v2";
import { VersusArena, VersusArenaSkeleton } from "@/components/versus/arena";
import { personaName, sanitizeTraits } from "@/lib/agent/persona";
import { nameNumberOf } from "@/lib/chog-id";
import { allChogs, getChog } from "@/lib/dna/chogs";
import { REPLAY } from "@/lib/dna/genome";
import { decodeBoutId } from "@/lib/rewind/id";
import { loadVisibility } from "@/lib/visibility";

/** "Rocket Ears (CHOG #1463)": its persona name and its marketplace name, from the frozen snapshot. */
function fighterName(tokenId: number): string {
  const chog = getChog(tokenId);
  const label = chog && nameNumberOf(chog.name) !== null ? chog.name.trim() : `token ${tokenId}`;
  return chog ? `${personaName(String(tokenId), sanitizeTraits(chog.traits))} (${label})` : label;
}

export const viewport: Viewport = { themeColor: "#0d0c11" };

export async function generateMetadata({ params }: PageProps<"/versus/[id]">): Promise<Metadata> {
  const key = decodeBoutId((await params).id);
  if (!key) return { title: "Bout not found" };
  // A Chog its holder hid isn't named in the title or the preview text either (request data: connection()).
  await connection();
  const { hidden } = await loadVisibility();
  if (hidden.has(key.a) || hidden.has(key.b)) return { title: "Versus" };
  const [a, b] = [fighterName(key.a), fighterName(key.b)];
  return {
    title: `${a} vs ${b} · Versus`,
    description: `${a} and ${b} race the same hidden 48 hours of real $CHOG history: who stacks more $CHOG? Watch the bout and see the real dates. Simulated (1% fee + impact), points only.`,
  };
}

/** A shared bout (opengraph-image.tsx draws its card): the visitor picks first, or just watches. */
export default function VersusBoutPage({ params }: PageProps<"/versus/[id]">) {
  const metadataIds = allChogs().map((chog) => Number(chog.metadataId) || 0);
  return (
    <div className="v2-shell pb-20">
      {/* The same header as /versus: a revealed bout's address moves here without a navigation. */}
      <PageHeader
        title="Two Chogs. One chart. Who wins?"
        lead={
          <>
            Two Chogs get {REPLAY.startChog.toLocaleString("en-US")} $CHOG each and the same 48 hours of real $CHOG
            history, dates hidden. Pick the one that ends with more, watch them trade, then see when it really happened.
          </>
        }
      />
      <div className="v2-section">
        {/* params are request data under Cache Components, so they're read inside the boundary. */}
        <Suspense fallback={<VersusArenaSkeleton />}>
          <Bout params={params} metadataIds={metadataIds} />
        </Suspense>
      </div>
    </div>
  );
}

async function Bout({ params, metadataIds }: Pick<PageProps<"/versus/[id]">, "params"> & { metadataIds: number[] }) {
  const { id } = await params;
  if (!decodeBoutId(id)) notFound();
  return <VersusArena initialId={id} metadataIds={metadataIds} />;
}
