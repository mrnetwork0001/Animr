"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";

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
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
