"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, Suspense, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { V2_NAV_LINKS, isV2NavActive } from "./nav";
import { NavItemContent, NavWalletSource } from "./nav-hud";

/** Below this width the section links and the wallet live in the hamburger panel (matches design-v2.css). */
const COMPACT = "(max-width: 1099.98px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(COMPACT);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True on phones and tablets. The server (and the first client render) assume a wide screen; CSS hides
 * whichever of the two layouts doesn't apply, so nothing flashes before this settles. */
function useCompact(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(COMPACT).matches,
    () => false,
  );
}

/**
 * The header's right column: on wide screens the wallet slot (Log in / account), on phones and tablets a
 * hamburger whose panel holds the section links and the wallet. The wallet is mounted in one place only,
 * so its client state (Privy, wagmi) never runs twice.
 */
export function V2HeaderActions({ wallet }: { wallet?: ReactNode }) {
  const compact = useCompact();
  return (
    <div className="v2-header-actions">
      {/* Feeds the "Your Chogs" badge for both layouts (one instance per page). */}
      <NavWalletSource />
      {!compact && <div className="v2-header-wallet">{wallet}</div>}
      <Suspense fallback={<MenuButton open={false} onToggle={() => {}} controls="" />}>
        <MobileMenu wallet={compact ? wallet : null} />
      </Suspense>
    </div>
  );
}

function MenuButton({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
  return (
    <button
      type="button"
      className="v2-menu-button"
      aria-expanded={open}
      aria-controls={controls || undefined}
      aria-label={open ? "Close menu" : "Open menu"}
      onClick={onToggle}
    >
      <span className="v2-menu-icon" data-open={open ? "" : undefined} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </button>
  );
}

function MobileMenu({ wallet }: { wallet: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  // A navigation closes the panel (adjusting state while rendering, not in an effect).
  if (open && pathname !== openedAt) {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      // Privy's modal and the account menu render in portals: clicks there must not close the panel.
      if (target instanceof Element && target.closest("#privy-dialog, #privy-dialog-backdrop, #privy-modal-content")) return;
      if (rootRef.current && target && !rootRef.current.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="v2-menu">
      <MenuButton
        open={open}
        controls={panelId}
        onToggle={() => {
          setOpenedAt(pathname);
          setOpen((value) => !value);
        }}
      />
      <div id={panelId} className="v2-menu-panel" hidden={!open}>
        <nav aria-label="Main">
          <ul className="v2-menu-list">
            {V2_NAV_LINKS.map((link) => {
              const active = isV2NavActive(link, pathname);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="v2-menu-link"
                    aria-current={active ? (pathname === link.href ? "page" : "true") : undefined}
                    onClick={() => setOpen(false)}
                  >
                    <NavItemContent link={link} row badges={open} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {wallet && <div className="v2-menu-wallet">{wallet}</div>}
      </div>
    </div>
  );
}
