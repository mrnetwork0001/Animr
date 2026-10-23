Animr: every Chog is an AI trader. Its traits are its strategy, and the $CHOG market keeps score.

Animr turns all 1,969 Chog Genesis NFTs into traders. Each Chog's 13 on-chain traits compile into a published, versioned trading genome, and each Chog owns its own ERC-6551 wallet on Monad mainnet. Every result is scored on one number: $CHOG stacked vs just holding. Holders can give their Chog an LLM brain on 0G Compute. Everyone else can meet, rewind, ride and rob the Chogs, with no wallet and no sign-up. Judges: start with the 2-minute tour at https://useanimr.vercel.app/tour.

WHY THE NFT IS ESSENTIAL: no NFT, no trader, no wallet, no authority. The strategy is compiled from the token's own traits. The wallet is derived from the token by the ERC-6551 registry. Waking the AI, switching it to real trading and granting the guard take the current owner's signature, checked against ownerOf. One transfer moves everything: the trader, its wallet and tokens, its trophies, its record and its AI's history, while the seller's guard settings go dormant. Try to con a Chog's AI out of real $CHOG: the AI caves, the NFT says no.

FOUR VERBS

MEET. Every Chog is already a trader. Its traits compile into 8 genes: eyes pick the signal (laser eyes chase breakouts, teary eyes panic-sell), auras set the trigger, hats set the size (crowns trade big, beanies nibble), mouths take profit. The genome is a pure function of the NFT (version g1-7de62b), so the same traits always make the same trader. The League ranks all 1,969 against just holding; Trait Alpha shows which trait values win.

REWIND. The Time Machine replays any Chog over real hourly CHOG/WMON candles, trade by trade, in its own voice, and races two Chogs on the same chart. Most lose to holding, which makes the winners interesting: over the 45 days to Oct 21, 38% of Chogs beat holding (median edge −4.0%, best +55.3%). VERSUS races two Chogs on a hidden 48 hours of real $CHOG history: call the winner, watch, then see the real dates. BREED crosses two Chogs: the child takes each trait from one parent and trades the same chart.

RIDE. The Daily Bell rings at 15:00 UTC. Every Chog publishes a 24-hour $CHOG call. Fans ride the Chog they trust for points, with a cookie instead of a wallet. 24 hours later the real price settles every call: Oracle of the Day, Most Rekt, streaks, and an AI-written recap. Then the team sends an Oracle Purse of <PURSE_AMOUNT> $CHOG it bought into the Oracle's own ERC-6551 wallet (never the House Chog). Fans never receive $CHOG: the reward belongs to the NFT.

ROB. The team's House Chog, CHOG #891 (token 1399), keeps real $CHOG in its Tokenbound wallet on Monad mainnet. Anyone can try to talk its AI into handing it over. When the AI caves, the page simulates the exact transfer from the AI's key against live mainnet state, pinned to one block, and Monad refuses: Tokenbound answers NotAuthorized(). The same call from the real owner goes through as a control. Nothing is broadcast. The AI can be fooled. The NFT can't.

ALSO: Ask this Chog (its AI answers about its trades and DNA, text only); Best traders for sale (live OpenSea listings ranked by League edge); a trophy cabinet; a 19-page docs site; Privy login (wallet, email, Google, X, Discord); a Farcaster mini app.

REAL TRADING, BUILT SO THE AI CAN'T STEAL

Claimed Chogs think with glm-5.3 on 0G Compute. Every LLM decision is stored with its 0G receipt (provider, request ID, cost, about $0.002), and if the model fails, the genome decides. Real trades go only through AnimrTradeGuard, our contract on Monad mainnet at 0x92D3d4Af4B3b0F29Ec020e407803e135af61987b (verified on Sourcify):
- The AI's key can call one function, trade(): a $CHOG/WMON swap on the main pool (Capricorn CL, 1% fee) whose output always lands back in the same Chog wallet. It can never withdraw, pick a recipient or token, or send calldata.
- Owner limits per trade, per day and per interval, under ceilings fixed in the contract: 50% per trade, 100% per day, 2% slippage.
- A TWAP price floor the AI can raise but never lower, a deadline on every trade, and settlement checked against the wallet's balances.
- The House Chog, "Paper Paws", was born to panic-sell; its mandate makes it buy the dip instead: real $CHOG both ways, at most 10% per trade and 30% per day, and a code rule blocks real-money sells into dips.
- AnimrTrophies (0x7720Ed65f3DdfC4AD812D8A5ACd25762712b513d) mints soulbound ERC-1155 trophies into Chog wallets: Best call, Most rekt, Survived a heist, First real trade. They move with the NFT.
- Fork tests on live Monad mainnet state: AnimrTradeGuard 37 (0 failures), AnimrTrophies 12.

REAL VS SIMULATED (EVERYTHING IS LABELLED)

Real: the NFTs, traits and art; the ERC-6551 wallets and balances; hourly CHOG/WMON candles and Bell settlement prices; 0G LLM calls and receipts; the heist's mainnet check (read-only); guarded trades; trophies; Oracle Purse transfers.

Simulated: League, Time Machine, Versus and Breed, "simulated on real $CHOG candles (1% fee + impact)"; paper trading for claimed Chogs not yet on-chain; Bells before <FIRST_LIVE_BELL>, labelled as replays.

Points have no cash value and are never a wager. Brand safety: 14 trait values get display-friendly names wherever they become text, including AI prompts, and some Chogs are kept out of featured slots. Holders can hide their Chog with one free signature. No AI-generated Chog art.

PRE-EXISTING WORK

No Animr code existed before Chogathon. We built on: the create-next-app scaffold; ERC-6551 registry v0.3.1 and Tokenbound V3, as deployed; Uniswap v3 FullMath, TickMath and OracleLibrary, vendored with their licenses; forge-std and open-source npm packages; the Chog Genesis IPFS metadata; GeckoTerminal, DexScreener and OpenSea APIs.

WHAT'S LIVE

- Meet, Rewind (with Versus and Breed), Ride and Rob at https://useanimr.vercel.app, no wallet needed, with share cards.
- Daily Bells at 15:00 UTC; the first live Bell rang on <FIRST_LIVE_BELL>.
- Holders can create their Chog's wallet, wake its AI with one free signature, and watch it think with 0G receipts.
- AnimrTradeGuard and AnimrTrophies, deployed on Monad mainnet.
- The House Chog, CHOG #891 (token 1399): launching, set up to trade its own real $CHOG through the guard.

USAGE AND FEEDBACK

<STATS>

<FEEDBACK>

Live counters: https://useanimr.vercel.app/stats

LINKS

- App: https://useanimr.vercel.app (judge tour: /tour, docs: /docs)
- Demo video: https://youtu.be/15xbPJcaLVI
- Code: https://github.com/mrnetwork0001/Animr

Built for Chogathon 2026. Not affiliated with Chog.
