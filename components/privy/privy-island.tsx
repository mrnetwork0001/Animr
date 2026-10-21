"use client";

import {
  type ConnectedWallet,
  type PrivyClientConfig,
  PrivyProvider,
  type User,
  addRpcUrlOverrideToChain,
  useLinkAccount,
  usePrivy,
  useWallets,
} from "@privy-io/react-auth";
import { useEffect, useMemo, useState } from "react";
import { type Config, useConfig } from "wagmi";
import { appConfig } from "@/lib/config";
import { shortAddress } from "@/lib/format";
import { privyAppId, privyClientId } from "@/lib/privy";
import { type PrivyIdentity, type PrivyWalletView, publishPrivySession } from "./session";
import { syncWagmiToWallet } from "./wagmi-bridge";

/**
 * The Privy SDK, loaded after hydration (app/providers.tsx imports this file with next/dynamic, ssr: false) so no
 * page waits for it. It renders no UI of its own besides Privy's modal: it publishes the session to ./session.ts and
 * bridges the active Privy wallet into wagmi, so useConnection / useSignMessage / useWriteContract… keep working for
 * external and embedded wallets alike.
 *
 * Why not @privy-io/wagmi: its peer range pins viem 2.57.5 (the app is on 2.57.7). ./wagmi-bridge.ts does what its
 * `setActiveWalletForWagmi` mode does, for one active wallet.
 */

const chain =
  appConfig.rpcUrl && appConfig.rpcUrl !== appConfig.chain.rpcUrls.default.http[0]
    ? addRpcUrlOverrideToChain(appConfig.chain, appConfig.rpcUrl)
    : appConfig.chain;

const PRIVY_CONFIG: PrivyClientConfig = {
  loginMethods: ["wallet", "email", "google", "twitter", "discord"],
  appearance: {
    theme: "dark",
    accentColor: "#6f5adc",
    // An element with a fixed size: Privy's logo slot collapses to 0×0 for an SVG URL without intrinsic dimensions.
    // eslint-disable-next-line @next/next/no-img-element -- rendered inside Privy's modal, which overwrites its style
    logo: <img src="/brand/animr-mark.png" alt="Animr" width={56} height={56} />,
    landingHeader: "Log in to Animr",
    showWalletLoginFirst: true,
    walletChainType: "ethereum-only",
    // Detected = every EIP-6963 wallet (Rabby, Phantom, Backpack, the Farcaster client's wallet…).
    walletList: ["detected_ethereum_wallets", "metamask", "coinbase_wallet", "rainbow", "wallet_connect"],
  },
  embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
  defaultChain: chain,
  supportedChains: [chain],
};

const ACTIVE_KEY = "animr.privy.activeWallet";

function readPreferred(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function writePreferred(address: string | null) {
  try {
    if (address) window.localStorage.setItem(ACTIVE_KEY, address);
    else window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Storage can be blocked; the default (most recent wallet) still works.
  }
}

const same = (a?: string | null, b?: string | null) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

export default function PrivyIsland() {
  if (!privyAppId) return null;
  return (
    <PrivyProvider appId={privyAppId} clientId={privyClientId} config={PRIVY_CONFIG}>
      <PrivyBridge />
    </PrivyProvider>
  );
}

function identityOf(user: User | null, active?: string): PrivyIdentity | null {
  if (!user) return null;
  const email = user.email?.address;
  const google = user.google?.email;
  const twitter = user.twitter?.username ?? undefined;
  const discord = user.discord?.username ?? undefined;
  const wallet = active ?? user.wallet?.address;
  const label = twitter
    ? `@${twitter}`
    : email ?? google ?? (discord ? discord : wallet ? shortAddress(wallet) : "Account");
  return {
    label,
    avatarUrl: user.twitter?.profilePictureUrl ?? undefined,
    email,
    google,
    twitter,
    discord,
  };
}

function PrivyBridge() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const link = useLinkAccount();
  const [preferred, setPreferred] = useState<string | null>(readPreferred);
  const config = useConfig();

  // Only wallets the logged-in user owns: linked external wallets and the embedded one. Wallets Privy merely detected
  // or connected without linking are left out, so "logged in" always means one identity.
  const owned = useMemo(
    () => (authenticated ? wallets.filter((w) => w.type === "ethereum" && w.linked) : []),
    [authenticated, wallets],
  );
  const active: ConnectedWallet | undefined =
    owned.find((w) => same(w.address, preferred)) ?? owned.find((w) => w.walletClientType !== "privy") ?? owned[0];

  useActiveWalletInWagmi(config, active);

  const status = ready && (!authenticated || walletsReady) ? "ready" : "loading";
  const walletViews: PrivyWalletView[] = owned.map((w) => ({
    address: w.address as `0x${string}`,
    name: w.walletClientType === "privy" ? "Animr wallet (Privy)" : w.meta.name,
    embedded: w.walletClientType === "privy",
  }));

  useEffect(() => {
    publishPrivySession(
      {
        status,
        authenticated,
        identity: authenticated ? identityOf(user, active?.address) : null,
        wallets: walletViews,
        activeAddress: active?.address as `0x${string}` | undefined,
      },
      {
        login: () => login(),
        logout: async () => {
          writePreferred(null);
          setPreferred(null);
          await logout();
        },
        linkWallet: () => link.linkWallet(),
        linkEmail: () => link.linkEmail(),
        linkGoogle: () => link.linkGoogle(),
        linkTwitter: () => link.linkTwitter(),
        linkDiscord: () => link.linkDiscord(),
        setActiveWallet: (address) => {
          writePreferred(address);
          setPreferred(address);
        },
      },
    );
  });

  return null;
}

/** Re-syncs wagmi whenever the active wallet (address or kind) changes. */
function useActiveWalletInWagmi(config: Config, active: ConnectedWallet | undefined) {
  const address = active?.address;
  const clientType = active?.walletClientType;
  useEffect(() => {
    let cancelled = false;
    void syncWagmiToWallet(config, active, () => cancelled);
    return () => {
      cancelled = true;
    };
    // `active` is a fresh object on every Privy update; the address and wallet type identify it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, address, clientType]);
}
