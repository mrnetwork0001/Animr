import type { Metadata } from "next";
import { AppFooter } from "@/components/app-footer";
import { MinimalSiteHeader } from "@/components/header-shell";
import { NotFoundContent } from "@/components/not-found-content";

export const metadata: Metadata = { title: "Not found" };

/**
 * Unmatched URLs and the proxy's rewrite for invalid Chog IDs (/chog/abc, /chog/0) render here,
 * inside the root layout only, so this page brings the app's chrome itself: header, the page's one
 * <main> and footer. It also replaces Next's default 404, whose inline styles repaint <body> white
 * or black.
 *
 * The header is the minimal one (no wallet button, no client islands) and there are no providers:
 * Next sends this boundary along with every page (the landing page too), so client code imported
 * here would be downloaded everywhere.
 */
export default function NotFound() {
  return (
    <>
      <MinimalSiteHeader />
      <main className="flex flex-1 flex-col">
        <NotFoundContent />
      </main>
      <AppFooter />
    </>
  );
}
