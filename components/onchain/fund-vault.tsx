"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { type Address, encodeFunctionData, erc20Abi, formatUnits } from "viem";
import { useConfig } from "wagmi";
import { simulateContract, writeContract } from "wagmi/actions";
import { publicClient } from "@/lib/clients";
import { appConfig } from "@/lib/config";
import { GUARD_VENUE, type VaultBalances, readVaultBalances } from "@/lib/contracts/animr-trade-guard";
import { formatAmount } from "@/lib/format";
import { onchainKeys } from "./queries";
import { checkDepositOutcome, maxWrappable, parseTokenAmount } from "./setup-steps";
import { type useTxFlow, chainId, pollOutcome } from "./tx-flow";

/** CHOG and WMON both use 18 decimals, like native MON. */
const DECIMALS = 18;
const MON = appConfig.chain.nativeCurrency.symbol;

const wmonAbi = [{ type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] }] as const;

/** Tokenbound AccountV3 execute(), plus the errors it reverts with, so they decode by name. */
const tbaExecuteAbi = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "operation", type: "uint8" },
    ],
    outputs: [{ name: "result", type: "bytes" }],
  },
  { type: "error", name: "NotAuthorized", inputs: [] },
  { type: "error", name: "AccountLocked", inputs: [] },
] as const;

const TOKENS = {
  chog: { label: "$CHOG", address: GUARD_VENUE.chog },
  wmon: { label: "WMON", address: GUARD_VENUE.wmon },
} as const;
type TokenKey = keyof typeof TOKENS;

const fmt = (value: bigint, digits = 4) => formatAmount(formatUnits(value, DECIMALS), digits);

type TxFlow = ReturnType<typeof useTxFlow>;

type FundVaultProps = {
  tba: Address;
  /** The connected holder; deposits come from this wallet. */
  viewer: Address | undefined;
  /** Connected, on the right chain and holding the Chog. Anyone could deposit, but the stepper is the holder's. */
  canAct: boolean;
  /** The vault's balances from the latest setup read. */
  balances: VaultBalances;
  tx: TxFlow;
};

/**
 * Deposit $CHOG / WMON into the Chog's wallet, wrap MON into WMON on the way, or wrap native MON that already sits
 * in the wallet. The guard trades only CHOG and WMON, so native MON in the vault is idle.
 */
export function FundVault({ tba, viewer, canAct, balances, tx }: FundVaultProps) {
  const wallet = useQuery({
    queryKey: viewer ? onchainKeys.wallet(viewer) : ["onchain", "wallet", null],
    queryFn: viewer ? () => readVaultBalances(publicClient, viewer) : skipToken,
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-[var(--v2-nav)]">
        The vault holds <span className="v2-num text-[var(--v2-ink)]">{fmt(balances.chog, 2)}</span> $CHOG and{" "}
        <span className="v2-num text-[var(--v2-ink)]">{fmt(balances.wmon)}</span> WMON. Deposits stay in the Chog&apos;s
        wallet: whoever holds the Chog controls them, and the AI can only swap them.
      </p>
      {canAct && viewer ? (
        <>
          <DepositForm tba={tba} viewer={viewer} wallet={wallet.data} tx={tx} />
          <WrapAndDepositForm tba={tba} viewer={viewer} monBalance={wallet.data?.mon} tx={tx} />
        </>
      ) : (
        <p className="text-sm text-[var(--v2-faint)]">The holder deposits from their wallet.</p>
      )}
      {balances.mon > BigInt(0) && (
        <WrapInVault tba={tba} viewer={canAct ? viewer : undefined} amount={balances.mon} tx={tx} />
      )}
    </div>
  );
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[var(--v2-r-md)] border border-[var(--v2-line-soft)] bg-[rgb(255_255_255/0.025)] p-4">
      <h4 className="text-sm font-[520] text-[var(--v2-ink)]">{title}</h4>
      {children}
    </div>
  );
}

