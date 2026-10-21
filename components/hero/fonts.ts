import { DM_Sans, Inter } from "next/font/google";

// The hero's two families, self-hosted by next/font at build time (latin only, variable weight axis).
// Each sets a CSS variable on the hero root (hero.css reads --hx-font-display / --hx-font-text), so
// nothing outside the hero changes font.

/** DM Sans: the headline, the stat numbers and the "Built on" wordmarks (italic for three of them). */
export const heroDisplayFont = DM_Sans({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--hx-font-display",
  display: "swap",
});

/** Inter: everything else (nav, subline, buttons, labels, cards). */
export const heroTextFont = Inter({
  subsets: ["latin"],
  variable: "--hx-font-text",
  display: "swap",
});
