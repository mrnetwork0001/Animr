import { NotFoundContent } from "@/components/not-found-content";

/**
 * notFound() thrown inside the app (/app, /leaderboard, /chog/[tokenId]) renders here, inside the app's AppShell (its
 * header and <main>). Unmatched URLs, and the proxy's rewrite for invalid Chog IDs, render the root app/not-found.tsx
 * instead, which wraps the same content in its own AppShell.
 */
export default function AppNotFound() {
  return <NotFoundContent />;
}
