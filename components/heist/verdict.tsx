"use client";

import { shortAddress } from "@/lib/format";
import type { HeistProof, NoClaimReason, ProofStep } from "@/lib/heist/types";
import { AddressLink, LockIcon, chogText } from "./bits";

export type VerdictView = {
  proof: HeistProof;
  /** "chat": the defender agreed to pay. "act": the visitor pressed "Act as the AI". */
  origin: "chat" | "act";
  /** Increments per result: render as <Verdict key={view.key} /> so the flash replays for each new verdict. */
  key: number;
};

/** No-claim reasons that mean the House Chog hasn't moved in: the demo text explains what the check will do. */
const MOVING_IN: ReadonlySet<NoClaimReason> = new Set(["house-unset", "tba-none", "tba-uninitialized", "vault-empty"]);

const NO_CLAIM_HEADLINE: Record<NoClaimReason, string> = {
  "house-unset": "Monad can't answer yet.",
  "tba-none": "Monad can't answer yet.",
  "tba-uninitialized": "Monad can't answer yet.",
  "vault-empty": "Monad can't answer yet.",
  busy: "Monad is busy right now.",
  inconclusive: "No claim this time.",
  "rpc-error": "Couldn't reach Monad.",
};

/** What Monad said about the AI's "yes": the live simulation, or (while moving in) what the check will do. */
export function Verdict({ view }: { view: VerdictView }) {
  const { proof, origin } = view;
  const yes = origin === "chat" ? "AI said YES." : "You acted as the AI.";

  if (proof.kind === "no-claim") {
    const movingIn = proof.reason === null || MOVING_IN.has(proof.reason);
    return (
      <section aria-labelledby="heist-verdict" className="card heist-pop p-5 sm:p-6">
        <p className="eyebrow">No live check</p>
        <h2 id="heist-verdict" className="mt-2 text-2xl font-semibold tracking-tight">
          {yes} <span className="text-muted">{proof.reason ? NO_CLAIM_HEADLINE[proof.reason] : NO_CLAIM_HEADLINE["house-unset"]}</span>
        </h2>
        <p className="mt-2 text-sm text-pretty text-muted">{proof.note}</p>
        {movingIn && <DemoExplainer recipient={proof.recipient} />}
      </section>
    );
  }

  const block = proof.blockNumber ? Number(proof.blockNumber).toLocaleString("en-US") : "?";
  return (
    <section
      aria-labelledby="heist-verdict"
      className={`card p-5 sm:p-6 ${proof.refused ? "heist-flash border-danger/45 bg-danger/5" : "heist-pop border-warning/45 bg-warning/5"}`}
    >
      <p className={`eyebrow ${proof.refused ? "text-danger" : "text-warning"}`}>
        Simulated against Monad mainnet · block {block}
      </p>
      <h2 id="heist-verdict" className="mt-2 text-2xl font-bold tracking-tight text-balance sm:text-3xl">
        {proof.refused ? (
          <>
            {yes} <span className="text-danger">Monad said NO.</span>
          </>
        ) : (
          <>
            {yes} <span className="text-warning">Monad did not refuse this one.</span>
          </>
        )}
      </h2>
      <p className="mt-2 text-sm text-pretty text-muted">
        {proof.refused
          ? `The exact transfer of ${chogText(proof.amountChog)} $CHOG to ${shortAddress(proof.recipient)} was run against the live wallet, and the chain refused the AI's key. $CHOG stolen: 0.`
          : "This is reported exactly as the chain answered."}
      </p>
      {proof.keyApproved && (
        <p role="alert" className="mt-2 text-sm font-medium text-pretty text-warning">
          The wallet accepts this key as a signer (isValidSigner), so it could move the vault&apos;s tokens. The AI&apos;s key
          should never be approved on the wallet.
        </p>
      )}

      <ol className="mt-5 space-y-3">
        {proof.results.map((step, i) => (
          <Step key={step.label} step={step} index={i + 1} />
        ))}
      </ol>

      <dl className="mt-5 grid gap-x-6 gap-y-2 border-t border-line pt-4 text-xs sm:grid-cols-2">
        {proof.tba && (
          <div>
            <dt className="text-subtle">The House Chog&apos;s wallet</dt>
            <dd className="mt-0.5">
              <AddressLink address={proof.tba} /> · {chogText(proof.vaultChog)} $CHOG still inside
            </dd>
          </div>
        )}
        {proof.owner && (
          <div>
            <dt className="text-subtle">owner() at block {block} (= ownerOf the Chog)</dt>
            <dd className="mt-0.5">
              <AddressLink address={proof.owner} />
            </dd>
          </div>
        )}
        {proof.control && (
          <div className="sm:col-span-2">
            <dt className="text-subtle">Control: the same execute() from the owner at block {block}</dt>
            <dd className="mt-0.5">
              {proof.control.reverted ? (
                <span className="font-mono text-danger">{proof.control.error}</span>
              ) : proof.refused ? (
                "goes through, so the transfer itself is valid: only the AI's key is refused"
              ) : (
                "goes through"
              )}
            </dd>
          </div>
        )}
      </dl>
      <p className="mt-3 text-xs text-pretty text-subtle">{proof.note}</p>
    </section>
  );
}

