"use client";

import { type UseQueryResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type Address, formatUnits } from "viem";
import { useConfig, useSignMessage } from "wagmi";
import { simulateContract, writeContract } from "wagmi/actions";
import { ActivateAgent } from "@/components/activate-agent";
import type { AgentDetailResponse, AgentMode } from "@/lib/agent/types";
import {
  type GuardLimits,
  configureGuardRequest,
  disableGuardRequest,
  grantGuardRequest,
  revokeGuardRequest,
} from "@/lib/contracts/animr-trade-guard";
import { type TokenBoundAccountParams, createAndInitializeAccountRequest } from "@/lib/erc6551";
import { formatAmount } from "@/lib/format";
import { requestAgentMode } from "./agent-mode";
import { FundVault, missingToken } from "./fund-vault";
import { LimitsForm } from "./limits-form";
import { type OnchainSetup, agentKey } from "./queries";
import { type SetupAction, canStop, describeLimits, initialLimits } from "./setup-steps";
import { describeTxError } from "./tx-errors";
import { TxStatus, chainId, type useTxFlow } from "./tx-flow";
import { AddressLink, Callout, Spinner } from "./ui";

// The step panels of components/onchain/guard-onboarding.tsx. Every transaction goes through the shared tx flow:
// simulate from the holder, send, wait for the receipt, then re-read the chain (Ctx.verify) before claiming success.

type TxFlow = ReturnType<typeof useTxFlow>;

/** What every step panel needs. */
export type Ctx = {
  tokenId: number;
  tba: Address;
  guard: Address;
  setup: OnchainSetup;
  viewer: Address | undefined;
  /** Connected as the holder, on the right chain. */
  canAct: boolean;
  /** Why the viewer can't act, for the panels' hint (undefined when canAct). */
  actHint: string | undefined;
  tx: TxFlow;
  /** Re-reads the setup after a transaction, polling until `action` shows on-chain. */
  verify: (action: SetupAction, expected?: { limits?: GuardLimits }) => () => Promise<string | undefined>;
};

function ActHint({ ctx }: { ctx: Ctx }) {
  return ctx.actHint ? <p className="mt-3 text-sm text-[var(--v2-faint)]">{ctx.actHint}</p> : null;
}

export function CreateAccountPanel({ ctx, params }: { ctx: Ctx; params: TokenBoundAccountParams | undefined }) {
  const config = useConfig();
  const { setup, viewer, tx } = ctx;
  const finishing = setup.account === "uninitialized";
  const request = params && setup.account !== "ready" ? createAndInitializeAccountRequest(params, setup.account) : null;
  const label = finishing ? "Finish wallet setup" : "Create the wallet";

  function start() {
    if (!request || !viewer) return;
    void tx.run({
      origin: "step",
      steps: [
        {
          label,
          send: async () => {
            const { request: prepared } = await simulateContract(config, { ...request, account: viewer, chainId });
            return writeContract(config, prepared);
          },
        },
      ],
      verify: ctx.verify("create-account"),
      success: "The Chog's wallet is set up on-chain. Next: let the guard trade.",
    });
  }

  return (
    <>
      <p className="text-sm leading-relaxed text-[var(--v2-nav)]">
        {finishing
          ? "This wallet was created but never initialized, so it can't hold permissions yet. One transaction finishes the setup."
          : "Deploys the Chog's account through the ERC-6551 registry and initializes it, in one transaction. Tokens sent to the address earlier are already safe there."}{" "}
        It doesn&apos;t change who controls the wallet: whoever holds the Chog does.
      </p>
      {!params && (
        <p className="mt-2 text-sm text-[var(--v2-warning)]">
          Missing config: NEXT_PUBLIC_CHOG_NFT_ADDRESS and NEXT_PUBLIC_TBA_IMPLEMENTATION.
        </p>
      )}
      {ctx.canAct ? (
        <button type="button" onClick={start} disabled={!request || tx.busy} className="v2-btn-primary v2-btn--sm mt-4">
          {tx.busy && tx.progress.origin === "step" && <Spinner />}
          {label}
        </button>
      ) : (
        <ActHint ctx={ctx} />
      )}
    </>
  );
}

