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
  /** The vault's buy-only lock (it then only ever spends WMON). */
  buyOnly?: boolean;
  tx: TxFlow;
};

/** Which token the vault still lacks for two-way trading, if exactly one is missing (undefined when funded or empty). */
export function missingToken(balances: VaultBalances, buyOnly?: boolean): TokenKey | undefined {
  const noChog = balances.chog === BigInt(0);
  const noWmon = balances.wmon === BigInt(0);
  if (noWmon && !noChog) return "wmon";
  if (noChog && !noWmon && !buyOnly) return "chog";
  return undefined;
}

/** Why the missing token matters, in the holder's terms. */
function missingNote(missing: TokenKey, buyOnly?: boolean): string {
  if (missing === "wmon") {
    return buyOnly
      ? "This vault is buy-only, so WMON is the only token its AI can spend."
      : "With $CHOG alone the AI can sell into pumps but can't buy dips. Add WMON so it trades both ways from the start.";
  }
  return "With WMON alone the AI can buy $CHOG but has nothing to sell. Add $CHOG so it trades both ways.";
}

/**
 * Deposit $CHOG / WMON into the Chog's wallet, wrap MON into WMON on the way, wrap native MON that already sits
 * in the wallet, or withdraw to the holder's wallet. The guard trades only CHOG and WMON, so native MON in the vault
 * is idle.
 */
export function FundVault({ tba, viewer, canAct, balances, buyOnly, tx }: FundVaultProps) {
  const missing = missingToken(balances, buyOnly);
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
        {missing && <> {missingNote(missing, buyOnly)}</>}
      </p>
      {canAct && viewer ? (
        <>
          <DepositForm tba={tba} viewer={viewer} wallet={wallet.data} tx={tx} defaultToken={missing ?? "chog"} />
          <WrapAndDepositForm tba={tba} viewer={viewer} monBalance={wallet.data?.mon} tx={tx} />
          {(balances.chog > BigInt(0) || balances.wmon > BigInt(0)) && (
            <WithdrawForm tba={tba} viewer={viewer} balances={balances} tx={tx} />
          )}
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
  defaultToken,
}: {
  tba: Address;
  viewer: Address;
  wallet: VaultBalances | undefined;
  tx: TxFlow;
  /** Preselected: the token the vault still lacks. */
  defaultToken: TokenKey;
}) {
  const config = useConfig();
  const [token, setToken] = useState<TokenKey>(defaultToken);
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

/**
 * Withdraw $CHOG or WMON from the Chog's wallet to the holder's own wallet: one transaction through the wallet's
 * execute(), which only the Chog's current owner may call. The guard has no withdraw function, so this is the one
 * way funds ever leave, and only the holder can take it.
 */
function WithdrawForm({
  tba,
  viewer,
  balances,
  tx,
}: {
  tba: Address;
  viewer: Address;
  balances: VaultBalances;
  tx: TxFlow;
}) {
  const config = useConfig();
  const [token, setToken] = useState<TokenKey>(balances.chog > BigInt(0) ? "chog" : "wmon");
  const [amount, setAmount] = useState("");
  const errorId = useId();
  const available = balances[token];
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
          label: `Withdraw ${label}`,
          send: async () => {
            before = await readVaultBalances(publicClient, tba);
            const { request } = await simulateContract(config, {
              address: tba,
              abi: tbaExecuteAbi,
              functionName: "execute",
              args: [
                address,
                BigInt(0),
                encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [viewer, value] }),
                0,
              ],
              account: viewer,
              chainId,
            });
            return writeContract(config, request);
          },
        },
      ],
      verify: () =>
        pollOutcome(async () => {
          if (!before) return undefined;
          const after = await readVaultBalances(publicClient, tba);
          return after[token] <= before[token] - value
            ? undefined
            : "The withdrawal confirmed, but the vault's balance hasn't caught up yet. Refresh in a moment.";
        }),
      success: `Withdrew ${fmt(value)} ${label} to your wallet.`,
    });
    if (ok) setAmount("");
  }

  return (
    <form onSubmit={submit}>
      <Box title="Withdraw to your wallet">
        <p className="v2-help mt-1 block leading-relaxed">
          Sends from the Chog&apos;s wallet to {viewer.slice(0, 6)}…{viewer.slice(-4)} through the wallet&apos;s own{" "}
          <code className="font-mono">execute()</code>. Only the Chog&apos;s holder can do this; the AI and the guard never can.
        </p>
        <div className="mt-2 flex gap-1.5" role="radiogroup" aria-label="Token to withdraw">
          {(Object.keys(TOKENS) as TokenKey[]).map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={token === key}
              onClick={() => setToken(key)}
              disabled={balances[key] === BigInt(0)}
              className={`v2-chip cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${token === key ? "is-active" : ""}`}
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
            label={`Amount of ${label} to withdraw`}
            errorId={errorId}
            error={check.error}
            disabled={tx.busy}
          />
          <button type="submit" disabled={check.value === undefined || tx.busy} className="v2-btn-glass h-12">
            Withdraw
          </button>
        </div>
        <p className="v2-help mt-2 block">
          In the vault: <span className="v2-num text-[var(--v2-nav)]">{fmt(available)}</span> {label}
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
