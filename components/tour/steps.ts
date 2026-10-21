// The judge tour (/tour): plain data shared by the tour page (server), its client guide and the tour pill. Safe to
// import on the client. Every step opens a real page; links carry ?tour=N so that page can offer the way back
// (components/tour/tour-pill.tsx).

export type TourAction = { label: string; href: string };

export type TourStep = {
  /** Stable key for live data and progress. */
  id: string;
  /** Seven words at most. */
  title: string;
  /** What the judge will see, in one or two lines. */
  why: string;
  /** The judging point, said plainly: why the NFT is essential here. */
  point: string;
  /** The one button that opens the real page. `random` draws a brand-safe Chog's profile in the browser. */
  action?: TourAction & { random?: boolean };
  /** A quieter second link, when a step covers two pages. */
  also?: TourAction;
};

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "trader",
    title: "Every Chog is a trader",
    why: "Open any Chog: its traits compile into a trading strategy, and the NFT owns its own ERC-6551 wallet.",
    point: "The NFT is the account. The token owns the wallet that would hold its $CHOG; sell the Chog and the wallet goes with it.",
    action: { label: "Open a random Chog", href: "/app", random: true },
  },
  {
    id: "dna",
    title: "Its Trading DNA, ranked",
    why: "The League replays every Chog's DNA on real hourly $CHOG candles and scores it vs holding. Traits shows which traits trade best.",
    point: "Traits are the strategy: the same Chog always makes the same calls, so its record is reproducible.",
    action: { label: "Open the League", href: "/league" },
    also: { label: "Which traits trade best", href: "/traits" },
  },
  {
    id: "replay",
    title: "Time Machine: one Chog replayed",
    why: "Watch one Chog's trades replayed on real $CHOG history (simulated), every buy and sell explained by the genes that made it.",
    point: "The record is computed from the token's own traits, so it travels with the NFT.",
    action: { label: "Open the Time Machine", href: "/replay/1820" },
  },
  {
    id: "versus",
    title: "Versus: call a hidden race",
    why: "Two Chogs get the same hidden 48 hours of real $CHOG. Pick the winner, watch them trade, then see the real dates.",
    point: "Different traits, different strategies: the DNA decides who wins.",
    action: { label: "Start a race", href: "/versus" },
  },
  {
    id: "breed",
    title: "Breed two Chogs",
    why: "Pick two Chogs and cross their Trading DNA to see what kind of trader the pair would make.",
    point: "A strategy is inherited from traits, so it composes like the NFTs themselves.",
    action: { label: "Open Breed", href: "/breed" },
  },
  {
    id: "bell",
    title: "Daily Bell: ride a Chog",
    why: "Every day at 15:00 UTC all 1,969 Chogs call $CHOG's next 24 hours. Ride one; the real price settles it a day later.",
    point: "Each Chog makes its own call from its DNA. Points only.",
    action: { label: "Open the Daily Bell", href: "/bell" },
  },
  {
    id: "heist",
    title: "Rob this Chog",
    why: "Talk the House Chog's AI into sending you its $CHOG. When it caves, that exact transfer runs against Monad mainnet.",
    point: "The AI can be fooled. The NFT can't: Monad refuses, because only the token's holder controls its wallet.",
    action: { label: "Try to rob it", href: "/heist" },
  },
  {
    id: "proof",
    title: "The real proof, on Monad",
    why: "AnimrTradeGuard is live on Monad mainnet, tested on a mainnet fork: the AI can trade a Chog's wallet within limits, never withdraw.",
    point: "The funds sit in the NFT's own wallet, not ours: the House Chog's profile shows that wallet, its $CHOG and its trophy cabinet.",
    action: { label: "Read the guard", href: "/guard" },
  },
  {
    id: "done",
    title: "That's Animr",
    why: "What you just saw, sorted into real and simulated:",
    point: "",
    action: { label: "Explore freely", href: "/app" },
  },
];

export const TOUR_STEP_COUNT = TOUR_STEPS.length;

/** Where the tour's progress lives in the browser (a per-viewer convenience only). */
export const TOUR_STORAGE_KEY = "animr:tour";

/** `href` with ?tour=<step> (1-based), keeping any query or hash it already has. */
export function tourHref(href: string, step: number): string {
  const hashAt = href.indexOf("#");
  const [path, hash] = hashAt >= 0 ? [href.slice(0, hashAt), href.slice(hashAt)] : [href, ""];
  return `${path}${path.includes("?") ? "&" : "?"}tour=${step}${hash}`;
}

/** A 1-based step from a query value, or null. */
export function parseTourStep(raw: string | null | undefined): number | null {
  if (!raw || !/^\d{1,2}$/.test(raw)) return null;
  const step = Number(raw);
  return step >= 1 && step <= TOUR_STEP_COUNT ? step : null;
}
