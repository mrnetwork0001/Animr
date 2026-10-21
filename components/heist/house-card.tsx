"use client";

import type { DefenderProfile, HouseChog } from "@/lib/heist/types";
import { AddressLink, HouseArt, chogText } from "./bits";

const STATUS_LABEL = { none: "not deployed", uninitialized: "not initialized", ready: "ready" } as const;

/** Who you're robbing: the House Chog, its wallet and its vault, or the "moving in" notice. */
export function HouseCard({ house, defender }: { house: HouseChog; defender: DefenderProfile }) {
  const open = house.phase === "open";
  // The visible traits are the clues the hint points at (brand-safe values; Side, Form and Naked say little).
  const clues = house.traits.filter((trait) => !/^(side|form|naked|tier)$/i.test(trait.type));
  return (
    <section aria-labelledby="heist-house" className="card overflow-hidden">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        <HouseArt image={house.image} tokenId={house.tokenId} className="size-24 sm:size-28" />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">The House Chog</p>
          <h2 id="heist-house" className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xl font-semibold tracking-tight">
            {house.name ?? "Moving in"}
            {house.tokenId !== null && <span className="chip font-mono">token {house.tokenId}</span>}
          </h2>
          <p className="mt-1.5 text-sm text-pretty text-muted">
            <span className="font-medium text-foreground">{defender.archetype}.</span> {defender.temperament}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-subtle">Vault</dt>
              <dd className="font-semibold tabular-nums">{house.chogBalance !== null ? `${chogText(house.chogBalance)} $CHOG` : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Wallet (ERC-6551)</dt>
              <dd>{house.tba ? <AddressLink address={house.tba} /> : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Status</dt>
              <dd className={open ? "text-success" : "text-warning"}>
                {house.tbaStatus ? STATUS_LABEL[house.tbaStatus] : house.phase === "unset" ? "not picked yet" : "unknown"}
              </dd>
            </div>
          </dl>
          {clues.length > 0 && (
            <ul aria-label="Its traits (clues to its soft spot)" className="mt-3 flex flex-wrap gap-1.5">
              {clues.map((trait) => (
                <li key={trait.type} className="chip" title={trait.type}>
                  <span className="text-subtle">{trait.type}</span> {trait.value}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {!open && (
        <div role="status" className="border-t border-warning/30 bg-warning/10 px-5 py-3 text-sm text-pretty sm:px-6">
          <p className="font-semibold text-warning">The House Chog is moving in.</p>
          <p className="mt-0.5 text-muted">
            {house.note} You can already chat with it. Until its wallet is ready and holds $CHOG, no live check runs, and
            “Act as the AI” explains exactly what that check will do.
          </p>
        </div>
      )}
    </section>
  );
}
