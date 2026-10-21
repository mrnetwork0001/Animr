# Deploy Animr on Vercel

The owner's guide: you run every step yourself. All times are UTC. Wherever this guide says `<APP_URL>`, use your production domain, for example `https://animr.vercel.app`.

> **Never paste your whole `.env.local` into Vercel.** It holds `HOUSE_PRIVATE_KEY`, which must never leave your laptop. It also holds a Redis pair that would override the Marketplace one. Paste only the blocks in step 4.

## The deadline that matters

| When | What happens |
| --- | --- |
| **Wed Oct 21, by 14:30** | Steps 1–6 done: production deployed, Redis connected, variables set, redeployed, external pulse saved and checks green. |
| Wed Oct 21, 15:01 | The first trigger rings the **Oct 21 Bell as live**. The trigger can be the cron-job.org pulse at 15:01, Vercel's cron (any time from 15:00 to 15:59) or anyone opening `/bell`. |
| Thu Oct 22, 00:00 | Feature freeze. |
| Thu Oct 22, 03:00 | Rides on the Oct 21 Bell close (12 hours after 15:00). |
| **Thu Oct 22, from 15:10** | The Oct 21 Bell can settle (horizon 15:00 plus 10 minutes). The pulse settles it at 15:11. Then come the Oracle Purse (step 9) and the Bell scenes of the video. |
| Fri Oct 23, 12:00 | Submit. The Oct 22 Bell settles at 15:10 that day, after submission. |

**The Oct 21 Bell is the only live Bell that can settle before you submit.**

- If production goes up after 15:00 on Oct 21, the first trigger that day still rings the Oct 21 Bell as live. It rings late, so its calls count from that later price, and its rides still close at 03:00.
- If production first runs on Oct 22, no live Bell settles before submission.

Production gets its own Redis namespace and starts empty:

- On first use it builds 14 replayed Bells (Oct 7–20), each labelled as a replay.
- Oct 21 becomes its first live Bell, so `<FIRST_LIVE_BELL>` is `2026-10-21`. Confirm it with `/api/stats`.
- The Bells on your laptop (first live on Oct 19) and the agents you woke there live in the `dev` namespace. They don't carry over.

---

## 0. Prepare (10 minutes)

- [ ] **Accounts.** You need:
  - GitHub, with `gh auth status` showing you logged in
  - Vercel (Hobby is enough)
  - cron-job.org (free)
  - pc.0g.ai, with credit on the account
- [ ] **Make three new secrets** and save each one in your password manager. Vercel's Secret values are write-only after saving, and you'll need `CRON_SECRET` again for cron-job.org and for the checks.
  ```bash
  openssl rand -hex 32   # CRON_SECRET (new for production: don't reuse the one in .env.local)
  openssl rand -hex 32   # HEIST_ADMIN_SECRET
  openssl rand -hex 32   # HEIST_IP_SALT
  ```
- [ ] **Have two values from `.env.local` ready:** `ZG_API_KEY` and `OPERATOR_PRIVATE_KEY`. Copy them one at a time.
- [ ] **Decide `ORACLE_PURSE_CHOG`.** Use the whole $CHOG the House key will really send after the Oct 21 Bell settles. Use `0` if the House key won't hold that much $CHOG by Thu 15:10. If you leave it unset, the settled Bell shows a 5,000 $CHOG Purse "on its way" for 48 hours.

## 1. Put the code on GitHub

Skip this step if the repo is already on GitHub. Push once the final integration pass is done. After that, every push to `main` redeploys production by itself.

```bash
cd /Users/mrnetwork/Animr
git init -b main
git add -A
git ls-files | grep -E '(^|/)\.env|(^|/)\.data/'   # must print exactly one line: .env.example
git commit -m "Animr: Chogathon 2026"
gh repo create animr --public --source=. --push     # or --private, then invite the reviewer account the form names
```

`.gitignore` already keeps out `.env*` (except `.env.example`), `.data/`, `.next/` and `node_modules/`. `contracts/.gitignore` keeps out `out/`, `cache/`, `broadcast/` and `contracts/.env`.

## 2. Import the project

1. Open https://vercel.com/new, choose **Import Git Repository**, pick the repo and click **Import**.
2. On **Configure Project**:
   - **Project Name:** `animr`. Your free domain becomes `animr.vercel.app` if it's available; otherwise Vercel adds a suffix.
   - **Framework Preset:** **Next.js**, detected from `package.json`.
   - **Root Directory:** **`./`**, so leave it. The repo root *is* the app: `package.json`, `package-lock.json`, `next.config.ts` and `vercel.json` sit there. `contracts/` and `scripts/` aren't part of the build.
   - **Build and Output Settings:** leave every override off. The build is `next build` through `npm run build`, the output is the Next.js default, and the install is `npm install` from `package-lock.json`.
   - **Environment Variables:** leave empty for now. Step 4 adds them with the right types.
