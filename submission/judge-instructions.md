JUDGE ACCESS: no wallet, no sign-up, no install

Start here: open https://useanimr.vercel.app/tour on a desktop or phone. It is a 2-minute guided tour of the real pages, with no wallet. A wallet is only needed for the optional holder steps.

THE 60-SECOND VERSION

1. https://useanimr.vercel.app/heist: press "Run the check". Monad mainnet refuses the AI key's transfer of the House Chog's $CHOG out of its wallet: Tokenbound answers NotAuthorized(), and the same call from the owner goes through. The block number and explorer links are on screen.
2. https://useanimr.vercel.app/replay/2?vs=8: press play. Two Chogs' trait-compiled genomes race on real hourly $CHOG candles.
3. https://useanimr.vercel.app/bell: ride a Chog on today's 15:00 UTC call. No wallet: your fan card is a cookie.

Why the NFT is essential: no NFT, no trader (the strategy is compiled from its traits), no wallet (its ERC-6551 wallet is derived from the token) and no authority (every owner action is checked against ownerOf).

Names: marketplaces call Chogs "CHOG #n", the number in the metadata name. Animr's URLs use the token ID (1–1969). Chog pages and Versus show both, for example "CHOG #1462 · token 1", and the /app lookup and League search accept either.

THE FULL NO-WALLET PATH (about 8 minutes)

1. MEET a random Chog (1 min)
Open https://useanimr.vercel.app/league and press "Random Chog" (the dice button). Its page shows its genome card (8 genes, each naming the trait that set it), its trading style and its League rank among all 1,969 Chogs, measured as $CHOG stacked vs just holding. Then open /traits (Trait Alpha) to see which trait values win.

2. REWIND it (2 min)
On its Time Machine page (/replay/<token id>), press play. Its genome trades the real hourly CHOG/WMON chart, narrated in its own voice, and ends with its edge over holding. Switch windows (30d, 45d, max) or race it against a rival on the same candles.

3. VERSUS (2 min)
Open /versus. Two Chogs face off on a hidden 48 hours of real $CHOG history. Call the one you think stacks more $CHOG, watch the race, then see the real dates. A correct call adds 10 points (points only, up to 100 a day).

4. ROB IT (2 min)
Open /heist ("Rob this Chog"). The House Chog, CHOG #891 (token 1399), keeps real $CHOG in its own wallet on Monad mainnet. Try to talk its AI into sending it to you: 280 characters per message, 3 messages per heist (the defender's patience comes from the House Chog's genome). The heist is public by design and only ever targets the House Chog; its AI has no keys and no tools. When the AI says yes, the page simulates the exact transfer out of the wallet from the AI's key against Monad mainnet at a pinned block:
- Tokenbound refuses it with NotAuthorized(): the AI's key isn't the wallet's owner.
- The same transfer from the real owner goes through, as a control.
- The AI's only real door, our guard, is asked to sell the whole vault and refuses that too: TradeRejected("exceeds per-trade cap") under the House Chog's 10% per-trade limit. A sell within the limits would be allowed, and it stays in the same wallet.

Nothing is ever broadcast. You don't have to con the AI first: "Run the check" runs the same mainnet check at any time. Every attempt is counted in the header badge and on /stats, and a caving reply can go on the Hall of Fame after the team approves it.

5. RIDE the Bell (1 min)
Open /bell. At 15:00 UTC every day, every Chog publishes a 24-hour $CHOG call. Pick the Chog you trust; your ride counts from the next hourly close. 24 hours later the real price settles every call: Oracle of the Day, Most Rekt, points, streaks and a short AI-written recap. On production the Bell rings at 15:01 UTC and settles at 15:11 the next day; rides close 12 hours after the ring. A settled live Bell also shows its Oracle Purse: real $CHOG sent automatically after settlement by a scheduled job the team runs, from the House key into the Oracle's own ERC-6551 wallet, shown as "on its way" and then "sent" with the transaction. Past Bells are under /bell/<YYYY-MM-DD>. Points have no cash value.

OPTIONAL EXTRAS (no wallet)

- /breed: cross two Chogs. The child takes each trait from one parent and trades the same real chart (simulated).
- Ask this Chog: on any /chog/<token id> page, ask its AI about its trades and DNA. It answers in text and can't act.
- /market: "Best traders for sale", live OpenSea listings ranked by League edge.
- Trophy cabinet: on /chog/<token id>, trophies minted by AnimrTrophies into the Chog's own wallet.
- /docs: 20 pages, including the Holder guide, AnimrTradeGuard, Trophy cabinet and Contracts and API pages.
- /stats: live usage numbers.

IF YOU HOLD A CHOG (optional, about 5 minutes, a little MON for gas)