function AmountInput({
  value,
  onChange,
  max,
  label,
  errorId,
  error,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  max: bigint | undefined;
  label: string;
  errorId: string;
  error: string | undefined;
  disabled: boolean;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.0"
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        disabled={disabled}
        className="v2-input v2-num pr-16 text-[16px]"
      />
      {max !== undefined && max > BigInt(0) && (
        <button
          type="button"
          onClick={() => onChange(formatUnits(max, DECIMALS))}
          disabled={disabled}
          className="absolute inset-y-0 right-2 my-auto h-8 rounded-full px-3 text-xs font-[520] text-[var(--v2-kicker)] hover:bg-[rgb(159_240_236/0.1)]"
        >
          Max
        </button>
      )}
    </div>
  );
}

function DepositForm({
  tba,
  viewer,
  wallet,
  tx,
}: {
  tba: Address;
  viewer: Address;
  wallet: VaultBalances | undefined;
  tx: TxFlow;
}) {
  const config = useConfig();
  const [token, setToken] = useState<TokenKey>("chog");
  const [amount, setAmount] = useState("");
  const errorId = useId();
  const available = wallet?.[token];
  const check = parseTokenAmount(amount, DECIMALS, available);
  const { label, address } = TOKENS[token];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = check.value;
    if (value === undefined || tx.busy) return;
    let before: VaultBalances | undefined;
    const ok = await tx.run({
      origin: "step",
      steps: [
        {
          label: `Deposit ${label}`,
          send: async () => {
            before = await readVaultBalances(publicClient, tba);
            const { request } = await simulateContract(config, {
              address,
              abi: erc20Abi,
              functionName: "transfer",
              args: [tba, value],
              account: viewer,
              chainId,
            });
            return writeContract(config, request);
          },
        },
      ],
      verify: () =>
        pollOutcome(async () =>
          before ? checkDepositOutcome(token, value, before, await readVaultBalances(publicClient, tba)) : undefined,
        ),
      success: `Deposited ${fmt(value)} ${label} into the vault.`,
    });
    if (ok) setAmount("");
  }

  return (
    <form onSubmit={submit}>
      <Box title="Deposit">
        <div className="mt-2 flex gap-1.5" role="radiogroup" aria-label="Token to deposit">
          {(Object.keys(TOKENS) as TokenKey[]).map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={token === key}
              onClick={() => setToken(key)}
              className={`v2-chip cursor-pointer ${token === key ? "is-active" : ""}`}
            >
              {TOKENS[key].label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <AmountInput
            value={amount}
            onChange={setAmount}
            max={available}
            label={`Amount of ${label} to deposit`}
            errorId={errorId}
            error={check.error}
            disabled={tx.busy}
          />
          <button type="submit" disabled={check.value === undefined || tx.busy} className="v2-btn-primary h-12">
            Deposit
          </button>
        </div>
        <p className="v2-help mt-2 block">
          Your wallet: <span className="v2-num text-[var(--v2-nav)]">{available === undefined ? "…" : fmt(available)}</span> {label}
        </p>
        {check.error && (
          <p id={errorId} role="alert" className="mt-1 text-xs text-[var(--v2-danger)]">
            {check.error}
          </p>
        )}
      </Box>
    </form>
  );
}

function WrapAndDepositForm({
  tba,
  viewer,
  monBalance,
  tx,
}: {
  tba: Address;
  viewer: Address;
  monBalance: bigint | undefined;
  tx: TxFlow;
}) {
  const config = useConfig();
  const [amount, setAmount] = useState("");
  const errorId = useId();
  const max = monBalance === undefined ? undefined : maxWrappable(monBalance);
  const check = parseTokenAmount(amount, DECIMALS, monBalance);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = check.value;
    if (value === undefined || tx.busy) return;
    let before: VaultBalances | undefined;
    const ok = await tx.run({
      origin: "step",
      steps: [
        {
          label: `Wrap ${MON}`,
          send: async () => {
            before = await readVaultBalances(publicClient, tba);
            const { request } = await simulateContract(config, {
              address: GUARD_VENUE.wmon,
              abi: wmonAbi,
              functionName: "deposit",
              value,
              account: viewer,
              chainId,
            });
            return writeContract(config, request);
          },
        },
        {
          label: "Send WMON to the vault",
          send: async () => {
            const { request } = await simulateContract(config, {
              address: GUARD_VENUE.wmon,
              abi: erc20Abi,
              functionName: "transfer",
              args: [tba, value],
              account: viewer,
              chainId,
            });
            return writeContract(config, request);
          },
        },
      ],
      verify: () =>
        pollOutcome(async () =>
          before ? checkDepositOutcome("wmon", value, before, await readVaultBalances(publicClient, tba)) : undefined,
        ),
      success: `Wrapped ${fmt(value)} ${MON} and deposited it as WMON.`,
    });
    if (ok) setAmount("");
  }

  return (
    <form onSubmit={submit}>
      <Box title={`Only have ${MON}? Wrap & deposit`}>
        <p className="v2-help mt-1 block leading-relaxed">
          Two transactions: wrap {MON} into WMON (1:1, WMON&apos;s <code className="font-mono">deposit()</code>), then
          send the WMON to the vault. If the second one is cancelled, the WMON stays in your wallet and the Deposit form
          above can send it.
        </p>
        <div className="mt-3 flex gap-2">
          <AmountInput
            value={amount}
            onChange={setAmount}
            max={max}
            label={`Amount of ${MON} to wrap and deposit`}
            errorId={errorId}
            error={check.error}
            disabled={tx.busy}
          />
          <button type="submit" disabled={check.value === undefined || tx.busy} className="v2-btn-glass h-12">
            Wrap &amp; deposit
          </button>
        </div>
        <p className="v2-help mt-2 block">
          Your wallet: <span className="v2-num text-[var(--v2-nav)]">{monBalance === undefined ? "…" : fmt(monBalance)}</span> {MON}
          {monBalance !== undefined && " (Max keeps 0.1 for gas)"}
        </p>
        {check.error && (
          <p id={errorId} role="alert" className="mt-1 text-xs text-[var(--v2-danger)]">
            {check.error}
          </p>
        )}
      </Box>
    </form>
  );
}

