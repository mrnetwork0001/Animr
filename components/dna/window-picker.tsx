"use client";

import { WINDOW_LABEL, WINDOWS, type WindowKey } from "./shared";

/** Short labels for the segmented control; the full ones ("45 days", "All") are what a screen reader hears. */
const SHORT: Record<WindowKey, string> = { "30d": "30d", "45d": "45d", max: "Max" };
const SPOKEN: Record<WindowKey, string> = { "30d": WINDOW_LABEL["30d"], "45d": WINDOW_LABEL["45d"], max: "All history" };

/** The v2 segmented 30d / 45d / Max picker for the replay window (state buttons, aria-pressed). */
export function WindowPicker({
  value,
  onChange,
  label = "Replay window",
  className = "",
}: {
  value: WindowKey;
  onChange: (value: WindowKey) => void;
  label?: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`v2-tabs shrink-0 ${className}`}>
      {WINDOWS.map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          aria-label={SPOKEN[key]}
          title={SPOKEN[key]}
          onClick={() => onChange(key)}
          className="v2-tab h-[30px] px-3.5 text-[13.5px]"
        >
          {SHORT[key]}
        </button>
      ))}
    </div>
  );
}
