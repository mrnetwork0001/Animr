import { connection } from "next/server";
import {
  DEFAULT_BUTTON,
  DEFAULT_TARGET,
  EMBED_IMAGE_PATH,
  ICON_PATH,
  MINIAPP_NAME,
  SPLASH_BACKGROUND,
  SPLASH_PATH,
  absoluteUrl,
} from "@/lib/farcaster/embed";

// The Farcaster Mini App manifest (https://miniapps.farcaster.xyz/docs/specification#manifest). The account
// association is signed per domain by the owner's Farcaster account in the Warpcast Manifest tool and pasted
// into FARCASTER_HEADER / FARCASTER_PAYLOAD / FARCASTER_SIGNATURE (submission/FARCASTER.md). Read at request
// time so new env values only need a redeploy, never a code change. Copy limits from the spec: subtitle,
// tagline and ogTitle 30 characters, description 170, ogDescription 100, tags 5 x 20 lowercase.

export async function GET() {
  await connection();
  const header = process.env.FARCASTER_HEADER?.trim();
  const payload = process.env.FARCASTER_PAYLOAD?.trim();
  const signature = process.env.FARCASTER_SIGNATURE?.trim();
  const shareImage = absoluteUrl("/landing/og-v2.png");

  const manifest = {
    // Without it the manifest still parses; clients just won't verify the domain (or let anyone add the app).
    ...(header && payload && signature ? { accountAssociation: { header, payload, signature } } : {}),
    miniapp: {
      version: "1",
      name: MINIAPP_NAME,
      homeUrl: absoluteUrl(DEFAULT_TARGET),
      iconUrl: absoluteUrl(ICON_PATH),
      splashImageUrl: absoluteUrl(SPLASH_PATH),
      splashBackgroundColor: SPLASH_BACKGROUND,
      subtitle: "Every Chog is an AI trader",
      description:
        "Every Chog NFT is an AI trader and its traits are its strategy. Ride one at the Daily Bell, race two in Versus, or try to rob the House Chog. Points only.",
      tagline: "Ride a Chog at the Daily Bell",
      primaryCategory: "games",
      tags: ["chog", "monad", "aitrading", "nft", "dailybell"],
      heroImageUrl: shareImage,
      ogTitle: "Animr",
      ogDescription: "Every Chog NFT is an AI trader. Ride one at the Daily Bell for points.",
      ogImageUrl: shareImage,
      // Preview deployments stay out of the Mini App search.
      noindex: process.env.VERCEL_ENV === "preview",
      // Deprecated fields, still read by older clients for the app's default embed.
      imageUrl: absoluteUrl(EMBED_IMAGE_PATH),
      buttonTitle: DEFAULT_BUTTON,
    },
  };

  return Response.json(manifest, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
