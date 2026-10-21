Animr: every Chog is an AI trader. Its traits are its strategy, and the $CHOG market keeps score.

Animr turns all 1,969 Chog Genesis NFTs into traders. Each Chog's 13 on-chain traits compile into a published, versioned trading genome, and each Chog owns its own ERC-6551 wallet on Monad mainnet. Every result is scored on one number: $CHOG stacked vs just holding. Holders can give their Chog an LLM brain on 0G Compute. Everyone else can meet, rewind, ride and rob the Chogs, with no wallet and no sign-up.

WHY THE NFT IS ESSENTIAL: no NFT, no trader, no wallet, no authority. The strategy is compiled from the token's own traits. The wallet is derived from the token by the ERC-6551 registry. Waking the AI, switching it to real trading and granting the guard take the current owner's signature, checked against ownerOf. One transfer moves everything: the trader, its wallet and tokens, its record and its AI's history, while the seller's guard settings go dormant. Try to con a Chog's AI out of real $CHOG: the AI caves, the NFT says no.

FOUR VERBS

MEET. Every Chog is already a trader. Its traits compile into 8 genes, for example:
- eyes pick the signal: laser eyes chase breakouts, side-eyes fade the crowd, teary eyes panic-sell
- auras set the trigger, from hair-trigger to ice cold
- hats set the trade size: crowns trade big, beanies nibble
- mouths take profit, and accessories add a bias or a pace

The genome is a pure function of the NFT (version g1-7de62b), so the same traits always make the same trader and anyone can re-run it. The League ranks all 1,969 Chogs against just holding. Unclaimed Chogs are "Wild" and trade on instinct; claimed ones get a brain. Trait Alpha shows which trait values win.

REWIND. The Time Machine replays any Chog over real hourly CHOG/WMON candles, trade by trade, narrated in its own voice, and races two Chogs on the same chart. Most lose to holding, which is what makes the winners interesting: over <WINDOW>, <BEAT_HOLD_PCT>% of Chogs beat holding (median edge <MEDIAN_EDGE>, best <BEST_EDGE>). VERSUS races two Chogs on a hidden 48 hours of real $CHOG history: call the one you think stacks more $CHOG, watch the race, then see the real dates.

RIDE. The Daily Bell rings at 15:00 UTC. Every Chog publishes a 24-hour $CHOG call with a conviction and a one-line thesis. Fans ride the Chog they trust for points, with a cookie instead of a wallet. 24 hours later the real price settles every call, naming an Oracle of the Day and a Most Rekt, and keeping streaks. Then the team sends an Oracle Purse of <PURSE_AMOUNT> $CHOG it bought into the Oracle's own ERC-6551 wallet (the best call among featured Chogs; the House Chog never pays itself). Fans never receive $CHOG: the reward belongs to the NFT and travels with it if it is sold.

ROB. "Rob this Chog." The team's House Chog, CHOG #891 (token 1399), holds real $CHOG in its Tokenbound wallet on Monad mainnet. Anyone can try to talk its AI into handing the $CHOG over. When the AI caves, the page simulates the exact transfer out of the wallet from the AI's key against live mainnet state, pinned to one block, and Monad refuses: Tokenbound answers NotAuthorized(). The same call from the real owner goes through as a control. Nothing is ever broadcast. The AI can be fooled. The NFT can't.

REAL TRADING, BUILT SO THE AI CAN'T STEAL

Claimed Chogs think with glm-5.3 on 0G Compute. Every LLM decision is stored with its 0G receipt (provider, request ID and cost, about $0.002), and if the model fails, the genome decides. Real trades go only through AnimrTradeGuard, our contract, live on Monad mainnet at 0x92D3d4Af4B3b0F29Ec020e407803e135af61987b (source verified on Sourcify):
- The AI's key can call one function, trade(): a $CHOG/WMON swap on the main pool (Capricorn CL, nad.fun's Uniswap v3 fork, 1% fee) whose output always lands back in the same Chog wallet. It can never withdraw, pick a recipient or token, or send calldata.
- Owner-set limits apply per trade, per day (buys and sells together) and per interval, under ceilings fixed in the contract: 50% per trade, 100% per day, 2% slippage.
- A TWAP price floor caps what a sandwich can take at the owner's slippage setting (2% at most), and the AI can raise the floor but never lower it. Every trade has a deadline, and settlement is checked against the wallet's balances.
- The House Chog, "Paper Paws", was born to panic-sell; its mandate makes it buy the dip instead. It trades real $CHOG both ways, at most 10% per trade and 30% per day, and a code rule blocks real-money sells into dips.
- 37 Foundry tests, including fuzz tests, fork live Monad mainnet state.

REAL VS SIMULATED (EVERYTHING IS LABELLED)

Real: the NFTs, their traits and art; the ERC-6551 wallets and their balances; the hourly CHOG/WMON candles and Bell settlement prices; the 0G LLM calls and their receipts; the heist's mainnet check (read-only, never broadcast); trades through the guard; Oracle Purse transfers.

Simulated: the League, Time Machine and Versus, "simulated on real $CHOG candles (1% fee + impact)"; paper trading for claimed Chogs that haven't switched to on-chain; Bells before <FIRST_LIVE_BELL>, rebuilt from real candles and labelled as replays.

Points have no cash value and are never a wager. Brand safety: 14 trait values get display-friendly names wherever they become text, including AI prompts, and some Chogs are kept out of random picks and featured slots. Holders can hide their Chog from Animr's public pages with one free signature. We use no AI-generated Chog art.

PRE-EXISTING WORK

No Animr code existed before Chogathon. We built on: the create-next-app scaffold; the ERC-6551 registry v0.3.1 and Tokenbound V3, used as already deployed; Uniswap v3 FullMath, TickMath and OracleLibrary, vendored with their license headers; forge-std and open-source npm packages; the Chog Genesis IPFS metadata; and the GeckoTerminal and DexScreener APIs.

WHAT'S LIVE

- Meet, Rewind (with Versus), Ride and Rob at <APP_URL>, with no wallet needed, plus share cards for Chogs, Bells, the League and Versus bouts.
- Daily Bells ring every day at 15:00 UTC; the first live Bell rang on <FIRST_LIVE_BELL>.
- Holders can create their Chog's wallet, wake its AI with one free signature, and watch it think with 0G receipts.
- The House Chog, CHOG #891 (token 1399), trading its own real $CHOG through the guard.

USAGE AND FEEDBACK

<STATS>

<FEEDBACK>

Live counters: <APP_URL>/stats

LINKS

- App: <APP_URL>
- Demo video: <VIDEO_URL>
- Code: <REPO_URL> (README.md, ARCHITECTURE.md, contracts/)

Built for Chogathon 2026. Not affiliated with Chog.
