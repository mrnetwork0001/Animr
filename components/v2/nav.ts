import { HEIST_TITLE } from "@/lib/heist/config";

// The v2 header and footer links (components/v2/app-shell.tsx). Shared by the server shell and its
// client island (nav-links.tsx), so plain data only. HEIST_TITLE is safe to import on the client.

export type V2NavLink = {
  href: string;
  label: string;
  /** Phones (under 560px), where the rail has less room. */
  short: string;
  /** Path prefixes (whole segments) that belong to this section, so sub-pages highlight it too. */
  match: readonly string[];
};

export const V2_NAV_LINKS: readonly V2NavLink[] = [
  // A Chog's own page (/chog/N) is where the dashboard lookup leads.
  { href: "/app", label: "Dashboard", short: "Dashboard", match: ["/app", "/chog"] },
  { href: "/league", label: "League", short: "League", match: ["/league", "/traits"] },
  // Rewind = Versus, with the one-Chog Time Machine at /replay.
  { href: "/versus", label: "Rewind", short: "Rewind", match: ["/versus", "/replay"] },
  { href: "/bell", label: "Daily Bell", short: "Bell", match: ["/bell"] },
  { href: "/heist", label: HEIST_TITLE, short: HEIST_TITLE.split(" ")[0], match: ["/heist"] },
  { href: "/leaderboard", label: "Live agents", short: "Agents", match: ["/leaderboard"] },
];

export const V2_FOOTER_LINKS: readonly { href: string; label: string }[] = [
  { href: "/stats", label: "Stats" },
  { href: "/traits", label: "Traits" },
  { href: "/guard", label: "Guard" },
  { href: "/", label: "About" },
];

/** Whether `pathname` is inside the link's section (whole segments: "/app" isn't active on "/apple"). */
export function isV2NavActive(link: V2NavLink, pathname: string | null): boolean {
  return pathname !== null && link.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
