import { type NextRequest, NextResponse } from "next/server";
import { parseDay } from "@/lib/bell/rules";
import { appConfig } from "@/lib/config";
import { isBoutId } from "@/lib/rewind/id";

/** Same rule as the /chog/[tokenId] and /replay/[tokenId] pages: a decimal id inside the collection's range. */
function isChogTokenId(raw: string): boolean {
  if (!/^\d{1,78}$/.test(raw)) return false;
  const id = BigInt(raw);
  return id >= appConfig.tokenIdRange.min && id <= appConfig.tokenIdRange.max;
}

/** The dynamic segment each matched route validates (same rules as its page). */
const ROUTES: { prefix: string; valid: (segment: string) => boolean }[] = [
  { prefix: "/chog/", valid: isChogTokenId },
  { prefix: "/replay/", valid: isChogTokenId },
  { prefix: "/bell/", valid: (day) => parseDay(day) !== null },
  // A VERSUS bout id: 11 base-36 characters with a check (lib/rewind/id.ts). Its window may still be unknown to
  // this server's candles; the page answers that one itself.
  { prefix: "/versus/", valid: isBoutId },
];

/**
 * Metadata image routes that sit next to a checked segment: app/(app)/bell/opengraph-image.tsx is served at
 * /bell/opengraph-image-<hash>, which is neither a day nor a 404 but a real route.
 */
const METADATA_IMAGE = /^(?:opengraph|twitter)-image(?:-[\w-]+)?$/;

/**
 * Gives invalid Chog, replay, Bell-day and VERSUS bout URLs a real 404. Those pages read their params inside
 * <Suspense>, so their own notFound() runs after streaming starts and can only send a soft 404 (200).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const route = ROUTES.find(({ prefix }) => pathname.startsWith(prefix));
  if (!route) return NextResponse.next();
  let segment: string;
  try {
    segment = decodeURIComponent(pathname.slice(route.prefix.length));
  } catch {
    segment = "";
  }
  if (METADATA_IMAGE.test(segment)) return NextResponse.next();
  if (route.valid(segment)) return NextResponse.next();
  // The built-in not-found route renders app/not-found.tsx with a 404 status.
  return NextResponse.rewrite(new URL("/_not-found", request.url));
}

export const config = { matcher: ["/chog/:tokenId", "/replay/:tokenId", "/bell/:day", "/versus/:id"] };
