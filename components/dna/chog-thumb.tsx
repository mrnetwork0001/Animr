"use client";

import { useState } from "react";
import { resolveUri } from "@/lib/nft";
import { chogThumbUrl } from "./thumb-url";

type ChogThumbProps = {
  /** ipfs:// URI from the snapshot (or any URL). */
  image?: string;
  tokenId: number;
  /** Rendered size in CSS px; the image is fetched at 2x. */
  size?: number;
  /** Responsive size classes (e.g. "size-16 sm:size-24") instead of the fixed `size` box. */
  box?: string;
  /** Lazy by default; pass true for the one image above the fold. */
  eager?: boolean;
  alt?: string;
  className?: string;
};

/** A Chog's face in a fixed square: resized copy, then the original, then a labelled placeholder. */
export function ChogThumb({ image, tokenId, size = 40, box, eager = false, alt = "", className = "" }: ChogThumbProps) {
  const sources = image ? [chogThumbUrl(image, Math.min(size * 2, 1000)), resolveUri(image)] : [];
  const [failed, setFailed] = useState<string[]>([]);
  const src = sources.find((s) => !failed.includes(s));

  return (
    <span
      className={`relative block shrink-0 overflow-hidden bg-surface-2 ${box ?? ""} ${className}`}
      style={box ? undefined : { width: size, height: size }}
    >
      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgb(131_110_249/0.35),transparent_70%)] font-mono text-[10px] text-white/70"
      >
        #{tokenId}
      </span>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- IPFS / resizer hosts aren't in next/image's allowlist
        <img
          key={src}
          src={src}
          alt={alt}
          width={size}
          height={size}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed((list) => [...list, src])}
          className="relative size-full object-cover"
        />
      )}
    </span>
  );
}