3. Click **Deploy**. The first build takes a few minutes. It works without any variables; it just isn't wired up yet.
4. Note the **production domain** shown on the project's Overview. That domain is your `<APP_URL>`. Never share or schedule a deployment URL (`animr-<hash>-<team>.vercel.app` or `…-git-…`): Vercel Authentication protects those, so visitors and cron-job.org would hit a login page.
5. **Settings → Build and Deployment → Node.js Version:** choose **24.x**, Vercel's default. 22.x also works: Next 16 needs Node 20.9 or later. Your laptop runs Node 26, which Vercel doesn't offer.
6. **Settings → Functions:**
   - Make sure **Fluid Compute** is on. It's the default for new projects. `/api/bell/cron` and `/api/bell/today` export `maxDuration = 300`, which is the Hobby maximum with Fluid compute.
   - Leave the function region at **Washington, D.C. (iad1)**, unless you use the Redis from step 3B and it lives elsewhere.

## 3. Redis: Upstash through the Vercel Marketplace

Every piece of shared state lives in Redis: Bells, rides, fan cards, Versus, the heist's counters and daily 0G budget, agents and their decisions, and rate limits.

The app picks its store in `lib/kv.ts` and `lib/agent/store.ts`, in this order:

1. `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, when both are set.
2. Otherwise `KV_REST_API_URL` + `KV_REST_API_TOKEN`.
3. Otherwise a file store: `.data/` on your laptop, or `/tmp/animr` on Vercel. On Vercel that copy belongs to one instance and is wiped on cold starts.

Keys are stored as `animr:<namespace>:…`. The namespace is `production` on Vercel production, `preview` on previews and `dev` on your laptop, so one database can safely serve all three.

### 3A. Create it in the Marketplace (recommended)

1. Open the project's **Storage** tab, click **Create Database** and choose **Upstash** → **Redis** ("Upstash for Redis"). Click **Continue**.
2. Set **Region** to **us-east-1**, next to the iad1 functions, and **Plan** to **Free**. Name it `animr` and click **Create**.
3. **Connect Project:**
   - Pick the Animr project.
   - Tick the **Production** and **Preview** environments. Development is optional.
   - Leave the advanced options, including any custom prefix, at their defaults.
   - Click **Connect**.
4. Open **Settings → Environment Variables**. The integration usually adds these five variables:
   - `KV_REST_API_URL` and `KV_REST_API_TOKEN`: Animr uses these two (Upstash's REST API).
   - `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL` and `REDIS_URL`: Animr ignores these.

   If you see `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` instead, that works too. If neither exact pair is there (for example a prefixed name like `STORAGE_KV_REST_API_URL`), add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` yourself. To find the values, open the database from **Storage**, choose **Open in Upstash** and go to the **REST API** section.
5. **Don't** also add the `UPSTASH_REDIS_REST_*` pair from your `.env.local`. It would win over the Marketplace pair and point production at your laptop's database.

### 3B. Alternative: reuse the database in `.env.local`

- Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` with the values from `.env.local`. Make the token a Secret and tick Production and Preview.
- Production writes its own `production` namespace, and the Purse script (step 9) works unchanged.
- Check the database's region in the Upstash console. Every request makes several Redis round trips, so if the database isn't in us-east-1, move Vercel's function region to the closest one (**Settings → Functions**).

### 3C. If you chose 3A: point your local scripts at it

The Purse script reads Redis from `.env.local`, where the `UPSTASH_REDIS_REST_*` lines (your old database) win.

- Before Thu 15:10, change those two lines in `.env.local`. Keep the names and paste the values of the Marketplace database's `KV_REST_API_URL` and `KV_REST_API_TOKEN`, copied from Vercel.
- Your laptop's `next dev` then uses that database too, under `dev`, apart from production.

## 4. Environment variables

**Settings → Environment Variables → Add.** You can paste a `.env`-style block into the **Key** field to add several variables at once. Choose the **Type** and **Environments** before saving.

**Block A.** Type **Config**, environments **Production and Preview**:

```dotenv
NEXT_PUBLIC_NETWORK=mainnet
NEXT_PUBLIC_TRADE_GUARD_ADDRESS=0x92D3d4Af4B3b0F29Ec020e407803e135af61987b
OPERATOR_ADDRESS=0x2523bBdD941783C4E565180D2a1b18DE86319cC2
ORACLE_PURSE_CHOG=<whole $CHOG you will really send per settled live Bell, or 0>
```

**Block B.** Type **Secret**, environment **Production only**. Previews then run without the AI and without the trading key, which is what you want.

```dotenv
CRON_SECRET=<new value from step 0>
ZG_API_KEY=<the sk-… key from .env.local>
OPERATOR_PRIVATE_KEY=<the operator key from .env.local; its address must be 0x2523…9cC2>
HEIST_ADMIN_SECRET=<new value from step 0>
HEIST_IP_SALT=<new value from step 0>
```

Then **redeploy** (4.2). The Redis variables from step 3 are already there. `HOUSE_CHOG_TOKEN_ID` comes later, in step 8.

### 4.1 Every variable the code reads

This list comes from `process.env` reads across `app/`, `lib/`, `components/` and `scripts/`, plus `vm.env*` reads in `contracts/script/`.

**Set on Vercel**

| Variable | Needed | Type | Value and where it comes from | What it does |
| --- | --- | --- | --- | --- |
| `CRON_SECRET` | Required | Secret | New `openssl rand -hex 32`. | Guards `/api/bell/cron` and `/api/agent/tick`, which answer 401 without it in production. Vercel Cron sends it as `Authorization: Bearer …`. It is also the fallback key for the heist's IP hashes. |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, **or** `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Required | Added by the integration, or Secret for the token | Step 3. | All shared state. Without it, state is per instance and wiped on cold starts, and the heist fails closed (the House Chog naps). |
| `ZG_API_KEY` | Required for the AI | Secret | The `sk-…` key from pc.0g.ai → Dashboard → API Keys (mainnet), the one in `.env.local`. | 0G Compute Router: agents' LLM decisions with receipts, and the heist's replies. Without it, agents follow their genome's rules and the heist uses template replies. |
| `OPERATOR_PRIVATE_KEY` | Required for on-chain mode | Secret, Production only | The AI operator's hot key from `.env.local`. Its address must be `0x2523bBdD941783C4E565180D2a1b18DE86319cC2`, the guard's `operator()`. | Signs `AnimrTradeGuard.trade()` for on-chain agents, including the House Chog's buy-only AI. Never use the House key or the admin wallet. Without it, trading is paper only. |
| `OPERATOR_ADDRESS` | Recommended | Config | `0x2523bBdD941783C4E565180D2a1b18DE86319cC2` | The heist proof's sender when the guard's `operator()` can't be read. The deploy script also reads it. |
| `NEXT_PUBLIC_TRADE_GUARD_ADDRESS` | Recommended | Config | `0x92D3d4Af4B3b0F29Ec020e407803e135af61987b` | The live guard. Unset on mainnet means the same address. **An empty value means paper only**, so never save it blank. Inlined at build time. |
| `NEXT_PUBLIC_NETWORK` | Recommended | Config | `mainnet` | Monad mainnet (chain 143), which is also what unset means. Never `testnet`: the Chog assets exist only on mainnet. Inlined at build time. |
| `ORACLE_PURSE_CHOG` | Decide | Config | Whole $CHOG per Purse, or `0`. Use the same value in `.env.local`. | What a settled live Bell promises its Oracle. Unset means 5,000, shown as "on its way" for 48 hours until the script records a transfer. |
| `HEIST_ADMIN_SECRET` | Recommended | Secret | New `openssl rand -hex 32`. | The bearer token for Hall of Fame moderation (appendix). Unset means no admin, and LLM-written replies stay held. |
| `HEIST_IP_SALT` | Optional | Secret | New `openssl rand -hex 32`. | The key for visitors' IP hashes. Unset means it's derived from `CRON_SECRET`. |
| `HOUSE_CHOG_TOKEN_ID` | Once the House Chog is bought | Config | Its **token ID** (1–1969, for example `1820`), never its "CHOG #" number. Use the same value in `.env.local`. | Step 8. Unset means the House Chog is "moving in" on `/heist`, `/guard` and `/`. |
| `HEIST_DAILY_USD_CAP` | Optional | Config | Default `3`. | 0G spend per UTC day on heist replies. `0` means template replies only. |
| `NEXT_PUBLIC_SITE_URL` | Optional on Vercel | Config | `https://<custom domain>`, only if you add one. | The base for `og:image` URLs and the host printed on share cards. Unset on Vercel means the production domain (`VERCEL_PROJECT_PRODUCTION_URL`). Inlined at build time. |

