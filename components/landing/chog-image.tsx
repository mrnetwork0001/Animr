"use client";

import { useCallback } from "react";

type ChogImageProps = {
  /** The image from the Chog's on-chain metadata, through the IPFS gateway. */
  src: string;
  /** A self-hosted copy, used only if the gateway fails. */
  fallbackSrc?: string;
  alt: string;
  /** Intrinsic size hint; the box itself is sized by className. */
  size?: number;
  /** For the one above-the-fold image: loads eagerly at high priority. */
  priority?: boolean;
  /** Shown behind the image, and in its place if every source fails. */
  fallbackLabel: string;
  className?: string;
};

/**
 * A Chog NFT image in a fixed square box, so nothing shifts while it loads. If the IPFS gateway
 * fails (Filebase answers bursts with 429s), it switches to the self-hosted copy; if that fails
 * too, the image fades out and the labelled placeholder behind it shows. Errors that happen
 * before hydration are caught as well.
 */
export function ChogImage({
  src,
  fallbackSrc,
  alt,
  size = 1000,
  priority = false,
  fallbackLabel,
  className = "",
}: ChogImageProps) {
  const recoverFromErrors = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img) return;
      const onError = () => {
        if (fallbackSrc && img.getAttribute("src") !== fallbackSrc) {
          img.src = fallbackSrc;
          return;
        }
        img.setAttribute("data-broken", "");
      };
      if (img.complete && img.naturalWidth === 0) onError();
      img.addEventListener("error", onError);
      return () => img.removeEventListener("error", onError);
    },
    [fallbackSrc],
  );

  return (
    <span className={`relative block aspect-square overflow-hidden bg-surface-2 ${className}`}>
      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgb(111_90_220/0.3),transparent_65%)] font-mono text-xs text-subtle"
      >
        {fallbackLabel}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element -- Chog images live on IPFS; no next/image remote config */}
      <img
        ref={recoverFromErrors}
        src={src}
        alt={alt}
        width={size}
        height={size}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        referrerPolicy="no-referrer"
        className="relative size-full object-cover transition-opacity duration-300 data-broken:opacity-0"
      />
    </span>
  );
}
