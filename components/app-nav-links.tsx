"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { APP_NAV_LINKS, AppNavLabel, appNavLinkClass, isAppNavActive } from "./app-nav";

/** The app header's section links, with the current one highlighted (sub-flows count: /replay is Rewind). */
export function AppNavLinks() {
  return (
    // usePathname suspends while prerendering routes with unknown params (/chog/[tokenId]).
    <Suspense fallback={<NavLinks pathname={null} />}>
      <CurrentNavLinks />
    </Suspense>
  );
}

function CurrentNavLinks() {
  const pathname = usePathname();
  return <NavLinks pathname={pathname} />;
}

function NavLinks({ pathname }: { pathname: string | null }) {
  return APP_NAV_LINKS.map((link) => {
    const active = isAppNavActive(link, pathname);
    return (
      <Link
        key={link.href}
        href={link.href}
        // "page" on the link's own page; "true" inside its section (a replay is part of Rewind).
        aria-current={active ? (pathname === link.href ? "page" : "true") : undefined}
        className={appNavLinkClass(active)}
      >
        <AppNavLabel label={link.label} short={link.short} />
      </Link>
    );
  });
}
