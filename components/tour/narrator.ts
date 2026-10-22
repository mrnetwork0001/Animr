import { FALLBACK_IMAGE_IDS } from "@/components/landing/content";
import { personaName, sanitizeTraits } from "@/lib/agent/persona";
import { FLAGGED_TOKEN_IDS } from "@/lib/brand-safety";
import { nameNumberOf } from "@/lib/chog-id";
import { animrTradeGuardAddress } from "@/lib/contracts/animr-trade-guard";
import { getChog } from "@/lib/dna/chogs";
import { shortAddress } from "@/lib/format";
import { houseChogTokenId } from "@/lib/heist/config";
import { resolveUri } from "@/lib/nft";
import type { CoachFacts, CoachNarrator } from "./coach-steps";

// Server only (it reads the Chog snapshot): what the in-app guide's narrator is, from committed data and env. Pure
// (no RPC, no clock), so the app layout that calls it stays prerenderable. The House Chog's persona name is the one
// its profile, the heist and the League show; the image is the real NFT art through the IPFS gateway.

let cached: CoachFacts | undefined;

/** The guide's narrator (the House Chog, or null while none is configured) and the deployed guard's short address. */
export function coachFacts(): CoachFacts {
  cached ??= {
    narrator: houseNarrator(),
    guardShort: animrTradeGuardAddress ? shortAddress(animrTradeGuardAddress) : null,
  };
  return cached;
}

function houseNarrator(): CoachNarrator | null {
  const tokenId = houseChogTokenId();
  const chog = tokenId === null ? undefined : getChog(tokenId);
  // Flagged art still shows the words the trait filter hides: never put it on a card.
  if (tokenId === null || !chog || FLAGGED_TOKEN_IDS.has(tokenId)) return null;
  const title = chog.name.trim();
  return {
    tokenId,
    name: personaName(String(chog.id), sanitizeTraits(chog.traits)),
    label: title && nameNumberOf(title) !== null ? title : `token ${tokenId}`,
    image: {
      src: resolveUri(chog.image),
      fallbackSrc: FALLBACK_IMAGE_IDS.has(tokenId) ? `/landing/chogs/${tokenId}.webp` : undefined,
    },
  };
}
