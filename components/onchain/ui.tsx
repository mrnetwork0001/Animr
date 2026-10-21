import type { ReactNode } from "react";
import type { Address } from "viem";
import { explorerAddressUrl, shortAddress } from "@/lib/format";

// Small presentational pieces shared by the on-chain components (no hooks).

export function Callout({ tone, title, children }: { tone: "warning" | "danger"; title: string; children: ReactNode }) {
  const [box, heading] =
    tone === "danger"
      ? ["border-danger/30 bg-danger/10", "text-danger"]
      : ["border-warning/30 bg-warning/10", "text-warning"];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 ${box}`}>
      <p className={`text-sm font-medium ${heading}`}>{title}</p>
      <div className="mt-1 text-sm leading-relaxed break-words text-muted">{children}</div>
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
      className="font-mono text-foreground underline-offset-2 hover:underline"
    >
      {shortAddress(address)} ↗
    </a>
  ) : (
    <span title={address} className="font-mono text-foreground">
      {shortAddress(address)}
    </span>
  );
}

export function Spinner() {
  return (
    <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}
