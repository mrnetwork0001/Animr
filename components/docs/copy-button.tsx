"use client";

import { useEffect, useState } from "react";

/** Copies `value` to the clipboard. The docs' only client code besides links. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard blocked (insecure context, permissions): the value stays selectable on the page.
    }
  }

  return (
    <button type="button" className="docs-icon-btn" onClick={copy} aria-label={copied ? "Copied" : `${label} ${value}`} title={copied ? "Copied" : label}>
      {copied ? (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.6" />
          <path d="M10.5 3.5v-.4A1.6 1.6 0 0 0 8.9 1.5H3.1A1.6 1.6 0 0 0 1.5 3.1v5.8a1.6 1.6 0 0 0 1.6 1.6h.4" />
        </svg>
      )}
      <span className="v2-sr" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}
