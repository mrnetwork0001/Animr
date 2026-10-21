import { trophyInfo } from "./config";

// Trophy badges: flat line art on a 64x64 grid, one silhouette and glyph per kind, coloured per kind. Shared by the
// cabinet (components/trophies) and the ERC-1155 image route, so a marketplace shows the same badge. Static markup
// only (no user input reaches it).

const FRAMES: Record<number, string> = {
  // Best call: hexagon medal
  1: '<path d="M32 4 56 18v28L32 60 8 46V18Z"/>',
  // Most rekt: round token
  2: '<circle cx="32" cy="32" r="27"/>',
  // Survived a heist: shield
  3: '<path d="M32 5 54 13v18c0 14-10 23-22 28-12-5-22-14-22-28V13Z"/>',
  // First real trade: octagon
  4: '<path d="M22 5h20l17 17v20L42 59H22L5 42V22Z"/>',
};

const GLYPHS: Record<number, string> = {
  // Crosshair on the mark: the closest call
  1: '<circle cx="32" cy="32" r="11"/><path d="M32 14v6M32 44v6M14 32h6M44 32h6"/><circle cx="32" cy="32" r="2.5" fill="currentColor" stroke="none"/>',
  // A chart line falling through the floor
  2: '<path d="M15 22l10 8 7-5 14 17"/><path d="M38 42h8v-8"/>',
  // Keyhole: the vault held
  3: '<circle cx="32" cy="27" r="5"/><path d="M29.5 31.5 28 42h8l-1.5-10.5"/>',
  // Swap arrows: CHOG <-> WMON
  4: '<path d="M18 26h26M38 20l6 6-6 6"/><path d="M46 38H20M26 32l-6 6 6 6"/>',
};

/** Inner markup of a kind's badge for <svg viewBox="0 0 64 64">; uses currentColor. */
export function trophyBadgeMarkup(kind: number): string {
  const frame = FRAMES[kind] ?? FRAMES[2];
  const glyph = GLYPHS[kind] ?? "";
  return (
    `<g fill="currentColor" fill-opacity="0.1" stroke="currentColor" stroke-width="2" stroke-linejoin="round">${frame}</g>` +
    `<g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>`
  );
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}

/** A standalone 512x512 SVG for the ERC-1155 metadata `image`. */
export function trophyImageSvg(kind: number): string {
  const info = trophyInfo(kind);
  const color = info?.color ?? "#d3d3d7";
  const name = escapeXml(info?.name ?? `Trophy ${kind}`);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">` +
    `<rect width="512" height="512" fill="#0d0c11"/>` +
    `<g transform="translate(112 52) scale(4.5)" color="${color}">${trophyBadgeMarkup(kind)}</g>` +
    `<text x="256" y="410" text-anchor="middle" fill="#ffffff" font-family="DM Sans, Inter, Helvetica, Arial, sans-serif" font-size="34">${name}</text>` +
    `<text x="256" y="450" text-anchor="middle" fill="#8f8e96" font-family="Inter, Helvetica, Arial, sans-serif" font-size="20">Animr trophy</text>` +
    `</svg>`
  );
}
