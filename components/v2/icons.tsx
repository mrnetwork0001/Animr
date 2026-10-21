import type { SVGProps } from "react";

// v2 glyphs for <IconTile>: the hero's line style (32×32 grid, 1.6 stroke, round joins), always
// decorative (aria-hidden). The hero's two are re-exported so every page draws from one set.
export { FortressLockIcon as GuardIcon, NetworkGraphIcon as GenomeIcon } from "@/components/hero/icons";

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

/** League: a podium with a star over the top step. */
export function LeagueIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 27.5h23M11.5 27.5V16h9v11.5M4.5 27.5V20.5h7M27.5 27.5V22.5h-7" />
      <path d="m16 4.6 1.55 3.15 3.47.5-2.51 2.45.59 3.45L16 12.53l-3.1 1.62.59-3.45-2.51-2.45 3.47-.5Z" fill="currentColor" fillOpacity={0.16} />
    </svg>
  );
}

/** Rewind / Time Machine: a clock face with a counter-clockwise arrow. */
export function RewindIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6.2 11.5A11 11 0 1 1 5 16" />
      <path d="M5.6 5.8v5.9h5.9" />
      <path d="M16 10v6.2l4 2.6" />
      <circle cx="16" cy="16" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Daily Bell. */
export function BellIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8.5 22.5V15a7.5 7.5 0 0 1 15 0v7.5l2.2 2.5H6.3Z" fill="currentColor" fillOpacity={0.1} />
      <path d="M13.2 25a2.9 2.9 0 0 0 5.6 0M16 4.5v3" />
      <path d="M25.5 7.5c1.4 1.3 2.3 3 2.6 4.9M6.5 7.5C5.1 8.8 4.2 10.5 3.9 12.4" opacity={0.5} />
    </svg>
  );
}

/** Rob this Chog: a domino mask. */
export function MaskIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 12.5c0-1.6 1.2-2.6 2.8-2.3 3.3.6 6.4 1.2 9.7 1.2s6.4-.6 9.7-1.2c1.6-.3 2.8.7 2.8 2.3 0 6.3-3 10-7.5 10-2.6 0-3.6-2.6-5-2.6s-2.4 2.6-5 2.6c-4.5 0-7.5-3.7-7.5-10Z" fill="currentColor" fillOpacity={0.1} />
      <path d="M8.5 15.3c1.2-1.3 3.4-1.3 4.6 0M18.9 15.3c1.2-1.3 3.4-1.3 4.6 0" />
    </svg>
  );
}

/** Live agents: a pulse line through a ring. */
export function PulseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="16" cy="16" r="11.5" opacity={0.42} />
      <path d="M3.5 16.5h6l2.5-5.5 4 11 3-8 2 2.5h7.5" />
    </svg>
  );
}

/** ERC-6551 wallet. */
export function WalletIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 9.5A2.5 2.5 0 0 1 7.5 7H23v4" />
      <rect x="5" y="9.5" width="22.5" height="16" rx="3" fill="currentColor" fillOpacity={0.1} />
      <path d="M27.5 14.5h-5a3 3 0 0 0 0 6h5" />
      <circle cx="22.6" cy="17.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Stats / performance: a rising line over a baseline. */
export function ChartIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 27.5h23" opacity={0.42} />
      <path d="M5.5 22 11 15.5l5 3.5 6.5-9 4.5 3" />
      <circle cx="22.5" cy="10" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** AI / decisions: a four-point spark with a small companion. */
export function SparkIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14 4.5c.6 5.6 2.9 7.9 8.5 8.5-5.6.6-7.9 2.9-8.5 8.5-.6-5.6-2.9-7.9-8.5-8.5 5.6-.6 7.9-2.9 8.5-8.5Z" fill="currentColor" fillOpacity={0.14} />
      <path d="M24 19.5c.3 2.6 1.4 3.7 4 4-2.6.3-3.7 1.4-4 4-.3-2.6-1.4-3.7-4-4 2.6-.3 3.7-1.4 4-4Z" />
    </svg>
  );
}

/** Lookup. */
export function SearchIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="14" cy="14" r="8.5" />
      <path d="m20.5 20.5 7 7" />
    </svg>
  );
}

/** Small inline arrow for buttons and links (20×20, sits in text). */
export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...base} viewBox="0 0 20 20" strokeWidth={1.7} {...props}>
      <path d="M4 10h11.5M11 5.5 15.5 10 11 14.5" />
    </svg>
  );
}

/** Outbound link (explorer). */
export function ExternalIcon(props: IconProps) {
  return (
    <svg {...base} viewBox="0 0 20 20" strokeWidth={1.6} {...props}>
      <path d="M8 4.5H5.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V12M11 4.5h4.5V9M15.5 4.5 9 11" />
    </svg>
  );
}