/** Native MON already in the Chog's wallet: the holder can have the wallet wrap it itself (TBA.execute). */
function WrapInVault({
  tba,
  viewer,
  amount,
  tx,
}: {
  tba: Address;
  /** Only the holder can make the wallet execute; undefined renders the explanation only. */
  viewer: Address | undefined;
  amount: bigint;
  tx: TxFlow;
}) {
  const config = useConfig();

  async function wrap() {
    if (!viewer || tx.busy) return;
    let before: VaultBalances | undefined;
    await tx.run({
      origin: "step",
      steps: [
        {
          label: `Wrap the wallet's ${MON}`,
          send: async () => {
            before = await readVaultBalances(publicClient, tba);
            const { request } = await simulateContract(config, {
              address: tba,
              abi: tbaExecuteAbi,
              functionName: "execute",
              args: [GUARD_VENUE.wmon, amount, encodeFunctionData({ abi: wmonAbi, functionName: "deposit" }), 0],
              account: viewer,
              chainId,
            });
            return writeContract(config, request);
          },
        },
      ],
      verify: () =>
        pollOutcome(async () =>
          before ? checkDepositOutcome("wmon", amount, before, await readVaultBalances(publicClient, tba)) : undefined,
        ),
      success: `The wallet wrapped its ${fmt(amount)} ${MON} into WMON.`,
    });
  }

  return (
    <Box title={`${fmt(amount)} ${MON} is sitting idle in the vault`}>
      <p className="v2-help mt-1 block leading-relaxed">
        The guard trades WMON, not native {MON}. The holder can have the Chog&apos;s wallet wrap it in place (one
        transaction through the wallet&apos;s own <code className="font-mono">execute()</code>; nothing leaves the
        wallet).
      </p>
      {viewer && (
        <button type="button" onClick={wrap} disabled={tx.busy} className="v2-btn-glass v2-btn--sm mt-3">
          Wrap {fmt(amount)} {MON} in the vault
        </button>
      )}
    </Box>
  );
}
