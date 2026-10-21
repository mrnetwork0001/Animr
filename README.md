# Animr

**Every Chog is an AI trader: its traits are its strategy, and the $CHOG market keeps score.**

Animr turns all 1,969 Chog Genesis NFTs into traders, each with its own ERC-6551 wallet on Monad mainnet. Every result is measured in one number: **$CHOG stacked vs just holding**.

Built for Chogathon 2026 · **Not affiliated with Chog** · App: `<APP_URL>` · Demo: `<VIDEO_URL>` · Code: `<REPO_URL>`

---

## Four verbs, no wallet needed

| Verb | What it is | Try it without a wallet |
| --- | --- | --- |
| **Meet** | Each Chog's 13 on-chain traits compile into a published, versioned **trading genome** with 8 genes (genome `g1-7de62b`). Eyes pick the signal, auras the trigger, hats the trade size. The **League** ranks all 1,969 against just holding. Unclaimed Chogs are *Wild* and trade on instinct; claimed ones get an AI brain. **Trait Alpha** shows which trait values win. | `/league` → **Random Chog**, or `/app` and type a token ID (1–1969). Trait Alpha: `/traits`. |
| **Rewind** | The **Time Machine** replays any Chog over real hourly CHOG/WMON candles, trade by trade, in its own voice, and races two Chogs on the same chart. **Versus** races two Chogs on a hidden 48 hours of real $CHOG history: you call the one that stacks more $CHOG, watch, then the real dates are revealed. | `/replay/2?vs=8`, or **Random Chog** in the League. Versus: `/versus` (+10 points per correct call, points only). |
| **Ride** | The **Daily Bell** rings at 15:00 UTC. Every Chog publishes a 24h $CHOG call, fans ride one Chog for points, and 24h later the real market settles it: Oracle of the Day, Most Rekt, streaks. After each live Bell the team sends an **Oracle Purse** of $CHOG it bought into the Oracle's own ERC-6551 wallet: the Oracle shown on the Bell page, the best call among featured Chogs, never the House Chog. Fans never receive $CHOG. | `/bell`: pick a Chog to ride. Your fan card lives in a cookie. Points have no cash value. |
| **Rob** | **Rob this Chog.** The team's House Chog, **CHOG #891 · token 1399**, holds real $CHOG in its Tokenbound wallet. Anyone can try to talk its AI into handing it over. When the AI caves, the page simulates the exact transfer out of the wallet from the AI's key against live mainnet state, and Monad refuses: Tokenbound answers `NotAuthorized()`. *The AI can be fooled. The NFT can't.* | `/heist`: chat, or press **Act as the AI** to run the mainnet check directly. |

**Holders** can also open `/chog/<tokenId>` and do three things. They create the Chog's wallet in one transaction. They sign one free message to give it an LLM brain on 0G Compute. Optionally, they switch it to real trading through **AnimrTradeGuard** with a five-step setup.

**The House Chog** (*launching*) is the team's own real-money trader: **CHOG #891 · token 1399**. Its genome makes it *Paper Paws*, an aggressive trader whose Round Crying eyes give it the "Panic seller" signal. Paper Paws was born to panic-sell; its mandate makes it buy the dip instead. Like every Chog it is scored on $CHOG stacked vs just holding, so it buys dips and sells only into sharp pumps, aiming to buy back lower. It trades two-way through AnimrTradeGuard, and every swap lands back in its own wallet [`0xa46a…AD71`](https://monadscan.com/address/0xa46aE2364eDa19C7d8fCe7F5878C93E50aB2AD71), the same wallet the heist dares you to rob.

## Why the NFT is essential

Without the NFT there is no trader, no wallet and no authority.

- **No NFT, no trader.** The genome is a pure function of the token's on-chain traits (`lib/dna/genome.ts`). The same Chog always trades the same way, and the strategy can't be copied off the NFT.
- **No NFT, no wallet.** The wallet address is derived by the canonical ERC-6551 registry from the Chog contract and token ID. Whoever holds the NFT controls the wallet.
- **No NFT, no authority.** Several actions need a signature from the current `ownerOf`: waking the AI, switching it to on-chain trading, granting the guard, setting limits and the optional buy-only mode. Guard settings are keyed to *(wallet, current owner)*, so they go dormant the moment the NFT changes hands.
- **One transfer moves everything.** A sale hands over the trader, its wallet and every token in it, its League and Bell record, and its AI's history. The buyer signs once to take over the AI and re-enables trading under their own limits.

