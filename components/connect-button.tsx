"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import {
  type Connector,
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { PrivyLoginButton } from "@/components/privy/login-button";
import { pillClass } from "@/components/v2/primitives";
import { appConfig } from "@/lib/config";
import { explorerAddressUrl, shortAddress } from "@/lib/format";
import { privyEnabled } from "@/lib/privy";
import { walletErrorMessage } from "@/lib/wagmi";
import { useIsClient } from "./use-is-client";

// Many wallet-aware components import the hydration flag from here.
export { useIsClient };

const subscribeNothing = () => () => {};

function hasInjectedProvider() {
  return Boolean((window as { ethereum?: unknown }).ethereum);
}

/** Wallets to offer: the EIP-6963 announced ones by name, else the generic window.ethereum. */
function useWallets(): readonly Connector[] {
  const connectors = useConnectors();
  const injectedAvailable = useSyncExternalStore(subscribeNothing, hasInjectedProvider, () => false);
  const announced = connectors.filter((c) => c.id !== "injected");
  if (announced.length > 0) return announced;
  return injectedAvailable ? connectors.filter((c) => c.id === "injected") : [];
}

const INSTALL_LINKS = [
  { name: "MetaMask", href: "https://metamask.io" },
  { name: "Rabby", href: "https://rabby.io" },
  { name: "Phantom", href: "https://phantom.com" },
  { name: "Backpack", href: "https://backpack.app" },
] as const;

/** The header slot's Suspense fallback: the logged-out button's shape, inert. */
export function ConnectButtonFallback({ size = "sm" }: { size?: "sm" | "md" }) {
  if (privyEnabled) {
    return (
      <span aria-hidden className={`${pillClass(size === "sm" ? "glass" : "primary", size)} opacity-50`}>
        Log in
      </span>
    );
  }
  return (
    <span aria-hidden className={`${pillClass("primary", size)} opacity-50`}>
      Connect wallet
    </span>
  );
}

/** The floating panel under the wallet button: dark glass, right-aligned, never wider than the screen. */
const PANEL =
  "v2-glass--strong absolute top-full right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2*var(--v2-gutter)))] rounded-[var(--v2-r-lg)] text-sm";

/**
 * The login / wallet button used in the header and in page prompts. With NEXT_PUBLIC_PRIVY_APP_ID set it is Privy's
 * "Log in" (components/privy/login-button.tsx); without it, the plain wagmi wallet menu below.
 */
export function ConnectButton(props: { className?: string; size?: "sm" | "md" }) {
  return privyEnabled ? <PrivyLoginButton {...props} /> : <WagmiConnectButton {...props} />;
}

/**
 * The fallback wallet button (no Privy app configured): "Connect wallet" (a violet pill), then the network chip and
 * the address with its panel (copy, explorer, switch network, disconnect). `size` follows the v2 pills: "sm" (36px) in the header, "md" (46px) in pages.
 */
