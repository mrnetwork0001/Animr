import type { Viewport } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer/site-footer";
import { V2Brand, v2FontClassName } from "@/components/v2/app-shell";
import "@/app/design-v2.css";

export const viewport: Viewport = {
  themeColor: "#0d0c11",
  colorScheme: "dark",
};

/**
 * The documentation's own chrome: the same page frame and footer as the app, but a quiet header with only the brand
 * and a way back into the app. No section tabs, no live badges, no login: the docs are for reading, and they load no
 * wallet code.
 */
export default function DocsLayout({ children }: LayoutProps<"/">) {
  return (
    <div className={`v2-page ${v2FontClassName}`}>
      <a href="#v2-main" className="v2-skip">
        Skip to content
      </a>
      <header className="v2-header">
        <div className="v2-shell v2-docs-header-bar">
          <V2Brand />
          <Link href="/app" className="v2-btn-glass v2-btn--sm">
            Open the app
          </Link>
        </div>
      </header>
      <main id="v2-main" className="v2-main" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