**Optional: leave unset unless you have a reason**

| Variable | Default | Notes |
| --- | --- | --- |
| `ZG_MODEL` | `glm-5.3` | The model the docs, video and receipts name. Your `.env.local` sets one; leave it unset on Vercel unless you deliberately want another model. |
| `ZG_BASE_URL` | `https://router-api.0g.ai/v1` | The 0G mainnet Router. |
| `ZG_JSON_MODE` | `json_object` | Other values: `json_schema` or `prompt`. |
| `ZG_THINKING` | `off` | `on` lets the model "think", which is slower. |
| `ZG_VERIFY_TEE` | `on` | Asks the Router for a TEE verdict. Receipts say "TEE verified" only when the Router says so. |
| `NEXT_PUBLIC_RPC_URL` | `https://rpc.monad.xyz` | **Ships to every browser.** Set it only for rate-limit trouble (troubleshooting), then redeploy. |
| `NEXT_PUBLIC_IPFS_GATEWAY` | `https://ipfs.filebase.io/ipfs/` | Needs a trailing slash. |
| `NEXT_PUBLIC_MARKETPLACE_URL_TEMPLATE` | OpenSea item page | `{contract}` and `{tokenId}` are substituted. |
| `ANIMR_PAPER_START_CHOG` | `1000` | The demo bankroll for a new paper agent whose wallet is empty. |
| `ANIMR_MANUAL_RUNS_PER_DAY` | `400` | The global daily cap on "Think now" runs, each one 0G call (about $0.002). |
| `NEXT_PUBLIC_CHOG_NFT_ADDRESS`, `NEXT_PUBLIC_CHOG_TOKEN_ADDRESS`, `NEXT_PUBLIC_TBA_IMPLEMENTATION`, `NEXT_PUBLIC_TBA_SALT` | Chog Genesis, $CHOG, Tokenbound AccountProxy, zero salt | **Never change these.** A different value moves every Chog's wallet address or breaks the guard's fixed wiring. |

**Never on Vercel**

| Variable | Why |
| --- | --- |
| `HOUSE_PRIVATE_KEY` | The House hot key. Only `scripts/send-oracle-purse.mts` reads it, and you pass it to the Foundry scripts on the command line, all on your laptop. The app never reads it. |
| `HOUSE_ADDRESS`, `ADMIN_ADDRESS` | Script inputs: the Purse script and `contracts/script/DeployAnimrTradeGuard.s.sol`. |
| `ANIMR_ENV` | Vercel already namespaces Redis by `VERCEL_ENV`. If you set it (to `production`, say), preview deployments would write production data. Use it only on your laptop, for the Purse script. |
| `ANIMR_MOCK_MARKET` | It replaces real prices with a simulated random walk, for demos only. |
| `ANIMR_DATA_DIR` | The local file store only. |
| `JITI_TSCONFIG_PATHS` | A command-line flag for running the scripts with jiti. |
| Any key or token with a `NEXT_PUBLIC_` prefix | It would ship to every visitor's browser. |

**Set by Vercel or Next.js: don't add these**

| Variable | Used for |
| --- | --- |
| `VERCEL` | Sends the file fallback to `/tmp/animr`, and trusts `x-vercel-forwarded-for` for rate limits. |
| `VERCEL_ENV` | `production`, `preview` or `development`: the Redis namespace. |
| `VERCEL_PROJECT_PRODUCTION_URL` | The production domain: the fallback for share-card URLs and their footer. |
| `NODE_ENV` | `production` on Vercel. Cron routes demand `CRON_SECRET` and the fan cookie is `Secure`. |

### 4.2 When you must redeploy

- **After any variable change.** Vercel applies variables to *new* deployments only.
- **`NEXT_PUBLIC_*` variables:** they are compiled into the JavaScript bundles at build time. The code reads each one as a literal `process.env.NEXT_PUBLIC_…` expression (in `lib/config.ts`, `lib/nft.ts`, `lib/contracts/animr-trade-guard.ts`, `app/layout.tsx` and `lib/og/theme.ts`), which Next replaces with the value, so only a new build changes them.
- **`HOUSE_CHOG_TOKEN_ID`:** this one is **server-only**, not `NEXT_PUBLIC_`. `lib/heist/config.ts` reads it lazily on the server. It still needs a redeploy for two reasons:
  - Vercel applies it only to new deployments.
  - `/guard` and the landing page `/` are prerendered at build time (Cache Components), so they only show the House Chog after a rebuild.

  The heist and Bell APIs pick it up in the same new deployment.

