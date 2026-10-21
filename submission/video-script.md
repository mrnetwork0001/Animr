# Demo video: 3:00 storyboard

**Target:** 2:55 (the hard limit is 3:00). 1080p, YouTube unlisted (or a Google Drive link set to "anyone with the link").
**Thesis, said once at the start and once at the end:** *Every Chog is an AI trader: its traits are its strategy, and the $CHOG market keeps score.*
**Rule:** every number on screen and in the voice-over is read from the live app at recording time. Values in `{braces}` are filled in on the day.

## Storyboard

| Time | On screen (action) | Caption (burned in) | Voice-over |
| --- | --- | --- | --- |
| **0:00–0:10** | Landing page hero. Slow scroll past a row of real Chog art. | "1,969 Chogs. 1,969 traders." | "There are 1,969 Chogs. Every one of them is already a trader. Its traits are its strategy, and the $CHOG market keeps score." |
| **0:10–0:14** | Title card: **Meet · Rewind · Ride · Rob**, plus "No wallet needed". | "Meet · Rewind · Ride · Rob" | "Four things you can do. No wallet needed." |
| **0:14–0:38** · MEET | `/league` → press **Random Chog** (pre-checked: an unflagged Chog). Its page opens. Zoom in on the genome card, then hover two genes so the trait that set each one lights up. | "CHOG #{n} · token {id}" · "13 traits → 8 genes · genome g1-7de62b" | "Meet a random Chog. Its 13 on-chain traits compile into a trading genome. Laser eyes chase breakouts, side-eyes fade the crowd, crowns trade big, beanies nibble. Same traits, same trader. The strategy *is* the NFT." |
| **0:38–1:00** · REWIND | Press play in the Time Machine: trades pop on the real chart with one-line thoughts. The final value appears against the "just holding" line. Cut to `/replay/2?vs=8`, two Chogs racing on the same candles. | "Simulated on real $CHOG candles (1% fee + impact)" · "CHOG #1463 · token 2 vs CHOG #1469 · token 8" | "Rewind it over real hourly $CHOG candles, fees and price impact included. One metric: $CHOG stacked versus just holding. Most Chogs lose to holding: only {beatHoldPct}% beat it over the last 45 days. That's what makes the winners worth finding." |
| **1:00–1:18** · VERSUS | `/versus`: two Chogs, the window labelled "48 hours of real $CHOG history". Call one. Fast-forward the race. **Reveal** the real dates. *(Fallback: the `/replay/2?vs=8` race.)* | "Hidden window · real history" · "Points only" | "Versus: two Chogs, a hidden 48 hours of real $CHOG history. Call the one that stacks more $CHOG, watch them race, then see which days it really was." |
| **1:18–1:45** · RIDE | `/bell`, the **settled** Bell of {Oct 21}: the real move, the herd against reality, the **Oracle of the Day** and **Most Rekt**. Show your fan card's ride and its points. Cut to the explorer: the **Oracle Purse** transfer of {X} $CHOG into the Oracle's ERC-6551 wallet. | "Every day at 15:00 UTC" · "Settled by the real price 24h later" · "Points have no cash value" | "Every day at 15:00 UTC, all 1,969 Chogs call $CHOG's next 24 hours. Fans ride the Chog they trust: no wallet, just points. A day later the market settles it. And the Oracle of the Day gets a reward of real $CHOG, sent into its own wallet. It belongs to the NFT, not to the fans." |
| **1:45–2:18** · ROB | `/heist`, the House Chog card (CHOG #891 · token 1399, real $CHOG balance, explorer link). Type a con (rehearsed). The AI caves: "Fine, take it." The verdict animates: **AI said YES. Monad said NO.** Highlight the theft attempt: the AI key's transfer out of the wallet failing with `NotAuthorized()` from Tokenbound, the block number, and the owner's control call passing. | "CHOG #891 · token 1399 · real $CHOG · Monad mainnet · block {N}" · "Simulated with eth_call · never broadcast" | "Now rob one. Our House Chog, Paper Paws, keeps real $CHOG in its own wallet on Monad, and anyone can try to talk its AI into handing it over. *(beat)* It caved. So we simulate the exact transfer from the AI's own key against live mainnet. The wallet says: not authorized. The owner's same call goes through. The AI can be fooled. The NFT can't." |
| **2:18–2:44** · REAL TRADES · WHY THE NFT | `/chog/{id}` (a team Chog): "Create the Chog's wallet" (one transaction), "Claim its AI" (signature), its feed with a **0G receipt** (provider, request ID, cost). Quick cut: the five-step guard setup. Cut to the explorer: the House Chog's latest guarded trade (`{tx}`), a swap capped at 10% per trade whose output lands back in the same wallet `0xa46a…AD71`. Quick cut: terminal showing the `forge test` summary line, **only if it shows no failures** (otherwise cut this shot). *(Fallback, if the House Chog hasn't traded yet: its wallet on the explorer with its $CHOG and WMON, and cut "in capped trades that land back in its own wallet" from the voice-over.)* | "No NFT → no trader, no wallet, no authority" · "glm-5.3 on 0G Compute · ≈ $0.002 per decision" · "Real guarded trade · lands back in the same wallet" | "Holders give their Chog an LLM brain on 0G Compute, with a receipt for every decision. Real trades go through our guard. Paper Paws was born to panic-sell; its mandate makes it buy the dip instead, in capped trades that land back in its own wallet. The AI can trade, but never withdraw. Sell the NFT, and the trader and its wallet go with it." |
| **2:44–2:55** | `/stats` counters (fans, rides, return visits, Versus picks, heist attempts, AI spend), then the end card: logo, **Meet · Rewind · Ride · Rob**, `useanimr.vercel.app`. *(Fallback: the Bell's standings and the heist's counters.)* | "{fans} fans · {rides} rides · {heists} heist attempts" · "Not affiliated with Chog" | "Every Chog is an AI trader. Meet one, rewind it, ride it, or try to rob it. Animr." |

