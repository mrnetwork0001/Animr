/**
 * Whether this process is the production deployment: ANIMR_ENV=production (any host) or Vercel's VERCEL_ENV. Only
 * production may broadcast with the operator key (guarded trades, trophy mints). A laptop or a preview that happens
 * to hold the key and the contract addresses in its env must never act on mainnet for its own Bells or agents.
 */
export function isProductionRuntime(): boolean {
  return (process.env.ANIMR_ENV || process.env.VERCEL_ENV || "").toLowerCase() === "production";
}
