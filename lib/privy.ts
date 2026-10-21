/**
 * Privy login (email, Google, X, Discord, external wallets, embedded wallets). Public values, inlined at build time.
 *
 * Unset `NEXT_PUBLIC_PRIVY_APP_ID` keeps the plain wagmi "Connect wallet" menu (components/connect-button.tsx), so the
 * app works without a Privy account. Set, Privy is the only way in, and the active Privy wallet is bridged into wagmi
 * (components/privy/privy-island.tsx), so every wagmi hook keeps working unchanged.
 */
export const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() || undefined;

/** Only needed when the Privy dashboard has an app client for this deployment (Settings → Clients). */
export const privyClientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID?.trim() || undefined;

export const privyEnabled = Boolean(privyAppId);
