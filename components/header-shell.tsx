import Link from "next/link";
import type { ReactNode } from "react";
import { APP_NAV_LINKS, AppNavLabel, appNavLinkClass } from "./app-nav";

/**
 * The app header's frame: the logo (back to the landing page) and the section links, plus an
 * optional actions slot. Plain server markup that imports no client islands;
 * components/site-header.tsx fills it for the app. About, Stats, Traits and Guard live in the footer.
 */
export function HeaderShell({ nav, actions }: { nav: ReactNode; actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        {/* Dashboard is the first link, so the logo goes home: the story of what Animr is. */}
        <Link href="/" className="flex items-center gap-2.5" aria-label="Animr home">
          <AnimrLogo className="size-8" />
          <span className="text-lg font-semibold tracking-tight">Animr</span>
        </Link>
        {/* Its own full-width row below md, spread like a tab bar; scrolls sideways only on the narrowest phones. */}
        <nav
          aria-label="Main"
          className="order-last -mx-1.5 flex w-[calc(100%+0.75rem)] items-center justify-between gap-0.5 overflow-x-auto [scrollbar-width:none] sm:justify-start sm:gap-1 md:order-none md:mx-0 md:w-auto md:flex-1 md:overflow-visible"
        >
          {nav}
        </nav>
        {actions && <div className="ml-auto">{actions}</div>}
      </div>
    </header>
  );
}

/**
 * The app header without client code (no current-page highlight, no wallet button), for the root
 * 404 (app/not-found.tsx). Next ships that boundary with every page, the landing page included, so
 * it must not import the wallet code (wagmi, react-query) that the app header's islands bring.
 */
export function MinimalSiteHeader() {
  return (
    <HeaderShell
      nav={APP_NAV_LINKS.map(({ href, label, short }) => (
        <Link key={href} href={href} className={appNavLinkClass(false)}>
          <AppNavLabel label={label} short={short} />
        </Link>
      ))}
    />
  );
}

export function AnimrLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="animr-logo-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#A493FF" />
          <stop offset="1" stopColor="#6A50F0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#animr-logo-fill)" />
      <path
        d="M9.5 23 16 8.5 22.5 23"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="18.6" r="2.3" fill="#fff" />
    </svg>
  );
}
