"use client";

import { requestCoachReplay } from "@/lib/coach";

function GuideIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M6.1 6.4a1.95 1.95 0 1 1 2.75 1.78c-.5.26-.85.62-.85 1.17v.25"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11.45" r=".75" fill="currentColor" />
    </svg>
  );
}

/** The header's small "?" on wide screens (styled in design-v2.css): starts the in-app guide again. */
export function CoachHelpButton() {
  return (
    <button
      type="button"
      className="v2-coach-help"
      aria-label="Replay the guide"
      title="Replay the guide"
      onClick={requestCoachReplay}
    >
      <GuideIcon />
    </button>
  );
}

/** The hamburger panel's bottom row: closes the panel (the caller's job) and starts the guide. */
export function CoachReplayRow({ onBeforeReplay }: { onBeforeReplay?: () => void }) {
  return (
    <button
      type="button"
      className="v2-menu-replay"
      onClick={() => {
        onBeforeReplay?.();
        requestCoachReplay();
      }}
    >
      <GuideIcon />
      Replay the guide
    </button>
  );
}
