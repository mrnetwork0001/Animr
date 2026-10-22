import type { ReactNode } from "react";
import { V2_NAV_LINKS } from "@/components/v2/nav";
import { ZG_DEFAULT_MODEL } from "@/lib/agent/zg-compute";
import { ADDR, HOUSE, LINKS } from "../facts";
import type { DocContent } from "../frame";
import { Address, Callout, Code, CodeBlock, DocLink, DocTable, P, Tag } from "../primitives";

const cron = <Tag tone="warning">CRON_SECRET</Tag>;
const admin = <Tag tone="warning">HEIST_ADMIN_SECRET</Tag>;
const pub = <Tag tone="teal">Config</Tag>;
const secret = <Tag tone="warning">Secret</Tag>;

// ---------------------------------------------------------------- Architecture

export const architecture: DocContent = {
  sections: [
    {
      id: "stack",
      title: "Stack",
      body: (
        <DocTable
          caption="Stack"
          head={["Layer", "What Animr uses"]}
          rows={[
            ["App", "Next.js 16 (App Router, Cache Components), React 19, Tailwind CSS 4"],
            ["Chain access", "viem and wagmi on Monad mainnet (chain 143), TanStack Query"],
            ["Login", "Privy (wallets, email, Google, X, Discord, embedded wallets) when NEXT_PUBLIC_PRIVY_APP_ID is set; otherwise a plain browser-wallet menu"],
            ["AI", `Vercel AI SDK with an OpenAI-compatible provider for the 0G Compute Router (default model ${ZG_DEFAULT_MODEL}), zod schemas`],
            ["State", "Upstash Redis, required in production: the Vercel Marketplace's KV_REST_API_URL/TOKEN pair, or UPSTASH_REDIS_REST_URL/TOKEN. A local file store in .data/ on a laptop."],
            ["Contracts", "Solidity 0.8 with Foundry; ERC-6551 registry v0.3.1 and Tokenbound V3 as already deployed"],
            ["Market data", "GeckoTerminal (hourly candles) and DexScreener (live price); OpenSea API for /market listings"],
            ["Hosting", "Vercel (Hobby: daily crons that fire anywhere within their hour) plus an external hourly pulse"],
          ]}
        />
      ),
    },
    {
      id: "data",
      title: "Data sources",
      body: (
        <ul>
          <li><strong>Traits:</strong> <Code>data/chogs.json</Code>, a snapshot of all 1,969 tokens&apos; on-chain metadata (IPFS), made by <Code>scripts/snapshot-chogs.mts</Code>.</li>
          <li><strong>Candles:</strong> hourly CHOG/WMON OHLCV from GeckoTerminal, with the history committed in <Code>data/chog-ohlcv-1h.json</Code>. A 10-minute cache per instance, a shared recent copy in Redis, one refresher at a time and backoff that honours <Code>Retry-After</Code>.</li>
          <li><strong>Live price:</strong> DexScreener and GeckoTerminal, cached 30 seconds, for agents.</li>
          <li><strong>Chain reads:</strong> the public Monad RPC (or <Code>NEXT_PUBLIC_RPC_URL</Code>).</li>
          <li><strong>Brand safety:</strong> <Code>data/brand-safety.json</Code> classifies all 327 distinct trait values.</li>
        </ul>
      ),
    },
    {
      id: "state",
      title: "Where state lives",
      body: (
        <P>
          Bells, rides, fan cards, Versus picks, the heist&apos;s counters and budget, agents and their decisions, rate
          limits and opt-outs live in Redis under <Code>animr:&lt;namespace&gt;:…</Code>. The namespace is{" "}
          <Code>ANIMR_ENV</Code>, else <Code>VERCEL_ENV</Code> (production, preview, development), else <Code>dev</Code>,
          so one database can serve several deployments safely. Nothing about a visitor needs a wallet: fans are anonymous
          httpOnly cookies.
        </P>
      ),
    },
    {
      id: "production",
      title: "What only production does",
      body: (
        <>
          <P lead="Redis is required in production.">
            Without a Redis pair, state falls back to one instance&apos;s <Code>/tmp</Code> and is wiped on cold starts:
            Bells, rides and heist counters don&apos;t persist, and the heist fails closed because its daily 0G budget
            can&apos;t be enforced (the House Chog naps). On Vercel, connect Upstash Redis from the Marketplace.
          </P>
          <P lead="Only the production deployment broadcasts.">
            Guarded trades and trophy mints are sent only when <Code>ANIMR_ENV</Code> or <Code>VERCEL_ENV</Code> is{" "}
            <Code>production</Code> (<Code>lib/runtime-env.ts</Code>). A laptop or a preview that happens to hold the
            operator key and the contract addresses refuses to act on mainnet for its own Bells or agents.
          </P>
        </>
      ),
    },
    {
      id: "schedule",
      title: "What runs on a schedule",
      body: (
        <>
          <DocTable
            caption="Schedule"
            head={["When (UTC)", "What", "Trigger"]}
            rows={[
              ["15:00", "Vercel Cron rings today's Bell; on Hobby it fires anywhere from 15:00 to 15:59", "Vercel Cron → GET /api/bell/cron"],
              ["15:01", "The pulse rings today's Bell after the 60-second ring lag (claimed agents think once)", "External pulse, 1,11 * * * * → GET /api/bell/cron"],
              ["15:11", "The pulse settles yesterday's Bell (horizon plus 10 minutes' grace) and mints its Best call and Most rekt trophies", "External pulse → GET /api/bell/cron"],
              ["16:00", "Vercel Cron settles yesterday's Bell if the pulse hasn't", "Vercel Cron → GET /api/bell/cron"],
              ["Every hour, :01 and :11", "Catch up any ring or settlement that is due", "External pulse → GET /api/bell/cron"],
              ["Every hour, :30", "Every awake agent thinks once; on-chain agents decide only here and at the ring", "External pulse, 30 * * * * → GET /api/agent/tick"],
              ["After settlement", "The Oracle Purse is sent from the House key and recorded", "A scheduled job the team runs: scripts/send-oracle-purse.mts"],
              ["On request", "A settled Bell's recap is written once, on its first request", "GET /api/bell/recap/[day]"],
              ["On visit", "Bell pages catch up anything due", "after() hook on the Bell read routes"],
            ]}
          />
          <P>
            The pulse schedules are production&apos;s, on an external scheduler; it sends <Code>CRON_SECRET</Code> as a
            Bearer header, never in a URL. Both routes are idempotent and hold a lock, so overlapping triggers are safe.
          </P>
        </>
      ),
    },
    {
      id: "ai",
      title: "AI on 0G Compute",
      body: (
        <P>
          Every LLM call goes to the 0G Compute Router (<Code>https://router-api.0g.ai/v1</Code> by default) with{" "}
          <Code>ZG_API_KEY</Code>. Three features use it: the agent brain, the heist defender and Ask this Chog (plus Bell
          recaps). Each has a deterministic fallback when 0G is not configured or fails: the genome&apos;s rules, a template
          defender and template answers. Spend is bounded by the per-feature caps described on their pages.
        </P>
      ),
    },
    {
      id: "share",
      title: "Share cards and the Mini App",
      body: (
        <P>
          Chogs, Bells, the League, replays and Versus bouts have <Code>opengraph-image</Code> share cards rendered from
          the collection&apos;s own art. A Farcaster Mini App embed opens the Daily Bell inside Farcaster clients. Animr uses
          no AI-generated Chog art.
        </P>
      ),
    },
    {
      id: "header",
      title: "The header and login",
      body: (
        <>
          <P lead="The header is a game HUD.">
            One glyph per section ({V2_NAV_LINKS.map((link) => link.label).join(", ")}) with small live badges from real
            data: the Daily Bell&apos;s countdown (to the ride window&apos;s close while a live Bell is open, else to the next
            ring), today&apos;s heist attempts, and how many Chogs the logged-in wallet holds. Badges load after hydration and
            pause while the tab is hidden. Below 1100px the links and the wallet move into a hamburger panel, and the
            League&apos;s and the market&apos;s filter chips wrap instead of scrolling sideways.
          </P>
          <P>
            <strong>Log in</strong> is Privy when <Code>NEXT_PUBLIC_PRIVY_APP_ID</Code> is set: a wallet, an email code,
            Google, X or Discord, with an embedded wallet for users who have none; the active wallet is bridged into wagmi.
            Unset, the header shows a plain browser-wallet menu.
          </P>
        </>
      ),
    },
  ],
};

// ---------------------------------------------------------------- Contracts and API

export const contractsAndApi: DocContent = {
  sections: [
    {
      id: "contracts",
      title: "Contracts",
      body: (
        <DocTable
          caption="Contracts"
          head={["Contract", "Address", "Animr uses"]}
          compact
          rows={[
            ["AnimrTradeGuard (Animr)", <Address key="g" address={ADDR.guard} kind="contract" />, "trade, configure, disable, setBuyOnly; views canTrade, maxAmountIn, quoteFloor, limitsOf, isBuyOnly. Events Traded, Configured, Disabled, BuyOnlySet."],
            ["AnimrTrophies (Animr)", <Address key="t" address={ADDR.trophies} kind="contract" />, "award, awarded, accountOf, balanceOfBatch. Event TrophyAwarded."],
            ["Chog Genesis (ERC-721)", <Address key="n" address={ADDR.chogNft} kind="contract" />, "ownerOf, tokenURI"],
            ["$CHOG (ERC-20)", <Address key="c" address={ADDR.chogToken} kind="contract" />, "balanceOf, transfer (simulated in the heist proof)"],
            ["WMON (ERC-20)", <Address key="w" address={ADDR.wmon} kind="contract" />, "balanceOf"],
            ["CHOG/WMON pool (Capricorn CL, 1%)", <Address key="p" address={ADDR.pool} kind="contract" />, "observe (TWAP), candles via GeckoTerminal"],
            ["Swap router", <Address key="r" address={ADDR.swapRouter} kind="contract" />, "exactInputSingle, called only by the guard"],
            ["QuoterV2", <Address key="q" address={ADDR.quoterV2} kind="contract" />, "Quotes for on-chain trades"],
            ["ERC-6551 Registry v0.3.1", <Address key="reg" address={ADDR.registry} kind="contract" />, "createAccount, account"],
            ["Tokenbound AccountProxy", <Address key="ap" address={ADDR.accountProxy} kind="contract" />, "initialize; the implementation in every wallet address"],
            ["Tokenbound AccountV3Upgradable", <Address key="v3" address={ADDR.accountV3} kind="contract" />, "owner, isValidSigner, execute, setPermissions"],
            ["Multicall3", <Address key="m" address={ADDR.multicall3} kind="contract" />, "aggregate3 for create + initialize"],
          ]}
        />
      ),
    },
    {
      id: "keys",
      title: "Public keys and wallets",
      body: (
        <DocTable
          caption="Keys"
          head={["Who", "Address", "Role"]}
          compact
          rows={[
            ["AI operator", <Address key="o" address={ADDR.operator} />, "guard.operator() and the trophies minter. Holds MON for gas only."],
            ["Guard admin", <Address key="a" address={ADDR.admin} />, "The team's main wallet: pause, rotate the operator. Also AnimrTrophies' owner."],
            ["House key", <Address key="h" address={ADDR.houseKey} />, "Scripts only: deployed the contracts, grew the oracle, pays Oracle Purses through the scheduled purse job"],
            [`House Chog wallet (${HOUSE.label})`, <Address key="hw" address={HOUSE.wallet} kind="wallet" />, "The heist's vault and the team's on-chain agent"],
          ]}
        />
      ),
    },
    {
      id: "api",
      title: "HTTP API",
      body: (
        <>
          <P>
            All routes answer JSON under <Code>{LINKS.app}</Code>. Token IDs run 1 to 1,969. Routes marked {cron} need{" "}
            <Code>Authorization: Bearer &lt;CRON_SECRET&gt;</Code>; {admin} marks moderation. Fan routes set the anonymous{" "}
            <Code>animr_fan</Code> cookie. Hidden Chogs answer 404 on per-Chog routes.
          </P>
          <DocTable
            caption="API routes"
            head={["Route", "Method", "Purpose"]}
            compact
            rows={[
              ["/api/dna/population", "GET", "All Chogs ranked by edge vs holding, with headline stats. ?window=30d|45d|max"],
              ["/api/dna/traits", "GET", "Trait Alpha. ?window="],
              ["/api/dna/[tokenId]", "GET", "A Chog's snapshot, genome and persona name"],
              ["/api/dna/[tokenId]/replay", "GET", "Its replay on real candles. ?window="],
              ["/api/dna/[tokenId]/standing", "GET", "Its League rank and edge. ?window=, ?since="],
              ["/api/versus/random", "GET", "A fresh random bout (fighters only)"],
              ["/api/versus/new", "GET", "A bout for chosen Chogs. ?a=&b="],
              ["/api/versus/[id]", "GET", "A bout's preview, or the whole race with ?spectate=1"],
              ["/api/versus/[id]/pick", "POST", "Body { fighter: \"a\" | \"b\" }: your pick, then the race and reveal"],
              ["/api/versus/me", "GET", "Your Versus record"],
              ["/api/versus/stats", "GET", "Versus totals"],
              ["/api/bell/today", "GET", "The latest Bell, with its live move while open"],
              ["/api/bell/[day]", "GET", "One Bell (YYYY-MM-DD), with its Oracle Purse once settled"],
              ["/api/bell/[day]/calls", "GET", "A page of a Bell's calls. ?cursor=&sort=bold|bull|bear|tokenId|points&limit="],
              ["/api/bell/chog/[tokenId]", "GET", "A Chog's latest call and season record"],
              ["/api/bell/recap/[day]", "GET", "A settled Bell's recap"],
              ["/api/bell/standings", "GET", "Top oracles and top fans"],
              ["/api/bell/ride", "POST", "Body { tokenId }: ride a Chog on the open (or next) Bell"],
              [<span key="c">/api/bell/cron {cron}</span>, "GET", "Ring and settle whatever is due (Vercel Cron at 15:00 and 16:00; the pulse at minutes 1 and 11)"],
              ["/api/fan", "GET, POST", "Your fan card; POST { nickname } sets a nickname"],
              ["/api/heist", "GET", "The heist page's data"],
              ["/api/heist/chat", "POST", "Body { sessionId?, message, recipient? }: one message to the defender"],
              ["/api/heist/proof", "POST", "Body { recipient? }: Run the check, the read-only mainnet simulation"],
              [<span key="h">/api/heist/hall-of-fame {admin}</span>, "GET, POST, PATCH, DELETE", "The wall; POST adds your caving reply; PATCH and DELETE moderate"],
              ["/api/chog/[tokenId]/ask", "POST", "Body { sessionId?, message, viewer? }: Ask this Chog"],
              ["/api/agents/[tokenId]", "GET", "A Chog's agent and its newest decisions. Cached 5 s at the CDN with no stale-while-revalidate, so a claim or a mode switch shows on the next poll"],
              ["/api/agents/[tokenId]/activate", "POST", "Wake the AI with the holder's signed message"],
              ["/api/agents/[tokenId]/mode", "POST", "Switch paper or on-chain with the holder's signed message"],
              ["/api/agents/[tokenId]/tick", "POST", "Think now (paper agents, rate limited; an on-chain agent answers 403)"],
              [<span key="t">/api/agent/tick {cron}</span>, "GET", "Every awake agent thinks once (the pulse at minute 30)"],
              ["/api/leaderboard", "GET", "Every claimed agent by PnL vs holding"],
              ["/api/holders/[address]", "GET", "The Chogs an address holds, with League place and Bell call"],
              ["/api/optout", "GET, POST", "Hide my Chog: list, status, the message to sign, and the signed opt-out"],
              ["/api/stats", "GET", "The numbers on /stats (counts only)"],
              ["/api/trophies/meta/[id]", "GET", "ERC-1155 metadata for a trophy kind"],
              ["/api/trophies/art/[id]", "GET", "A trophy's badge (SVG)"],
            ]}
          />
        </>
      ),
    },
  ],
};

// ---------------------------------------------------------------- Self-hosting

const envRows: [string, ReactNode, string][] = [
  ["CRON_SECRET", secret, "Protects /api/bell/cron and /api/agent/tick. Required in production, where the external pulse sends it as a Bearer header."],
  ["UPSTASH_REDIS_REST_URL / _TOKEN, or KV_REST_API_URL / _TOKEN", secret, "Shared state: Bells, rides, fan cards, the heist's counters and budget, agents. Required in production: without it state is per instance and lost on cold starts, and the heist fails closed (the House Chog naps). On Vercel, connect Upstash from the Marketplace."],
  ["ZG_API_KEY", secret, "0G Compute Router key. Without it, rules and templates decide."],
  ["ZG_MODEL, ZG_BASE_URL, ZG_JSON_MODE, ZG_THINKING, ZG_VERIFY_TEE", pub, "Optional 0G settings (server-only)"],
  ["OPERATOR_PRIVATE_KEY", secret, "The AI operator key for on-chain mode and trophy mints. A fresh hot wallet with gas only."],
  ["OPERATOR_ADDRESS", pub, "The operator's public address, for the heist proof and the deploy script"],
  ["NEXT_PUBLIC_TRADE_GUARD_ADDRESS", pub, "The guard. Unset on mainnet means the live guard; empty means paper only."],
  ["NEXT_PUBLIC_TROPHIES_ADDRESS", pub, "AnimrTrophies. Unset turns the cabinet and awards off."],
  ["HOUSE_CHOG_TOKEN_ID", pub, "The House Chog's token ID (1399), never its CHOG # number"],
  ["ORACLE_PURSE_CHOG", pub, "Whole $CHOG per Oracle Purse; unset or 0 means none. The Daily Bell page shows this deployment's value. Set the same value where the purse job runs."],
  ["HEIST_DAILY_USD_CAP", pub, "0G spend per UTC day on heist replies (default 3)"],
  ["HEIST_ADMIN_SECRET", secret, "Bearer token for Hall of Fame moderation"],
  ["HEIST_IP_SALT", secret, "Key for hashing visitors' IPs (default: derived from CRON_SECRET)"],
  ["CHOG_CHAT_DAILY_CALLS", pub, "Ask this Chog's 0G calls per UTC day (default 1500)"],
  ["ANIMR_MANUAL_RUNS_PER_DAY", pub, "Global Think now cap (default 400)"],
  ["NEXT_PUBLIC_PRIVY_APP_ID, NEXT_PUBLIC_PRIVY_CLIENT_ID", pub, "Privy login. Unset means the plain wallet menu."],
  ["NEXT_PUBLIC_SITE_URL", pub, "Origin for share-card URLs (optional on Vercel)"],
  ["NEXT_PUBLIC_RPC_URL, NEXT_PUBLIC_IPFS_GATEWAY", pub, "Optional overrides; they ship to every browser"],
  ["OPENSEA_API_KEY", secret, "Optional; without it the app requests a short-lived key for /market"],
  ["FARCASTER_HEADER, FARCASTER_PAYLOAD, FARCASTER_SIGNATURE", pub, "Mini App account association (server-only)"],
  ["ANIMR_ENV, ANIMR_DATA_DIR", pub, "Redis namespace and local file store; leave unset on Vercel"],
  ["HOUSE_PRIVATE_KEY, HOUSE_ADDRESS, ADMIN_ADDRESS", secret, "Scripts only. Never on Vercel."],
];

export const selfHosting: DocContent = {
  sections: [
    {
      id: "local",
      title: "Run it locally",
      body: (
        <>
          <CodeBlock label="Terminal">{"npm install\ncp .env.example .env.local   # every value is optional\nnpm run dev                  # http://localhost:3000"}</CodeBlock>
          <P>
            With no keys at all, everything except the LLM works: the League, Time Machine, Versus, Bell (genome calls) and
            heist (template defender). State goes to <Code>.data/</Code> as JSON files.
          </P>
        </>
      ),
    },
    {
      id: "env",
      title: "Environment variables",
      body: (
        <>
          <P>
            Names and purpose only. <Code>NEXT_PUBLIC_*</Code> values are inlined at build time, so changing one needs a
            rebuild. Never give a secret a <Code>NEXT_PUBLIC_</Code> prefix.
          </P>
          <DocTable caption="Environment variables" head={["Variable", "Type", "Purpose"]} compact rows={envRows} />
          <P>Never change the Chog NFT, $CHOG, account implementation or salt variables: that would move every wallet address.</P>
        </>
      ),
    },
    {
      id: "vercel",
      title: "Deploy on Vercel",
      body: (
        <ul>
          <li>Import the repo with the Next.js preset and no overrides; keep Fluid Compute on (the Bell routes use a 300-second max duration).</li>
          <li>Connect Upstash Redis from the Vercel Marketplace (it adds <Code>KV_REST_API_URL</Code> and <Code>KV_REST_API_TOKEN</Code>; the <Code>UPSTASH_REDIS_REST_*</Code> pair works too), then add the variables above (secrets as Secret, production only) and redeploy. Redis is required: without it the Bell, rides and the heist don&apos;t persist, and the House Chog naps.</li>
          <li><Code>vercel.json</Code> already calls <Code>/api/bell/cron</Code> at 15:00 and 16:00 UTC, but Vercel Hobby only allows daily crons and fires them anywhere within the hour. Add two jobs on an external scheduler (for example cron-job.org), each a GET with <Code>Authorization: Bearer &lt;CRON_SECRET&gt;</Code>: <Code>/api/bell/cron</Code> at minutes 1 and 11 of every hour (<Code>1,11 * * * *</Code>) and <Code>/api/agent/tick</Code> at minute 30 (<Code>30 * * * *</Code>). On-chain agents decide only on that tick and at the Bell.</li>
          <li>Only the production deployment sends guarded trades and trophy mints (<Code>VERCEL_ENV</Code> = <Code>production</Code>, or <Code>ANIMR_ENV</Code> elsewhere). Previews with the same variables stay paper-only.</li>
          <li>The Oracle Purse is a scheduled job the team runs outside Vercel: <Code>scripts/send-oracle-purse.mts --broadcast</Code> with <Code>ANIMR_ENV=production</Code>, the production Redis pair, <Code>HOUSE_PRIVATE_KEY</Code> and the same <Code>ORACLE_PURSE_CHOG</Code>. The app never reads the House key.</li>
          <li>Redeploy after any variable change. <Code>/guard</Code>, the landing page and the docs are prerendered, so House Chog and purse changes show after a rebuild.</li>
        </ul>
      ),
    },
    {
      id: "contracts",
      title: "Contracts",
      body: (
        <>
          <CodeBlock label="contracts/">{"forge test --fork-url https://rpc.monad.xyz -vv\nOPERATOR_ADDRESS=0x... ADMIN_ADDRESS=0x... forge script script/DeployAnimrTradeGuard.s.sol --rpc-url monad   # dry run"}</CodeBlock>
          <Callout tone="warning">
            <p>Grow the pool&apos;s oracle (<Code>GrowPoolOracle.s.sol</Code>) at least a day before deploying a new guard, and never use the deployer as the operator: the script refuses it.</p>
          </Callout>
          <P>
            Details: <DocLink href="/docs/trade-guard">AnimrTradeGuard</DocLink>.
          </P>
        </>
      ),
    },
  ],
};
