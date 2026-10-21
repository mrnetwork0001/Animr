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
      className={`rounded-[var(--v2-r-lg)] border border-[rgb(242_193_107/0.3)] bg-[rgb(242_193_107/0.05)] p-5 text-[length:var(--v2-fs-sm)] shadow-[var(--v2-glass-glow)] ${className}`}
    >
      <p className="m-0 flex items-center gap-2 font-medium text-[var(--v2-warning)]">
        <span aria-hidden className="size-1.5 rounded-full bg-[var(--v2-warning)] shadow-[0_0_8px_var(--v2-warning)]" />
        {title}
      </p>
      <p className="mt-2 mb-0 leading-relaxed text-pretty text-[var(--v2-nav)]">
        Add {missing.length === 1 ? "this variable" : "these variables"} to{" "}
        <code className="v2-mono text-[var(--v2-ink)]">.env.local</code> (see{" "}
        <code className="v2-mono text-[var(--v2-ink)]">.env.example</code>), then restart the dev server or rebuild:{" "}
        <code className="v2-mono">NEXT_PUBLIC_*</code> values are inlined at build time.
      </p>
      <ul className="m-0 mt-3 list-none space-y-1.5 p-0">
        {missing.map((key) => (
          <li key={key} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <code className="v2-mono text-[13px] text-[var(--v2-ink)]">{CONFIG_VARS[key].env}</code>
            <span className="text-[var(--v2-faint)]">{CONFIG_VARS[key].what}</span>
          </li>
        ))}
      </ul>
      <p className="v2-note mt-3">
        Network: {appConfig.chain.name} (chain {appConfig.chain.id})
      </p>
    </div>
  );
}