export function GrantGuardPanel({ ctx }: { ctx: Ctx }) {
  const config = useConfig();
  const { tba, guard, viewer, tx } = ctx;

  function grant() {
    if (!viewer) return;
    void tx.run({
      origin: "step",
      steps: [
        {
          label: "Authorize the guard",
          send: async () => {
            const { request } = await simulateContract(config, {
              ...grantGuardRequest(tba, guard),
              account: viewer,
              chainId,
            });
            return writeContract(config, request);
          },
        },
      ],
      // A receipt alone proves nothing here (a smart-wallet bundle can succeed while the inner call fails).
      verify: ctx.verify("grant-guard"),
      success: "The guard is authorized on this wallet (confirmed on-chain). Next: set your limits.",
    });
  }

  return (
    <>
      <p className="text-sm leading-relaxed text-[var(--v2-nav)]">
        The Chog&apos;s wallet is a Tokenbound account. This sends{" "}
        <code className="v2-mono text-[var(--v2-kicker)]">setPermissions([guard], [true])</code> to it, so AnimrTradeGuard
        (never the AI&apos;s key) may execute for it. The guard only ever makes the wallet approve the pool&apos;s
        router, swap, and reset the approval, with the output landing back here.
      </p>
      <p className="v2-note mt-2">
        Guard <AddressLink address={guard} />. Send it from the wallet that holds the Chog, directly: a permission set
        through a relayer or a batch contract doesn&apos;t count. It lapses automatically if the Chog is sold.
      </p>
      {ctx.canAct ? (
        <button type="button" onClick={grant} disabled={tx.busy} className="v2-btn-primary v2-btn--sm mt-4">
          {tx.busy && tx.progress.origin === "step" && <Spinner />}
          Authorize the guard
        </button>
      ) : (
        <ActHint ctx={ctx} />
      )}
    </>
  );
}

/** guard.configure(tba, limits) from the holder; resolves true once the new limits read back on-chain. */
function useConfigure(ctx: Ctx, origin: string) {
  const config = useConfig();
  return (limits: GuardLimits, success: string): Promise<boolean> => {
    const { tba, guard, viewer } = ctx;
    if (!viewer) return Promise.resolve(false);
    return ctx.tx.run({
      origin,
      steps: [
        {
          label: "Save limits",
          send: async () => {
            const { request } = await simulateContract(config, {
              ...configureGuardRequest(tba, limits, guard),
              account: viewer,
              chainId,
            });
            return writeContract(config, request);
          },
        },
      ],
      verify: ctx.verify("configure", { limits }),
      success,
    });
  };
}

export function ConfigurePanel({ ctx }: { ctx: Ctx }) {
  const configure = useConfigure(ctx, "step");
  const previous = ctx.setup.limits;
  const reenable = Boolean(previous && previous.maxTradeBps > 0 && !previous.enabled);
  const initial = initialLimits(previous);
  return (
    <>
      <p className="text-sm leading-relaxed text-[var(--v2-nav)]">
        {reenable
          ? "Trading is disabled for this vault. Save limits to turn it back on (these are your previous ones)."
          : "The guard checks these on every trade, on-chain. Change them any time; each change is one transaction."}
      </p>
      <div className="mt-3">
        <LimitsForm
          key={JSON.stringify(initial)}
          initial={initial}
          disabled={!ctx.canAct || ctx.tx.busy}
          submitLabel={reenable ? "Re-enable with these limits" : "Save limits on-chain"}
          onSubmit={(limits) => void configure(limits, "Limits saved on-chain. Next: fund the vault.")}
        />
      </div>
      <ActHint ctx={ctx} />
    </>
  );
}

function useModeSwitch(ctx: Ctx) {
  const queryClient = useQueryClient();
  const { mutateAsync: signMessage } = useSignMessage();
  const [phase, setPhase] = useState<"sign" | "submit">("sign");
  const mutation = useMutation({
    mutationFn: async (mode: AgentMode) => {
      const owner = ctx.viewer;
      if (!owner) throw new Error("Log in with the holder's wallet first.");
      setPhase("sign");
      return requestAgentMode({
        tokenId: ctx.tokenId,
        account: ctx.tba,
        owner,
        mode,
        signMessage: async (message) => {
          const signature = await signMessage({ account: owner, message });
          setPhase("submit");
          return signature;
        },
      });
    },
    onSuccess: (data) => queryClient.setQueryData(agentKey(ctx.tokenId), data),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: agentKey(ctx.tokenId) });
      void queryClient.invalidateQueries({ queryKey: ["/api/leaderboard"] });
    },
  });
  return { ...mutation, phase };
}

