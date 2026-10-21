import type { Metadata, Viewport } from "next";
import { AppFooterFacts } from "@/components/app-footer";
import { NotFoundContent } from "@/components/not-found-content";
import { AppShell } from "@/components/v2";

export const metadata: Metadata = { title: "Not found" };

export const viewport: Viewport = { themeColor: "#0d0c11", colorScheme: "dark" };

/**
 * Unmatched URLs and the proxy's rewrite for invalid Chog IDs (/chog/abc, /chog/0) render here, inside the root
 * layout only, so this page brings the app's chrome itself: AppShell's header, the page's one <main> and footer. It
 * also replaces Next's default 404, whose inline styles repaint <body> white or black.
 *
 * The shell gets no wallet button and there are no providers: Next sends this boundary along with every page (the
 * landing page too), so client code imported here would be downloaded everywhere. AppShell's only client island is
 * the nav highlight.
 */
export default function NotFound() {
  return (
    <AppShell footerExtra={<AppFooterFacts />}>
      <NotFoundContent />
    </AppShell>
  );
}