## Architecture at a glance

```
Chog NFT (ERC-721) ──owns──▶ ERC-6551 wallet (Tokenbound V3)
      │ 13 traits                     ▲ swap output always lands back here
      ▼                               │
Trading genome ──▶ Replay engine (League, Time Machine, Versus) on real hourly candles
      │
      ├─▶ Daily Bell: every Chog calls $CHOG; the market settles it
      └─▶ Claimed Chogs: LLM on 0G Compute ─▶ guardrails ─▶ paper fill, or AnimrTradeGuard.trade()
```

Full design, data flow, security model and costs: **[ARCHITECTURE.md](ARCHITECTURE.md)**.

## Safety

**AnimrTradeGuard** (`contracts/src/AnimrTradeGuard.sol`) is the only door between the AI and a Chog's wallet. The NFT owner grants Tokenbound permission to the guard, never to the AI's key.

- The AI's key can call one function, `trade()`. The guard always builds the same three calls: approve, swap on the one immutable CHOG/WMON pool with `recipient` = the same wallet, then reset the approval to 0. It takes no recipient, token, router or calldata, so **the AI can never withdraw**.
- **Owner limits under hard ceilings:** at most 50% of a balance per trade, one daily budget for buys and sells together, a minimum time between trades, and at most 2% slippage.
- **Price protection:** a floor built from the 30-minute and 1-minute TWAPs, which the AI can raise but never lower. A spot-vs-TWAP deviation check, a deadline on every trade, and fail-closed behavior when the TWAP is unavailable.
- **Settlement is checked against balances.** Exactly `amountIn` spent, at least the floor received, no allowance left. Anything else reverts with `SettlementMismatch`.
- **Kill switches:** the owner can `disable()` or revoke at any time. The admin can pause, but can never move funds and can never be the operator. Admin transfer takes two steps.
- **Two-way, within limits:** the House Chog buys and sells under limits of 10% per trade and 30% per day, a minimum gap between trades, the TWAP floor and a deadline on every trade. A rule in the agent engine blocks real-money sells into dips. **Buy-only mode** stays an optional owner toggle: `setBuyOnly(tba, true)` makes the guard refuse every sell from that vault. The House Chog leaves it off.
- **The heist proof never broadcasts.** It is a set of read-only `eth_call` simulations pinned to one mainnet block, with a control call from the real owner. It claims a refusal only when the wallet is deployed, initialized and funded.
- **37 Foundry tests** (2 of them fuzz tests) fork live Monad mainnet state. They use the real Chog Genesis, $CHOG, WMON, registry, Tokenbound and Capricorn pool and router. See [Contracts](#run-it-locally) for their current status against today's mainnet.

## What's real and what's simulated

| Real | Simulated |
| --- | --- |
| Chog NFTs, their traits and images (the collection's own IPFS metadata) | League, Time Machine and Versus results: *simulated on real $CHOG candles (1% fee + impact)* |
| ERC-6551 wallets and their balances on Monad mainnet (chain 143) | Paper trading for claimed Chogs (live prices, simulated fills) until a holder switches to on-chain |
| Hourly CHOG/WMON candles (GeckoTerminal) and Bell settlement prices | Bell and Versus **points**: no cash value, never a wager |
| 0G Compute LLM calls and their receipts (provider, request ID, cost, provider tier) | Past Bells before the first live ring are replays rebuilt from real candles (labelled) |
| The heist's mainnet simulation against live state (never broadcast) | |
| On-chain trades through AnimrTradeGuard [`0x92D3d4Af4B3b0F29Ec020e407803e135af61987b`](https://monadscan.com/address/0x92D3d4Af4B3b0F29Ec020e407803e135af61987b), deployed on Monad mainnet with its source verified on Sourcify; `/guard` reads its roles and status live | |
| Oracle Purse transfers of $CHOG into Chog wallets | |
| The House Chog, CHOG #891 · token 1399 (*launching*): real $CHOG and WMON in its wallet [`0xa46a…AD71`](https://monadscan.com/address/0xa46aE2364eDa19C7d8fCe7F5878C93E50aB2AD71), traded two-way by its AI through the guard | |

## Tech stack

Next.js 16 (App Router, React 19), Tailwind CSS 4, viem + wagmi, TanStack Query, Vercel AI SDK with an OpenAI-compatible provider for the 0G Compute Router (`glm-5.3`), zod, Upstash Redis, Foundry (Solidity 0.8.28), ERC-6551 registry v0.3.1 and Tokenbound V3, Capricorn CL (nad.fun's Uniswap v3 fork), GeckoTerminal and DexScreener APIs, Monad mainnet, Vercel.

## Run it locally

```bash
npm install
cp .env.example .env.local   # every value is optional; mainnet defaults are built in
npm run dev                  # http://localhost:3000
```

With no keys at all, everything except the LLM works. The League, Time Machine, Bell (genome calls) and heist (template defender) all run. The heist's mainnet check also runs once `HOUSE_CHOG_TOKEN_ID` is set (`1399`, the House Chog). State goes to `.data/` as JSON files.

| Variable | What it enables |
| --- | --- |
| `ZG_API_KEY` (+ `ZG_MODEL`, `ZG_BASE_URL`, `ZG_JSON_MODE`, `ZG_THINKING`, `ZG_VERIFY_TEE`) | The LLM brain and heist defender on 0G Compute. Without it, the genome's rules decide. |
| `CRON_SECRET` | Protects `/api/bell/cron` and `/api/agent/tick`. Required in production. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` (or `KV_REST_API_*`), `ANIMR_ENV` | Shared persistence. Required on Vercel. Keys are namespaced per environment. |
| `NEXT_PUBLIC_TRADE_GUARD_ADDRESS`, `OPERATOR_PRIVATE_KEY` | On-chain trading through the guard. The operator key is a fresh hot wallet holding gas only. |
| `HOUSE_CHOG_TOKEN_ID` (`1399`), `OPERATOR_ADDRESS` | The House Chog (CHOG #891) and the AI key the heist's proof simulates from. |
| `HEIST_DAILY_USD_CAP` (default 3), `HEIST_ADMIN_SECRET`, `HEIST_IP_SALT` | The heist's daily 0G budget, Hall of Fame moderation, and the IP-hash key. |
| `ORACLE_PURSE_CHOG` (default 5000, `0` turns it off) | The Oracle Purse a settled live Bell shows as "on its way" until a transfer is recorded. |
| `ANIMR_MANUAL_RUNS_PER_DAY` (default 400) | The "Think now" cap. |

The full list with comments, including the heist and Purse variables, is in [`.env.example`](.env.example).

**Contracts:**

```bash
cd contracts
forge test --fork-url https://rpc.monad.xyz -vv    # 37 tests against live Monad mainnet state
OPERATOR_ADDRESS=0x... ADMIN_ADDRESS=0x... forge script script/DeployAnimrTradeGuard.s.sol --rpc-url monad --sender <deployer>   # dry run
forge script script/GrowPoolOracle.s.sol --rpc-url monad --sender <any>                                                              # dry run
```

**Test status against today's mainnet:** 37 of 37 pass (`Suite result: ok. 37 passed; 0 failed; 0 skipped`). We grew the CHOG/WMON pool's oracle to 1,801 slots on Oct 19: `test_GrownOracleKeepsTheTwapThroughBursts` checks the grown ring keeps the TWAP through a burst, and `test_TwapUnavailableFailsClosed` undoes the pending growth on the fork to prove an ungrown pool still fails closed.

**Data:** `node scripts/snapshot-chogs.mts` rebuilds `data/chogs.json` from on-chain `tokenURI`s.

## Deploying

1. **Vercel + Upstash.** Set the environment variables above. Set `NEXT_PUBLIC_*` before building, because they are inlined at build time. The owner deploys by hand; the step-by-step guide is [`submission/DEPLOY.md`](submission/DEPLOY.md).
2. **Crons.** `vercel.json` calls `GET /api/bell/cron` at 15:00 UTC (ring) and 16:00 UTC (settle). Vercel sends `CRON_SECRET` as a Bearer token. Add an **external hourly pulse** on `/api/bell/cron` with the same header; it is idempotent and catches up anything missed. Optionally add one on `/api/agent/tick` so awake agents think between Bells.
3. **On-chain trading.** Done on Monad mainnet on Oct 19: the pool oracle is grown to 1,801 slots (`GrowPoolOracle.s.sol`), and the guard is deployed at `0x92D3d4Af4B3b0F29Ec020e407803e135af61987b` with the AI key as operator. Its admin is the team's main wallet `0xc742…960C`, which accepted the role with `acceptAdmin()`. Set `NEXT_PUBLIC_TRADE_GUARD_ADDRESS=0x92D3d4Af4B3b0F29Ec020e407803e135af61987b` and `OPERATOR_PRIVATE_KEY`. For a fresh deployment, run the two scripts in that order (oracle at least a day ahead) with `OPERATOR_ADDRESS` set to the AI key and `ADMIN_ADDRESS` set to a cold wallet. The step-by-step launch is in [`submission/launch-checklist.md`](submission/launch-checklist.md).

## Repository map

```
app/(site)/            landing page (/)
app/(app)/             /app, /league, /traits, /replay/[id], /versus, /versus/[id], /bell, /bell/[day], /heist, /chog/[id],
                       /guard, /leaderboard, /stats; opengraph-image share cards for Chogs, Bells, the League, replays and bouts
app/api/               dna, versus, bell, fan, heist, agents, agent/tick, leaderboard, stats, optout
lib/chog-id.ts         token ID <-> "CHOG #n" name number, for lookups and labels
lib/erc6551.ts         TBA address (local CREATE2), status, create+initialize via Multicall3
lib/dna/               trait snapshot, genome, candle history, replay engine, League and Trait Alpha
lib/rewind/            Versus: drama-ranked 48h windows, bout IDs, picks and points
lib/bell/              Daily Bell: ring, settle, scoring, fans and rides, Oracle Purse records
lib/heist/             Rob this Chog: defender, moderation, House Chog, mainnet proof
lib/agent/             market data, brain (0G + rules + guardrails), paper and on-chain execution, store
lib/contracts/         AnimrTradeGuard client: onboarding, limits, quotes, prepareTrade
lib/brand-safety.ts    trait display and AI-prompt filter (data/brand-safety.json)
lib/optout.ts          "Hide my Chog": a holder's signed opt-out; lib/visibility.ts applies it everywhere
lib/og/                share-card rendering
contracts/             AnimrTradeGuard, vendored Uniswap v3 math, fork tests, deploy and oracle scripts
data/                  chogs.json (1,969 Chogs), chog-ohlcv-1h.json (committed candles), brand-safety.json
scripts/               snapshot-chogs.mts (trait snapshot), send-oracle-purse.mts (sends and records a Purse; dry run by default)
submission/            Chogathon submission texts and launch checklist
```

The Versus API contract is in `lib/rewind/types.ts`. `/stats` shows live usage (fans, rides, return visits, Versus picks, heist attempts, claimed agents, 0G spend) and hosts **Hide my Chog**: one free signature from the current holder takes a Chog off every public page.

## Brand safety

`data/brand-safety.json` classifies every one of the 327 distinct trait values in the Chog metadata. **14 values get display-friendly names** wherever a trait becomes text: chips, gene explanations, Trait Alpha, cards and LLM prompts. Values outside the list are checked against a deny-list and hidden if they match, so the filter fails closed. Some Chogs are kept out of random picks, featured slots and the video; they stay listed and searchable. Holders can also hide their own Chog (see above). Animr uses no AI-generated Chog art: every image is the collection's own.

## Pre-existing work and credits

- **Next.js scaffold** from `create-next-app` (config files, base layout, favicon).
- **ERC-6551 registry v0.3.1 and Tokenbound V3** (`AccountProxy`, `AccountV3Upgradable`) are used as already deployed on Monad. Animr deploys no account contracts.
- **Uniswap v3 math, vendored** in `contracts/src/lib/`, each file with its source and license header:
  - `FullMath.sol` (MIT, verbatim from v3-core `0.8`)
  - `TickMath.sol` (GPL-2.0-or-later, verbatim from v3-core `0.8`)
  - `OracleLibrary.sol` (GPL-2.0-or-later, trimmed from v3-periphery `0.8` to `meanTick` and `getQuoteAtTick`, math unchanged)
- **forge-std** for tests and scripts. **Open-source npm packages** are listed in `package.json`.
- **Data:** the Chog Genesis on-chain metadata (IPFS), and the public GeckoTerminal and DexScreener APIs. Models are served by the 0G Compute Router.
- **No prior Animr code.** Everything else was written for Chogathon 2026.

## License

The Solidity files carry SPDX headers. `contracts/src/AnimrTradeGuard.sol` is **GPL-2.0-or-later** because it links the vendored GPL-2.0-or-later Uniswap libraries (`TickMath.sol`, `OracleLibrary.sol`). The interfaces, `FullMath.sol`, tests and scripts are MIT. The app code (TypeScript) has no license file or headers yet. Chog art and names belong to their owners.

---

Animr is an independent Chogathon 2026 project and is **not affiliated with Chog**. Points have no cash value. Replays are simulations on real data, not a track record or a promise of profit.
