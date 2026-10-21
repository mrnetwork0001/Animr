"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { privyEnabled } from "@/lib/privy";
import { wagmiConfig } from "@/lib/wagmi";

/**
 * Privy's SDK (login modal, embedded wallets) loads after hydration, beside the page rather than around it, so it
 * never delays a render. It publishes its session to components/privy/session.ts and bridges its active wallet into
 * the wagmi config below.
 */
const PrivyIsland = privyEnabled ? dynamic(() => import("@/components/privy/privy-island"), { ssr: false }) : null;

let browserQueryClient: QueryClient | undefined;

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 5_000 } } });
}

function getQueryClient() {
  // A fresh client per server render; one shared client per browser session.
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    // With Privy, the island owns the connection: wagmi must not reconnect on its own.
    <WagmiProvider config={wagmiConfig} reconnectOnMount={!privyEnabled}>
      <QueryClientProvider client={getQueryClient()}>
        {children}
        {PrivyIsland && <PrivyIsland />}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
