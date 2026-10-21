import Link from "next/link";
import type { ReactNode } from "react";
import { heroDisplayFont, heroTextFont } from "@/components/hero/fonts";
import { V2_FOOTER_LINKS } from "./nav";
import { V2NavLinks } from "./nav-links";
import "@/app/design-v2.css";

/**
 * The hero's two families (DM Sans, Inter) as CSS variables, for a v2 root that isn't <AppShell>
 * (e.g. the root 404): put it next to "v2-page" on the outermost element.
 */
export const v2FontClassName = `${heroDisplayFont.variable} ${heroTextFont.variable}`;

type AppShellProps = {
  children: ReactNode;
  /**
   * The wallet slot at the header's right: pass the existing client island, e.g.
   * <Suspense fallback={…}><ConnectButton /></Suspense>. The shell imports no wallet code itself, so
   * it can also frame pages outside the wagmi providers (the 404, previews).
   */
  wallet?: ReactNode;
  /** Replaces the footer's default line (build credit + "Not affiliated with Chog"). */
  footerNote?: ReactNode;
  /** Extra footer content under the note: contract addresses, honesty notes. */
  footerExtra?: ReactNode;
  /** Pins the nav highlight (style-guide previews). Normally it follows the URL. */
  activeHref?: string;
};

/**
 * The v2 app frame: grid background, sticky glass header (logo tile + wordmark, section links, wallet
 * slot), the page's one <main id="v2-main">, and the footer. Server component; the only client code
 * is the nav highlight. Pages render <div className="v2-shell"> containers inside it.
 */
export function AppShell({ children, wallet, footerNote, footerExtra, activeHref }: AppShellProps) {
  return (
    <div className={`v2-page ${v2FontClassName}`}>
      <a href="#v2-main" className="v2-skip">
        Skip to content
      </a>
      <V2Header wallet={wallet} activeHref={activeHref} />
      <main id="v2-main" className="v2-main" tabIndex={-1}>
        {children}
      </main>
      <V2Footer note={footerNote} extra={footerExtra} />
    </div>
  );
}

/** The Animr lockup (public/brand/animr-header.png): mark, wordmark and tagline. Links home. */
export function V2Brand() {
  return (
    <Link href="/" className="v2-brand" aria-label="Animr home">
      {/* eslint-disable-next-line @next/next/no-img-element -- a small static lockup; next/image adds nothing here */}
      <img className="v2-brand-logo" src="/brand/animr-header.png" width={494} height={132} alt="Animr" decoding="async" />
    </Link>
  );
}

export function V2Header({ wallet, activeHref }: { wallet?: ReactNode; activeHref?: string }) {
  return (
    <header className="v2-header">
      <div className="v2-shell v2-header-bar">
        <V2Brand />
        {/* From 1100px inline between brand and wallet; below that, its own scrollable row. */}
        <nav className="v2-nav" aria-label="Main">
          <V2NavLinks activeHref={activeHref} />
        </nav>
        <div className="v2-header-actions">{wallet}</div>
      </div>
    </header>
  );
}

export function V2Footer({ note, extra }: { note?: ReactNode; extra?: ReactNode }) {
  return (
    <footer className="v2-footer">
      <div className="v2-shell">
        <div className="v2-footer-row">
          <nav aria-label="Footer">
            <ul className="v2-footer-links">
              {V2_FOOTER_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="v2-footer-link">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <p className="v2-footer-tag">
            {note ?? (
              <>
                Animr · Built for Chogathon 2026 on Monad <span aria-hidden="true">·</span> Not affiliated with Chog
              </>
            )}
          </p>
        </div>
        {extra != null && <div className="v2-footer-note">{extra}</div>}
      </div>
    </footer>
  );
}
