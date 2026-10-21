"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { HeroLink } from "./content";
import { MenuIcon } from "./icons";
// Same query as hero.css's wide layout: there the header shows its links and this menu is hidden.
import { WIDE_LAYOUT } from "./layout";

type HeroMenuProps = {
  items: readonly HeroLink[];
  yourChogs: HeroLink;
  launch: HeroLink;
  /** `button` names the toggle (its state is aria-expanded); `label` names the nav inside the panel. */
  labels: { button: string; label: string };
};

/**
 * The reflowed hero's round menu button and its glass dropdown. Opening moves focus to the first
 * link; Escape closes it and returns focus to the button. A tap outside, choosing a link or tabbing
 * out of it also closes it.
 */
export function HeroMenu({ items, yourChogs, launch, labels }: HeroMenuProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a[href]")?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    // The wide layout hides the button: don't leave a panel open behind it after a resize.
    const wide = matchMedia(WIDE_LAYOUT);
    const onLayout = () => {
      if (wide.matches) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    wide.addEventListener("change", onLayout);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      wide.removeEventListener("change", onLayout);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div
      ref={rootRef}
      className="hx-menu"
      // focusout bubbles in React: close once focus lands outside the menu (e.g. tabbing past the
      // last link). A null relatedTarget (clicking nothing focusable) is left to the handlers above.
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (open && next instanceof Node && !event.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="hx-menu-button hx-glass"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={labels.button}
        onClick={() => setOpen((value) => !value)}
        data-hx="head"
      >
        <MenuIcon open={open} className="hx-menu-icon" />
      </button>
      <div ref={panelRef} id={panelId} className="hx-menu-panel" hidden={!open}>
        <nav aria-label={labels.label}>
          <ul className="hx-menu-list">
            {items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hx-menu-link" onClick={close}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="hx-menu-actions">
            <Link href={yourChogs.href} className="hx-menu-link" onClick={close}>
              {yourChogs.label}
            </Link>
            <Link href={launch.href} className="hx-pill hx-glass hx-menu-pill" onClick={close}>
              {launch.label}
            </Link>
          </div>
        </nav>
      </div>
    </div>
  );
}
