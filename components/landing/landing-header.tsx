import Link from "next/link";
import { brand, ctas, links, menu, nav } from "./content";
import { Icon } from "./icons";
import { LandingLogo } from "./logo";
import { MobileMenu } from "./mobile-menu";

/** Sticky landing header: brand, section anchors (a menu on phones) and the way into the app. */
export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-background/75 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" aria-label={brand.homeLabel} className="flex shrink-0 items-center gap-2.5 rounded-lg">
          <LandingLogo id="header" className="size-8" />
          <span className="text-lg font-semibold tracking-tight">{brand.name}</span>
        </Link>

        <nav aria-label={menu.label} className="ml-4 hidden md:block lg:ml-8">
          <ul className="flex items-center gap-1">
            {nav.map((item) => (
              // `wide` items need the room the header has from lg.
              <li key={item.href} className={item.wide ? "hidden lg:block" : undefined}>
                <a
                  href={item.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2/60 hover:text-foreground"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <Link href={links.app} className="btn btn-primary">
            {ctas.launch}
            <Icon name="arrowRight" className="size-4" strokeWidth={2} />
          </Link>
          <MobileMenu items={nav} labels={menu} />
        </div>
      </div>
    </header>
  );
}