**How to redeploy:**

1. Open **Deployments**, then the newest Production deployment.
2. Choose **⋯ → Redeploy**.
3. **Untick "Use existing Build Cache"** and click **Redeploy**. It takes about 2–4 minutes.

A push to `main` also redeploys. Redeploys keep every Bell, ride and agent, because they live in Redis.

## 5. Crons

### 5.1 Vercel Cron (from `vercel.json`, nothing to set up)

| Path | Schedule (UTC) | Fires on Hobby | Does |
| --- | --- | --- | --- |
| `/api/bell/cron` | `0 15 * * *` | Any time from 15:00 to 15:59 | Rings today's Bell. A run before 15:01 waits out the 1-minute ring lag first. |
| `/api/bell/cron` | `0 16 * * *` | Any time from 16:00 to 16:59 | Settles yesterday's Bell, which becomes due at 15:10. |

- It's the same route twice. Each run does whatever is due: it fills in missing replays, settles any open Bell whose horizon has passed, and rings today's Bell from 15:01. It's idempotent and holds a lock, so a run that finds another one busy answers 409.
- Crons run **on production deployments only**. Vercel sends `Authorization: Bearer <CRON_SECRET>` by itself once `CRON_SECRET` is in the deployment.
- **Settings → Cron Jobs** lists both jobs, each with **View Logs**. Vercel never retries a failed run, and Hobby allows only daily jobs with ±59-minute timing. That's why the external pulse below exists.

### 5.2 External hourly pulse on cron-job.org

You create two jobs:

| Job | URL | Schedule (UTC) | Why |
| --- | --- | --- | --- |
| Animr Bell pulse | `<APP_URL>/api/bell/cron` | Minutes **1 and 11** of every hour (`1,11 * * * *`) | Rings at 15:01 sharp. Settles at 15:11 the next day. Catches up anything a late or missed run left behind. |
| Animr agent tick | `<APP_URL>/api/agent/tick` | Minute **30** of every hour (`30 * * * *`) | Every awake (claimed) agent thinks once: one 0G call each, about $0.002, so about $0.05 per agent per day with the Bell. Minute 30 stays clear of the 15:01 ring. |

To set them up:

1. Sign up at https://console.cron-job.org/signup (free) and confirm your email.
2. Go to **Cronjobs → Create cronjob**.
3. **Title:** `Animr Bell pulse`. **URL:** `https://<your production domain>/api/bell/cron`, with no trailing slash.
4. Turn on **Enable job** and **Save responses in job history**. You can then read each run's JSON.
5. **Execution schedule:** choose the custom schedule. Set the minutes to **1** and **11**, and every hour, day, month and weekday. If your console takes a crontab expression, use `1,11 * * * *`.
6. In the **Advanced** settings:
   - **Time zone:** `UTC`. Depending on the console version, this setting may sit next to the schedule instead.
   - **Request method:** `GET`.
   - **Headers:** add one with key `Authorization` and value `Bearer <CRON_SECRET>`: the word `Bearer`, one space, then the secret, with no quotes.
   - **Timeout:** the most it offers. That's 30 seconds on the free plan.
7. **Notifications:** turn on email on failure (after 3 failures in a row) and email when the job gets disabled automatically.
8. Save. Repeat steps 2–7 for `Animr agent tick` with `<APP_URL>/api/agent/tick` at minute `30`.
9. Run each job once, with the console's test run or with the curl commands in step 6. Expect HTTP 200 and a JSON body.

Good to know:

- The free plan waits 30 seconds, then logs a **timeout**. A 15:01 ring with claimed agents, or a busy agent tick, can take longer, but the run **still completes on Vercel**: Vercel only cancels a function when the caller hangs up if the project opts in (`supportsCancellation`), and Animr doesn't. To see whether a ring worked, check `/bell`, not the job log.
- cron-job.org disables a job after about 25 failures in a row. If the agent tick keeps timing out because many agents are awake, move it to a scheduler with a longer timeout, such as an Upstash QStash schedule or a GitHub Actions cron.

## 6. Post-deploy checks

Set two shell variables first. The secret prompt stays hidden, so nothing lands in your history:

```bash
APP=https://<your production domain>
read -rs CRON_SECRET   # paste the secret, press Enter
```

Then open each URL in an incognito window:

