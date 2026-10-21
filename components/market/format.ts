// Listing prices in whole MON. Safe on server and client.

const SMALL = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 });
const PLAIN = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** "0.42", "12.5", "5,664", "1.2M". */
export function formatListingPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value < 100) return SMALL.format(value);
  if (value < 1_000_000) return PLAIN.format(value);
  return COMPACT.format(value);
}
