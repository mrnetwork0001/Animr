import { styles } from "@/components/landing/content";
import { showcaseChog } from "@/components/landing/showcase";
import { nameNumberOf } from "@/lib/chog-id";
import { getChog } from "@/lib/dna/chogs";
import { resolveUri } from "@/lib/nft";
import { heroDeck } from "./content";

/** One card of the hero's deck: everything hero-deck.tsx draws, nothing more (it ships in the page's payload). */
export type DeckChog = {
  tokenId: number;
  /** Its persona name (lib/agent/persona.ts), the same one its profile and League row carry. */
  name: string;
  /** "CHOG #1462": the marketplace number, never the token id. */
  number: string;
  /** Its Trading DNA style: "Aggressive", "Balanced" or "Cautious". */
  style: string;
  /** The self-hosted copy of its metadata image. */
  src: string;
  /** The metadata image through the IPFS gateway, if the copy fails. */
  fallbackSrc: string;
};

/**
 * The deck, in heroDeck.ids order: brand-safe Chogs only (showcaseChog drops flagged art), each with its
 * persona name, marketplace number and Trading DNA style. Pure, from committed data: the page still prerenders.
 */
export function heroDeckChogs(): DeckChog[] {
  return heroDeck.ids.flatMap((tokenId) => {
    const chog = showcaseChog(tokenId);
    const image = getChog(tokenId)?.image;
    const number = nameNumberOf(chog?.label);
    if (!chog || !image || number === null) return [];
    return [
      {
        tokenId,
        name: chog.name,
        number: `CHOG #${number}`,
        style: styles[chog.style].label,
        src: heroDeck.image(tokenId),
        fallbackSrc: resolveUri(image),
      },
    ];
  });
}
