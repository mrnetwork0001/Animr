import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BackToLeague, ReplaySkeleton, ReplayView } from "@/components/dna/replay-view";
import { parseChogId } from "@/components/dna/shared";
import { HiddenChogNotice } from "@/components/stats/hidden-notice";
import { personaName, sanitizeTraits } from "@/lib/agent/persona";
import { nameNumberOf } from "@/lib/chog-id";
import { allChogs, getChog } from "@/lib/dna/chogs";
import { isHiddenChog } from "@/lib/visibility";

/** "CHOG #1463": its marketplace name (1:1s keep their title), never its token id dressed as a name. */
function labelOf(tokenId: number): string {
  const name = getChog(tokenId)?.name ?? "";
  return nameNumberOf(name) !== null ? name.trim() : `token ${tokenId}`;
}

/** "Silver Whiskers (CHOG #1312)": its persona name first, as every page shows it. */
function titleOf(tokenId: number): string {
  const chog = getChog(tokenId);
  return chog ? `${personaName(String(tokenId), sanitizeTraits(chog.traits))} (${labelOf(tokenId)})` : labelOf(tokenId);
}

export const viewport: Viewport = { themeColor: "#0d0c11" };

export async function generateMetadata({ params }: PageProps<"/replay/[tokenId]">): Promise<Metadata> {
  const tokenId = parseChogId((await params).tokenId);
  if (!tokenId) return { title: "Chog not found" };
  // A Chog its holder hid ("Hide my Chog") isn't named in link previews either. The hidden list is request data
  // (lib/visibility.ts), so it is read after connection().
  await connection();
  if (await isHiddenChog(tokenId)) return { title: "Time Machine" };
  const title = titleOf(tokenId);
  return {
    title: `${title} · Time Machine`,
    description: `Watch ${title} trade the real $CHOG chart on its trading DNA, trade by trade, against just holding. Simulated on real $CHOG candles (1% fee + impact).`,
  };
}

/** Shareable replay of one Chog's genome (opengraph-image.tsx draws its share card). */
export default function ReplayPage({ params }: PageProps<"/replay/[tokenId]">) {
  // Token id -> name number ("CHOG #1462" is token 1), for the Time Machine's labels and the rival search.
  const nameNumbers = allChogs().map((chog) => Number(chog.metadataId) || 0);
  return (
    <div className="v2-shell pb-20 sm:pb-28">
      <BackToLeague />
      {/* params are request data under Cache Components, so they're read inside the boundary. */}
      <Suspense fallback={<ReplaySkeleton />}>
        <Replay params={params} nameNumbers={nameNumbers} />
      </Suspense>
    </div>
  );
}

async function Replay({ params, nameNumbers }: Pick<PageProps<"/replay/[tokenId]">, "params"> & { nameNumbers: number[] }) {
  const tokenId = parseChogId((await params).tokenId);
  if (!tokenId) notFound();
  // Its holder took it out of Animr's public pages: the notice instead of its replay (request data: connection()).
  await connection();
  if (await isHiddenChog(tokenId)) return <HiddenChogNotice tokenId={tokenId} label={labelOf(tokenId)} />;
  return <ReplayView tokenId={tokenId} nameNumbers={nameNumbers} />;
}
