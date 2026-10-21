# Launch checklist: owner actions, in order

All times are UTC. On-chain facts below were read from Monad mainnet on Mon Oct 19.

| Key date | |
| --- | --- |
| First live Bell | **Tue Oct 20, 15:00**, if production first runs after 00:00 on Oct 20 (step 5) |
| Feature freeze | **Thu Oct 22, 00:00** |
| Record the video | **Thu Oct 22**: heist, Meet, Rewind and Versus in the morning; the Bell and Purse after the Bell settles (about 15:10–16:00) |
| Submit | **Fri Oct 23, by 12:00** (the hard deadline is 15:00) |

Steps marked **You** need you: your wallet or your accounts. Steps marked **Agent** can be run by Claude once you've done the step before them.

---

## Already done on Monad mainnet (Oct 19): do not redo

- [x] **Hot wallets funded.** House `0xbcfD3a3846e39a687901EB77ed05F4E3CdC1e259`: 4.118 MON. Operator (the AI's key) `0x2523bBdD941783C4E565180D2a1b18DE86319cC2`: 8.0 MON.
- [x] **Pool oracle grown** by the House key (3 transactions): the CHOG/WMON pool's `observationCardinalityNext` is 1,801. The new slots fill as the ring wraps.
- [x] **AnimrTradeGuard deployed** at `0x92D3d4Af4B3b0F29Ec020e407803e135af61987b`: tx `0x8e731cd40fb102e05e484db12fdbd9d504e6ecda4d3654b2bc4683851ca78ee0`, block 114,783,301. `operator()` is `0x2523…9cC2` and `paused()` is `false`. It includes `setBuyOnly` and `isBuyOnly`.
- [x] **Source verified on Sourcify** (exact match), so Monadscan, MonadVision and Animr's `/guard` page show it.
- [x] **Admin handover started:** `transferAdmin(0xc742AdA2872a042dD36D2E706907b4036968960C)`, tx `0xad1d222b20e110d5141bf4a8285d14c1cdce1f60249d8d695efbeb3610886edc`. `pendingAdmin()` is `0xc742…960C`, and `admin()` is still the House key.

**Never run `DeployAnimrTradeGuard.s.sol` with `--broadcast` again.** It would deploy a second guard.

---

## Mon Oct 19 – Tue Oct 20 morning

### 1. You: accept the guard's admin role

- [ ] Confirm that `0xc742AdA2872a042dD36D2E706907b4036968960C` is your main wallet. If it isn't, tell the agent: the House key must call `transferAdmin` again with the right address.
- [ ] From `0xc742…960C`, call `acceptAdmin()` on the guard: Monadscan's "Write contract" tab, or `cast send 0x92D3d4Af4B3b0F29Ec020e407803e135af61987b "acceptAdmin()"`.
- [ ] **Agent:** check that `admin()` is `0xc742…960C`, `pendingAdmin()` is `0x0`, `operator()` is `0x2523…9cC2` and `paused()` is `false`. Then remove "handover pending" from ARCHITECTURE §8 and §9 and from README's Deploying step 3.

### 2. You: buy the House Chog

All five shortlisted Chogs are **unflagged** in `data/brand-safety.json`. OpenSea lists Chogs by their **"CHOG #" name**, not by token ID, so search by name:

| Token ID | Search OpenSea for | Notes |
| --- | --- | --- |
| 1820 | `CHOG #1312` | Crown, Side Eye |
| 1342 | `CHOG #834` | Epic, Diamond, Burning Aura |
| 241 | `CHOG #1702` | MEGA Chog, Knife |
| 616 | `CHOG #108` | Crown, Side Eye |
| 668 | `CHOG #160` | Crown, Royal Blue Aura |

- [ ] Buy whichever one is listed at the best price.
- [ ] On the item page, confirm that the token ID matches the table.
- [ ] Tell Claude the token ID.
- [ ] **Decide which wallet holds it.** That wallet signs the setup in step 4. We recommend your main wallet: if the hot House key ever leaked, it could not touch the House vault.

### 3. You (or the agent with the House key): buy the $CHOG and WMON

Nothing holds $CHOG yet: the House key and `0xc742…960C` both hold 0 $CHOG and 0 WMON.

| What | How much | Bought by | Goes to |
| --- | --- | --- | --- |
| The heist prize | `<HEIST_CHOG>` $CHOG (your call) | the wallet that holds the House Chog | the House Chog's TBA, in step 4e |
| WMON for the buy-only AI | `<HEIST_WMON>` WMON (wrap MON into WMON) | the same wallet | the House Chog's TBA, in step 4e |
| Oracle Purses | `ORACLE_PURSE_CHOG` per Purse (default 5,000 $CHOG) × at least 2 (the Bells that settle on Oct 21 and Oct 22) | **the House key**, which sends the Purses | stays on the House key until each send |

- [ ] Buy on the main CHOG/WMON pool (about $90K of liquidity), in a few small buys to keep slippage low.
- [ ] Keep at least 1 MON on the House key for Purse gas.
- [ ] Tell the agent the Purse amount. It goes into `ORACLE_PURSE_CHOG` (step 5) and replaces `<PURSE_AMOUNT>` in `description.md` and `go-to-market.md`.

### 4. You: set up the House Chog

Sign every step from the wallet that holds the House Chog, on `/chog/<token id>`.

- [ ] **4a. Create and initialize its wallet.** Click "Create the Chog's wallet". This is one Multicall3 transaction.
- [ ] **4b. Grant the guard.** Click "Let the guard trade". This sends `TBA.setPermissions([guard], [true])`.
- [ ] **4c. Configure the limits.** Click "Set your limits". The default is 10% per trade, 30% per day, 10 minutes between trades and 2% slippage. For a demo vault you can go more conservative.
- [ ] **4d. Turn on buy-only.** The House Chog's page shows its holder a buy-only switch once `HOUSE_CHOG_TOKEN_ID` is set on the server you use. Or send `cast send 0x92D3d4Af4B3b0F29Ec020e407803e135af61987b "setBuyOnly(address,bool)" <HOUSE_TBA> true` from the holder wallet.
- [ ] **4e. Deposit** the heist prize in $CHOG and the WMON from step 3 to the House Chog's TBA address. The heist only opens while that wallet holds $CHOG.
- [ ] **4f. Activate its AI.** Sign the free message on its page.
- [ ] **4g. Switch to on-chain.** Sign "Switch the AI to on-chain" on the same page.
- [ ] **Agent:** check that `guard.isBuyOnly(tba)` is `true` and that `guard.canTrade(tba, false, <small amount>)` returns `ok`. Write the House Chog into `<HOUSE_CHOG>` as "CHOG #n · token id". Run "Act as the AI" on `/heist`: it must show `NotAuthorized()` and `TradeRejected("buy-only vault")`.

### 5. You (accounts), then agent (values): Vercel, Upstash and environment variables

**When to go live decides the first live Bell.** Production rings today's Bell as **live** the first time anything triggers it after 15:01 (the cron, the hourly pulse or a page view), however late, and its ride window still closes at 03:00. So:
- **Recommended:** turn production on between 00:00 and 14:55 on **Tue Oct 20**. The first live Bell is then Oct 20, 15:00, with a full 12-hour ride window.
- If it goes up earlier, the Oct 19 Bell rings late and becomes the first live Bell.

Either way, `<FIRST_LIVE_BELL>` is filled from `GET /api/stats` (`bell.firstLiveDay`).

- [ ] **You:** create the Vercel project and an Upstash Redis database, and add the agent if you want it to set the values.
- [ ] Set these environment variables, then **redeploy**:
  - Public, which needs a rebuild after any change: `NEXT_PUBLIC_NETWORK=mainnet`, `NEXT_PUBLIC_SITE_URL=<APP_URL>`, `NEXT_PUBLIC_TRADE_GUARD_ADDRESS=0x92D3d4Af4B3b0F29Ec020e407803e135af61987b`
  - Server: `ZG_API_KEY`, `CRON_SECRET`, `OPERATOR_PRIVATE_KEY` (the operator key only), `OPERATOR_ADDRESS`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `HOUSE_CHOG_TOKEN_ID`, `HEIST_ADMIN_SECRET`, `HEIST_IP_SALT`, `ORACLE_PURSE_CHOG`, and optionally `HEIST_DAILY_USD_CAP` (default 3)
- [ ] **Never put `HOUSE_PRIVATE_KEY` on Vercel.** It stays local, for scripts and Purse sends only.
- [ ] Check that the 0G account has credit (pc.0g.ai, USD Billing mode for promo credits).

### 6. Agent: external hourly pulse

Vercel Hobby only runs daily crons.

- [ ] Set up an external hourly call to `GET <APP_URL>/api/bell/cron` with the header `Authorization: Bearer <CRON_SECRET>`, using cron-job.org, a GitHub Action or Upstash QStash. The route is idempotent and catches up any ring or settlement that's due.
- [ ] Optional: the same for `GET <APP_URL>/api/agent/tick`, so awake agents think between Bells. This multiplies LLM spend by up to 24.

### 7. You: moderation secret

- [ ] Keep `HEIST_ADMIN_SECRET` somewhere safe. Hall of Fame replies written by the LLM stay hidden until you approve them with it.

### 8. You: start collecting feedback (from Oct 20)

- [ ] Share `<APP_URL>` in the Chog community (Discord, X) and ask holders and fans to try it.
- [ ] Collect **3–5 dated quotes** from Chog holders or testers, with permission to quote them, and note **one change made because of the feedback**. These fill `<FEEDBACK>` in `description.md` (the form asks for "user feedback or usage you've gathered").

---

## Agent: integration pass, before the freeze (Thu Oct 22, 00:00)

These are code items. The docs already describe the code as it is today.

- [x] **Fix the two oracle-state tests.** Done Oct 19: 37 passed, 0 failed, 0 skipped against live mainnet (README and ARCHITECTURE updated). Keep the `forge test` shot in the video.
- [ ] **Wagering words in the app:** `lib/dna/genome.ts:79` ("Royal bets", "Standard bets") and `:710` ("I bet the other way"). Use trading words, such as "Big trades", "Standard trades" and "I trade the other way". Check that `GENOME_VERSION` stays `g1-7de62b`. If it changes, update every doc and the video captions.
- [ ] **`.env.example`:** add `HOUSE_CHOG_TOKEN_ID`, `OPERATOR_ADDRESS`, `HEIST_DAILY_USD_CAP`, `HEIST_ADMIN_SECRET`, `HEIST_IP_SALT`, `ORACLE_PURSE_CHOG` and `ZG_VERIFY_TEE`. They are read by the code and documented only in README.
- [ ] Optional: the Time Machine header says "Chog #2's trading DNA" by token ID. Use `chogLabel()` so it reads "CHOG #1463 · token 2", like the genome card.
- [ ] Optional (your call): a license for the app code (for example, a root `LICENSE` with MIT). Then update README's License section.

---

## Tue Oct 20

### 9. 15:00: the first live Bell

- [ ] **At 15:02**, `/bell` shows today's Bell as **live**, with 1,969 calls. Claimed agents' calls are marked as made by their 0G brain.
- [ ] If it hasn't rung by 15:05, call the cron URL by hand with the secret.
- [ ] Post the Bell at 15:00, then remind people when the ride window closes at 03:00.
- [ ] **Smoke test:** run "Act as the AI" on `/heist`. You should see `NotAuthorized()` and `TradeRejected("buy-only vault")`.

## Wed Oct 21

### 10. About 15:10–16:00: the first settlement and the first Oracle Purse

- [ ] `/bell/<FIRST_LIVE_BELL>` shows **settled**, and its Oracle card shows the Purse "on its way" with the winner's token ID.
- [ ] **The Purse rule:** the winner is the Oracle of the Day the Bell page shows, the best call among featured Chogs. When that is the House Chog or a Chog its holder hid, the next-closest call among the rest wins. Season records still credit the true best call.
- [ ] **Agent, with the House key:** dry run `ANIMR_ENV=production JITI_TSCONFIG_PATHS=1 npx jiti scripts/send-oracle-purse.mts`, check the winner and amount it prints, then run it again with `--broadcast`. It needs `HOUSE_PRIVATE_KEY` and the production Upstash credentials locally. It sends `ORACLE_PURSE_CHOG` $CHOG to the winner's TBA and records the transfer, so the Bell page shows the transaction. One Purse per Bell: a re-run does nothing. Tokens sent to a TBA that isn't deployed yet still arrive, because the address is counterfactual.
- [ ] Post the Oracle of the Day and the Purse transaction. Don't tag holders, and leave Most Rekt out of posts.

## Thu Oct 22

### 11. 00:00: feature freeze

- [ ] After the freeze, only copy edits and filling placeholders.

### 12. Record the video, in two sessions (`submission/video-script.md`)

- [ ] **Morning, soon after 00:00** (the heist's $3 0G budget has just reset): heist, Meet, Rewind, Versus and `/stats`. Read `/api/dna/population` and write down the window, `beatHoldPct`, `medianEdgePct` and `bestEdgePct`.
- [ ] **About 15:10–16:00:** `/bell/2026-10-21` (or the second live Bell) shows **settled**. Send Oracle Purse #2 with the same script (step 10), then record the Bell and Purse scenes.
- [ ] Caption every Chog on screen as "CHOG #n · token id", keep flagged Chogs off screen, and take every number from the live app.

### 13. Evening: fill the placeholders

- [ ] Fill in every placeholder:
  - `<APP_URL>` and `<VIDEO_URL>`
  - `<REPO_URL>`: push the repo; if it's private, invite the reviewer account the form asks for
  - `<HOUSE_CHOG>` and `<CONTACT>` (in `judge-instructions.md`)
  - `<FIRST_LIVE_BELL>` from `GET /api/stats` (`bell.firstLiveDay`)
  - `<PURSE_AMOUNT>` from `ORACLE_PURSE_CHOG`
  - `<WINDOW>`, `<BEAT_HOLD_PCT>`, `<MEDIAN_EDGE>` and `<BEST_EDGE>` in `description.md`: the values you wrote down at recording time, so the description matches the video. Refresh the snapshot in ARCHITECTURE §4 with the same values and time.
  - `<STATS>` from `/stats`: fans, rides, return visits, Versus picks, heist attempts and caves, claimed agents, 0G spend. Keep it under 400 characters.
  - `<FEEDBACK>` from step 8. Keep it under 800 characters.
- [ ] If the House Chog isn't live, change "The House Chog is `<HOUSE_CHOG>`, buy-only and holding real $CHOG" in `description.md` to say it is launching, and keep "launching" in README and ARCHITECTURE.
- [ ] Re-check the character counts. The limits are 8,000 for the description, 8,000 for the judge instructions, 200 for the tech stack and 8,000 for the go-to-market plan. Before filling, the description is 6,463 characters, so placeholders and URLs have about 1,500 characters of room.

## Fri Oct 23

### 14. By 12:00: submit on the chogathon.chog.xyz dashboard

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
