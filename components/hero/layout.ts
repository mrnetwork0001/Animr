/**
 * When the hero is drawn on its 2048×1455 design canvas instead of the single column. Must match the
 * wide-canvas @media query in hero.css. From 5:4 up the canvas still fits: its content keeps 75 units
 * from each edge, and below about 1.33:1 the unit also scales with the width (hero.css), so that edge
 * stays at least one gutter from the screen's.
 */
export const WIDE_LAYOUT = "(min-aspect-ratio: 5/4) and (min-width: 960px)";
