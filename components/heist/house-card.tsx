"use client";

import { Kicker } from "@/components/v2";
import { personaName } from "@/lib/agent/persona";
import type { DefenderProfile, HouseChog } from "@/lib/heist/types";
import { AddressLink, HouseArt, chogText } from "./bits";

/**
 * Who you're robbing: the House Chog behind its vault door, then its vault and wallet once it is open (wallet ready
 * and funded). Until then a single line says the wallet opens soon: the chat already works.
 */
export function HouseCard({ house, defender }: { house: HouseChog; defender: DefenderProfile }) {
  const open = house.phase === "open";
  // The visible traits are the clues the hint points at (brand-safe values; Side, Form and Naked say little).
  const clues = house.traits.filter((trait) => !/^(side|form|naked|tier)$/i.test(trait.type));
  // Persona name first ("Laser Pounce"), then the marketplace name ("CHOG #891"), as everywhere else.
  const persona =
    house.tokenId !== null && house.traits.length > 0
      ? personaName(String(house.tokenId), Object.fromEntries(house.traits.map((trait) => [trait.type, trait.value])))
      : null;
  return (
    <section aria-labelledby="heist-house" className="v2-card v2-card--flush v2-card--feature heist-vault">
      <div className="heist-vault-door">
        <HouseArt image={house.image} tokenId={house.tokenId} className="v2-avatar--xl" />
      </div>

      <div className="heist-vault-body">
        <div>
          <Kicker>The House Chog</Kicker>
          <h2 id="heist-house" className="heist-vault-name">
            {persona ?? house.name ?? "The House Chog"}
            {persona && house.name && (
              <span className="text-[length:var(--v2-fs-sm)] font-normal text-[var(--v2-faint)]">{house.name}</span>
            )}
          </h2>
          <p className="mt-3 text-[length:var(--v2-fs-sm)] leading-relaxed text-pretty text-[var(--v2-nav)]">
            <span className="font-medium text-[var(--v2-ink)]">{defender.archetype}.</span> {defender.temperament}
          </p>
        </div>

        {open ? (
          <>
            <div className="heist-vault-sum">
              <span className="text-[length:var(--v2-fs-sm)] text-[var(--v2-nav)]">In the vault</span>
              <span className="heist-vault-sum-value v2-num">
                {chogText(house.chogBalance)} <span className="text-[length:var(--v2-fs-sm)] text-[var(--v2-nav)]">$CHOG</span>
              </span>
            </div>
            {house.tba && (
              <dl className="v2-kv">
                <div>
                  <dt>Wallet (ERC-6551)</dt>
                  <dd>
                    <AddressLink address={house.tba} />
                  </dd>
                </div>
              </dl>
            )}
          </>
        ) : (
          <p role="status" className="text-[length:var(--v2-fs-sm)] text-pretty text-[var(--v2-muted)]">
            Its wallet opens soon. You can already try to talk it out of its $CHOG.
          </p>
        )}

        {clues.length > 0 && (
          <div className="grid gap-2.5">
            <p className="v2-overline" id="heist-clues">
              Its traits are clues to its soft spot
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
    </section>
  );
}
