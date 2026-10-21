import type { SVGProps } from "react";

// The hero's glyphs, drawn for Animr on a 32×32 grid (decorative: always aria-hidden).

type IconProps = Omit<SVGProps<SVGSVGElement>, "children">;

const base = {
  viewBox: "0 0 32 32",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

/** A hub with five linked nodes: thirteen traits wired into one genome. */
export function NetworkGraphIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M16 5 26.46 12.6 22.47 24.9H9.53L5.54 12.6Z" opacity={0.42} />
      <path d="M16 12.4V5M19.42 14.89l7.04-2.29M18.12 18.91l4.35 5.99M13.88 18.91 9.53 24.9M12.58 14.89 5.54 12.6" />
      <circle cx="16" cy="16" r="3.6" />
      <circle cx="16" cy="16" r="1.3" fill="currentColor" stroke="none" />
      <g fill="currentColor" stroke="none">
        <circle cx="16" cy="5" r="2.1" />
        <circle cx="26.46" cy="12.6" r="2.1" />
        <circle cx="22.47" cy="24.9" r="2.1" />
        <circle cx="9.53" cy="24.9" r="2.1" />
        <circle cx="5.54" cy="12.6" r="2.1" />
      </g>
    </svg>
  );
}

/** A crenellated wall with a padlock in it: the guard that lets trades through and nothing out. */
export function FortressLockIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 27.5V6.5H8V10h3V6.5h3.5V10h3V6.5H21V10h3V6.5h3.5v21Z" />
      <path d="M12.75 18.5v-2.25a3.25 3.25 0 0 1 6.5 0v2.25" />
      <rect x="11" y="18.5" width="10" height="7.25" rx="1.6" fill="currentColor" fillOpacity={0.16} />
      <circle cx="16" cy="21.6" r="1.05" fill="currentColor" stroke="none" />
      <path d="M16 22.6v1.5" />
    </svg>
  );
}

/** Two bars that cross into an X while the menu is open. */
export function MenuIcon({ open, ...props }: IconProps & { open: boolean }) {
  return (
    <svg {...base} viewBox="0 0 24 24" strokeWidth={1.7} {...props}>
      {open ? <path d="M7 7l10 10M17 7 7 17" /> : <path d="M5 9.25h14M5 14.75h14" />}
    </svg>
  );
}
