import { appConfig } from "@/lib/config";

// No hooks: renders from Server and Client Components alike.

const CONFIG_VARS = {
  chogNft: { env: "NEXT_PUBLIC_CHOG_NFT_ADDRESS", what: "Chog NFT collection (ERC-721)" },
  accountImplementation: {
    env: "NEXT_PUBLIC_TBA_IMPLEMENTATION",
    what: "ERC-6551 account implementation",
  },
  chogToken: { env: "NEXT_PUBLIC_CHOG_TOKEN_ADDRESS", what: "$CHOG token (ERC-20)" },
} as const;

export type ConfigKey = keyof typeof CONFIG_VARS;

const ALL_KEYS = Object.keys(CONFIG_VARS) as ConfigKey[];

/** Which of the given contract addresses are not configured yet. */
export function missingConfig(keys: readonly ConfigKey[] = ALL_KEYS): ConfigKey[] {
  return keys.filter((key) => !appConfig[key]);
}

/** Lists the missing NEXT_PUBLIC_* variables (see .env.example); renders nothing when all are set. */
export function ConfigNotice({
  keys = ALL_KEYS,
  title = "Animr isn't fully configured yet",
  className = "",
}: {
  keys?: readonly ConfigKey[];
  title?: string;
  className?: string;
}) {
  const missing = missingConfig(keys);
  if (missing.length === 0) return null;
  return (
    <div
      role="status"
      className={`rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm ${className}`}
    >
      <p className="flex items-center gap-2 font-medium text-warning">
        <span aria-hidden className="size-1.5 rounded-full bg-warning" />
        {title}
      </p>
      <p className="mt-1.5 text-muted">
        Add {missing.length === 1 ? "this variable" : "these variables"} to{" "}
        <code className="font-mono text-foreground">.env.local</code> (see{" "}
        <code className="font-mono text-foreground">.env.example</code>), then restart the dev
        server or rebuild: <code className="font-mono">NEXT_PUBLIC_*</code> values are inlined at
        build time.
      </p>
      <ul className="mt-3 space-y-1.5">
        {missing.map((key) => (
          <li key={key} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <code className="font-mono text-[13px] text-foreground">{CONFIG_VARS[key].env}</code>
            <span className="text-subtle">{CONFIG_VARS[key].what}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-subtle">
        Network: {appConfig.chain.name} (chain {appConfig.chain.id})
      </p>
    </div>
  );
}
