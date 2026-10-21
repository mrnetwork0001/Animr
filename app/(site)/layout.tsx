import { brand } from "@/components/landing/content";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import "@/components/landing/landing.css";

/**
 * Chrome for the landing page at /: its own header and footer around the page's one <main>.
 * The app routes (app/(app)) share the root layout, so "Launch App" stays a client-side navigation.
 */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    // overflow-x-clip (not hidden) trims the decorative glows without breaking the sticky header.
    <div className="landing-root flex flex-1 flex-col overflow-x-clip">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-background"
      >
        {brand.skipLink}
      </a>
      <LandingHeader />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
      <LandingFooter />
    </div>
  );
}
