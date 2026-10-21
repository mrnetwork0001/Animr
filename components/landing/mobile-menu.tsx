"use client";

import { useEffect, useId, useRef, useState } from "react";

type MobileMenuProps = {
  items: readonly { href: string; label: string }[];
  /** `button` names the toggle (its open state is aria-expanded); `label` names the nav panel. */
  labels: { button: string; label: string };
};

/**
 * Section links for small screens: a disclosure that closes on selection, Escape, an outside tap,
 * or when keyboard focus leaves it.
 */
export function MobileMenu({ items, labels }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      // React's onBlur bubbles (focusout): close once focus moves to something outside the menu,
      // e.g. tabbing past the last link. A null relatedTarget (a click on nothing focusable,
      // switching windows) is left to the pointer and Escape handlers above.
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (open && next instanceof Node && !event.currentTarget.contains(next)) setOpen(false);
      }}
      className="relative md:hidden"
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={labels.button}
        onClick={() => setOpen((value) => !value)}
        className="btn btn-ghost size-10 p-0"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          className="size-5"
          aria-hidden
        >
          {open ? <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      <nav
        id={panelId}
        aria-label={labels.label}
        hidden={!open}
        className="card absolute top-full right-0 mt-3 w-60 bg-surface p-2"
      >
        <ul>
          {items.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
