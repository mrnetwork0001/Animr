"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { V2_NAV_LINKS, isV2NavActive } from "./nav";
import { NavItemContent } from "./nav-hud";

/**
 * The header's section links with the current one marked (aria-current), each with its glyph and live badge
 * (nav-hud.tsx). `activeHref` pins the highlight (style-guide previews); normally it follows the URL.
 */
export function V2NavLinks({ activeHref }: { activeHref?: string }) {
  if (activeHref) return <Links pathname={activeHref} />;
  return (
    // usePathname suspends while prerendering routes with unknown params (/chog/[tokenId]).
    <Suspense fallback={<Links pathname={null} />}>
      <CurrentLinks />
    </Suspense>
  );
}

function CurrentLinks() {
  return <Links pathname={usePathname()} />;
}

function Links({ pathname }: { pathname: string | null }) {
  return (
    <ul className="v2-nav-list">
      {V2_NAV_LINKS.map((link) => {
        const active = isV2NavActive(link, pathname);
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              className="v2-nav-link"
              // "page" on the section's own page, "true" on its sub-pages (a replay is part of Versus).
              aria-current={active ? (pathname === link.href ? "page" : "true") : undefined}
            >
              <NavItemContent link={link} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
