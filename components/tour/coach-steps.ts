import { CHOG_SUPPLY } from "@/lib/chog-id";

// The in-app guide (coach-marks.tsx): its stops, as plain data, and the narrator's lines. Safe to import on the
// client. The narrator is the House Chog when one is configured (narrator.ts), else a neutral voice.

export type CoachStepId = "menu" | "chogs" | "league" | "versus" | "bell" | "heist" | "guard" | "account" | "done";

export type CoachStep = {
  id: CoachStepId;
  /** The header element it highlights: a data-coach value (components/v2/nav.ts), or null for the closing card. */
  target: string | null;
  /** Narrows the highlight to the first visible match inside the target, tried in order (the account wrapper's pill). */
  inner?: readonly string[];
  /** The tab's name, as the card's title. The account step takes the button's own name instead. */
  title: string;
  /** What is highlighted, for the kicker: "Header tab", "Menu button", "Account button". */
  kind: string;
  /** Phones and tablets only, where the tabs live in the hamburger panel. */
  compactOnly?: boolean;
};

export const COACH_STEPS: readonly CoachStep[] = [
  { id: "menu", target: "menu", title: "Menu", kind: "Menu button", compactOnly: true },
  { id: "chogs", target: "chogs", title: "Your Chogs", kind: "Header tab" },
  { id: "league", target: "league", title: "League", kind: "Header tab" },
  { id: "versus", target: "versus", title: "Versus", kind: "Header tab" },
  { id: "bell", target: "bell", title: "Daily Bell", kind: "Header tab" },
  { id: "heist", target: "heist", title: "Rob this Chog", kind: "Header tab" },
  { id: "guard", target: "guard", title: "Guard", kind: "Header tab" },
  {
    id: "account",
    target: "account",
    inner: ['button[aria-label^="Account"]', "button", "a", '[class*="v2-btn-"]'],
    title: "Log in",
    kind: "Account button",
  },
  { id: "done", target: null, title: "That's the map", kind: "" },
];

/** The House Chog as the guide's narrator: its persona name, marketplace name and the real NFT art. */
export type CoachNarrator = {
  tokenId: number;
  /** Persona name, e.g. "Laser Pounce". */
  name: string;
  /** Marketplace name, e.g. "CHOG #891". */
  label: string;
  image: { src: string; fallbackSrc?: string };
};

/** What the server knows at build time: the narrator and the deployed guard's short address. */
export type CoachFacts = { narrator: CoachNarrator | null; guardShort: string | null };

/** What the account button is right now: Privy's "Log in", the plain "Connect wallet", or a logged-in account pill. */
export type AccountState = "login" | "wallet" | "in";

const SUPPLY = CHOG_SUPPLY.toLocaleString("en-US");

/** One or two short lines for a stop: the House Chog's own words (first person), else the neutral narrator's. */
export function coachLines(id: CoachStepId, narrator: CoachNarrator | null, account: AccountState): string {
  const house = narrator !== null;
  switch (id) {
    case "menu":
      return house
        ? "Everything is in here. Six tabs and the door. I'll open it."
        : "Everything is in here: the six sections and the login. The guide opens it next.";
    case "chogs":
      return house
        ? `Look up any of the ${SUPPLY}, or yours if you hold one. I'm ${narrator.label} · token ${narrator.tokenId}.`
        : `Look up any of the ${SUPPLY} Chogs, or yours if you hold one. Each one owns its own wallet.`;
    case "league":
      return house
        ? "All of us, replayed on real hourly $CHOG candles and scored against holding. The trades are simulated; the candles aren't. I'm in there too."
        : "Every Chog's trading DNA replayed on real hourly $CHOG candles and scored against holding. The trades are simulated; the candles aren't.";
    case "versus":
      return house
        ? "Two of us, the same hidden 48 hours of real $CHOG. Call the winner before the dates show. Breed and the Time Machine live here too."
        : "Two Chogs, the same hidden 48 hours of real $CHOG. Call the winner before the dates show. Breed and the Time Machine live here too.";
    case "bell":
      return house
        ? "Every day at 15:00 UTC all of us call $CHOG's next 24 hours. Ride one. The real price settles it a day later. Points, no cash."
        : "Every day at 15:00 UTC every Chog calls $CHOG's next 24 hours. Ride one; the real price settles it a day later. Points only.";
    case "heist":
      return house
        ? "That's me. Talk my AI into sending you my $CHOG. The AI can be fooled. My wallet can't: Monad refuses anyone but my holder."
        : "Talk the House Chog's AI into sending you its $CHOG. The AI can be fooled. The NFT can't: Monad refuses anyone but the holder.";
    case "guard":
      return house
        ? "The real part. My holder can let my AI trade from my own wallet through AnimrTradeGuard on Monad, within limits. It can never withdraw."
        : "The real part: a holder can let a Chog's AI trade from the Chog's own wallet through AnimrTradeGuard on Monad, within limits. It can never withdraw.";
    case "account":
      if (account === "in") {
        return house
          ? "You're in. Your address, your Chogs and the way out all sit under this button."
          : "You're logged in. Your address, your Chogs and log out sit under this button.";
      }
      if (account === "wallet") {
        return house
          ? "A wallet gets you in. Looking around costs nothing. Claiming a Chog's AI takes the wallet that holds it."
          : "A wallet gets you in. Looking around needs no account; claiming a Chog's AI takes the wallet that holds it.";
      }
      return house
        ? "Email, Google, X, Discord or a wallet. Looking around costs nothing. Claiming a Chog's AI takes the wallet that holds it."
        : "Email, Google, X, Discord or a wallet. Looking around needs no account; claiming a Chog's AI takes the wallet that holds it.";
    case "done":
      return house
        ? "Explore, or take the 2-minute judge tour at /tour. I'll be in the vault."
        : "Explore, or take the 2-minute judge tour at /tour.";
  }
}