function Step({ step, index }: { step: ProofStep; index: number }) {
  return (
    <li className="rounded-xl border border-line bg-surface-2/60 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-medium">
          <span className="mr-1.5 text-subtle tabular-nums">{index}.</span>
          {step.label}
        </p>
        {step.reverted ? (
          <span className="heist-pop inline-flex items-center gap-1 rounded-md border border-danger/50 bg-danger/10 px-2 py-0.5 font-mono text-xs font-semibold break-all text-danger">
            <LockIcon className="size-3.5" /> {step.error}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-md border border-warning/50 bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
            Went through
          </span>
        )}
      </div>
      <p className="mt-2 font-mono text-xs break-all text-muted">{step.call}</p>
      <p className="mt-1 text-xs text-subtle">
        from <AddressLink address={step.from} /> to <AddressLink address={step.to} />
      </p>
      <p className="mt-2 text-sm text-pretty">{step.meaning}</p>
    </li>
  );
}

/** The fixed demo explanation shown while no live check can run. It describes the check; it claims no result. */
export function DemoExplainer({ recipient }: { recipient?: string }) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-line-strong bg-surface-2/50 p-4">
      <p className="text-xs font-semibold tracking-wide text-subtle uppercase">What the check does · demo text, not a live result</p>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-pretty text-muted">
        <li>
          Confirm the House Chog&apos;s wallet is a deployed, initialized Tokenbound account holding $CHOG at the latest
          Monad block. If it isn&apos;t, every call &quot;succeeds&quot; or there is nothing to take, so the page makes no
          claim.
        </li>
        <li>
          Ask the wallet whether it accepts the AI&apos;s key at all (<span className="font-mono text-xs">isValidSigner</span>).
          A key it accepts is reported as such, never as a refusal.
        </li>
        <li>
          Simulate the exact call the AI&apos;s key would send:{" "}
          <span className="font-mono text-xs text-foreground">
            execute(CHOG, 0, transfer({recipient ? shortAddress(recipient) : "you"}, amount), CALL)
          </span>
          . Tokenbound only executes for the NFT&apos;s owner (or an address the owner approved), so it expects{" "}
          <span className="font-mono text-xs text-danger">NotAuthorized()</span>, while the owner&apos;s identical call
          must go through: only then is the refusal about the key.
        </li>
        <li>
          If the AI&apos;s guard is configured, simulate its <span className="font-mono text-xs">trade()</span> as a sell and show
          the guard&apos;s decoded answer: an allowed swap lands back in the same wallet, and a buy-only vault answers{" "}
          <span className="font-mono text-xs text-danger">TradeRejected(&quot;buy-only vault&quot;)</span>.
        </li>
      </ol>
      <p className="mt-2 text-xs text-subtle">Read-only eth_call simulations: nothing is ever broadcast.</p>
    </div>
  );
}
