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
  // A Chog's own page (/chog/N) is where the lookup leads.
  { href: "/app", label: "Your Chogs", short: "Chogs", match: ["/app", "/chog"] },
  // Traits, Chogs for sale (/market) and the claimed-AI board (/leaderboard) are League tabs.
  { href: "/league", label: "League", short: "League", match: ["/league", "/traits", "/market", "/leaderboard"] },
  // Two-Chog races, the one-Chog Time Machine at /replay and Breed (/breed).
  { href: "/versus", label: "Versus", short: "Versus", match: ["/versus", "/replay", "/breed"] },
  { href: "/bell", label: "Daily Bell", short: "Bell", match: ["/bell"] },
  { href: "/heist", label: HEIST_TITLE, short: "Heist", match: ["/heist"] },
  { href: "/guard", label: "Guard", short: "Guard", match: ["/guard"] },
];

export const V2_FOOTER_LINKS: readonly { href: string; label: string }[] = [
  { href: "/tour", label: "Judge tour" },
  { href: "/stats", label: "Stats" },
  { href: "/traits", label: "Traits" },
  { href: "/#faq", label: "FAQ" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/docs", label: "Docs" },
];

/** Whether `pathname` is inside the link's section (whole segments: "/app" isn't active on "/apple"). */
export function isV2NavActive(link: V2NavLink, pathname: string | null): boolean {
  return pathname !== null && link.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
