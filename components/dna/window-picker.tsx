"use client";

import { WINDOW_LABEL, WINDOWS, type WindowKey } from "./shared";

/** Segmented 30 days / 45 days / All picker for the replay window. */
export function WindowPicker({
  value,
  onChange,
  label = "Replay window",
}: {
  value: WindowKey;
  onChange: (value: WindowKey) => void;
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex shrink-0 rounded-xl border border-line bg-surface-2 p-0.5">
      {WINDOWS.map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={`rounded-[0.6rem] px-3 py-1 text-xs font-medium transition-colors ${
            value === key ? "bg-accent text-background" : "text-muted hover:text-foreground"
          }`}
        >
          {WINDOW_LABEL[key]}
        </button>
      ))}
    </div>
  );
}
