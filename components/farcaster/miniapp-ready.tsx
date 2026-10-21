"use client";

import { useEffect } from "react";

/**
 * Inside a Farcaster client (Warpcast and co.), hides the splash screen once the page has rendered:
 * without `sdk.actions.ready()` the splash never goes away. Everywhere else it costs nothing: a top-level
 * window that isn't a React Native WebView can't be a Mini App, so the SDK chunk is never fetched.
 *
 * Loading the SDK also bridges the client's wallet as an EIP-6963 provider. Both login paths listen for EIP-6963
 * announcements (Privy's "detected wallets", or wagmi's discovery in lib/wagmi.ts without Privy), so asking again
 * once the bridge is up adds the Farcaster wallet to the login options with no extra connector package.
 */
export function MiniAppReady() {
  useEffect(() => {
    const w = window as Window & { ReactNativeWebView?: unknown };
    if (w === w.parent && !w.ReactNativeWebView) return;
    let cancelled = false;
    import("@farcaster/miniapp-sdk")
      .then(async ({ sdk }) => {
        if (cancelled || !(await sdk.isInMiniApp())) return;
        await sdk.actions.ready();
        window.dispatchEvent(new Event("eip6963:requestProvider"));
      })
      .catch((error: unknown) => {
        console.warn("[animr] Farcaster Mini App SDK failed:", (error as Error)?.message ?? error);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
