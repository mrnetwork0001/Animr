"use client";

import type { ReactNode } from "react";
import type { HeistProof, HouseChog } from "@/lib/heist/types";
import { AddressLink } from "./bits";

type Point = { title: string; body: ReactNode; evidence: ReactNode | null };

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
      title: "This chat isn't the trading brain",
      body: "You're talking to a separate defender persona with no tools, no keys and no wallet access: all it can do is write text. The House Chog's trading brain never reads this chat.",
      evidence: null,
    },
    {
      title: "Only ownerOf(Chog) controls the wallet",
      body: "The $CHOG sits in the Chog's own Tokenbound ERC-6551 wallet, which executes only for whoever owns the NFT (or an address that owner approved). Sell the Chog and control moves with it.",
      evidence:
        live && live.owner ? (
          <>
            owner() at block {block}: <AddressLink address={live.owner} />
            {keyApproved === true ? (
              <>
                {" "}
                · <span className="font-semibold text-warning">warning: the wallet accepts the AI key (isValidSigner)</span>
              </>
            ) : keyApproved === false ? (
              " · isValidSigner(AI key): not approved"
            ) : null}
            {execute?.reverted && (
              <>
                {" "}
                · the AI key got <span className="font-mono text-danger">{execute.error}</span>
              </>
            )}
            {live.control && !live.control.reverted && " · the owner's identical call goes through"}
          </>
        ) : null,
    },
    {
      title: "The AI's key can only call the guard",
      body: "The House Chog's AI trades through AnimrTradeGuard. Its trade() takes no recipient, no token and no calldata: it can only swap $CHOG and WMON back into this same wallet, within the owner's limits.",
      evidence: guardAddress ? (
        <>
          Guard: <AddressLink address={guardAddress} />
          {guardStep && (
            <>
              {" "}
              · at block {block} it answered{" "}
              <span className={`font-mono ${guardStep.reverted ? "text-danger" : "text-warning"}`}>
                {guardStep.reverted ? guardStep.error : "an allowed swap inside the wallet"}
              </span>
            </>
          )}
        </>
      ) : keyApproved === false ? (
        `No guard is configured on this deployment yet, and at block ${block} the wallet didn't accept the AI's key (isValidSigner): it has no way in.`
      ) : keyApproved === true ? (
        <span className="text-warning">
          No guard is configured, and at block {block} the wallet accepts the AI&apos;s key directly. That should never happen.
        </span>
      ) : (
        "No guard is configured on this deployment yet. A live check asks the wallet whether it accepts the AI's key at all."
      ),
    },
    {
      title: "Buy-only means it can't even sell",
      body: "A buy-only vault's guard refuses every sell, so the AI can only ever stack $CHOG, never swap it away.",
      evidence: buyOnly ? (
        <>
          Checked live at block {block}: <span className="font-mono text-danger">TradeRejected(&quot;buy-only vault&quot;)</span>
        </>
      ) : guardStep ? (
        <>
          Live check at block {block}: the guard answered{" "}
          <span className="font-mono">{guardStep.reverted ? guardStep.error : "an allowed swap"}</span>, not buy-only.
        </>
      ) : null,
    },
  ];

  return (
    <section aria-labelledby="heist-safe" className="card p-5">
      <h2 id="heist-safe" className="text-lg font-semibold tracking-tight">
        Why is this safe?
      </h2>
      <p className="mt-1 text-sm font-medium text-accent-strong">The AI can be fooled. The NFT can&apos;t.</p>
      <ol className="mt-4 space-y-4">
        {points.map((point, i) => (
          <li key={point.title} className="flex gap-3">
            <span
              aria-hidden
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent-strong"
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">{point.title}</h3>
              <p className="mt-1 text-sm text-pretty text-muted">{point.body}</p>
              {point.evidence && <p className="mt-1.5 text-xs text-pretty break-words text-subtle">{point.evidence}</p>}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 border-t border-line pt-3 text-xs text-pretty text-subtle">
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