// --- Header nav glyphs ----------------------------------------------------------------------------
// One family for the six section links (components/v2/nav-hud.tsx): a 24-unit grid drawn at 18px, so the
// 2.13 stroke lands at the hero's 1.6px; the main shape carries the family's faint fill. Parts that move on
// hover (design-v2.css `.v2-nav-glyph`) carry a `data-part`.

const nav = { ...base, viewBox: "0 0 24 24", strokeWidth: 2.13, width: 18, height: 18 } as const;

/** Your Chogs: a Chog's head, ears up. */
export function NavChogIcon(props: IconProps) {
  return (
    <svg {...nav} {...props}>
      <g data-part="head">
        <path
          d="M5.2 9.6 5.7 3.9l4.1 3.2h4.4l4.1-3.2.5 5.7c.8 1.2 1.2 2.5 1.2 3.9 0 4.2-3.6 7-8 7s-8-2.8-8-7c0-1.4.4-2.7 1.2-3.9Z"
          fill="currentColor"
          fillOpacity={0.1}
        />
        <circle cx="9.1" cy="13.2" r="1.15" fill="currentColor" stroke="none" />
        <circle cx="14.9" cy="13.2" r="1.15" fill="currentColor" stroke="none" />
        <path d="M11 16.4c.6.5 1.4.5 2 0" />
      </g>
    </svg>
  );
}

/** League: a trophy. */
export function NavLeagueIcon(props: IconProps) {
  return (
    <svg {...nav} {...props}>
      <g data-part="cup">
        <path d="M7.5 3.8h9v5.4a4.5 4.5 0 0 1-9 0Z" fill="currentColor" fillOpacity={0.1} />
        <path d="M7.5 5.6H4.6v1.1a3.6 3.6 0 0 0 3.5 3.6M16.5 5.6h2.9v1.1a3.6 3.6 0 0 1-3.5 3.6" />
      </g>
      <path d="M12 13.7v3.4M8.4 20.4h7.2M9.6 17.1h4.8l.6 3.3H9Z" />
    </svg>
  );
}

/** Versus: two crossed swords. */
export function NavVersusIcon(props: IconProps) {
  return (
    <svg {...nav} {...props}>
      <g data-part="blade-a">
        <path d="M4 4h3.4l8.3 8.3M4 4v3.4l8.3 8.3" />
        <path d="M12.6 17.8l5.2-5.2M16.4 16.4l3.6 3.6" />
      </g>
      <g data-part="blade-b">
        <path d="M20 4h-3.4l-4.2 4.2M20 4v3.4l-4.2 4.2" />
        <path d="M11.4 17.8 6.2 12.6M7.6 16.4 4 20" />
      </g>
    </svg>
  );
}

/** Daily Bell. */
export function NavBellIcon(props: IconProps) {
  return (
    <svg {...nav} {...props}>
      <g data-part="bell">
        <path d="M6 16.6V11a6 6 0 0 1 12 0v5.6l1.8 2.1H4.2Z" fill="currentColor" fillOpacity={0.1} />
        <path d="M12 3.4V5M10 21a2.2 2.2 0 0 0 4 0" />
      </g>
    </svg>
  );
}

/** Rob this Chog: a domino mask. */
export function NavMaskIcon(props: IconProps) {
  return (
    <svg {...nav} {...props}>
      <g data-part="mask">
        <path
          d="M2.6 10.1c0-1.3 1-2.1 2.2-1.9 2.5.5 4.7.9 7.2.9s4.7-.4 7.2-.9c1.2-.2 2.2.6 2.2 1.9 0 4.6-2.2 7.5-5.6 7.5-1.9 0-2.6-2-3.8-2s-1.9 2-3.8 2c-3.4 0-5.6-2.9-5.6-7.5Z"
          fill="currentColor"
          fillOpacity={0.1}
        />
        <path d="M6.3 12.4c.9-1 2.6-1 3.5 0M14.2 12.4c.9-1 2.6-1 3.5 0" />
      </g>
    </svg>
  );
}

/** Guard: a shield with a check. */
export function NavShieldIcon(props: IconProps) {
  return (
    <svg {...nav} {...props}>
      <path d="M12 3.2 19 6v5.3c0 4.4-2.9 7.9-7 9.5-4.1-1.6-7-5.1-7-9.5V6Z" fill="currentColor" fillOpacity={0.1} />
      <path data-part="check" pathLength={1} d="m8.9 12.1 2.2 2.2 4.1-4.3" />
    </svg>
  );
}
