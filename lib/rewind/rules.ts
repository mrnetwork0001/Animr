// Pure VERSUS rules and copy (no server imports): safe in client components, so every page says the
// same honest thing. Exhibition only: points, never money.

/** Hourly steps in every bout: frame 0 is the start, frames 1-48 the 48 closes after it. */
export const VERSUS_HOURS = 48;
/** Points for a correct pick. */
export const VERSUS_POINTS_PER_WIN = 10;
/** VERSUS points one fan can earn per UTC day (10 correct picks); picks past it still count in their record. */
export const VERSUS_DAILY_POINTS_CAP = 100;
/** What a bout shows before the reveal (VersusBoutPreview.windowLabel). */
export const VERSUS_WINDOW_LABEL = "48 hours of real $CHOG history";

export const VERSUS_COPY = {
  pitch: "Two Chogs, two trading genomes, the same hidden 48 hours of real $CHOG history. Pick the one that stacks more $CHOG.",
  metric: "Score: $CHOG stacked vs just holding.",
  simulated: "Simulated on real $CHOG candles, 1% fee + impact. No real trades.",
  hidden: "The real dates stay hidden until the race ends.",
  points: "Points only: no cash value.",
  scoring: `+${VERSUS_POINTS_PER_WIN} points for a correct pick, up to ${VERSUS_DAILY_POINTS_CAP} a day. One pick per bout.`,
  tie: "Same edge? The Chog that paid less in fees wins; otherwise it's a draw.",
  spectate: "Just watching: no pick, no points.",
  capped: `You've earned today's ${VERSUS_DAILY_POINTS_CAP} VERSUS points. Picks still count toward your record.`,
  repeat: "You already picked this bout: here's the replay.",
} as const;
