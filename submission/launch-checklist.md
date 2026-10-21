# Launch checklist: owner actions, in order

All times are UTC. On-chain facts below were read from Monad mainnet on Mon Oct 19 and re-checked on Wed Oct 21 (block 115,210,769).

| Key date | |
| --- | --- |
| First live Bell | **Wed Oct 21, 15:00**, if production is up before then (step 5) |
| Feature freeze | **Thu Oct 22, 00:00** |
| First settlement and Oracle Purse | **Thu Oct 22, from about 15:10** (step 10) |
| Record the video | **Thu Oct 22**: heist, Meet, Rewind and Versus in the morning; the Bell and Purse once the Bell has settled and the Purse is sent (from about 15:10) |
| Submit | **Fri Oct 23, by 12:00** (the hard deadline is 15:00) |

Steps marked **You** need you: your wallet or your accounts. Steps marked **Agent** can be run by Claude once you've done the step before them. You deploy Vercel yourself, by hand: no agent deploys.

---

## Already done on Monad mainnet: do not redo

- [x] **Hot wallets funded** (Oct 19). House `0xbcfD3a3846e39a687901EB77ed05F4E3CdC1e259`: 4.118 MON. Operator (the AI's key) `0x2523bBdD941783C4E565180D2a1b18DE86319cC2`: 8.0 MON.
- [x] **Pool oracle grown** by the House key (3 transactions, Oct 19): the CHOG/WMON pool's `observationCardinalityNext` is 1,801. The new slots fill as the ring wraps.
- [x] **AnimrTradeGuard deployed** at `0x92D3d4Af4B3b0F29Ec020e407803e135af61987b`: tx `0x8e731cd40fb102e05e484db12fdbd9d504e6ecda4d3654b2bc4683851ca78ee0`, block 114,783,301. It includes `setBuyOnly` and `isBuyOnly`, an optional owner toggle.
- [x] **Source verified on Sourcify** (exact match), so Monadscan, MonadVision and Animr's `/guard` page show it.
- [x] **Admin accepted.** `transferAdmin(0xc742AdA2872a042dD36D2E706907b4036968960C)` (tx `0xad1d222b20e110d5141bf4a8285d14c1cdce1f60249d8d695efbeb3610886edc`), then `acceptAdmin()` from your main wallet. Read on Oct 21: `admin()` is `0xc742…960C`, `pendingAdmin()` is `0x0`, `operator()` is `0x2523…9cC2` and `paused()` is `false`.
- [x] **House Chog bought:** token **1399**, "CHOG #891" on OpenSea, held by your main wallet `0xc742…960C`. Its Tokenbound wallet will be `0xa46aE2364eDa19C7d8fCe7F5878C93E50aB2AD71`, the registry's address for token 1399 (not deployed yet on Oct 21).
- [x] **$CHOG bought:** your main wallet holds about 24,550 $CHOG (Oct 21), enough for the House Chog's wallet and the Purses (step 3).

**Never run `DeployAnimrTradeGuard.s.sol` with `--broadcast` again.** It would deploy a second guard.

---

## Mon Oct 19 – Wed Oct 21, before 15:00

### 1. You: accept the guard's admin role (done)

- [x] `0xc742AdA2872a042dD36D2E706907b4036968960C` is your main wallet, and it called `acceptAdmin()`.
- [x] **Agent:** `admin()` is `0xc742…960C`, `pendingAdmin()` is `0x0`, `operator()` is `0x2523…9cC2` and `paused()` is `false`. README (Deploying, step 3) and ARCHITECTURE §8 and §9 no longer say the handover is pending.

### 2. You: buy the House Chog (done)

- [x] Token **1399**, "CHOG #891" on OpenSea, bought into your main wallet, which signs the setup in step 4. If the hot House key ever leaked, it could not touch the House vault.
- [x] Brand check: it is unflagged in `data/brand-safety.json`, and every trait shows as it is: Round Crying eyes, Japan Headband, Yellow Yukata, Rainbow Puke mouth, Lemon Yellow background.
- [x] Its genome makes it *Paper Paws*: aggressive, with the "Panic seller" signal from its Round Crying eyes. The story line: Paper Paws was born to panic-sell; its mandate makes it buy the dip instead.
- [x] `HOUSE_CHOG_TOKEN_ID=1399`: always the token ID, never the "CHOG #" number 891.

### 3. You: fund the House Chog and the House key

| What | How much | Goes to | Status |
| --- | --- | --- | --- |
| The House Chog's $CHOG: what its AI trades, and what the heist dares visitors to take | about 15,000 $CHOG | the House Chog's TBA `0xa46a…AD71`, in step 4e | bought: it's on your main wallet |
| WMON, so its AI can buy dips | about 1,000 WMON (wrap MON into WMON) | the same TBA, in step 4e | to do: the main wallet holds 0 WMON |
| Oracle Purses | about 9,500 $CHOG in all, `ORACLE_PURSE_CHOG` per Purse | **the House key** `0xbcfD…e259`, which sends the Purses | to do: the House key holds 0 $CHOG |

- [x] $CHOG bought on the main CHOG/WMON pool.
- [ ] Wrap about 1,000 MON into WMON on your main wallet.
- [ ] Send about 9,500 $CHOG to the House key. Keep at least 1 MON on it for Purse gas (it holds 4.118).
- [ ] Tell the agent the Purse amount. It goes into `ORACLE_PURSE_CHOG` (step 5) and replaces `<PURSE_AMOUNT>` in `description.md` and `go-to-market.md`.

### 4. You: set up the House Chog (token 1399)

Sign every step from your main wallet `0xc742…960C`, on `/chog/1399`. **Buy-only stays off:** the House Chog trades two-way.

- [ ] **4a. Create and initialize its wallet.** Click "Create the Chog's wallet". This is one Multicall3 transaction, and it deploys `0xa46aE2364eDa19C7d8fCe7F5878C93E50aB2AD71`.
- [ ] **4b. Grant the guard.** Click "Let the guard trade". This sends `TBA.setPermissions([guard], [true])`.
- [ ] **4c. Configure the limits.** Click "Set your limits": 10% per trade, 30% per day, 10 minutes between trades and 2% slippage (the defaults).
- [ ] **4d. Leave buy-only off.** It is an optional owner toggle (`setBuyOnly`), and the House Chog's mandate needs its sells into sharp pumps. If the page offers a buy-only switch, don't turn it on. On Oct 21, `guard.isBuyOnly(0xa46a…AD71)` reads `false`.
- [ ] **4e. Deposit** about 15,000 $CHOG and about 1,000 WMON from step 3 to `0xa46aE2364eDa19C7d8fCe7F5878C93E50aB2AD71`. The heist only opens while that wallet holds $CHOG.
- [ ] **4f. Wake its AI.** Sign the free message on its page.
- [ ] **4g. Switch to on-chain.** Sign "Switch the AI to on-chain" on the same page.
- [ ] **Agent:** check that the TBA is `ready` and holds $CHOG and WMON, that `guard.isBuyOnly(tba)` is `false` and that `guard.canTrade(tba, false, <small amount>)` returns `ok`. Run "Act as the AI" on `/heist`: it must show `NotAuthorized()` for the AI key's transfer and the owner's control call going through.
- [ ] **First real guarded trade.** The House Chog trades when it thinks (at the Bell, and at each agent tick if step 6's optional pulse is on) and its mandate calls for a trade. **Agent:** note the transaction for the video, and check that the swap's output landed back in `0xa46a…AD71`.

### 5. You: Vercel, Upstash and environment variables (deploy by hand, before 15:00 on Wed Oct 21)

Follow [`DEPLOY.md`](DEPLOY.md) step by step. You run every step yourself. The House Chog is already bought, so set `HOUSE_CHOG_TOKEN_ID=1399` in this first deploy. Where DEPLOY.md gives an example token ID (such as `1820`) or says it comes later, use `1399` now. Where it mentions buy-only for the House Chog, leave buy-only off (step 4d).

**When to go live decides the first live Bell.** Production rings today's Bell as **live** the first time anything triggers it after 15:01 (the cron, the hourly pulse or a page view), however late, and its ride window still closes at 03:00. So:
- **Plan:** production up by about 14:30 on **Wed Oct 21**. The first live Bell is then Oct 21, 15:00, with a full 12-hour ride window, and it settles on Thu Oct 22 from 15:10, before you submit.
- If production goes up after 15:00 on Oct 21, the Oct 21 Bell still rings as live, but late: its calls count from that later price.
- If production first runs on Oct 22, no live Bell settles before submission.

`<FIRST_LIVE_BELL>` should then be `2026-10-21`. Confirm it with `GET /api/stats` (`bell.firstLiveDay`).

- [ ] **You:** create the Vercel project and an Upstash Redis database.
- [ ] Set these environment variables, then **redeploy**:
  - Public, which needs a rebuild after any change: `NEXT_PUBLIC_NETWORK=mainnet`, `NEXT_PUBLIC_SITE_URL=<APP_URL>`, `NEXT_PUBLIC_TRADE_GUARD_ADDRESS=0x92D3d4Af4B3b0F29Ec020e407803e135af61987b`
  - Server: `ZG_API_KEY`, `CRON_SECRET`, `OPERATOR_PRIVATE_KEY` (the operator key only), `OPERATOR_ADDRESS`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `HOUSE_CHOG_TOKEN_ID=1399`, `HEIST_ADMIN_SECRET`, `HEIST_IP_SALT`, `ORACLE_PURSE_CHOG`, and optionally `HEIST_DAILY_USD_CAP` (default 3)
- [ ] **Never put `HOUSE_PRIVATE_KEY` on Vercel.** It stays local, for scripts and Purse sends only.
- [ ] Check that the 0G account has credit (pc.0g.ai, USD Billing mode for promo credits).

### 6. You: external hourly pulse (cron-job.org)

Vercel Hobby only runs daily crons.

- [ ] Set up an external hourly call to `GET <APP_URL>/api/bell/cron` with the header `Authorization: Bearer <CRON_SECRET>` on cron-job.org (DEPLOY.md step 5.2 has the schedule). The route is idempotent and catches up any ring or settlement that's due.
- [ ] Optional: the same for `GET <APP_URL>/api/agent/tick`, so awake agents think between Bells. On-chain agents like the House Chog think only on schedule, so without it the House Chog thinks once a day, at the Bell. This multiplies LLM spend by up to 24.

### 7. You: moderation secret

- [ ] Keep `HEIST_ADMIN_SECRET` somewhere safe. Hall of Fame replies written by the LLM stay hidden until you approve them with it.

### 8. You: start collecting feedback (as soon as production is up)

- [ ] Share `<APP_URL>` in the Chog community (Discord, X) and ask holders and fans to try it.
- [ ] Collect **3–5 dated quotes** from Chog holders or testers, with permission to quote them, and note **one change made because of the feedback**. These fill `<FEEDBACK>` in `description.md` (the form asks for "user feedback or usage you've gathered").

---

## Agent: integration pass, before the freeze (Thu Oct 22, 00:00)

These are code items.

- [x] **Fix the two oracle-state tests.** Done Oct 19: 37 passed, 0 failed, 0 skipped against live mainnet (README and ARCHITECTURE updated). Keep the `forge test` shot in the video.
- [x] **Wagering words in the app.** `lib/dna/genome.ts` now says "Big trades", "Standard trades" and "I trade the other way", and `GENOME_VERSION` is still `g1-7de62b`.
- [x] **`.env.example`** lists `HOUSE_CHOG_TOKEN_ID`, `OPERATOR_ADDRESS`, `HEIST_DAILY_USD_CAP`, `HEIST_ADMIN_SECRET`, `HEIST_IP_SALT`, `ORACLE_PURSE_CHOG` and `ZG_VERIFY_TEE`.
- [x] Optional: the Time Machine header uses `chogLabel()`, so it reads "CHOG #1463 · token 2", like the genome card.
- [ ] **The House Chog's two-way mandate** (in progress): the code-level rule that blocks real-money sells into dips, and the app's House Chog copy (the landing page, `/heist`, `/guard` and its `/chog` page) moving from buy-only to two-way. Then "Act as the AI" shows the theft attempt refused with `NotAuthorized()`, and a guarded sell as allowed, staying in the same wallet.
- [ ] Optional (your call): a license for the app code (for example, a root `LICENSE` with MIT). Then update README's License section.

---

## Wed Oct 21

### 9. 15:00: the first live Bell

- [ ] **At 15:02**, `/bell` shows today's Bell as **live**, with 1,969 calls. Claimed agents' calls are marked as made by their 0G brain.
- [ ] If it hasn't rung by 15:05, call the cron URL by hand with the secret.
- [ ] Post the Bell at 15:00, then remind people when the ride window closes at 03:00.
- [ ] **Smoke test** (once step 4 is done): run "Act as the AI" on `/heist`. You should see `NotAuthorized()` for the AI key's transfer and the owner's control call going through. Until the House Chog's wallet holds $CHOG, the page says it is still moving in.

## Thu Oct 22

**00:00: feature freeze.** After the freeze, only copy edits and filling placeholders.

### 10. From about 15:10: the first settlement and the first Oracle Purse

- [ ] `/bell/2026-10-21` shows **settled**, and its Oracle card shows the Purse "on its way" with the winner's token ID.
- [ ] **The Purse rule:** the winner is the Oracle of the Day the Bell page shows, the best call among featured Chogs. When that is the House Chog or a Chog its holder hid, the next-closest call among the rest wins. Season records still credit the true best call.
- [ ] **Agent, with the House key:** dry run `ANIMR_ENV=production JITI_TSCONFIG_PATHS=1 npx jiti scripts/send-oracle-purse.mts`, check the winner and amount it prints, then run it again with `--broadcast`. It needs `HOUSE_PRIVATE_KEY` and the production Upstash credentials locally. It sends `ORACLE_PURSE_CHOG` $CHOG to the winner's TBA and records the transfer, so the Bell page shows the transaction. One Purse per Bell: a re-run does nothing. Tokens sent to a TBA that isn't deployed yet still arrive, because the address is counterfactual.
- [ ] Post the Oracle of the Day and the Purse transaction. Don't tag holders, and leave Most Rekt out of posts.

### 11. Record the video, in two sessions (`submission/video-script.md`)

- [ ] **Morning, soon after 00:00** (the heist's $3 0G budget has just reset): heist, Meet, Rewind, Versus, `/stats` and the House Chog's guarded trade. Read `/api/dna/population` and write down the window, `beatHoldPct`, `medianEdgePct` and `bestEdgePct`.
- [ ] **From about 15:10, after step 10:** `/bell/2026-10-21` shows **settled** and the Purse is on the explorer. Record the Bell and Purse scenes.
- [ ] Caption every Chog on screen as "CHOG #n · token id" (the House Chog is "CHOG #891 · token 1399"), keep flagged Chogs off screen, and take every number from the live app.

### 12. Evening: fill the placeholders

- [ ] Fill in every placeholder:
  - `<APP_URL>` and `<VIDEO_URL>`
  - `<REPO_URL>`: push the repo; if it's private, invite the reviewer account the form asks for
  - `<CONTACT>` (in `judge-instructions.md`)
  - `<FIRST_LIVE_BELL>` from `GET /api/stats` (`bell.firstLiveDay`)
  - `<PURSE_AMOUNT>` from `ORACLE_PURSE_CHOG`
  - `<WINDOW>`, `<BEAT_HOLD_PCT>`, `<MEDIAN_EDGE>` and `<BEST_EDGE>` in `description.md`: the values you wrote down at recording time, so the description matches the video. Refresh the snapshot in ARCHITECTURE §4 with the same values and time.
  - `<STATS>` from `/stats`: fans, rides, return visits, Versus picks, heist attempts and caves, claimed agents, 0G spend. Keep it under 400 characters.
  - `<FEEDBACK>` from step 8. Keep it under 800 characters.
- [ ] **The House Chog's label.** Once its wallet holds real $CHOG and its first guarded trade has landed, remove "*launching*" from README (the House Chog paragraph and "What's real") and from ARCHITECTURE §6 and §10. If it isn't live by then, change its line under WHAT'S LIVE in `description.md` ("The House Chog, CHOG #891 (token 1399), trading its own real $CHOG through the guard") to say it is launching, and keep "launching" in README and ARCHITECTURE.
- [ ] Re-check the character counts. The limits are 8,000 for the description, 8,000 for the judge instructions, 200 for the tech stack and 8,000 for the go-to-market plan. Before filling, the description is 6,618 characters, so placeholders and URLs have about 1,380 characters of room: `<STATS>` and `<FEEDBACK>` at full length leave about 180 for the URLs and numbers.

## Fri Oct 23

### 13. By 12:00: submit on the chogathon.chog.xyz dashboard

| Form field | Source |
| --- | --- |
| Project name | Animr |
| Description | `submission/description.md` |
| Demo video | `<VIDEO_URL>` |
| App link | `<APP_URL>` |
| GitHub repo | `<REPO_URL>` |
| Judge access instructions | `submission/judge-instructions.md` |
| Tech stack | `submission/tech-stack.txt` |
| Go-to-market plan | `submission/go-to-market.md` |

- [ ] After submitting, open the app link and the video link in an incognito window.
