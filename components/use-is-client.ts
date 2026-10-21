"use client";

import { useSyncExternalStore } from "react";

const subscribeNothing = () => () => {};

/**
 * False during SSR and hydration, true afterwards. The server always renders
 * "disconnected", and wagmi's hooks read the live store even while hydrating, so
 * wallet-dependent markup must wait for this to stay hydration-safe.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}
