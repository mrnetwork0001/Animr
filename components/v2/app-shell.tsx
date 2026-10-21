import Link from "next/link";
import type { ReactNode } from "react";
import { heroDisplayFont, heroTextFont } from "@/components/hero/fonts";
import { SiteFooter } from "@/components/site-footer/site-footer";
import { V2HeaderActions } from "./mobile-menu";
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
  /** Replaces the footer's credit line ("© 2026 Animr · Built for Chogathon 2026 on Monad · Not affiliated with Chog"). */
  footerNote?: ReactNode;
  /** Extra footer content under the honesty note. The note and contract chips are built into the footer already. */
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
        {/* From 1100px inline between brand and wallet; below that, inside the hamburger panel. */}
        <nav className="v2-nav" aria-label="Main">
          <V2NavLinks activeHref={activeHref} />
        </nav>
        <V2HeaderActions wallet={wallet} />
      </div>
    </header>
  );
}

/** The site footer (components/site-footer), shared with the landing page. Kept under this name for older imports. */
export function V2Footer({ note, extra }: { note?: ReactNode; extra?: ReactNode }) {
  return <SiteFooter note={note} extra={extra} />;
}
