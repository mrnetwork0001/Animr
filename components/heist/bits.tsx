"use client";

import { useState } from "react";
import { explorerAddressUrl, formatAmount, shortAddress } from "@/lib/format";
import { resolveUri } from "@/lib/nft";

// Small pieces shared by the heist components.

/** "50,000" for a whole-token decimal string or number. */
export function chogText(value: string | number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return "—";
  return formatAmount(value, digits);
}

/** The House Chog's real NFT art (never a generated image); a vault icon until it has one. */
export function HouseArt({ image, tokenId, className = "" }: { image: string | null; tokenId: number | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = image && !failed ? resolveUri(image) : null;
  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-2xl border border-line bg-surface-2 ${className}`}>
      <span aria-hidden className="absolute inset-0 flex items-center justify-center text-accent-strong/70">
        <VaultIcon className="size-1/2" />
      </span>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- IPFS gateways aren't in next/image's allowlist
        <img
          src={src}
          alt={tokenId ? `The House Chog, token ${tokenId}` : ""}
          width={160}
          height={160}
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="relative size-full object-cover"
        />
      )}
    </span>
  );
}

export function VaultIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" className={className} aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 8.4v1.2M12 14.4v1.2M8.4 12h1.2M14.4 12h1.2M6 20v1.5M18 20v1.5" />
    </svg>
  );
}

export function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className={className} aria-hidden>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 1 1 8 0v2.5" />
    </svg>
  );
}

/** A short address, linked to the explorer. */
export function AddressLink({ address, label }: { address: string; label?: string }) {
  const href = explorerAddressUrl(address);
  const text = label ?? shortAddress(address);
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="font-mono text-accent-strong hover:underline" title={address}>
      {text}
    </a>
  ) : (
    <span className="font-mono" title={address}>
      {text}
    </span>
  );
}

const TIME_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

/** "Oct 19, 13:11 UTC" (fixed time zone: identical on server and client). */
export function utcTime(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? `${TIME_FMT.format(ms)} UTC` : "";
}