function WagmiConnectButton({ className = "", size = "md" }: { className?: string; size?: "sm" | "md" }) {
  const isClient = useIsClient();
  const connection = useConnection();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const switchChain = useSwitchChain();
  const wallets = useWallets();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Close the panel on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const target = appConfig.chain;
  const connected = isClient && connection.status === "connected" ? connection : undefined;
  const busy =
    isClient &&
    (connect.isPending ||
      connection.status === "connecting" ||
      connection.status === "reconnecting");

  function switchToTarget() {
    switchChain.mutate({ chainId: target.id }, { onError: () => setOpen(true) });
  }

  function connectWith(connector: Connector) {
    connect.mutate(
      { connector },
      {
        onSuccess: (data) => {
          setOpen(false);
          // Offer the switch right away; if declined, the header keeps a "Switch" button.
          if (data.chainId !== target.id) switchToTarget();
        },
        onError: () => setOpen(true),
      },
    );
  }

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (permissions, insecure context); the address is shown in full.
    }
  }

  if (connected) {
    const wrongChain = connected.chainId !== target.id;
    const explorer = explorerAddressUrl(connected.address);
    return (
      <div ref={rootRef} className={`relative flex items-center gap-2 ${className}`}>
        {wrongChain ? (
          <button
            type="button"
            onClick={switchToTarget}
            disabled={switchChain.isPending}
            className={`${pillClass("glass", size)} border-[rgb(242_193_107/0.4)] bg-[rgb(242_193_107/0.08)] text-[var(--v2-warning)] hover:border-[var(--v2-warning)]`}
          >
            <span aria-hidden className="size-2 rounded-full bg-[var(--v2-warning)] shadow-[0_0_8px_var(--v2-warning)]" />
            {switchChain.isPending ? (
              "Switching…"
            ) : (
              <>
                <span className="sm:hidden">Switch network</span>
                <span className="hidden sm:inline">Switch to {target.name}</span>
              </>
            )}
          </button>
        ) : (
          <span className="v2-chip hidden sm:inline-flex" title={`Chain ID ${target.id}`}>
            <span aria-hidden className="size-1.5 rounded-full bg-[var(--v2-success)] shadow-[0_0_8px_var(--v2-success)]" />
            {target.name}
          </span>
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((value) => !value)}
          className={`${pillClass("glass", size)} gap-2 pr-3 pl-2.5`}
        >
          <AddressAvatar address={connected.address} />
          <span className="v2-mono">{shortAddress(connected.address)}</span>
          <Chevron />
        </button>
        {open && (
          <div
            id={panelId}
            className={`${PANEL} p-4`}
          >
            <p className="v2-note">
              Connected with{" "}
              {connected.connector.id === "injected" ? "your browser wallet" : connected.connector.name}
            </p>
            <p className="v2-mono mt-1.5 text-[13px] break-all text-[var(--v2-ink)]">{connected.address}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => copyAddress(connected.address)}
                className={`${pillClass("glass", "sm")} flex-1 px-3`}
              >
                {copied ? "Copied" : "Copy address"}
              </button>
              {explorer && (
                <a
                  href={explorer}
                  target="_blank"
                  rel="noreferrer"
                  className={`${pillClass("glass", "sm")} flex-1 px-3`}
                >
                  Explorer <span aria-hidden>↗</span>
                </a>
              )}
            </div>
            <div className="mt-4 border-t border-[var(--v2-line-soft)] pt-3">
              {wrongChain ? (
                <>
                  <p className="text-[var(--v2-warning)]">
                    Wrong network (chain {connected.chainId}). Animr runs on {target.name}.
                  </p>
                  <button
                    type="button"
                    onClick={switchToTarget}
                    disabled={switchChain.isPending}
                    className={`${pillClass("primary", "sm", true)} mt-3`}
                  >
                    {switchChain.isPending ? "Switching…" : `Switch to ${target.name}`}
                  </button>
                </>
              ) : (
                <p className="flex items-center gap-2 text-[var(--v2-nav)]">
                  <span aria-hidden className="size-1.5 rounded-full bg-[var(--v2-success)] shadow-[0_0_8px_var(--v2-success)]" />
                  {target.name} · chain {target.id}
                </p>
              )}
              {switchChain.isError && (
                <p className="mt-2 text-xs text-[var(--v2-danger)]">{walletErrorMessage(switchChain.error)}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                disconnect.mutate();
              }}
              className={`${pillClass("ghost", "sm", true)} mt-2 text-[var(--v2-danger)] hover:text-[var(--v2-danger)]`}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        disabled={!isClient || busy}
        onClick={() => {
          connect.reset();
          if (wallets.length === 1) connectWith(wallets[0]);
          else setOpen((value) => !value);
        }}
        className={pillClass("primary", size)}
      >
        {busy ? "Connecting…" : "Connect wallet"}
      </button>
      {open && (
        <div
          id={panelId}
          className={`${PANEL} p-3`}
        >
          {wallets.length === 0 ? (
            <div className="p-1">
              <p className="font-medium text-[var(--v2-ink)]">No browser wallet found</p>
              <p className="mt-1 text-[var(--v2-nav)]">
                Install a wallet that supports {target.name}, then reload this page. On a phone,
                open Animr in your wallet app&apos;s browser.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {INSTALL_LINKS.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className={`${pillClass("glass", "sm")} px-3`}
                  >
                    {link.name} <span aria-hidden>↗</span>
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <>
              <p className="v2-note px-2 pb-2">Choose a wallet</p>
              <ul className="space-y-1">
                {wallets.map((wallet) => (
                  <li key={wallet.uid}>
                    <button
                      type="button"
                      onClick={() => connectWith(wallet)}
                      disabled={connect.isPending}
                      className={`${pillClass("ghost", "sm", true)} justify-start px-2.5 text-[var(--v2-ink)]`}
                    >
                      {wallet.icon ? (
                        // eslint-disable-next-line @next/next/no-img-element -- EIP-6963 icons are data: URIs
                        <img src={wallet.icon} alt="" className="size-5 rounded" />
                      ) : (
                        <span aria-hidden className="size-5 rounded [background:var(--v2-grad-tile)]" />
                      )}
                      {wallet.id === "injected" ? "Browser wallet" : wallet.name}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {connect.isError && (
            <p className="mt-2 px-2 text-xs text-[var(--v2-danger)]">{walletErrorMessage(connect.error)}</p>
          )}
        </div>
      )}
    </div>
  );
}

function AddressAvatar({ address }: { address: string }) {
  const hue = Number.parseInt(address.slice(2, 6), 16) % 360;
  return (
    <span
      aria-hidden
      className="size-4 rounded-full"
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 85% 68%), hsl(${(hue + 60) % 360} 80% 52%))`,
      }}
    />
  );
}

function Chevron() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 text-[var(--v2-faint)]" fill="none">
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
