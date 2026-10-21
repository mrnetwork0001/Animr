import type { ReactNode } from "react";

/**
 * Landing-page icons: 24×24 stroke glyphs drawn for Animr. Add one here and its name becomes
 * available to content.ts (e.g. for a new feature card).
 */
export const icons = {
  wallet: (
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H17a1 1 0 0 1 1 1v3" />
      <path d="M4 7.5v10A2.5 2.5 0 0 0 6.5 20H19a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 1 4 7.5Z" />
      <circle cx="16" cy="14.5" r="1.25" fill="currentColor" stroke="none" />
    </>
  ),
  dna: (
    <>
      <path d="M8 3c0 5 8 5 8 9s-8 4-8 9" />
      <path d="M16 3c0 5-8 5-8 9s8 4 8 9" />
      <path d="M9 5.5h6M8.5 12h7M9 18.5h6" />
    </>
  ),
  scroll: (
    <>
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4M9 12h6M9 16h6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="12" cy="6.5" rx="6.5" ry="2.75" />
      <path d="M5.5 6.5v5c0 1.5 2.9 2.75 6.5 2.75s6.5-1.25 6.5-2.75v-5" />
      <path d="M5.5 11.5v5c0 1.5 2.9 2.75 6.5 2.75s6.5-1.25 6.5-2.75v-5" />
    </>
  ),
  spark: (
    <>
      <path d="M11 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5Z" />
      <path d="M18.5 15.5v5M16 18h5" />
    </>
  ),
  feed: (
    <>
      <path d="M5 4.5h14a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z" />
      <path d="M8 9h8M8 12h5" />
    </>
  ),
  nft: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <circle cx="9" cy="9" r="1.75" />
      <path d="m20.5 15-4.5-4.5-10 10" />
    </>
  ),
  cpu: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9.5 9.5h5v5h-5z" />
      <path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5.5c0 4.3 2.9 7.9 7 9.5 4.1-1.6 7-5.2 7-9.5V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  pool: (
    <>
      <path d="M4 8.5h13.5M14 5l3.5 3.5L14 12" />
      <path d="M20 15.5H6.5M10 12l-3.5 3.5L10 19" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 11.5h6M9 15h3" />
    </>
  ),
  refresh: (
    <>
      <path d="M4.5 12a7.5 7.5 0 0 1 12.9-5.2L20 9.5" />
      <path d="M20 4.5v5h-5" />
      <path d="M19.5 12a7.5 7.5 0 0 1-12.9 5.2L4 14.5" />
      <path d="M4 19.5v-5h5" />
    </>
  ),
  gauge: (
    <>
      <path d="M4 16a8 8 0 1 1 16 0" />
      <path d="m12 16 3.5-5" />
      <circle cx="12" cy="16" r="1.25" />
    </>
  ),
  chart: (
    <>
      <path d="M4 4v15a1 1 0 0 0 1 1h15" />
      <path d="m7.5 14.5 3.5-4 3 3 5-6" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5.5H5.5v1a3 3 0 0 0 2.8 3M16 5.5h2.5v1a3 3 0 0 1-2.8 3" />
      <path d="M12 13v4M8.5 20.5h7M10 17h4v3.5h-4z" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 12.1V4.5a1 1 0 0 1 1-1h7.6a1 1 0 0 1 .7.3l7.7 7.7a1 1 0 0 1 0 1.4l-7.6 7.6a1 1 0 0 1-1.4 0l-7.7-7.7a1 1 0 0 1-.3-.7Z" />
      <circle cx="8" cy="8" r="1.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  play: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10.25 8.75v6.5L15.5 12l-5.25-3.25Z" />
    </>
  ),
  bell: (
    <>
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14l1.5-2Z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0M12 3.5v2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  rewind: (
    <>
      <path d="M11.5 7 5 12l6.5 5V7Z" />
      <path d="M19.5 7 13 12l6.5 5V7Z" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15.5" r="3.75" />
      <path d="m10.7 12.8 8.3-8.3M15.5 8l2.5 2.5M13.3 10.2l2 2" />
    </>
  ),
  mask: (
    <>
      <path d="M3 10c0-1.7 1.3-3 3-3 2.1 0 3.6.9 6 .9s3.9-.9 6-.9c1.7 0 3 1.3 3 3 0 4-2.3 6.5-4.8 6.5-2.2 0-2.9-1.6-4.2-1.6s-2 1.6-4.2 1.6C5.3 16.5 3 14 3 10Z" />
      <path d="M7 11.25c.6-.5 1.4-.5 2 0M15 11.25c.6-.5 1.4-.5 2 0" />
    </>
  ),
  dice: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="15" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof icons;

/** Decorative by default (aria-hidden): pair it with visible text. */
export function Icon({ name, className = "size-5", strokeWidth = 1.75 }: { name: IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden
      focusable="false"
    >
      {icons[name]}
    </svg>
  );
}
