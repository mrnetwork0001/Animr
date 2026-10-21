import type { ReactNode } from "react";
import { showcaseIds } from "./content";
import { RandomChogLink } from "./random-chog";
import { randomChogPool } from "./showcase";

let pool: ReturnType<typeof randomChogPool> | undefined;

/**
 * "Random Chog" for the landing page: the server hands the client link the token range and the ids
 * it must skip (flagged art), so the brand-safety list itself never ships to the browser.
 */
export function RandomChog({ className, children }: { className?: string; children: ReactNode }) {
  pool ??= randomChogPool();
  return (
    <RandomChogLink min={pool.min} max={pool.max} exclude={pool.exclude} fallbackId={showcaseIds.hero} className={className}>
      {children}
    </RandomChogLink>
  );
}
