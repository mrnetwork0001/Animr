"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useSound, useSoundArming } from "./use-sound";
import "./audio.css";

/*
 * The one sound control: a speaker in a glass pill (aria-pressed; off by default, remembered per browser) and, behind
 * its small chevron, a popover with the "Sound moments" and "Ambient" switches and the ambient's volume. Mount it in
 * the app header beside the account button and, with `showLabel`, as a row in the hamburger panel; every instance
 * shares one state (lib/audio/engine.ts).
 *
 * Nothing plays before the visitor turns it on in this browser session. If a previous visit left it on, the pill shows
 * "on, tap to start" until the page's first gesture (any click, key or tap, or this pill) unlocks audio.
 */

/** The header-glyph style (components/v2/icons.tsx): a 24-unit grid at 18px, so the 2.13 stroke lands at 1.6px. */
function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.13}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable={false}
    >
      <path d="M3.5 9.4v5.2h3.3l5 4.1V5.3l-5 4.1Z" fill="currentColor" fillOpacity={0.1} />
      {on ? (
        <g className="snd-wave">
          <path d="M15.3 9.4a3.7 3.7 0 0 1 0 5.2" />
          <path d="M18 6.7a7.5 7.5 0 0 1 0 10.6" opacity={0.5} />
        </g>
      ) : (
        <path d="m15.5 9.5 5 5m0-5-5 5" />
      )}
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" width={12} height={12} fill="none" aria-hidden="true" focusable={false}>
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  const id = useId();
  return (
    <div className="snd-row">
      <span id={id}>{label}</span>
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={id} className="snd-switch" onClick={() => onChange(!checked)} />
    </div>
  );
}

export function SoundToggle({ showLabel = false, className = "" }: { showLabel?: boolean; className?: string }) {
  const sound = useSound();
  useSoundArming(sound);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popId = useId();

  const armed = sound.on && !sound.running && !sound.unsupported;
  const label = sound.unsupported
    ? "Sound unavailable in this browser"
    : !sound.on
      ? "Sound off"
      : armed
        ? "Sound on, tap to start"
        : "Sound on";
  const status = sound.unsupported ? "Unavailable" : !sound.on ? "Off" : armed ? "On · tap to start" : "On";

  // The popover closes on an outside click or Escape.
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

  return (
    <div ref={rootRef} data-sound-toggle className={`snd ${showLabel ? "snd--row" : ""} ${className}`}>
      {showLabel && (
        <span className="snd-label">
          Sound
          <span className="snd-state" aria-hidden="true">
            {status}
          </span>
        </span>
      )}
      <span className="snd-pill">
        <button
          type="button"
          className="snd-btn"
          aria-pressed={sound.on}
          aria-label={label}
          title={label}
          disabled={sound.unsupported}
          data-armed={armed ? "" : undefined}
          onClick={() => (armed ? void sound.start() : sound.toggle())}
        >
          <SpeakerIcon on={sound.on} />
        </button>
        <button
          type="button"
          className="snd-more"
          aria-label="Sound settings"
          aria-expanded={open}
          aria-controls={open ? popId : undefined}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronIcon />
        </button>
      </span>
      {open && (
        <div id={popId} role="group" aria-label="Sound settings" className="snd-pop v2-glass--strong">
          <Switch checked={sound.moments} label="Sound moments" onChange={sound.setMoments} />
          <Switch checked={sound.ambient} label="Ambient" onChange={sound.setAmbient} />
          <div className="snd-row" aria-disabled={!sound.ambient}>
            <label htmlFor={`${popId}-volume`}>Ambient volume</label>
            <input
              id={`${popId}-volume`}
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sound.volume}
              disabled={!sound.ambient}
              onChange={(event) => sound.setVolume(Number(event.currentTarget.value))}
              className="snd-range"
            />
          </div>
        </div>
      )}
    </div>
  );
}
