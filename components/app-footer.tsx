import { SiteFooter } from "@/components/site-footer/site-footer";

/**
 * Retired: the app and the landing page share one footer, components/site-footer/site-footer.tsx, which carries the
 * honesty note and the contract chips itself. AppShell renders it; this name is kept for older imports.
 */
export function AppFooter() {
  return <SiteFooter />;
}
