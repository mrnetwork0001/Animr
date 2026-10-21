// Farcaster Mini App embeds (https://miniapps.farcaster.xyz/docs/specification#mini-app-embed): a cast of
// any Animr link shows a 3:2 card with one button that opens the page inside the Farcaster client. The
// tags go through Next's `metadata.other`, whose values are plain strings: every URL here is absolute.

/** The app's name in Farcaster clients (spec: at most 32 characters). */
export const MINIAPP_NAME = "Animr";
/** The splash shown while the app loads (200x200 PNG) and its background: the app's own near-black. */
export const SPLASH_PATH = "/farcaster/splash.png";
export const SPLASH_BACKGROUND = "#0E0B1E";
/** 1024x1024 PNG without alpha, for the manifest. */
export const ICON_PATH = "/farcaster/icon.png";
/** The site-wide 3:2 card: today's Daily Bell (app/api/farcaster/embed-image). */
export const EMBED_IMAGE_PATH = "/api/farcaster/embed-image";
export const DEFAULT_BUTTON = "Ride a Chog";
export const DEFAULT_TARGET = "/bell";

/**
 * The deployment's public origin, no trailing slash: NEXT_PUBLIC_SITE_URL, else Vercel's production domain,
 * else localhost (dev). Farcaster clients need absolute URLs and the manifest's domain must match it.
 */
export function siteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "";
  if (raw) {
    try {
      return new URL(raw.includes("://") ? raw : `https://${raw}`).origin;
    } catch {
      // Fall through to localhost.
    }
  }
  return `http://localhost:${process.env.PORT || 3000}`;
}

/** `path` ("/bell") on this deployment; an absolute URL is kept as is. */
export function absoluteUrl(path: string): string {
  return /^https?:\/\//.test(path) ? path : `${siteOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
}

export type MiniAppEmbedOptions = {
  /** The 3:2 card (600x400 to 3000x2000, PNG). Path or absolute URL. Default: today's Bell card. */
  imageUrl?: string;
  /** The button under the card (at most 32 characters). Default "Ride a Chog". */
  buttonTitle?: string;
  /** The page the button opens inside the client. Path or absolute URL. Default /bell. */
  targetUrl?: string;
};

function embedJson({ imageUrl, buttonTitle, targetUrl }: MiniAppEmbedOptions, actionType: "launch_miniapp" | "launch_frame"): string {
  const title = (buttonTitle ?? DEFAULT_BUTTON).slice(0, 32);
  return JSON.stringify({
    version: "1",
    imageUrl: absoluteUrl(imageUrl ?? EMBED_IMAGE_PATH),
    button: {
      title,
      action: {
        type: actionType,
        name: MINIAPP_NAME,
        url: absoluteUrl(targetUrl ?? DEFAULT_TARGET),
        splashImageUrl: absoluteUrl(SPLASH_PATH),
        splashBackgroundColor: SPLASH_BACKGROUND,
      },
    },
  });
}

/**
 * The `other` metadata for a page's Farcaster embed: `fc:miniapp` (action "launch_miniapp") plus the legacy
 * `fc:frame` (action "launch_frame") for older clients. A page that sets `other` replaces the root layout's,
 * so spread this into any other `other` keys that page needs.
 *
 * ```ts
 * export const metadata = { other: miniAppEmbed({ buttonTitle: "Race them", targetUrl: "/versus" }) };
 * ```
 */
export function miniAppEmbed(options: MiniAppEmbedOptions = {}): Record<string, string> {
  return {
    "fc:miniapp": embedJson(options, "launch_miniapp"),
    "fc:frame": embedJson(options, "launch_frame"),
  };
}
