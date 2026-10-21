import { Suspense } from "react";
import { AppNavLinks } from "./app-nav-links";
import { ConnectButton } from "./connect-button";
import { HeaderShell } from "./header-shell";

export { AnimrLogo } from "./header-shell";

/**
 * Header for the app routes (app/(app)/layout.tsx); the landing page at / has its own. The frame is
 * server markup (components/header-shell.tsx) with two client islands: the current-page highlight
 * and the wallet button. The root 404 uses MinimalSiteHeader instead, which has neither.
 */
export function SiteHeader() {
  return (
    <HeaderShell
      nav={<AppNavLinks />}
      actions={
        <Suspense fallback={<span className="btn btn-primary opacity-50">Connect wallet</span>}>
          <ConnectButton />
        </Suspense>
      }
    />
  );
}
