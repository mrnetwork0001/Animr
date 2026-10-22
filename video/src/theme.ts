import { loadFont as loadDisplay } from "@remotion/google-fonts/DMSans";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/GeistMono";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";

/** The app's two families (components/hero/fonts.ts): DM Sans for display, Inter for text. */
export const display = loadDisplay("normal", { weights: ["300", "400", "500", "600", "700", "800"], subsets: ["latin"] }).fontFamily;
export const sans = loadInter("normal", { weights: ["300", "400", "500", "600"], subsets: ["latin"] }).fontFamily;
export const mono = loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] }).fontFamily;
export const serif = loadSerif("italic", { weights: ["400"], subsets: ["latin"] }).fontFamily;

/** Animr's palette, from app/design-v2.css. */
export const C = {
  bg: "#0d0c11",
  raised: "#131218",
  panel: "#17161d",
  ink: "#ffffff",
  muted: "#d3d3d7",
  faint: "#8f8e96",
  violetA: "#4d19b1",
  violetB: "#6f5adc",
  violetInk: "#a99bf3",
  teal: "#9ff0ec",
  kicker: "#bdf7ee",
  success: "#62e0a6",
  warning: "#f2c16b",
  danger: "#ff7a8a",
  paper: "#f2f0f8",
  paperInk: "#0d0c11",
  paperMuted: "#5d5a6b",
  line: "rgba(255,255,255,0.14)",
};
export const GRAD = `linear-gradient(135deg, ${C.violetA} 0%, ${C.violetB} 100%)`;

export type Tone = "dark" | "light" | "brand";
export const TONE: Record<Tone, { bg: string; ink: string; muted: string; line: string; pill: string }> = {
  dark: { bg: C.bg, ink: "#ffffff", muted: "rgba(255,255,255,0.55)", line: "rgba(255,255,255,0.14)", pill: "rgba(13,12,17,0.62)" },
  light: { bg: C.paper, ink: C.paperInk, muted: "rgba(13,12,17,0.5)", line: "rgba(13,12,17,0.12)", pill: "rgba(255,255,255,0.8)" },
  brand: { bg: C.violetA, ink: "#ffffff", muted: "rgba(255,255,255,0.72)", line: "rgba(255,255,255,0.22)", pill: "rgba(30,10,80,0.45)" },
};

export const SCENE_TONE: Record<string, Tone> = {
  open: "dark", problem: "light", turn: "brand", meet: "dark", rewind: "dark", bell: "light",
  purse: "brand", heist: "dark", setup: "light", guard: "dark", unique: "brand", close: "dark",
};

/** Corner tags, keyed to the judges' form where a scene answers one of its questions. */
export const SCENE_LABEL: Record<string, string> = {
  open: "01 · block 115,447,994", problem: "02 · 1,969 chogs", turn: "03 · animr", meet: "04 · meet",
  rewind: "05 · race", bell: "06 · ride", purse: "07 · the oracle purse", heist: "08 · rob",
  setup: "09 · the house chog, on-chain", guard: "10 · under the hood", unique: "11 · why the chog", close: "12 · what's next",
};
