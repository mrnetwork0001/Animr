import { Suspense } from "react";
import { V2Header } from "@/components/v2/app-shell";
import { ConnectButton, ConnectButtonFallback } from "./connect-button";

export { AnimrLogo } from "./header-shell";

/**
 * Retired: app/(app)/layout.tsx renders AppShell (components/v2), which brings this header itself. Kept as an alias
 * (the v2 header with the wallet button) so older imports still render.
 */
export function SiteHeader() {
  return (
    <V2Header
      wallet={
        <Suspense fallback={<ConnectButtonFallback />}>
          <ConnectButton size="sm" />
        </Suspense>
      }
    />
  );
}
