/**
 * The Animr mark, same artwork as AnimrLogo in components/header-shell.tsx (also exported from
 * site-header.tsx). Redrawn here so the landing page never imports the app header's modules (wallet
 * connect and friends). `id` keeps the gradient id unique when the mark appears twice.
 */
export function LandingLogo({ id, className = "" }: { id: string; className?: string }) {
  const gradient = `animr-landing-logo-${id}`;
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#A493FF" />
          <stop offset="1" stopColor="#6A50F0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradient})`} />
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
