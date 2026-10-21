import type { Viewport } from "next";
import { Suspense } from "react";
import { AppFooterFacts } from "@/components/app-footer";
import { ConnectButton, ConnectButtonFallback } from "@/components/connect-button";
import { AppShell } from "@/components/v2";
import { Providers } from "../providers";

/** The v2 page colour, so the browser chrome matches the near-black shell. Pages may still override it. */
export const viewport: Viewport = {
  themeColor: "#0d0c11",
  colorScheme: "dark",
};

/**
 * Chrome for the app: /app (Your Chogs), /league, /chog/[tokenId] and the rest of the app. The
 * landing page at / lives in app/(site) with its own header and footer; both groups share the root
 * layout, so moving between them stays a client-side navigation.
 *
 * AppShell (components/v2) is the frame: glass header, the page's one <main id="v2-main">, footer.
 * It imports no wallet code; the wallet button comes in through its `wallet` slot.
 *
 * The wallet and query providers (wagmi + react-query) live here rather than in the root layout:
 * every consumer is an app route, so the landing page doesn't download or hydrate them.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Providers>
      <AppShell
        wallet={
          <Suspense fallback={<ConnectButtonFallback />}>
            <ConnectButton size="sm" />
          </Suspense>
        }
        footerExtra={<AppFooterFacts />}
      >
        {children}
      </AppShell>
    </Providers>
  );
}
