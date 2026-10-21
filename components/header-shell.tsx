import { V2Header } from "@/components/v2/app-shell";

// Retired: AppShell (components/v2) is the app's frame. Kept as thin aliases so older imports still render.

/** The v2 header without a wallet button (no wagmi), as the root 404 once used. */
export function MinimalSiteHeader() {
  return <V2Header />;
}

/** The Animr mark (the old app header's logo). The v2 header draws its own brand tile; kept for image cards. */
export function AnimrLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="animr-logo-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#A493FF" />
          <stop offset="1" stopColor="#6A50F0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#animr-logo-fill)" />
      <path
        d="M9.5 23 16 8.5 22.5 23"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="18.6" r="2.3" fill="#fff" />
    </svg>
  );
}