| URL | What you should see |
| --- | --- |
| `/` | **"Every Chog is an AI trader. Its traits are its strategy, and the $CHOG market keeps score."** Below it, the Meet, Rewind, Ride and Rob cards, and "Not affiliated with Chog" in the footer. The Rob card says the House Chog is moving in until step 8, and never says "live" before then. |
| `/app` | "Find any Chog's DNA, wallet and AI". Type `1820` or `CHOG #1312`. You get its trading DNA (archetype and League rank), today's Bell call, and the Chog's ERC-6551 wallet address with its $CHOG and MON balances. |
| `/league` | "The League": all 1,969 Chogs ranked against just holding $CHOG, labelled as simulated. **Random Chog** opens an unflagged Chog's Time Machine. |
| `/replay/1820` | "CHOG #1312 · token 1820" and its genome card. Press play: trades appear on the real hourly chart, and the run ends with its edge over holding, labelled "Simulated on real $CHOG candles (1% fee + impact)". |
| `/versus` | "Two Chogs. 48 hidden hours. Who stacks more $CHOG?" Pick one, watch the race, then the real dates appear, with points. **Share this bout** copies a `/versus/<id>` link. |
| `/bell` | "Every Chog calls $CHOG. The market settles it." Before Wed 15:01 it shows the latest **replayed** Bell (Oct 20, labelled as a replay). From 15:01 it shows today's **live** Bell: 1,969 calls and a ride button. Run command 3 below first: on a fresh deploy it builds the 14 replayed Bells in one go. Otherwise the first visit builds them and can take about 25 seconds; if it says the first Bell hasn't rung yet, reload a minute later. |
| `/heist` | "Rob this Chog". Until step 8 is done and the House Chog's wallet holds $CHOG, it says the House Chog is **moving in**: its AI already chats, but the mainnet check is off. After that, **Act as the AI** shows `NotAuthorized()` and `TradeRejected("buy-only vault")` at a pinned block. |
| `/guard` | "The AI can trade. It can never withdraw." It reads `0x92D3…987b` live: operator `0x2523…9cC2`, not paused, admin `0xc742…960C` once you've called `acceptAdmin()` (until then, the handover shows as pending). The House Chog card says moving in until step 8. |
| `/stats` | "Animr by the numbers". Counters start near zero, which is right for a fresh `production` namespace. |
| `/leaderboard` | "Live agents". Empty until someone wakes a Chog's AI on production. |
| `/api/dna/population` | JSON with `genomeVersion` `"g1-7de62b"`, 1,969 rows, a window label ending "(hourly, real CHOG/WMON)", and `stats` with `beatHoldPct`, `medianEdgePct`, `bestEdgePct` and `worstEdgePct`. |
| A share card | See command 2 below. The card is a 1200×630 PNG, and its URL must be on your production domain, not `localhost` and not a preview URL. |

```bash
# 1. Population: genome version, row count, window and headline stats
curl -s "$APP/api/dna/population" | jq '{genomeVersion, rows: (.rows|length), window: .window.label, stats}'

# 2. Share card: print the og:image URL, then fetch it (expect "200 image/png")
OG=$(curl -s "$APP/replay/1820" | grep -o 'og:image" content="[^"]*"' | head -1 | sed 's/.*content="//; s/"$//'); echo "$OG"
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' "$OG"
#    Do the same for "$APP/bell" and "$APP/league". To preview a card, paste the link into an X draft without posting it.

# 3. Cron routes: locked without the secret, open with it
curl -s "$APP/api/bell/cron"                                          # {"error":"Unauthorized."}
curl -s -H "Authorization: Bearer $CRON_SECRET" "$APP/api/bell/cron"   # first run: "replayed" and "settled" days; later: {} until something is due
curl -s -H "Authorization: Bearer $CRON_SECRET" "$APP/api/agent/tick"  # {"ran":0,"results":[]} until agents are claimed

# 4. Redis really holds production data. Copy the URL and token from Vercel → Settings → Environment Variables.
read -r REDIS_URL; read -rs REDIS_TOKEN
curl -s "$REDIS_URL" -H "Authorization: Bearer $REDIS_TOKEN" -d '["ZCARD","animr:production:bell:index"]'
#    {"result":14} after the first /bell visit or cron run, 15 once today's Bell has rung.
#    You can also open the Upstash console → Data Browser and search animr:production:*
```

**Wed Oct 21, before 15:00.** Wake the AI of any Chog you hold on production: it's one free signature on `/chog/<token id>`. The first live Bell then carries LLM calls, and `/leaderboard` isn't empty. Then open `/league`, `/traits`, `/bell` and `/heist` once to warm the caches.

**Wed Oct 21, 15:02–15:05.** Confirm the first live Bell:

