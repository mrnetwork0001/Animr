import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { LOGO_PNG_BASE64 } from "./logo-data";

// Shared look of the share cards (app/(app)/**/opengraph-image.tsx): the app's palette, the Animr mark
// and the Geist fonts, for next/og's ImageResponse (Satori + resvg). Server-only.

/** Every card is 1200x630: the Open Graph and X large-card size. */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** The app's color tokens (app/globals.css) as plain hex: Satori can't read CSS variables. */
export const C = {
  bg: "#0E0B1E",
  surface: "#151129",
  surface2: "#1C1737",
  line: "#2A2350",
  lineStrong: "#3A3170",
  fg: "#F3F1FF",
  muted: "#A59FC9",
  subtle: "#8A83B3",
  accent: "#836EF9",
  accentStrong: "#9D8CFF",
  accentDeep: "#5B45D6",
  success: "#3DDC97",
  warning: "#F5B544",
  danger: "#FF6B81",
} as const;

/** Green above zero, red below, muted at (rounded) zero: the same tone for bulls and bears, gains and losses. */
export function toneOf(pct: number | null | undefined, digits = 1): string {
  if (typeof pct !== "number" || !Number.isFinite(pct) || Math.abs(pct) < 0.5 * 10 ** -digits) return C.muted;
  return pct > 0 ? C.success : C.danger;
}

/** The Animr mark (public/brand/animr-mark.png, the favicon artwork) as a data URI. */
export const LOGO_SRC = `data:image/png;base64,${LOGO_PNG_BASE64}`;

type OgFont = { name: string; data: Buffer; weight: 400 | 600; style: "normal" };

/**
 * Geist 400 and 600 (the app's font; TTF because Satori can't read WOFF2; SIL OFL, lib/og/fonts/OFL.txt).
 * Read once at module scope, so no card does file I/O while it renders (and the static cards can be
 * prerendered). Static paths, so the build traces the files into the deployment. A missing file only
 * costs that weight: Satori falls back to its built-in Geist Regular.
 */
const FONTS: OgFont[] = (
  await Promise.all([
    readFile(join(process.cwd(), "lib/og/fonts/Geist-Regular.ttf")).then(
      (data): OgFont => ({ name: "Geist", data, weight: 400, style: "normal" }),
      () => null,
    ),
    readFile(join(process.cwd(), "lib/og/fonts/Geist-SemiBold.ttf")).then(
      (data): OgFont => ({ name: "Geist", data, weight: 600, style: "normal" }),
      () => null,
    ),
  ])
).filter((font): font is OgFont => font !== null);

if (FONTS.length < 2) console.warn("[animr] Share cards: Geist fonts missing from lib/og/fonts, using the built-in font.");

/**
 * ImageResponse options for a card. `cacheSeconds` (request-time cards only) lets the CDN keep a complete
 * card for that long; leave it out for prerendered cards, whose caching Next.js manages.
 */
export function ogOptions(cacheSeconds?: number) {
  return {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    ...(FONTS.length > 0 && { fonts: FONTS }),
    ...(cacheSeconds
      ? { headers: { "Cache-Control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, stale-while-revalidate=86400` } }
      : {}),
  };
}

/**
 * The site's host for the card footer ("animr.xyz"): NEXT_PUBLIC_SITE_URL, else Vercel's production
 * domain. Null on localhost or when neither is set, so a card never advertises a dev address.
 */
export function siteHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "";
  if (!raw) return null;
  try {
    const host = new URL(raw.includes("://") ? raw : `https://${raw}`).host;
    return host && !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(host) ? host.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}
