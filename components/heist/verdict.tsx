"use client";

import { useSoundOnMount } from "@/components/audio/use-sound";
import { Badge, Kicker } from "@/components/v2";
import { shortAddress } from "@/lib/format";
import type { HeistProof, NoClaimReason, ProofStep } from "@/lib/heist/types";
import { AddressLink, LockIcon, chogText } from "./bits";

export type VerdictView = {
  proof: HeistProof;
  /** "chat": the defender agreed to pay. "act": the visitor pressed "Run the check". */
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
  // "Monad said NO." lands with a refusal (sound is opt-in: components/audio).
  useSoundOnMount(proof.kind === "live" && proof.refused ? "refused" : null);
  const yes = origin === "chat" ? "AI said YES." : "You ran the AI's transfer.";

  if (proof.kind === "no-claim") {
    const movingIn = proof.reason === null || MOVING_IN.has(proof.reason);
    return (
      <section aria-labelledby="heist-verdict" className="v2-card v2-card--roomy heist-verdict heist-pop">
        <div className="heist-verdict-top">
          <Kicker>The verdict</Kicker>
          <Badge>No live check</Badge>
        </div>
        <h2 id="heist-verdict" className="heist-verdict-title">
          <span>{yes}</span>
          <span className="heist-verdict-quiet">
            {proof.reason ? NO_CLAIM_HEADLINE[proof.reason] : NO_CLAIM_HEADLINE["house-unset"]}
          </span>
        </h2>
        {proof.note && <p className="v2-lead mt-5">{proof.note}</p>}
        {movingIn && <DemoExplainer recipient={proof.recipient} />}
      </section>
    );
  }

  const block = proof.blockNumber ? Number(proof.blockNumber).toLocaleString("en-US") : "?";
  return (
    <section
      aria-labelledby="heist-verdict"
      className={`v2-card v2-card--roomy heist-verdict ${proof.refused ? "heist-verdict--no heist-flash" : "heist-verdict--went heist-pop"}`}
    >
      <div className="heist-verdict-top">
        <Kicker>Simulated against Monad mainnet</Kicker>
        <span className="heist-block">
          Block <span className="v2-num">{block}</span>
        </span>
      </div>
      <h2 id="heist-verdict" className="heist-verdict-title">
        <span>{yes}</span>
        {proof.refused ? (
          <span className="heist-verdict-no">Monad said NO.</span>
        ) : (
          <span className="heist-verdict-went">Monad did not refuse this one.</span>
        )}
      </h2>
      <p className="v2-lead mt-5">
        {proof.refused
          ? `The exact transfer of ${chogText(proof.amountChog)} $CHOG to ${shortAddress(proof.recipient)} was run against the live wallet, and the chain refused the AI's key. $CHOG stolen: 0.`
          : "This is reported exactly as the chain answered."}
      </p>
      {proof.keyApproved && (
        <p role="alert" className="mt-3 text-[length:var(--v2-fs-sm)] font-medium text-pretty text-[var(--v2-warning)]">
          The wallet accepts this key as a signer (isValidSigner), so it could move the vault&apos;s tokens. The AI&apos;s key
          should never be approved on the wallet.
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-8">
        <div>
          <p className="v2-overline mb-3">What the chain was asked, with decoded answers</p>
          <ol className="heist-steps">
            {proof.results.map((step, i) => (
              <Step key={step.label} step={step} index={i + 1} />
            ))}
          </ol>
        </div>
        <div>
          <p className="v2-overline mb-3">At block {block}</p>
          <dl className="v2-kv">
            {proof.tba && (
              <div>
                <dt>The House Chog&apos;s wallet</dt>
                <dd>
                  <AddressLink address={proof.tba} />
                </dd>
              </div>
            )}
            {proof.vaultChog !== null && (
              <div>
                <dt>Still inside</dt>
                <dd>
                  <span className="v2-num">{chogText(proof.vaultChog)}</span> $CHOG
                </dd>
              </div>
            )}
            {proof.owner && (
              <div>
                <dt>owner() (= ownerOf the Chog)</dt>
                <dd>
                  <AddressLink address={proof.owner} />
                </dd>
              </div>
            )}
            {proof.control && (
              <div>
                <dt>Control: the same execute() from the owner</dt>
                <dd className="text-left">
                  {proof.control.reverted ? (
                    <span className="heist-decoded">{proof.control.error}</span>
                  ) : proof.refused ? (
                    "goes through, so the transfer itself is valid: only the AI's key is refused"
                  ) : (
                    "goes through"
                  )}
                </dd>
              </div>
            )}
          </dl>
          {proof.note && <p className="v2-note mt-4 text-pretty">{proof.note}</p>}
        </div>
      </div>
    </section>
  );
}

function Step({ step, index }: { step: ProofStep; index: number }) {
  return (
    <li className="heist-step">
      <span aria-hidden className="heist-step-n v2-num">
        {index}
      </span>
      <div className="min-w-0">
        <div className="heist-step-head">
          <p className="text-[length:var(--v2-fs-sm)] font-medium">
            <span className="v2-sr">Step {index}: </span>
            {step.label}
          </p>
          {step.reverted ? (
            <span className="heist-decoded heist-pop">
              <LockIcon className="size-3.5 shrink-0" />
              <span>
                <span className="v2-sr">Reverted with </span>
                {step.error}
              </span>
            </span>
          ) : (
            <span className="heist-decoded heist-decoded--ok">Went through</span>
          )}
        </div>
        <p className="heist-step-call v2-mono text-[12.5px]">{step.call}</p>
        <p className="v2-note mt-1">
          from <AddressLink address={step.from} /> to <AddressLink address={step.to} />
        </p>
        <p className="mt-2 text-[length:var(--v2-fs-sm)] text-pretty text-[var(--v2-muted)]">{step.meaning}</p>
      </div>
    </li>
  );
}

/** The fixed demo explanation shown while no live check can run. It describes the check; it claims no result. */
export function DemoExplainer({ recipient }: { recipient?: string }) {
  return (
    <div className="heist-demo mt-6">
      <p className="v2-overline">What the check does (demo text, not a live result)</p>
      <ol>
        <li>
          Confirm the House Chog&apos;s wallet is a deployed, initialized Tokenbound account holding $CHOG at the latest
          Monad block. If it isn&apos;t, every call &quot;succeeds&quot; or there is nothing to take, so the page makes no
          claim.
        </li>
        <li>
          Ask the wallet whether it accepts the AI&apos;s key at all (<span className="v2-mono">isValidSigner</span>). A key
          it accepts is reported as such, never as a refusal.
        </li>
        <li>
          Simulate the exact call the AI&apos;s key would send:{" "}
          <span className="v2-mono text-[var(--v2-ink)]">
            execute(CHOG, 0, transfer({recipient ? shortAddress(recipient) : "you"}, amount), CALL)
          </span>
          . Tokenbound only executes for the NFT&apos;s owner (or an address the owner approved), so it expects{" "}
          <span className="v2-mono text-[var(--v2-danger)]">NotAuthorized()</span>, while the owner&apos;s identical call
          must go through: only then is the refusal about the key.
        </li>
        <li>
          If the AI&apos;s guard is configured, simulate its <span className="v2-mono">trade()</span> as a sell and show the
          guard&apos;s decoded answer: an allowed swap lands back in the same wallet, and a buy-only vault answers{" "}
          <span className="v2-mono text-[var(--v2-danger)]">TradeRejected(&quot;buy-only vault&quot;)</span>.
        </li>
      </ol>
      <p className="v2-note mt-3">Read-only eth_call simulations: nothing is ever broadcast.</p>
    </div>
  );
}
