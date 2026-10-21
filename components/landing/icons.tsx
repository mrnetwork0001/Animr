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
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
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
