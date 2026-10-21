"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { publicClient } from "@/lib/clients";
import { explorerAddressUrl } from "@/lib/format";
import { trophyBadgeMarkup } from "@/lib/trophies/art";
import { trophiesAddress } from "@/lib/trophies/config";
import { readTrophies } from "@/lib/trophies/read";
import { ExternalIcon } from "../v2/icons";

/** A trophy kind's badge (static markup from lib/trophies/art, coloured by `color`). */
export function TrophyBadge({ kind, color, size = 44 }: { kind: number; color: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      className="shrink-0"
      style={{ color }}
      dangerouslySetInnerHTML={{ __html: trophyBadgeMarkup(kind) }}
    />
  );
}

/**
 * "Trophy cabinet" card for a Chog profile: the AnimrTrophies its ERC-6551 wallet holds, with counts. Renders
 * nothing when the contract isn't configured (NEXT_PUBLIC_TROPHIES_ADDRESS) or the read fails.
 */
export function TrophyCabinet({ account }: { account?: Address }) {
  const trophies = useQuery({
    queryKey: ["trophies", trophiesAddress, account],
    queryFn: trophiesAddress && account ? () => readTrophies(publicClient, account) : skipToken,
    staleTime: 60_000,
  });
  if (!trophiesAddress || !account || !trophies.data) return null;
  const held = trophies.data;
  const contractUrl = explorerAddressUrl(trophiesAddress);

  return (
    <section aria-labelledby="trophies-title" className="v2-card">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="trophies-title" className="v2-h3">
          Trophy cabinet
        </h2>
        {contractUrl && (
          <a
            href={contractUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="v2-link inline-flex items-center gap-1 text-xs"
          >
            Contract
            <ExternalIcon className="size-3.5" />
          </a>
        )}
      </div>
      <p className="v2-note mt-1">Minted into this Chog&apos;s own wallet. They move with the NFT.</p>
      {held.length === 0 ? (
        <p className="v2-faint mt-4 text-sm">
          Empty for now: a best call on a live Daily Bell or a first real trade puts one here.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {held.map((trophy) => (
            <li
              key={trophy.kind}
              className="flex items-center gap-3 rounded-[var(--v2-r-md)] border border-[var(--v2-line-soft)] px-3 py-2.5"
            >
              <TrophyBadge kind={trophy.kind} color={trophy.color} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--v2-ink)]">
                  {trophy.name}
                  {trophy.count > 1 && (
                    <span className="v2-num ml-1.5 text-[var(--v2-nav)]" aria-label={`${trophy.count} times`}>
                      ×{trophy.count}
                    </span>
                  )}
                </p>
                <p className="v2-faint text-xs leading-snug">{trophy.blurb}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