1. Open https://useanimr.vercel.app/chog/<your token id> and press "Log in" (a wallet, email, Google, X or Discord). Then link or connect the wallet that holds the Chog: only the holder can do the steps below. The section "Let it trade real $CHOG" is a six-step stepper that reads the chain and shows what is next.
2. Create the Chog's wallet: one transaction that creates and initializes its ERC-6551 account through Multicall3.
3. Let the guard trade: one transaction (the wallet's setPermissions for AnimrTradeGuard; the AI's key never gets access).
4. Set your limits: one transaction. The form starts at 10% per trade, 30% of the vault per day, 10 minutes apart and 2% slippage; buy-only is an optional lock.
5. Fund the vault: deposit $CHOG and/or WMON from your wallet, or "Only have MON? Wrap & deposit" (two transactions). The step is done once the vault holds either token; the finished row shows the balances, says when only one token is in ("With $CHOG alone it can sell but not buy") and reopens with "Add WMON" or "Deposit or withdraw".
6. Wake the AI: sign a free message (not a transaction). Its LLM on 0G Compute paper-trades the vault's real balances at live prices, can think right away with "Think now", and each decision shows its 0G receipt: provider, request ID and cost.
7. Switch to on-chain: sign a second free message. From then on its trades are real swaps in the wallet, within your limits, on the hourly tick and at the Bell ("Think now" is for paper agents). The live panel offers Edit limits, Deposit or withdraw and Back to paper; Disable or Revoke stops it at any time.
8. Withdraw to your wallet: under Deposit or withdraw, one transaction through the wallet's own execute(), which only the holder can call. The guard has no withdraw function, so neither the AI nor Animr can ever move your tokens out.

Nothing needs an explorer: every step is a transaction or a signature from the Chog's page. If you sell the Chog, its wallet, tokens, trophies, record and AI history go with it. The new owner's limits start blank. To take your Chog off Animr's public pages, use "Hide my Chog" on /stats (one free signature). The Holder guide at /docs/holder-guide follows the stepper button by button.

ON-CHAIN

- AnimrTradeGuard: https://monadscan.com/address/0x92D3d4Af4B3b0F29Ec020e407803e135af61987b (source verified on Sourcify). /guard reads its roles, pause switch and the House Chog's vault live.
- AnimrTrophies: https://monadscan.com/address/0x7720Ed65f3DdfC4AD812D8A5ACd25762712b513d (source verified: Sourcify exact match, shown on Monadscan). Its owner is the team's main wallet 0xc742…960C, its minter the AI operator key, and its metadata is served at https://useanimr.vercel.app/api/trophies/meta/{id}. Trophies are minted only from the production deployment, like guarded trades.
- House Chog (CHOG #891 · token 1399): wallet https://monadscan.com/address/0xa46aE2364eDa19C7d8fCe7F5878C93E50aB2AD71, funded with real $CHOG and WMON, its AI in on-chain mode. It trades two-way through the guard, at most 10% per trade and 30% per day, and every swap lands back in the same wallet. Paper Paws was born to panic-sell; its mandate makes it buy the dip instead: a rule in the engine turns any sell into a hold while $CHOG is down over the last hour or day. Its first production decision was a hold whose thesis cited that House rule.

WHAT'S REAL AND WHAT'S SIMULATED

Real: Chog NFTs, traits and art (no AI-generated art); ERC-6551 wallets and balances on Monad mainnet (chain 143); hourly CHOG/WMON candles and Bell settlement prices; 0G Compute LLM calls and receipts; the heist's mainnet simulation (read-only); trades through AnimrTradeGuard; trophies; Oracle Purse transfers.

Simulated: League, Time Machine, Versus and Breed results, labelled "simulated on real $CHOG candles (1% fee + impact)", a replay of each genome's rules on real data, not a track record; paper trading for claimed Chogs not yet on-chain; Bell days before <FIRST_LIVE_BELL>, labelled "Replayed Bell". Points are never money and never a wager.

TROUBLESHOOTING

- "The House Chog is napping": today's $3 AI budget for the heist is spent; it resets at 00:00 UTC. "Run the check" still runs the full mainnet check.
- The heist says the House Chog is moving in, or "no claim made": the check only claims a refusal once its wallet is deployed, initialized and holds $CHOG. Contact us below.
- "Think now" refuses: each paper Chog can think on demand only every 15 minutes, under a global daily cap, and still thinks every hour and at every Bell. An on-chain Chog never thinks on demand: it decides on the hourly tick and at the Bell only.
- Numbers differ from the video: windows roll forward every hour, so replays and ranks move. Genome g1-7de62b never changes.
- Missing Chog images: the IPFS gateway rate-limits bursts, so reload.
- The ride window has closed: rides open for 12 hours after the 15:00 UTC ring. A later ride goes to the next Bell.

FOR THE CODE

The repository is private; access for judges is on request via the submission form. Without it, everything is checkable from the app:
- https://useanimr.vercel.app/docs: Contracts and API (every address and the public HTTP API), AnimrTradeGuard (limits, ceilings, tests) and Trophy cabinet.
- Both contracts' verified source on the explorer (links above; Sourcify exact matches). Fork tests on live Monad mainnet: AnimrTradeGuard 37 fork tests (36 pass, 1 skipped by design), AnimrTrophies 12/12.

Contact: <CONTACT>

Not affiliated with Chog.
