import Link from "next/link";
import { appConfig } from "@/lib/config";
import { animrTradeGuardAddress } from "@/lib/contracts/animr-trade-guard";
import { ERC6551_REGISTRY_ADDRESS } from "@/lib/erc6551";
import { explorerAddressUrl, shortAddress } from "@/lib/format";
import { APP_FOOTER_LINKS } from "./app-nav";

/** Footer for the app routes (app/(app)/layout.tsx) and the root 404 page: secondary links, honesty notes, contracts. */
export function AppFooter() {
  const contracts = [
    { label: "ERC-6551 registry", address: ERC6551_REGISTRY_ADDRESS },
    ...(animrTradeGuardAddress ? [{ label: "AnimrTradeGuard", address: animrTradeGuardAddress }] : []),
  ];
  return (
    <footer className="border-t border-line/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {APP_FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-muted transition-colors hover:text-foreground">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-col gap-3 text-xs text-subtle md:flex-row md:items-start md:justify-between md:gap-8">
          <p className="max-w-3xl text-pretty">
            Animr · Built for Chogathon 2026 on {appConfig.chain.name}. Not affiliated with Chog. League, Rewind and Bell
            numbers are simulated on real $CHOG candles (1% fee + impact); Bell points are never money. Chog wallets and
            AnimrTradeGuard are live on Monad mainnet: a Chog&apos;s AI trades on-chain only if its holder opts in, and
            paper-trades at live prices otherwise.
          </p>
          <ul className="flex shrink-0 flex-col gap-1 font-mono md:items-end">
            {contracts.map(({ label, address }) => {
              const href = explorerAddressUrl(address);
              return (
                <li key={label}>
                  {label}{" "}
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" title={address} className="hover:text-foreground">
                      {shortAddress(address)} ↗
                    </a>
                  ) : (
                    shortAddress(address)
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </footer>
  );
}
