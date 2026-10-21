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
import { appConfig } from "@/lib/config";
import { explorerAddressUrl, shortAddress } from "@/lib/format";
import { walletErrorMessage } from "@/lib/wagmi";

const subscribeNothing = () => () => {};

/**
 * False during SSR and hydration, true afterwards. The server always renders
 * "disconnected", and wagmi's hooks read the live store even while hydrating, so
 * wallet-dependent markup must wait for this to stay hydration-safe.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}

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

export function ConnectButton({ className = "" }: { className?: string }) {
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
            className="btn border-warning/40 bg-warning/10 text-warning hover:bg-warning/20"
          >
            <span aria-hidden className="size-2 rounded-full bg-warning" />
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
          <span className="chip hidden sm:inline-flex" title={`Chain ID ${target.id}`}>
            <span aria-hidden className="size-2 rounded-full bg-success" />
            {target.name}
          </span>
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((value) => !value)}
          className="btn btn-secondary font-mono font-medium"
        >
          <AddressAvatar address={connected.address} />
          {shortAddress(connected.address)}
          <Chevron />
        </button>
        {open && (
          <div
            id={panelId}
            className="card absolute top-full right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] bg-surface p-4 text-sm"
          >
            <p className="text-xs text-subtle">
              Connected with{" "}
              {connected.connector.id === "injected" ? "your browser wallet" : connected.connector.name}
            </p>
            <p className="mt-1 font-mono text-[13px] break-all text-foreground">
              {connected.address}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => copyAddress(connected.address)}
                className="btn btn-secondary flex-1 px-2 py-1.5 text-xs"
              >
                {copied ? "Copied" : "Copy address"}
              </button>
              {explorer && (
                <a
                  href={explorer}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary flex-1 px-2 py-1.5 text-xs"
                >
                  Explorer ↗
                </a>
              )}
            </div>
            <div className="mt-3 border-t border-line pt-3">
              {wrongChain ? (
                <>
                  <p className="text-warning">
                    Wrong network (chain {connected.chainId}). Animr runs on {target.name}.
                  </p>
                  <button
                    type="button"
                    onClick={switchToTarget}
                    disabled={switchChain.isPending}
                    className="btn btn-primary mt-2 w-full"
                  >
                    {switchChain.isPending ? "Switching…" : `Switch to ${target.name}`}
                  </button>
                </>
              ) : (
                <p className="flex items-center gap-2 text-muted">
                  <span aria-hidden className="size-2 rounded-full bg-success" />
                  {target.name} · chain {target.id}
                </p>
              )}
              {switchChain.isError && (
                <p className="mt-2 text-xs text-danger">
                  {walletErrorMessage(switchChain.error)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                disconnect.mutate();
              }}
              className="btn btn-ghost mt-3 w-full text-danger"
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
        className="btn btn-primary"
      >
        {busy ? "Connecting…" : "Connect wallet"}
      </button>
      {open && (
        <div
          id={panelId}
          className="card absolute top-full right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] bg-surface p-3 text-sm"
        >
          {wallets.length === 0 ? (
            <div className="p-1">
              <p className="font-medium text-foreground">No browser wallet found</p>
              <p className="mt-1 text-muted">
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
                    className="btn btn-secondary px-2 py-1.5 text-xs"
                  >
                    {link.name} ↗
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <>
              <p className="px-1 pb-2 text-xs text-subtle">Choose a wallet</p>
              <ul className="space-y-1">
                {wallets.map((wallet) => (
                  <li key={wallet.uid}>
                    <button
                      type="button"
                      onClick={() => connectWith(wallet)}
                      disabled={connect.isPending}
                      className="btn btn-ghost w-full justify-start px-2 text-foreground"
                    >
                      {wallet.icon ? (
                        // eslint-disable-next-line @next/next/no-img-element -- EIP-6963 icons are data: URIs
                        <img src={wallet.icon} alt="" className="size-5 rounded" />
                      ) : (
                        <span aria-hidden className="size-5 rounded bg-accent/30" />
                      )}
                      {wallet.id === "injected" ? "Browser wallet" : wallet.name}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {connect.isError && (
            <p className="mt-2 px-1 text-xs text-danger">{walletErrorMessage(connect.error)}</p>
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
    <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 text-subtle" fill="none">
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