```bash
curl -s "$APP/api/stats" | jq '.bell | {firstLiveDay, live, replayed}'   # firstLiveDay "2026-10-21", live 1 (cached up to a minute)
curl -s "$APP/api/bell/today" | jq '{day, kind, status, bullPct, bearPct, rideWindowClosesAt}'
```

If the Bell hasn't rung by 15:05, run `curl -s -H "Authorization: Bearer $CRON_SECRET" "$APP/api/bell/cron"`. Expect `{"rung":"2026-10-21"}`; with claimed agents it can take a few minutes.

**Thu Oct 22, 15:11.** The pulse should have settled the Bell. If `/bell/2026-10-21` doesn't say **settled**, run the same curl and expect `"settled":"2026-10-21"`.

## 7. Judges' view

- The production domain is public under Vercel's default Deployment Protection, which covers previews and deployment URLs only. Check `<APP_URL>` in an incognito window and on your phone.
- If an incognito visit to the production domain hits a Vercel login, the protection scope is **All Deployments** (a team default can set that). Switch it to **Standard Protection** under **Settings → Deployment Protection**.
- Fill `<APP_URL>` in `description.md`, `judge-instructions.md` and the social kit with the production domain only.

## 8. When the House Chog is bought

1. Find its **token ID** on the item page (for example 1820, which is "CHOG #1312"). `HOUSE_CHOG_TOKEN_ID=1312` or `#1312` would point at a different Chog.
2. In Vercel, add `HOUSE_CHOG_TOKEN_ID=<token id>` as Config for Production and Preview. Then **Redeploy without the build cache** (4.2).
3. Add the same line to `.env.local`, so the Purse script never pays the House Chog.
4. Set up the House Chog's wallet with the launch checklist (step 4, 4a–4g). After the redeploy:
   - `/guard` shows its wallet and its buy-only state.
   - `/chog/<token id>` shows its holder the buy-only switch.
   - `/heist` opens once its wallet is deployed and holds $CHOG.
5. Aim to finish before the freeze at Thu 00:00. A redeploy of the same commit is a configuration change, not a feature, but it has to happen before the heist recording on Thursday morning.

## 9. The Oracle Purse (Thu Oct 22, after the Bell settles)

Before you run it, check these:

- [ ] `/bell/2026-10-21` shows **settled**.
- [ ] The House key `0xbcfD…e259` holds at least `ORACLE_PURSE_CHOG` $CHOG plus at least 1 MON for gas.
- [ ] `.env.local` has `HOUSE_PRIVATE_KEY`, the same `ORACLE_PURSE_CHOG` as Vercel, `HOUSE_CHOG_TOKEN_ID` if it's set, and the **production** Redis credentials as `UPSTASH_REDIS_REST_URL`/`TOKEN` (step 3C).

```bash
cd /Users/mrnetwork/Animr
ANIMR_ENV=production JITI_TSCONFIG_PATHS=1 npx jiti scripts/send-oracle-purse.mts              # dry run: check the winner, wallet and amount
ANIMR_ENV=production JITI_TSCONFIG_PATHS=1 npx jiti scripts/send-oracle-purse.mts --broadcast  # send and record
```

One Purse per Bell: a re-run does nothing. The launch checklist (step 10) covers the posting rules.

## 10. Troubleshooting

**Redis missing: state is per instance.** Symptoms:

- Rides, points or fan cards vanish, or differ between refreshes.
- The Bell history rebuilds after quiet periods, and `/stats` numbers jump.
- The House Chog naps all day: without shared state the heist can't enforce its 0G budget, so it fails closed.
- Runtime logs show `[animr] No Upstash Redis configured: agent state lives in /tmp and will not persist.` or `[animr] heist: no Redis on Vercel …`.

The deployment has no complete Redis pair. Either it isn't connected, it's scoped to the wrong environment, its names carry a prefix, or it was added after the last deploy. Fix the names (3A, step 4), make sure Production is ticked, then redeploy. Command 4 in step 6 must then print a non-zero count.

**Cron routes answer 401.**

- `Set CRON_SECRET to enable this endpoint.` means this deployment has no `CRON_SECRET`. Add it for Production and redeploy.
- `Unauthorized.` means the header doesn't match exactly. It must be `Authorization: Bearer <secret>`: capital B, one space, and no quotes, spaces or newline around the secret.

**cron-job.org shows the Vercel login page, or a 401 HTML page.** It's calling a deployment URL. Use the production domain.

**409: "The Bell is busy ringing or settling."** Another run holds the lock, often Vercel's own cron. It's harmless, and the next run catches up.