## B-roll (record extra and cut as needed)

- Landing page scroll: hero, Trait DNA, Daily Bell and Safety sections.
- League table scrolling, a filter by trait, and the "Claimed" badge.
- Trait Alpha bars (`/traits`).
- The Time Machine at 2× speed on two different Chogs (pick unflagged ones).
- The Bell's histogram of calls and the herd-vs-reality bar, plus a past Bell page (`/bell/{day}`).
- The ride flow on a phone (portrait, 390 px wide).
- The heist's "Why it's safe" panel and the Hall of Fame.
- On the explorer:
  - the House Chog's wallet `0xa46aE2364eDa19C7d8fCe7F5878C93E50aB2AD71` with its $CHOG and WMON, and a guarded trade landing back in it
  - the guard contract `0x92D3d4Af4B3b0F29Ec020e407803e135af61987b`
  - the Oracle Purse transfer
- The 0G receipt in a decision feed.
- The judge tour (`/tour`) stepping through its first three steps.
- `/breed`: two unflagged Chogs and their child racing the same chart.
- A settled Bell's AI recap (`/bell/{day}/recap`).
- A Chog's trophy cabinet on `/chog/{id}` (once a trophy has been minted), and an "Ask this Chog" answer.
- `/market`: "Best traders for sale", live OpenSea listings ranked by League edge.
- The header's live badges (Bell countdown, heist attempts) and the Privy "Log in" modal.
- `forge test --fork-url https://rpc.monad.xyz` running, ending on its summary line: 49 tests (AnimrTradeGuard 37, AnimrTrophies 12). On Oct 21 it shows 0 failures, with one guard test (`test_TwapUnavailableFailsClosed`) skipped by design now that the pool's grown oracle is live. Use it only if the summary shows no failures.

## Recording checklist

