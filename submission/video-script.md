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
| **1:45–2:22** · ROB | `/heist`, the House Chog card (CHOG #{n} · token {id}, real $CHOG balance, explorer link). Type a con (rehearsed). The AI caves: "Fine, take it." The verdict animates: **AI said YES. Monad said NO.** Highlight `NotAuthorized()` from Tokenbound, `TradeRejected("buy-only vault")` from the guard, the block number, and the owner control call passing. | "Real $CHOG · Monad mainnet · block {N}" · "Simulated with eth_call · never broadcast" | "Now rob one. The House Chog keeps real $CHOG in its wallet on Monad, and anyone can try to talk its AI into handing it over. *(beat)* It caved. So we simulate the exact transfer from the AI's own key against live mainnet. The wallet says: not authorized. Our guard says: buy-only. The AI can be fooled. The NFT can't." |
| **2:22–2:44** · WHY THE NFT | `/chog/{id}` (a team Chog): "Create its wallet" (one transaction), "Wake its AI" (signature), its feed with a **0G receipt** (provider, request ID, cost). Quick cut: the five-step guard setup. Quick cut: terminal showing the `forge test` summary line, **only if it shows no failures** (otherwise cut this shot). | "No NFT → no trader, no wallet, no authority" · "glm-5.3 on 0G Compute · ≈ $0.002 per decision" | "Holders give their Chog a brain: an LLM on 0G Compute, with a receipt for every decision. Real trades go through our guard. The AI can swap inside the Chog's wallet and can never withdraw. Sell the NFT and the trader, its wallet and its record go with it, all in one transfer." |
| **2:44–2:55** | `/stats` counters (fans, rides, return visits, Versus picks, heist attempts, AI spend), then the end card: logo, **Meet · Rewind · Ride · Rob**, `<APP_URL>`. *(Fallback: the Bell's standings and the heist's counters.)* | "{fans} fans · {rides} rides · {heists} heist attempts" · "Not affiliated with Chog" | "Every Chog is an AI trader. Meet one, rewind it, ride it, or try to rob it. Animr." |

## B-roll (record extra and cut as needed)

- Landing page scroll: hero, Trait DNA, Daily Bell and Safety sections.
- League table scrolling, a filter by trait, and the "Claimed" badge.
- Trait Alpha bars (`/traits`).
- The Time Machine at 2× speed on two different Chogs (pick unflagged ones).
- The Bell's histogram of calls and the herd-vs-reality bar, plus a past Bell page (`/bell/{day}`).
- The ride flow on a phone (portrait, 390 px wide).
- The heist's "Why it's safe" panel and the Hall of Fame.
- On the explorer:
  - the House Chog's TBA with its $CHOG balance
  - the guard contract `0x92D3d4Af4B3b0F29Ec020e407803e135af61987b`
  - the Oracle Purse transfer
- The 0G receipt in a decision feed.
- `forge test --fork-url https://rpc.monad.xyz` running, ending on its summary line. Use it only if the summary shows no failures (see the launch checklist's integration pass).

## Recording checklist

**Timing: two sessions on Thu Oct 22**
- [ ] **Morning, soon after 00:00 UTC:** the heist (the $3 daily 0G budget has just reset, so the House Chog isn't "napping"), then Meet, Rewind, Versus and `/stats`. Read `/api/dna/population` once and use the same window, `beatHoldPct` and edges in the voice-over and in `description.md`. Don't plan on raising `HEIST_DAILY_USD_CAP`: that needs a redeploy after the freeze.
- [ ] **After the second live Bell settles, about 15:10–16:00 UTC:** the Bell and Purse scenes. The Bell of Oct 21 settles on the 15:00 close; the 16:00 UTC cron or the hourly pulse writes it. Confirm `/bell` shows it as **settled** and the Purse transfer is on the explorer before you start.
- [ ] **Fallbacks, so the 2:55 cut works either way:** the `/replay/2?vs=8` race instead of Versus, and the Bell's standings plus the heist's counters instead of `/stats`.

**Setup**
- [ ] Use the production URL `<APP_URL>`, never localhost, in a clean browser profile with no extensions or bookmarks bar, at 1920×1080 and 110–125% zoom.
- [ ] Pre-warm the pages: open `/league`, `/traits`, `/bell` and `/heist` once, so the League computation and IPFS images are cached.
- [ ] The House Chog is funded, buy-only, and its TBA is `ready`. Rehearse a con that works, then run "Act as the AI" once as a dry run.
- [ ] The Oracle Purse transfer for the settled Bell has been sent and is visible on the explorer.

**What's on screen**
- [ ] **Caption every Chog on screen as "CHOG #n · token id".** The genome card, the Chog page and Versus show both names, but the Time Machine header shows only "Chog #<token id>", so the caption carries the name. Chogs pre-checked as unflagged:
  - token 2 (CHOG #1463)
  - token 4 (CHOG #1465)
  - token 8 (CHOG #1469)
  - token 1225 (CHOG #717)
  - the House Chog shortlist: 1820, 1342, 241, 616, 668
- [ ] **Keep flagged Chogs off screen.** Random Chog never picks a flagged Chog, and the Bell's Oracle of the Day and Most Rekt are always chosen among unflagged Chogs. Any Chog you choose by hand, such as a rival or a League row you click, must be checked against `flaggedTokenIds` in `data/brand-safety.json` (214 IDs).
- [ ] **Every number comes from the real app at recording time.** Write down `beatHoldPct`, the Bell results, the Purse amount and the `/stats` counters from the screen. Never use numbers from this script.
- [ ] Show the honesty captions when they apply: "Simulated on real $CHOG candles (1% fee + impact)" on replays, "Points have no cash value" on the Bell, and "Not affiliated with Chog" on the end card.
- [ ] Don't show `.env.local`, private keys, the Vercel dashboard or terminal history with secrets. Show only public addresses.
- [ ] Use no AI-generated Chog art. Use only the collection's own images, as the app shows them.

**Export and upload**
- [ ] Record the voice-over separately and keep it under 2:55. Use royalty-free music, kept low under the voice-over.
- [ ] Export at 1080p. Upload unlisted, open the link in an incognito window, and paste it into `<VIDEO_URL>`.
