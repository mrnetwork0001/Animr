import { AppFooter } from "@/components/app-footer";
import { SiteHeader } from "@/components/site-header";
import { Providers } from "../providers";

/**
 * Chrome for the app: /app (dashboard), /leaderboard, /chog/[tokenId] and the rest of the app. The
 * landing page at / lives in app/(site) with its own header and footer; both groups share the root
 * layout, so moving between them stays a client-side navigation.
 *
 * The wallet and query providers (wagmi + react-query) live here rather than in the root layout:
 * every consumer is an app route, so the landing page doesn't download or hydrate them.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Providers>
      <SiteHeader />
      {/* The page's one <main> landmark; pages render plain containers inside it. */}
      <main className="flex flex-1 flex-col">{children}</main>
      <AppFooter />
    </Providers>
  );
}
