GO-TO-MARKET: start with the Chog community, give every visitor a daily reason to come back, and let real $CHOG flow into Chog wallets.

WHO IT'S FOR

1. Chog holders (about 1,000 wallets hold the 1,969 Chogs). Their NFT gains a trading genome, a League rank, a daily call and a wallet with a record. That is a new reason to hold, show off and trade their Chog.
2. Chog fans without an NFT. They can meet, rewind, ride and rob with no wallet, which makes them the funnel to future holders.
3. $CHOG traders. They get a daily, public, market-settled forecast from 1,969 personalities, and a reason to watch the CHOG/WMON chart at 15:00 UTC.

THE LOOPS

- Daily habit: the Bell rings at 15:00 UTC every day. Fans ride a Chog, come back the next day to see it settled, and keep a streak (+5 per day, up to +25). Every Bell names an Oracle of the Day, a natural daily post.
- Shareable moments, each with its own share card and a link back to a page anyone can try without a wallet:
  - "AI said YES. Monad said NO." heist verdicts and the Hall of Fame
  - Versus reveals ("you thought it was a pump, it was Oct 2")
  - Chog, Bell and League cards
- Holder pride and price discovery: the League and Trait Alpha answer "which traits trade best?", a question every holder wants answered about their own Chog. A Chog with a good record and a funded wallet is a better listing, and Animr links every Chog to its marketplace page.
- Real $CHOG, flowing the right way: after each live Bell the team sends an Oracle Purse of <PURSE_AMOUNT> $CHOG, bought from the market with the team's House wallet, into the Oracle's own ERC-6551 wallet. The Purse goes to the Oracle shown on the Bell page: the best call among featured Chogs, never the House Chog itself. The buy-only House Chog can only stack $CHOG, never sell. On-chain agents trade the main CHOG/WMON pool. Each of these puts $CHOG inside NFTs, where it changes hands with the NFT.

LAUNCH PLAN

Hackathon week (Oct 20–23)
- Live Bells every day from <FIRST_LIVE_BELL>, with a post at 15:00 UTC with the calls and the previous day's Oracle of the Day.
- The House Chog opens for heists. The first fans to con its AI make the Hall of Fame (glory only, no money).
- /stats publishes real usage: fans, rides, return visits, Versus picks, heist attempts, claimed agents and AI spend.
- Holders can hide their Chog from every public page with one free signature ("Hide my Chog").

The first 30 days
- Holder onboarding: claiming is free (one signature, and the team pays the 0G calls). Creating the wallet is one transaction.
- Weekly "Trait Alpha" threads with the League's winners and losers, always labelled as simulations on real candles.
- A Versus of the Day, shared as a card.
- Collect holder feedback in the Chog community and ship the most-asked change each week.

Days 30–90
- On-chain trading is open to any holder from day one, under owner-set limits inside the guard's fixed on-chain ceilings (50% per trade, 100% per day, 2% slippage). Promotion is gradual: team Chogs are featured first, then holders who opt in. A v2 guard with different ceilings would only follow an external review.
- Seasons: monthly Oracle standings, with the Purse growing with usage.
- A public API for the genome and the Bell (calls and settlements), so community bots and dashboards can build on it.

WHY IT CAN LAST

- Cheap and capped:
  - an LLM decision costs about $0.002 on 0G Compute
  - Bell calls from unclaimed Chogs are free (genome rules)
  - the heist's AI has a hard daily budget (default $3)
  - manual "Think now" runs are capped (default 400 a day)

  A thousand claimed Chogs thinking once a day at the Bell cost about $2 a day, without the optional hourly agent tick (with it, up to 24 times that).
- No token, no fees, no paid tiers. Nothing to sell during the hackathon, and nothing that touches holders' funds except through the guard they opt into.
- Light on infrastructure: Vercel, Upstash Redis, the public Monad RPC and public market data APIs.

WHAT WE MEASURE

- Rides per Bell and the share of fans who return the next day (D1) and the next week (D7).
- Versus picks, heist attempts per day and the share of attempts that reach a verdict.
- Claimed Chogs, Chog wallets created, and on-chain vaults with the guard enabled.
- $CHOG held in Chog wallets, and the total paid out by the Oracle Purse.

RISKS AND HOW WE HANDLE THEM

- Brand: Animr is independent and says "Not affiliated with Chog" everywhere. 14 trait values get display-friendly names wherever they become text, some Chogs are kept out of featured slots, and any holder can hide their Chog. Daily posts feature the Oracle of the Day and never tag a holder. There is no AI-generated Chog art.
- Misleading numbers: every replay is labelled "simulated on real $CHOG candles (1% fee + impact)". Points have no cash value. Paper and on-chain trading are clearly separated.
- Security: the AI's key can only call the guard's trade(), which can never withdraw. The guard's ceilings are constants in the deployed contract, it has 37 Foundry tests that fork live mainnet state, and owners can switch the AI off at any time.
- Thin liquidity (about $90K in the main pool): the guard's per-trade, daily and slippage limits plus its TWAP floor keep agents from moving the market. The replay engine models price impact against a fixed depth of about 4M WMON, set from the pool's size in October.
