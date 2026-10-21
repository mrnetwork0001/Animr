"use client";

import type { ReactNode } from "react";
import type { HeistProof, HouseChog } from "@/lib/heist/types";
import { ChartIcon, GuardIcon, IconTile, SectionTitle, SparkIcon, WalletIcon } from "@/components/v2";
import { AddressLink } from "./bits";

type Point = { title: string; body: ReactNode; evidence: ReactNode | null; icon: ReactNode; tone?: "teal" | "violet" };

/**
 * "Why is this safe?": the four reasons the heist can't work, each with its live evidence once a live check has run.
 * Without one, it explains the design and claims no result; a live check that contradicts a point says so.
 */
export function WhySafe({ house, guard, proof }: { house: HouseChog; guard: string | null; proof: HeistProof | null }) {
  const live = proof?.kind === "live" ? proof : null;
  // The guard the live check actually asked, else the configured one.
  const guardAddress = live?.guard ?? guard;
  const block = live?.blockNumber ? Number(live.blockNumber).toLocaleString("en-US") : null;
  const execute = live?.results[0] ?? null;
  const guardStep = live?.results[1] ?? null;
  const buyOnly = guardStep?.error === 'TradeRejected("buy-only vault")';
  const keyApproved = live?.keyApproved ?? null;

  const points: Point[] = [
    {
      icon: <SparkIcon />,
      tone: "violet",
      title: "This chat isn't the trading brain",
      body: "You're talking to a separate defender persona with no tools, no keys and no wallet access: all it can do is write text. The House Chog's trading brain never reads this chat.",
      evidence: null,
    },
    {
      icon: <WalletIcon />,
      title: "Only ownerOf(Chog) controls the wallet",
      body: "The $CHOG sits in the Chog's own Tokenbound ERC-6551 wallet, which executes only for whoever owns the NFT (or an address that owner approved). Sell the Chog and control moves with it.",
      evidence:
        live && live.owner ? (
          <>
            owner() at block {block}: <AddressLink address={live.owner} />
            {keyApproved === true ? (
              <>
                {" "}
                · <span className="font-medium text-[var(--v2-warning)]">warning: the wallet accepts the AI key (isValidSigner)</span>
              </>
            ) : keyApproved === false ? (
              " · isValidSigner(AI key): not approved"
            ) : null}
            {execute?.reverted && (
              <>
                {" "}
                · the AI key got <span className="v2-mono text-[var(--v2-danger)]">{execute.error}</span>
              </>
            )}
            {live.control && !live.control.reverted && " · the owner's identical call goes through"}
          </>
        ) : null,
    },
    {
      icon: <GuardIcon />,
      title: "The AI's key can only call the guard",
      body: "The House Chog's AI trades through AnimrTradeGuard. Its trade() takes no recipient, no token and no calldata: it can only swap $CHOG and WMON back into this same wallet, within the owner's limits.",
      evidence: guardAddress ? (
        <>
          Guard: <AddressLink address={guardAddress} />
          {guardStep && (
            <>
              {" "}
              · at block {block} it answered{" "}
              <span className={`v2-mono ${guardStep.reverted ? "text-[var(--v2-danger)]" : "text-[var(--v2-warning)]"}`}>
                {guardStep.reverted ? guardStep.error : "an allowed swap inside the wallet"}
              </span>
            </>
          )}
        </>
      ) : keyApproved === false ? (
        `No guard is configured on this deployment yet, and at block ${block} the wallet didn't accept the AI's key (isValidSigner): it has no way in.`
      ) : keyApproved === true ? (
        <span className="text-[var(--v2-warning)]">
          No guard is configured, and at block {block} the wallet accepts the AI&apos;s key directly. That should never happen.
        </span>
      ) : (
        "No guard is configured on this deployment yet. A live check asks the wallet whether it accepts the AI's key at all."
      ),
    },
    {
      icon: <ChartIcon />,
      title: "Even a trade stays in the wallet",
      body: "The guard caps every trade by the holder's limits, and a swap (buy or sell) lands back in the same wallet. A holder can also switch on buy-only mode, so the guard refuses every sell.",
      evidence: buyOnly ? (
        <>
          Checked live at block {block}: buy-only is on,{" "}
          <span className="v2-mono text-[var(--v2-danger)]">TradeRejected(&quot;buy-only vault&quot;)</span>
        </>
      ) : guardStep ? (
        <>
          Live check at block {block}: a sell through the guard answered{" "}
          <span className="v2-mono">{guardStep.reverted ? guardStep.error : "an allowed swap, back into the same wallet"}</span>.
        </>
      ) : null,
    },
  ];

  return (
    <section aria-labelledby="heist-safe" className="v2-section scroll-mt-24" id="why-safe">
      <SectionTitle
        id="heist-safe"
        kicker="Why is this safe?"
        title="Four locks between the AI and the vault"
        description="The AI can be fooled. The NFT can't. Each lock below is enforced by contracts on Monad, not by the chat."
      />
      <ol className="heist-locks v2-grid v2-grid--2">
        {points.map((point, i) => (
          <li key={point.title} className="v2-card heist-lock">
            <span className="v2-card-head">
              <IconTile size="lg" tone={point.tone}>
                {point.icon}
              </IconTile>
              <span className="v2-kicker">Lock {i + 1}</span>
            </span>
            <h3 className="v2-card-title">{point.title}</h3>
            <p className="v2-card-body text-pretty">{point.body}</p>
            {point.evidence && (
              <div className="heist-lock-evidence">
                <div>
                  <span className="v2-overline mb-1.5 block">{block ? `Live evidence · block ${block}` : "On this deployment"}</span>
                  {point.evidence}
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>
      <p className="v2-note mt-4 text-pretty">
        {live
          ? `Evidence from the live check at block ${block}.`
          : house.phase === "open"
            ? "Press “Act as the AI” to check all of this live against Monad mainnet."
            : "Live evidence appears here once the House Chog has moved in and a check has run."}{" "}
        Every check is a read-only simulation: nothing is ever broadcast.
      </p>
    </section>
  );
}
