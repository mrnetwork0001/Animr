import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { maxUint256 } from "viem";
import { AgentProfile, AgentProfileSkeleton, type ChogDna } from "@/components/agent-profile";
import { ChogJump } from "@/components/chog-jump";
import { personaName, sanitizeTraits } from "@/lib/agent/persona";
import { chogLabel } from "@/lib/chog-id";
import { appConfig } from "@/lib/config";
import { allChogs, getChog } from "@/lib/dna/chogs";
import { deriveGenome } from "@/lib/dna/genome";
import { houseChogTokenId } from "@/lib/heist/config";
import { isHiddenChog } from "@/lib/visibility";

/** The snapshot only covers Chog Genesis, the one collection with a bounded id range. */
const HAS_SNAPSHOT = appConfig.tokenIdRange.max !== maxUint256;

/** Canonical decimal token id ("007" -> "7"), or null outside the collection's id range. */
function parseTokenId(raw: string): string | null {
  if (!/^\d{1,78}$/.test(raw)) return null;
  const id = BigInt(raw);
  const { min, max } = appConfig.tokenIdRange;
  return id >= min && id <= max ? id.toString() : null;
}

/**
 * The Chog's trait DNA before (and without) an awake agent: its AI's name ("Rocket Ears" for token 2,
 * the naming rule activation applies) and its genome's archetype and style. Server-side, from the
 * Chog Genesis metadata snapshot (data/chogs.json); pure, so the page needs no request data for it.
 */
function chogDna(tokenId: string): ChogDna | undefined {
  if (!HAS_SNAPSHOT) return undefined;
  const chog = getChog(Number(tokenId));
  if (!chog || Object.keys(chog.traits).length === 0) return undefined;
  // The metadata name gives the ten 1:1 Legendaries their own genomes.
  const genome = deriveGenome(chog.traits, chog.name);
  return { name: personaName(tokenId, sanitizeTraits(chog.traits)), archetype: genome.archetype, style: genome.style };
}

/** Its metadata name ("CHOG #1462"), the one marketplaces show; the snapshot has it for every Chog Genesis token. */
function metadataNameOf(tokenId: string): string | undefined {
  return HAS_SNAPSHOT ? getChog(Number(tokenId))?.name || undefined : undefined;
}

export async function generateMetadata({ params }: PageProps<"/chog/[tokenId]">): Promise<Metadata> {
  const tokenId = parseTokenId((await params).tokenId);
  if (!tokenId) return { title: "Chog not found" };
  const label = chogLabel(tokenId, { metadataName: metadataNameOf(tokenId) });
  return {
    title: label,
    description: `${label}: its trading DNA, its Time Machine replay on real $CHOG candles, its Daily Bell call, its ERC-6551 wallet and, once claimed, its AI trader on 0G Compute.`,
  };
}

export default function ChogPage({ params }: PageProps<"/chog/[tokenId]">) {
  // Token id -> name number ("CHOG #1462" is token 1), so the header search finds a Chog by either.
  const nameNumbers = HAS_SNAPSHOT ? allChogs().map((chog) => Number(chog.metadataId) || 0) : undefined;
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-20 sm:px-6 sm:pt-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/league" className="inline-flex text-sm text-muted transition-colors hover:text-foreground">
          ← The League
        </Link>
        {nameNumbers && <ChogJump nameNumbers={nameNumbers} />}
      </div>
      {/* params are request data under Cache Components, so they're read inside the boundary. */}
      <Suspense fallback={<AgentProfileSkeleton />}>
        <Profile params={params} />
      </Suspense>
    </div>
  );
}

async function Profile({ params }: Pick<PageProps<"/chog/[tokenId]">, "params">) {
  const tokenId = parseTokenId((await params).tokenId);
  if (!tokenId) notFound();
  // The "Hide my Chog" list below is request data (lib/visibility.ts): read it at request time.
  await connection();
  return (
    <AgentProfile
      tokenId={tokenId}
      dna={chogDna(tokenId)}
      metadataName={metadataNameOf(tokenId)}
      // The House Chog (HOUSE_CHOG_TOKEN_ID; unset until it moves in): its holder also gets the buy-only step.
      house={houseChogTokenId() === Number(tokenId)}
      // "Hide my Chog": its DNA, replays and Bell call give way to a notice (its wallet and agent stay).
      hidden={HAS_SNAPSHOT && (await isHiddenChog(tokenId))}
    />
  );
}