export function GoOnchainPanel({ ctx, agentQuery }: { ctx: Ctx; agentQuery: UseQueryResult<AgentDetailResponse> }) {
  const queryClient = useQueryClient();
  const modeSwitch = useModeSwitch(ctx);
  const agent = agentQuery.data?.agent ?? null;

  if (agentQuery.isPending) return <p className="text-sm text-[var(--v2-nav)]">Checking the agent…</p>;
  if (!agentQuery.data) {
    return (
      <p className="text-sm text-[var(--v2-danger)]">
        Couldn&apos;t load the agent: {describeTxError(agentQuery.error)}{" "}
        <button type="button" onClick={() => agentQuery.refetch()} className="v2-btn-glass v2-btn--sm ml-1 h-8">
          Retry
        </button>
      </p>
    );
  }
  if (!agent || !agent.active) {
    return (
      <>
        <p className="text-sm leading-relaxed text-[var(--v2-nav)]">
          The vault is ready. {agent ? "The agent is paused: wake it first" : "Wake the Chog's AI first"} (one free
          signature), then switch it to on-chain.
        </p>
        <OneWayNote ctx={ctx} />
        {ctx.canAct && ctx.viewer ? (
          <div className="mt-3">
            <ActivateAgent
              embedded
              tokenId={String(ctx.tokenId)}
              account={ctx.tba}
              owner={ctx.viewer}
              reactivate={Boolean(agent)}
              onActivated={(data) => queryClient.setQueryData(agentKey(ctx.tokenId), data)}
            />
          </div>
        ) : (
          <ActHint ctx={ctx} />
        )}
      </>
    );
  }
  return (
    <>
      <p className="text-sm leading-relaxed text-[var(--v2-nav)]">
        Everything on-chain is in place. Sign one free message (no gas) to switch{" "}
        <span className="text-[var(--v2-ink)]">{agent.persona.name}</span> from paper to on-chain: from its next decision,
        its trades execute as real $CHOG swaps in this wallet, through the guard and within your limits. Its PnL
        restarts from the vault&apos;s value at the switch.
      </p>
      {ctx.canAct ? (
        <button
          type="button"
          onClick={() => modeSwitch.mutate("onchain")}
          disabled={modeSwitch.isPending}
          className="v2-btn-primary v2-btn--sm mt-4"
        >
          {modeSwitch.isPending && <Spinner />}
          {modeSwitch.isPending
            ? modeSwitch.phase === "sign"
              ? "Confirm in your wallet…"
              : "Switching…"
            : "Sign & go on-chain"}
        </button>
      ) : (
        <ActHint ctx={ctx} />
      )}
      {modeSwitch.isError && (
        <Callout tone="danger" title="Couldn't switch modes">
          {describeTxError(modeSwitch.error)}
        </Callout>
      )}
    </>
  );
}

/** The vault holds only one of the two tokens (and isn't buy-only): the AI would trade one way until the other is added. */
function OneWayNote({ ctx }: { ctx: Ctx }) {
  const { balances, buyOnly } = ctx.setup;
  const missing = missingToken(balances, buyOnly);
  if (!missing || (missing === "wmon" && buyOnly)) return null;
  return (
    <p className="mt-2 text-sm leading-relaxed text-[var(--v2-warning)]">
      {missing === "wmon"
        ? "It holds $CHOG but no WMON, so the AI can sell but not buy. Add WMON under “Fund the vault” above to let it trade both ways."
        : "It holds WMON but no $CHOG, so the AI can buy but has nothing to sell. Add $CHOG under “Fund the vault” above."}
    </p>
  );
}