**cron-job.org shows "Timeout".** See 5.2: the run keeps going on Vercel. Check `/bell`.

**The Bell hasn't rung by 15:05.** Run the cron curl, then look at **Logs** filtered to `/api/bell/cron` and run command 4 in step 6. A late ring on the same UTC day is still live.

**The Bell isn't settled after 15:10.** Settlement needs the 15:00 candle, fetched after 15:05. Run the curl again a few minutes later; Vercel's 16:00 cron and any `/bell` visit retry it too. If the pool had no trade between 14:00 and 15:00, the Bell settles on the last close once data fetched 2 hours later still shows none, so around 17:00.

**0G is napping.** Symptoms: "The House Chog is napping", template replies, or agents deciding without 0G receipts. The causes:

- **The heist's daily budget is spent** (`HEIST_DAILY_USD_CAP`, default $3). It resets at 00:00 UTC, and raising it needs a redeploy. **Act as the AI** still runs the full mainnet check while it naps.
- **The key is missing or wrong, or the account is out of credit.** Test the key with the command below. One call costs a fraction of a cent.
  ```bash
  read -rs ZG_API_KEY
  curl -s -w '\nHTTP %{http_code}\n' https://router-api.0g.ai/v1/chat/completions \
    -H "Authorization: Bearer $ZG_API_KEY" -H "Content-Type: application/json" \
    -d '{"model":"glm-5.3","messages":[{"role":"user","content":"Reply OK"}],"max_tokens":200}' | tail -c 400
  ```
  - `HTTP 200` means the key and the credit are fine.
  - `HTTP 401` means the wrong key: use a mainnet `sk-` key from pc.0g.ai.
  - Any other error: read the message. It's usually the balance. Promo credits only work in USD Billing mode (Dashboard → Billing).
- **The Router is slow or down.** That run falls back to the genome's rules, and the next one tries 0G again. If 0G is down at 15:01, the Bell still rings: claimed Chogs make their genome's call.

**Public RPC rate limits.** Symptoms:

- `/guard` shows read errors or blanks.
- The heist proof makes "no claim".
- `/app` balances keep spinning.

The public Monad RPC throttles bursts, and every server-side read comes from Vercel's shared IPs. Retry after a minute; the heist already caps proofs at 60 a minute across all visitors. If it persists, set `NEXT_PUBLIC_RPC_URL` and redeploy. You can use `https://rpc1.monad.xyz` (in viem's chain list), `https://rpc2.monad.xyz` (in `contracts/foundry.toml`), or a provider key restricted to your domain: the value ships to browsers.

**Share cards point at `localhost` or a preview domain.** Either `NEXT_PUBLIC_SITE_URL` is wrong or you're on a preview. Fix it or unset it, then redeploy.

**The build fails on `maxDuration`.** Fluid compute is off. Turn it on (**Settings → Functions**) and redeploy.

**The on-chain switch says "this server's AI operator is not the guard's operator".** `OPERATOR_PRIVATE_KEY` isn't the key of `0x2523…9cC2`. Fix it and redeploy.

**`/heist` still says "moving in" after step 8.** One of these:

- You haven't redeployed.
- The value is the "CHOG #" number instead of the token ID.
- The House Chog's wallet isn't deployed and initialized yet, or holds no $CHOG (launch checklist 4a–4e).

**You changed a variable and nothing changed.** Redeploy (4.2).

**The Purse script can't find a settled live Bell.** Either `ANIMR_ENV=production` is missing, or `.env.local` points at another database (`UPSTASH_*` wins over `KV_*`; see 3C).

**Chog images are missing.** The IPFS gateway throttles bursts. Reload.

## Appendix: Hall of Fame moderation

LLM-written replies stay hidden on the heist's wall until you approve them.

```bash
read -rs HEIST_ADMIN_SECRET
# Held replies waiting for review
curl -s -H "Authorization: Bearer $HEIST_ADMIN_SECRET" "$APP/api/heist/hall-of-fame" | jq '.entries[] | select(.review == "held") | {id, nickname, reply}'
# Approve one ("approved": false holds it again)
curl -s -X PATCH -H "Authorization: Bearer $HEIST_ADMIN_SECRET" -H "Content-Type: application/json" -d '{"id":"<id>","approved":true}' "$APP/api/heist/hall-of-fame"
# Remove one
curl -s -X DELETE -H "Authorization: Bearer $HEIST_ADMIN_SECRET" -H "Content-Type: application/json" -d '{"id":"<id>"}' "$APP/api/heist/hall-of-fame"
```
