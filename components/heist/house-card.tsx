"use client";

import { Badge, Chip, IconTile, Kicker, MaskIcon } from "@/components/v2";
import type { DefenderProfile, HouseChog } from "@/lib/heist/types";
import { AddressLink, HouseArt, chogText } from "./bits";

const STATUS_LABEL = { none: "Not deployed", uninitialized: "Not initialized", ready: "Ready" } as const;

/** Who you're robbing: the House Chog behind its vault door, its wallet and vault, or the "moving in" notice. */
export function HouseCard({ house, defender }: { house: HouseChog; defender: DefenderProfile }) {
  const open = house.phase === "open";
  // The visible traits are the clues the hint points at (brand-safe values; Side, Form and Naked say little).
  const clues = house.traits.filter((trait) => !/^(side|form|naked|tier)$/i.test(trait.type));
  const status = house.tbaStatus ? STATUS_LABEL[house.tbaStatus] : house.phase === "unset" ? "Not picked yet" : "Unknown";
  return (
    <section aria-labelledby="heist-house" className="v2-card v2-card--flush v2-card--feature heist-vault">
      <div className="heist-vault-door">
        <span className="relative">
          <HouseArt image={house.image} tokenId={house.tokenId} className="v2-avatar--xl" />
          <IconTile size="sm" tone="violet" className="heist-vault-mask">
            <MaskIcon />
          </IconTile>
        </span>
      </div>

      <div className="heist-vault-body">
        <div>
          <Kicker dot>The House Chog</Kicker>
          <h2 id="heist-house" className="heist-vault-name">
            {house.name ?? "Moving in"}
            {house.tokenId !== null && <Chip className="v2-mono">token {house.tokenId}</Chip>}
          </h2>
          <p className="mt-3 text-[length:var(--v2-fs-sm)] leading-relaxed text-pretty text-[var(--v2-nav)]">
            <span className="font-medium text-[var(--v2-ink)]">{defender.archetype}.</span> {defender.temperament}
          </p>
        </div>

        <div className="heist-vault-sum">
          <span className="text-[length:var(--v2-fs-sm)] text-[var(--v2-nav)]">In the vault</span>
          <span className="heist-vault-sum-value v2-num">
            {house.chogBalance !== null ? chogText(house.chogBalance) : "—"}{" "}
            <span className="text-[length:var(--v2-fs-sm)] text-[var(--v2-nav)]">$CHOG</span>
          </span>
        </div>

        <dl className="v2-kv">
          <div>
            <dt>Wallet (ERC-6551)</dt>
            <dd>{house.tba ? <AddressLink address={house.tba} /> : "—"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <Badge tone={open ? "success" : "warning"} dot>
                {status}
              </Badge>
            </dd>
          </div>
          <div>
            <dt>Patience</dt>
            <dd>
              <span className="v2-num">{defender.patience}</span> messages a heist
            </dd>
          </div>
        </dl>

        {clues.length > 0 && (
          <div className="grid gap-2.5">
            <p className="v2-overline" id="heist-clues">
              Its traits · clues to its soft spot
            </p>
            <ul aria-labelledby="heist-clues" className="heist-clues">
              {clues.map((trait) => (
                <li key={trait.type} className="v2-chip" title={trait.type}>
                  <span className="text-[var(--v2-faint)]">{trait.type}</span> {trait.value}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {!open && (
        <div role="status" className="heist-moving">
          <p className="font-medium text-[var(--v2-warning)]">The House Chog is moving in.</p>
          <p className="mt-1 text-pretty">
            {house.note} You can already chat with it. Until its wallet is ready and holds $CHOG, no live check runs, and
            “Act as the AI” explains exactly what that check will do.
          </p>
        </div>
      )}
    </section>
  );
}
