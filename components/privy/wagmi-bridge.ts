import type { EIP1193Provider } from "viem";
import type { Config, Connector } from "wagmi";
import { injected } from "wagmi/connectors";
import { appConfig } from "@/lib/config";

/** The parts of Privy's ConnectedWallet the bridge needs (kept structural so this file doesn't import the SDK). */
export type BridgeWallet = {
  address: string;
  /** "privy" for the embedded wallet, else the external wallet's client type ("metamask", "rabby_wallet"…). */
  walletClientType: string;
  /** CAIP-2, e.g. "eip155:143". */
  chainId: string;
  meta: { name: string; icon?: unknown };
  getEthereumProvider: () => Promise<unknown>;
};

/**
 * Keeps wagmi connected to exactly the active Privy wallet: one injected connector wrapping that wallet's EIP-1193
 * provider, marked connected without a wallet prompt (Privy already authorised it). No wallet (logged out) →
 * disconnected. The same job as @privy-io/wagmi's `setActiveWalletForWagmi` mode, which can't be installed here
 * (its peer range pins viem 2.57.5).
 */
export async function syncWagmiToWallet(config: Config, wallet: BridgeWallet | undefined, isCancelled: () => boolean) {
  if (!wallet) {
    dropConnections(config);
    return;
  }
  const id = `privy.${wallet.walletClientType}.${wallet.address.toLowerCase()}`;
  const current = config.state.current ? config.state.connections.get(config.state.current) : undefined;
  if (current?.connector.id === id) return;

  const provider = (await wallet.getEthereumProvider()) as EIP1193Provider;
  if (isCancelled()) return;
  const connector: Connector =
    config.connectors.find((c) => c.id === id) ??
    config._internal.connectors.setup(
      injected({
        shimDisconnect: false,
        target: {
          id,
          name: wallet.walletClientType === "privy" ? "Privy" : wallet.meta.name,
          icon: typeof wallet.meta.icon === "string" ? wallet.meta.icon : undefined,
          provider: provider as never,
        },
      }),
    );
  // Read the accounts without prompting (isReconnecting) and attach the provider listeners, so account and network
  // changes made in the wallet reach wagmi.
  const data = await connector.connect({ isReconnecting: true }).catch(() => null);
  if (isCancelled()) return;
  const accounts = (data?.accounts.length ? data.accounts : [wallet.address]) as readonly [
    `0x${string}`,
    ...`0x${string}`[],
  ];
  const chainId = data?.chainId ?? (Number(wallet.chainId.replace("eip155:", "")) || appConfig.chain.id);

  dropConnections(config, connector);
  connector.emitter.off("connect", config._internal.events.connect);
  connector.emitter.on("change", config._internal.events.change);
  connector.emitter.on("disconnect", config._internal.events.disconnect);
  config._internal.connectors.setState([connector]);
  config.setState((state) => ({
    ...state,
    chainId: appConfig.chain.id,
    connections: new Map([[connector.uid, { accounts, chainId, connector }]]),
    current: connector.uid,
    status: "connected",
  }));
}

/** Forgets every connection except `keep`, detaching the old connectors' listeners (no wallet calls). */
function dropConnections(config: Config, keep?: Connector) {
  for (const connector of config.connectors) {
    if (connector === keep) continue;
    connector.emitter.off("change", config._internal.events.change);
    connector.emitter.off("disconnect", config._internal.events.disconnect);
  }
  if (!keep) config._internal.connectors.setState([]);
  if (config.state.status === "disconnected" && config.state.connections.size === 0) return;
  if (keep && config.state.current === keep.uid) return;
  config.setState((state) => ({ ...state, connections: new Map(), current: null, status: "disconnected" }));
}
