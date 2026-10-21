import type { ReactNode } from "react";
import type { Address } from "viem";
import { explorerAddressUrl, shortAddress } from "@/lib/format";
import "@/app/design-v2.css";

// Small presentational pieces shared by the on-chain components (no hooks), in the v2 look: callouts are inline
// toast panels (a status dot, a title, the text), addresses are mono with an explorer arrow.

export function Callout({ tone, title, children }: { tone: "warning" | "danger"; title: string; children: ReactNode }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`v2-toast ${tone === "danger" ? "v2-toast--danger" : "v2-toast--warning"} shadow-none`}
    >
      <div className="min-w-0">
        <span className="v2-toast-title">{title}</span>
        <div className="mt-1 leading-relaxed break-words text-[var(--v2-nav)]">{children}</div>
      </div>
      <span />
    </div>
  );
}

export function AddressLink({ address }: { address: Address }) {
  const href = explorerAddressUrl(address);
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={address}
      className="v2-mono text-[var(--v2-ink)] underline decoration-[rgb(189_247_238/0.3)] underline-offset-[3px] hover:text-[var(--v2-kicker)]"
    >
      {shortAddress(address)} ↗
    </a>
  ) : (
    <span title={address} className="v2-mono text-[var(--v2-ink)]">
      {shortAddress(address)}
    </span>
  );
}

export function Spinner() {
  return (
    <span aria-hidden className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}
