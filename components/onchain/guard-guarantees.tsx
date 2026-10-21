import { GUARD_LIMIT_CEILINGS, animrTradeGuardAddress } from "@/lib/contracts/animr-trade-guard";
import { explorerAddressUrl, shortAddress } from "@/lib/format";
import "@/app/design-v2.css";

// No hooks: renders from Server and Client Components alike (reusable on the landing page).

const CAN = ["Swap CHOG ⇄ WMON inside this Chog's own wallet, on one pool, within the holder's limits."] as const;

const CANNOT = [
  "Withdraw or transfer tokens out of the wallet",
  "Choose the recipient, token, router or calldata",
  "Move or sell the NFT",
  "Exceed the per-trade cap, daily budget or pace the holder set",
] as const;

const ENFORCED = [
  `Hard ceilings: at most ${GUARD_LIMIT_CEILINGS.maxTradeBps / 100}% of a balance per trade, ${GUARD_LIMIT_CEILINGS.maxDailyBps / 100}% of the vault per day, ${GUARD_LIMIT_CEILINGS.maxSlippageBps / 100}% slippage.`,
  "Every fill must clear a floor from the pool's 30-minute TWAP, so a sandwich can't drain a trade.",
  "The holder can disable the AI or revoke the guard in one transaction, at any time.",
  "Sell the Chog and the permission goes dormant: the buyer opts in under their own limits.",
] as const;

type GuardGuaranteesProps = {
  /** "card" wraps it in a v2 glass card; "plain" for use inside another card. */
  variant?: "card" | "plain";
  /** Defaults to "live" once NEXT_PUBLIC_TRADE_GUARD_ADDRESS is set, else "launching". */
  status?: "live" | "launching";
  /** Hide the "what the guard enforces" list for tight spots. */
  compact?: boolean;
  /** "h3" when nested under another section's heading. */
  headingLevel?: "h2" | "h3";
  className?: string;
};

/** "Trades, never withdraws": what the AI can and can never do through AnimrTradeGuard. */
export function GuardGuarantees({
  variant = "card",
  status,
  compact = false,
  headingLevel: Heading = "h2",
  className = "",
}: GuardGuaranteesProps) {
  const state = status ?? (animrTradeGuardAddress ? "live" : "launching");
  const Sub = Heading === "h2" ? "h3" : "h4";
  const guardHref = animrTradeGuardAddress ? explorerAddressUrl(animrTradeGuardAddress) : undefined;
  return (
    <section className={`${variant === "card" ? "v2-card v2-card--roomy" : ""} ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading className="flex items-center gap-2.5 text-[length:var(--v2-fs-h3)] font-[520] tracking-[-0.012em] text-[var(--v2-ink)]">
          <ShieldIcon className="size-5 text-[var(--v2-teal)]" />
          Trades, never withdraws
        </Heading>
        {state === "live" ? (
          <span className="v2-badge v2-badge--success v2-badge--dot">Guard deployed</span>
        ) : (
          <span className="v2-badge v2-badge--warning v2-badge--dot">Launching</span>
        )}
      </div>
      <p className="mt-2 max-w-[66ch] text-[15px] leading-relaxed text-[var(--v2-nav)]">
        The AI never holds the keys to a Chog&apos;s wallet. It gets one narrow door:{" "}
        <span className="text-[var(--v2-ink)]">AnimrTradeGuard</span>, a contract that can only make bounded swaps, and
        every swap&apos;s output lands back in the same wallet.
      </p>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <Sub className="v2-overline text-[var(--v2-success)]">The AI can</Sub>
          <ul className="mt-3 space-y-2.5">
            {CAN.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-[var(--v2-ink)]">
                <Mark ok />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <Sub className="v2-overline text-[var(--v2-danger)]">The AI can never</Sub>
          <ul className="mt-3 space-y-2.5">
            {CANNOT.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-[var(--v2-muted)]">
                <Mark ok={false} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {!compact && (
        <ul className="mt-5 space-y-2 border-t border-[var(--v2-line-soft)] pt-5">
          {ENFORCED.map((item) => (
            <li key={item} className="flex gap-2.5 text-[13px] leading-relaxed text-[var(--v2-nav)]">
              <span
                aria-hidden
                className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--v2-teal)] shadow-[0_0_6px_rgb(159_240_236/0.7)]"
              />
              {item}
            </li>
          ))}
        </ul>
      )}

      <p className="v2-note mt-5">
        Limits bound what the AI can do, not whether it profits: trading can lose value.
        {animrTradeGuardAddress && (
          <>
            {" "}
            Guard contract:{" "}
            {guardHref ? (
              <a href={guardHref} target="_blank" rel="noopener noreferrer" className="v2-link v2-mono">
                {shortAddress(animrTradeGuardAddress)} ↗
              </a>
            ) : (
              <span className="v2-mono">{shortAddress(animrTradeGuardAddress)}</span>
            )}
          </>
        )}
      </p>
    </section>
  );
}

function Mark({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
        ok
          ? "border-[rgb(98_224_166/0.32)] bg-[rgb(98_224_166/0.1)] text-[var(--v2-success)]"
          : "border-[rgb(255_122_138/0.3)] bg-[rgb(255_122_138/0.08)] text-[var(--v2-danger)]"
      }`}
    >
      <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        {ok ? <path d="m3.5 8.5 3 3 6-7" strokeLinejoin="round" /> : <path d="m4.5 4.5 7 7m0-7-7 7" />}
      </svg>
    </span>
  );
}

export function ShieldIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.3 7.5 9.5 4.4-1.2 7.5-4.9 7.5-9.5V6L12 3Z" strokeLinejoin="round" />
      <path d="m8.8 12 2.2 2.2 4.2-4.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
