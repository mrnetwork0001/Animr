/**
 * The landing page at / draws its own frame (app/(site)/page.tsx): the hero's header is the banner,
 * the hero and every section sit in the page's one <main>, and the landing footer follows. The app
 * routes (app/(app)) share the root layout, so "Launch App" stays a client-side navigation.
 */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return children;
}
