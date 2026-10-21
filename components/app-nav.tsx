import { HEIST_TITLE } from "@/lib/heist/config";

// The app's section links, shared by the server header frame (components/header-shell.tsx), its
// client island that highlights the current one (components/app-nav-links.tsx) and the app footer
// (components/app-footer.tsx). The four verbs of the story sit between the dashboard and the live
// agents: Meet (the League), Rewind (Versus, with the one-Chog Time Machine at /replay), Ride (the
// Daily Bell) and Rob (the heist, named by HEIST_TITLE).

export type AppNavLink = {
  href: string;
  /** Shown from lg. */
  label: string;
  /** Shown below lg, where the header has less room. */
  short: string;
  /** Path prefixes (whole segments) that belong to this section, so its sub-flows highlight it too. */
  match: readonly string[];
};

export const APP_NAV_LINKS: readonly AppNavLink[] = [
  // A Chog's own page (/chog/N) is where the dashboard's lookup leads.
  { href: "/app", label: "Dashboard", short: "Dashboard", match: ["/app", "/chog"] },
  { href: "/league", label: "Meet", short: "Meet", match: ["/league", "/traits"] },
  { href: "/versus", label: "Rewind", short: "Rewind", match: ["/versus", "/replay"] },
  { href: "/bell", label: "Ride", short: "Ride", match: ["/bell"] },
  // "Rob this Chog" from lg, its verb ("Rob") on phones; follows HEIST_TITLE if the name changes.
  { href: "/heist", label: HEIST_TITLE, short: HEIST_TITLE.split(" ")[0], match: ["/heist"] },
  { href: "/leaderboard", label: "Live agents", short: "Agents", match: ["/leaderboard"] },
];

/** The quieter links in the app footer. */
export const APP_FOOTER_LINKS: readonly { href: string; label: string }[] = [
  { href: "/stats", label: "Stats" },
  { href: "/traits", label: "Traits" },
  { href: "/guard", label: "Guard" },
  { href: "/", label: "About" },
];

/** Whether `pathname` is inside the link's section (whole segments only: "/app" isn't active on "/apple"). */
export function isAppNavActive(link: AppNavLink, pathname: string | null): boolean {
  return pathname !== null && link.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Compact on phones (the links share one row with no sideways scroll down to ~340px), roomier from sm. */
export function appNavLinkClass(active: boolean): string {
  return `shrink-0 whitespace-nowrap rounded-lg px-1.5 py-1.5 text-[13px] font-medium transition-colors sm:px-3 sm:text-sm ${
    active ? "bg-accent/15 text-foreground" : "text-muted hover:text-foreground"
  }`;
}

/** A nav label: the short form below lg, the full one from lg. */
export function AppNavLabel({ label, short }: { label: string; short: string }) {
  if (label === short) return label;
  return (
    <>
      <span className="lg:hidden">{short}</span>
      <span className="hidden lg:inline">{label}</span>
    </>
  );
}