export function LivePanel({ ctx, agentQuery }: { ctx: Ctx; agentQuery: UseQueryResult<AgentDetailResponse> }) {
  const [editing, setEditing] = useState(false);
  const [topUp, setTopUp] = useState(false);
  const configure = useConfigure(ctx, "edit");
  const modeSwitch = useModeSwitch(ctx);
  const { setup, tx } = ctx;
  const agent = agentQuery.data?.agent ?? null;
  const limits = setup.limits;
  const fmt = (value: bigint, digits: number) => formatAmount(formatUnits(value, 18), digits);

  return (
    <>
      <div className="rounded-[var(--v2-r-md)] border border-[rgb(98_224_166/0.3)] bg-[rgb(98_224_166/0.05)] p-4">
        <p className="text-sm font-[520] text-[var(--v2-success)]">
          {agent?.persona.name ?? "The AI"} trades the real $CHOG in this wallet
        </p>
        {limits && <p className="mt-2 text-sm text-[var(--v2-nav)]">{describeLimits(limits)}</p>}
        <p className="mt-1 text-sm text-[var(--v2-nav)]">
          Vault: <span className="v2-num text-[var(--v2-ink)]">{fmt(setup.balances.chog, 2)}</span> $CHOG ·{" "}
          <span className="v2-num text-[var(--v2-ink)]">{fmt(setup.balances.wmon, 4)}</span> WMON
        </p>
      </div>
      {ctx.canAct ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            aria-expanded={editing}
            className="v2-btn-glass v2-btn--sm"
          >
            Edit limits
          </button>
          <button
            type="button"
            onClick={() => setTopUp((value) => !value)}
            aria-expanded={topUp}
            className="v2-btn-glass v2-btn--sm"
          >
            Deposit or withdraw
          </button>
          <button
            type="button"
            onClick={() => modeSwitch.mutate("paper")}
            disabled={modeSwitch.isPending}
            className="v2-btn-ghost v2-btn--sm"
          >
            {modeSwitch.isPending
              ? modeSwitch.phase === "sign"
                ? "Confirm in your wallet…"
                : "Switching…"
              : "Back to paper trading"}
          </button>
        </div>
      ) : (
        <ActHint ctx={ctx} />
      )}
      {modeSwitch.isError && (
        <p role="alert" className="mt-3 text-sm text-[var(--v2-danger)]">
          {describeTxError(modeSwitch.error)}
        </p>
      )}
      {editing && ctx.canAct && limits && (
        <div className="mt-4 rounded-[var(--v2-r-md)] border border-[var(--v2-line-soft)] bg-[rgb(255_255_255/0.025)] p-4">
          <LimitsForm
            initial={limits}
            disabled={tx.busy}
            submitLabel="Update limits on-chain"
            onSubmit={async (next) => {
              if (await configure(next, "Limits updated on-chain.")) setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
      <TxStatus progress={tx.progress} origin="edit" />
      {topUp && ctx.canAct && (
        <div className="mt-4">
          <FundVault tba={ctx.tba} viewer={ctx.viewer} canAct={ctx.canAct} balances={setup.balances} tx={tx} />
        </div>
      )}
    </>
  );
}

/** Disable (guard.disable) keeps the grant; Revoke (TBA.setPermissions false) removes it. Either stops the AI. */
export function StopControls({ ctx }: { ctx: Ctx }) {
  const config = useConfig();
  const { tba, guard, viewer, tx, setup } = ctx;
  const { disable, revoke } = canStop(setup);

  function run(action: "disable" | "revoke") {
    if (!viewer) return;
    void tx.run({
      origin: "stop",
      steps: [
        {
          label: action === "disable" ? "Disable trading" : "Revoke the guard",
          send: async () => {
            if (action === "disable") {
              const { request } = await simulateContract(config, {
                ...disableGuardRequest(tba, guard),
                account: viewer,
                chainId,
              });
              return writeContract(config, request);
            }
            const { request } = await simulateContract(config, {
              ...revokeGuardRequest(tba, guard),
              account: viewer,
              chainId,
            });
            return writeContract(config, request);
          },
        },
      ],
      verify: ctx.verify(action),
      success:
        action === "disable"
          ? "Trading is disabled: the guard refuses every AI trade until you save limits again."
          : "The guard's permission is revoked: the AI can't trade this wallet at all.",
    });
  }

  return (
    <div className="rounded-[var(--v2-r-lg)] border border-[var(--v2-line)] p-4 sm:p-5">
      <h3 className="text-[15px] font-[520] text-[var(--v2-ink)]">Stop the AI</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-[var(--v2-nav)]">
        <span className="text-[var(--v2-ink)]">Disable</span> turns trading off and keeps the guard&apos;s permission (save
        limits again to resume). <span className="text-[var(--v2-ink)]">Revoke</span> removes the guard&apos;s permission
        from the wallet entirely. Either takes effect from the next block; your tokens stay where they are.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {disable && (
          <button type="button" onClick={() => run("disable")} disabled={tx.busy} className="v2-btn-glass v2-btn--sm">
            Disable trading
          </button>
        )}
        {revoke && (
          <button
            type="button"
            onClick={() => run("revoke")}
            disabled={tx.busy}
            className="v2-btn-glass v2-btn--sm text-[var(--v2-danger)] hover:border-[rgb(255_122_138/0.5)]"
          >
            Revoke the guard
          </button>
        )}
      </div>
      <TxStatus progress={tx.progress} origin="stop" />
    </div>
  );
}

/** The AI's key can execute for the wallet directly: it would bypass the guard, so the server refuses to trade. */
export function OperatorWarning({ ctx }: { ctx: Ctx }) {
  const config = useConfig();
  const { tba, viewer, tx, setup } = ctx;

  function revokeOperator() {
    if (!viewer) return;
    void tx.run({
      origin: "operator",
      steps: [
        {
          label: "Revoke the operator's access",
          send: async () => {
            const { request } = await simulateContract(config, {
              ...revokeGuardRequest(tba, setup.operator),
              account: viewer,
              chainId,
            });
            return writeContract(config, request);
          },
        },
      ],
      verify: ctx.verify("revoke-operator"),
      success: "The operator's direct access is revoked. It can only act through the guard now.",
    });
  }

  return (
    <Callout tone="danger" title="The AI's key has direct access to this wallet">
      The operator <AddressLink address={setup.operator} /> can execute for this wallet directly (a Tokenbound
      permission, or it holds the Chog). That would bypass every limit of the guard, so Animr refuses to trade this
      vault until it&apos;s removed.
      {ctx.canAct && (
        <span className="mt-3 block">
          <button type="button" onClick={revokeOperator} disabled={tx.busy} className="v2-btn-glass v2-btn--sm">
            Revoke the operator&apos;s access
          </button>
        </span>
      )}
      <TxStatus progress={tx.progress} origin="operator" />
    </Callout>
  );
}
