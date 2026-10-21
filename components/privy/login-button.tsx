"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useConnection, useSwitchChain } from "wagmi";
import { pillClass } from "@/components/v2/primitives";
import { useIsClient } from "@/components/use-is-client";
import { appConfig } from "@/lib/config";
import { explorerAddressUrl, shortAddress } from "@/lib/format";
import { walletErrorMessage } from "@/lib/wagmi";
import { type PrivyIdentity, runPrivyAction, setPrivyActiveWallet, usePrivySession } from "./session";

/** The floating panel under the account pill: dark glass, right-aligned, never wider than the screen. */
const PANEL =
  "v2-glass--strong absolute top-full right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2*var(--v2-gutter)))] rounded-[var(--v2-r-lg)] p-4 text-sm";

const ROW = `${pillClass("ghost", "sm", true)} justify-start px-2.5 text-[var(--v2-ink)]`;

/**
 * The Privy login button. Logged out: "Log in" (glass, in the header) or "Connect wallet" (violet, in a page prompt);
 * both open Privy's modal (wallets, email code, Google, X, Discord). Logged in: an account pill with a menu (copy
 * address, Your Chogs, link more accounts, log out), plus a "Switch to Monad" pill when an external wallet is on
 * another network.
 */
export function PrivyLoginButton({ className = "", size = "md" }: { className?: string; size?: "sm" | "md" }) {
  const isClient = useIsClient();
  const session = usePrivySession();
  const connection = useConnection();
  const switchChain = useSwitchChain();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

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
  const header = size === "sm";

  if (!isClient || !session.authenticated || !session.identity) {
    const loading = isClient && session.status === "loading";
    return (
      <button
        type="button"
        aria-busy={loading || undefined}
        onClick={() => runPrivyAction("login")}
        className={[pillClass(header ? "glass" : "primary", size), loading && "opacity-70", className]
          .filter(Boolean)
          .join(" ")}
      >
        {header ? "Log in" : "Connect wallet"}
      </button>
    );
  }

  const identity = session.identity;
  const active = session.activeAddress;
  const connected = connection.status === "connected" ? connection : undefined;
  const wrongChain = Boolean(connected && connected.chainId !== target.id);

  // Logged in without a wallet (e.g. the embedded wallet is still being created): page prompts offer to add one.
  if (!header && !active) {
    return (
      <button
        type="button"
        onClick={() => runPrivyAction("linkWallet")}
        className={`${pillClass("primary", size)} ${className}`}
      >
        Connect wallet
      </button>
    );
  }

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable; the address is shown in full.
    }
  }

  const switchToTarget = () => switchChain.mutate({ chainId: target.id });
  const explorer = active ? explorerAddressUrl(active) : undefined;
  const linkable = [
    !identity.email && { label: "Add email", action: "linkEmail" as const },
    !identity.google && { label: "Add Google", action: "linkGoogle" as const },
    !identity.twitter && { label: "Add X (Twitter)", action: "linkTwitter" as const },
    !identity.discord && { label: "Add Discord", action: "linkDiscord" as const },
  ].filter(Boolean) as { label: string; action: "linkEmail" | "linkGoogle" | "linkTwitter" | "linkDiscord" }[];

  return (
    <div ref={rootRef} className={`relative flex items-center gap-2 ${className}`}>
      {wrongChain && (
        <button
          type="button"
          onClick={switchToTarget}
          disabled={switchChain.isPending}
          className={`${pillClass("glass", size)} border-[rgb(242_193_107/0.4)] bg-[rgb(242_193_107/0.08)] text-[var(--v2-warning)] hover:border-[var(--v2-warning)]`}
        >
          <span aria-hidden className="size-2 rounded-full bg-[var(--v2-warning)]" />
          {switchChain.isPending ? (
            "Switching…"
          ) : (
            <>
              <span className="sm:hidden">Switch</span>
              <span className="hidden sm:inline">Switch to {target.name}</span>
            </>
          )}
        </button>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Account: ${identity.label}`}
        onClick={() => setOpen((value) => !value)}
        className={`${pillClass("glass", size)} max-w-[11rem] gap-2 pr-3 pl-1.5 sm:max-w-[15rem]`}
      >
        <Avatar identity={identity} seed={active ?? identity.label} />
        <span className={`truncate ${identity.label.startsWith("0x") ? "v2-mono" : ""}`}>{identity.label}</span>
        <Chevron />
      </button>
      {open && (
        <div id={panelId} className={PANEL}>
          <p className="v2-note">Logged in as {identity.label}</p>
          {active ? (
            <>
              <p className="v2-mono mt-1.5 text-[13px] break-all text-[var(--v2-ink)]">{active}</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => copyAddress(active)}
                  className={`${pillClass("glass", "sm")} flex-1 px-3`}
                >
                  {copied ? "Copied" : "Copy address"}
                </button>
                {explorer && (
                  <a href={explorer} target="_blank" rel="noreferrer" className={`${pillClass("glass", "sm")} flex-1 px-3`}>
                    Explorer <span aria-hidden>↗</span>
                  </a>
                )}
              </div>
            </>
          ) : (
            <p className="mt-1.5 text-[var(--v2-nav)]">Setting up your wallet…</p>
          )}

          {wrongChain && (
            <p className="mt-3 text-[var(--v2-warning)]">
              Your wallet is on another network. Animr runs on {target.name}.
            </p>
          )}
          {switchChain.isError && (
            <p className="mt-2 text-xs text-[var(--v2-danger)]">{walletErrorMessage(switchChain.error)}</p>
          )}

          {session.wallets.length > 1 && (
            <div className="mt-4 border-t border-[var(--v2-line-soft)] pt-3">
              <p className="v2-note px-2.5 pb-1">Use wallet</p>
              <ul className="space-y-0.5">
                {session.wallets.map((wallet) => {
                  const current = wallet.address === active;
                  return (
                    <li key={wallet.address}>
                      <button
                        type="button"
                        aria-pressed={current}
                        onClick={() => setPrivyActiveWallet(wallet.address)}
                        className={`${ROW} ${current ? "bg-[rgb(255_255_255/0.05)]" : ""}`}
                      >
                        <span
                          aria-hidden
                          className={`size-1.5 shrink-0 rounded-full ${current ? "bg-[var(--v2-success)]" : "bg-[var(--v2-line)]"}`}
                        />
                        <span className="truncate">{wallet.name}</span>
                        <span className="v2-mono ml-auto text-[var(--v2-faint)]">{shortAddress(wallet.address)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="mt-4 space-y-0.5 border-t border-[var(--v2-line-soft)] pt-3">
            <Link href="/app" onClick={() => setOpen(false)} className={ROW}>
              Your Chogs
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                runPrivyAction("linkWallet");
              }}
              className={ROW}
            >
              Link another wallet
            </button>
            {linkable.map((item) => (
              <button
                key={item.action}
                type="button"
                onClick={() => {
                  setOpen(false);
                  runPrivyAction(item.action);
                }}
                className={`${ROW} text-[var(--v2-nav)]`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              runPrivyAction("logout");
            }}
            className={`${pillClass("ghost", "sm", true)} mt-2 text-[var(--v2-danger)] hover:text-[var(--v2-danger)]`}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

function Avatar({ identity, seed }: { identity: PrivyIdentity; seed: string }) {
  if (identity.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote profile picture (X), tiny and decorative
      <img src={identity.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-6 shrink-0 rounded-full" />
    );
  }
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  const initial = identity.label.startsWith("0x") ? "" : identity.label.replace(/^@/, "").charAt(0).toUpperCase();
  return (
    <span
      aria-hidden
      className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
      style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 62%), hsl(${(hue + 60) % 360} 65% 48%))` }}
    >
      {initial}
    </span>
  );
}

function Chevron() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 shrink-0 text-[var(--v2-faint)]" fill="none">
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