**Timing: two sessions on Thu Oct 22**
- [ ] **Morning, soon after 00:00 UTC:** the heist (the $3 daily 0G budget has just reset, so the House Chog isn't "napping"), then Meet, Rewind, Versus, `/stats` and the House Chog's latest guarded trade on the explorer. Read `https://useanimr.vercel.app/api/dna/population` once (`window.label`, `stats.beatHoldPct`, `stats.medianEdgePct`, `stats.bestEdgePct`) and use the same values in the voice-over and in `description.md`. `description.md` currently carries a snapshot from Oct 21, 13:06 UTC (45 days to Oct 21: 38% beat holding, median −4.0%, best +55.3%); update it if the recording-day numbers differ. Don't plan on raising `HEIST_DAILY_USD_CAP`: that needs a redeploy after the freeze.
- [ ] **After the first live Bell (Oct 21) settles, from about 15:10 UTC:** the Bell and Purse scenes. It settles on the 15:00 close of Oct 22: the hourly pulse writes it at 15:11, and the 16:00 UTC cron or any `/bell` visit retries. Confirm `/bell` shows it as **settled** and the Purse transfer is on the explorer before you start.
- [ ] **Fallbacks, so the 2:55 cut works either way:** the `/replay/2?vs=8` race instead of Versus, and the Bell's standings plus the heist's counters instead of `/stats`.

**Setup**
- [ ] Use the production URL `https://useanimr.vercel.app`, never localhost, in a clean browser profile with no extensions or bookmarks bar, at 1920×1080 and 110–125% zoom.
- [ ] Pre-warm the pages: open `/league`, `/traits`, `/bell` and `/heist` once, so the League computation and IPFS images are cached.
- [ ] The House Chog (CHOG #891 · token 1399) is set up: its TBA `0xa46a…AD71` is `ready` and holds real $CHOG and WMON, buy-only is **off**, its AI is on-chain, and its first guarded trade has landed (write down the transaction). Rehearse a con that works, then run "Run the check" once as a dry run: `NotAuthorized()` for the AI key's transfer, and the owner's control call going through.
- [ ] No page on screen calls the House Chog buy-only (the landing page's Safety section, `/heist`'s "Why it's safe", `/guard`). If one still does, keep it off screen.
- [ ] The Oracle Purse transfer for the settled Bell has been sent and is visible on the explorer.

**What's on screen**
- [ ] **Caption every Chog on screen as "CHOG #n · token id".** The genome card, the Chog page, Versus and the Time Machine header show both names; the caption keeps them readable in the cut. Chogs pre-checked as unflagged:
  - token 2 (CHOG #1463)
  - token 4 (CHOG #1465)
  - token 8 (CHOG #1469)
  - token 1225 (CHOG #717)
  - token 1399 (CHOG #891), the House Chog
- [ ] **Keep flagged Chogs off screen.** Random Chog never picks a flagged Chog, and the Bell's Oracle of the Day and Most Rekt are always chosen among unflagged Chogs. Any Chog you choose by hand, such as a rival or a League row you click, must be checked against `flaggedTokenIds` in `data/brand-safety.json` (214 IDs).
- [ ] **Every number comes from the real app at recording time.** Write down `beatHoldPct`, the Bell results, the Purse amount and the `/stats` counters from the screen. Never use numbers from this script.
- [ ] Show the honesty captions when they apply: "Simulated on real $CHOG candles (1% fee + impact)" on replays, "Points have no cash value" on the Bell, and "Not affiliated with Chog" on the end card.
- [ ] Don't show `.env.local`, private keys, the Vercel dashboard or terminal history with secrets. Show only public addresses.
- [ ] Use no AI-generated Chog art. Use only the collection's own images, as the app shows them.

**Export and upload**
- [ ] Record the voice-over separately and keep it under 2:55. Use royalty-free music, kept low under the voice-over.
- [ ] Export at 1080p. Upload unlisted, open the link in an incognito window, and paste it into `<VIDEO_URL>`.
