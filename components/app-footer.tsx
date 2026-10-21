import { V2Footer } from "@/components/v2";
import { ExternalIcon } from "@/components/v2/icons";
import { animrTradeGuardAddress } from "@/lib/contracts/animr-trade-guard";
import { ERC6551_REGISTRY_ADDRESS } from "@/lib/erc6551";
import { explorerAddressUrl, shortAddress } from "@/lib/format";

/**
 * The app footer's facts, for AppShell's `footerExtra` slot (app/(app)/layout.tsx and the root 404): the app's one
 * consolidated honesty note (what is simulated, what is real), and the contracts with explorer links. Pages keep at
 * most a short "Simulated" / "Points only" label and leave the long caveats to this note. Server markup, no client code. The
 * shell's own footer line already carries the build credit and "Not affiliated with Chog".
 */
export function AppFooterFacts() {
  const contracts = [
    { label: "ERC-6551 registry", address: ERC6551_REGISTRY_ADDRESS },
    ...(animrTradeGuardAddress ? [{ label: "AnimrTradeGuard", address: animrTradeGuardAddress }] : []),
  ];
  return (
    <>
      <p className="m-0 text-pretty">
        Simulated: League, Versus, Time Machine and Daily Bell results replay real hourly $CHOG candles with the
        pool&apos;s 1% fee and price impact. Points have no cash value. Real: every Chog&apos;s ERC-6551 wallet and
        AnimrTradeGuard on Monad mainnet; a Chog&apos;s AI trades on-chain only if its holder opts in.
      </p>
      <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
        {contracts.map(({ label, address }) => {
          const href = explorerAddressUrl(address);
          const body = (
            <>
              <span className="text-[var(--v2-nav)]">{label}</span>
              <span className="v2-mono">{shortAddress(address)}</span>
              {href && <ExternalIcon aria-hidden className="size-3.5" />}
            </>
          );
          return (
            <li key={label}>
              {href ? (
                <a href={href} target="_blank" rel="noreferrer" title={address} className="v2-chip">
                  {body}
                </a>
              ) : (
                <span title={address} className="v2-chip">
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** The whole v2 footer with the facts. Kept for older imports; AppShell renders its own footer. */
export function AppFooter() {
  return <V2Footer extra={<AppFooterFacts />} />;
}
