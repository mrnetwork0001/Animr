import { appConfig } from "./config";

export function shortAddress(address: string, chars = 4): string {
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

/** Formats a token amount (decimal string or number) for display. */
export function formatAmount(value: string | number, maxFractionDigits = 4): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxFractionDigits }).format(n);
}

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const digits = Math.abs(value) < 1 ? 6 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  }).format(value);
}

/** "+12.34%" / "-5.00%" / "—". */
export function formatPct(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

/**
 * "3m ago". Pass `now` explicitly; under Cache Components, call this from client
 * components (or after `connection()`), never during a server prerender.
 */
export function timeAgo(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const explorer = appConfig.chain.blockExplorers?.default.url;

export function explorerAddressUrl(address: string): string | undefined {
  return explorer ? `${explorer}/address/${address}` : undefined;
}

export function explorerTxUrl(hash: string): string | undefined {
  return explorer ? `${explorer}/tx/${hash}` : undefined;
}

/** "Buy this Portfolio" link (OpenSea by default; see appConfig.marketplaceUrlTemplate). */
export function marketplaceUrl(contract: string, tokenId: string): string | undefined {
  const template = appConfig.marketplaceUrlTemplate;
  if (!template) return undefined;
  return template.replace("{contract}", contract.toLowerCase()).replace("{tokenId}", tokenId);
}
