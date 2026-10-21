"use client";

import { useSyncExternalStore } from "react";

/**
 * The Privy session as plain data, so the header button and in-page "Connect wallet" prompts can render without
 * importing the Privy SDK. The lazily loaded island (privy-island.tsx) publishes here and registers the actions.
 */

export type PrivyWalletView = {
  address: `0x${string}`;
  /** "MetaMask", "Rabby", "Privy" (embedded)… */
  name: string;
  embedded: boolean;
};

export type PrivyIdentity = {
  /** What the header pill shows: an email, "@handle", or a short address. */
  label: string;
  avatarUrl?: string;
  email?: string;
  google?: string;
  twitter?: string;
  discord?: string;
};

export type PrivySession = {
  /** "loading" until the SDK has loaded and restored any session. */
  status: "loading" | "ready";
  authenticated: boolean;
  identity: PrivyIdentity | null;
  wallets: PrivyWalletView[];
  /** The wallet wagmi is connected to (the one every flow signs with). */
  activeAddress?: `0x${string}`;
};

export type PrivyActions = {
  login: () => void;
  logout: () => Promise<void>;
  /** Connect an external wallet to an already logged-in user (no new login). */
  linkWallet: () => void;
  linkEmail: () => void;
  linkGoogle: () => void;
  linkTwitter: () => void;
  linkDiscord: () => void;
  setActiveWallet: (address: `0x${string}`) => void;
};

const LOADING: PrivySession = { status: "loading", authenticated: false, identity: null, wallets: [] };

let session: PrivySession = LOADING;
let actions: PrivyActions | null = null;
/** An action clicked before the SDK finished loading; run once it is ready. */
let queued: keyof PrivyActions | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePrivySession(): PrivySession {
  return useSyncExternalStore(
    subscribe,
    () => session,
    () => LOADING,
  );
}

/** Called by the island. */
export function publishPrivySession(next: PrivySession, nextActions: PrivyActions) {
  actions = nextActions;
  if (!sameSession(session, next)) {
    session = next;
    for (const listener of listeners) listener();
  }
  if (next.status === "ready" && queued) {
    const name = queued;
    queued = null;
    if (name !== "setActiveWallet") void (nextActions[name] as () => unknown)();
  }
}

/** Runs a Privy action now, or right after the SDK is ready. */
export function runPrivyAction(name: Exclude<keyof PrivyActions, "setActiveWallet">) {
  if (actions && session.status === "ready") void (actions[name] as () => unknown)();
  else queued = name;
}

export function setPrivyActiveWallet(address: `0x${string}`) {
  actions?.setActiveWallet(address);
}

function sameSession(a: PrivySession, b: PrivySession) {
  return (
    a.status === b.status &&
    a.authenticated === b.authenticated &&
    a.activeAddress === b.activeAddress &&
    JSON.stringify(a.identity) === JSON.stringify(b.identity) &&
    JSON.stringify(a.wallets) === JSON.stringify(b.wallets)
  );
}
