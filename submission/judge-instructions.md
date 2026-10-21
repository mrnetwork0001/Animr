JUDGE ACCESS: no wallet, no sign-up, no install

Open <APP_URL> on a desktop or phone. A wallet is only needed for the optional holder steps.

THE 60-SECOND VERSION

1. <APP_URL>/heist: press "Act as the AI". Monad mainnet refuses the AI key's transfer of the House Chog's real $CHOG out of its wallet: Tokenbound answers NotAuthorized(), and the same call from the owner goes through. The block number and explorer links are on screen.
2. <APP_URL>/replay/2?vs=8: press play. Two Chogs' trait-compiled genomes race on real hourly $CHOG candles.
3. <APP_URL>/bell: ride a Chog on today's 15:00 UTC call. No wallet: your fan card is a cookie.

Why the NFT is essential: no NFT, no trader (the strategy is compiled from its traits), no wallet (its ERC-6551 wallet is derived from the token) and no authority (every owner action is checked against ownerOf).

Names: marketplaces call Chogs "CHOG #n", the number in the metadata name. Animr's URLs use the token ID (1–1969). The genome card, the Chog page and Versus show both, for example "CHOG #1462 · token 1", and the /app lookup and the League search accept either.

THE FULL NO-WALLET PATH (about 8 minutes)

1. MEET a random Chog (1 min)
Open <APP_URL>/league and press "Random Chog" (the dice button). Its Time Machine page opens with:
- its genome card: 8 genes, each naming the trait that set it, when one did
- its trading style
- its League rank among all 1,969 Chogs, measured as $CHOG stacked vs just holding

Then open <APP_URL>/traits (Trait Alpha) to see which trait values win across all genomes.

2. REWIND it (2 min)
On that page (/replay/<token id>), press play. Its genome trades the real hourly CHOG/WMON chart, narrated in its own voice, and ends with its edge over holding. Things to try:
- Switch windows: 30d, 45d or max.
- Race it against a rival on the same candles. A ready-made race is at <APP_URL>/replay/2?vs=8.

3. VERSUS (2 min)
Open <APP_URL>/versus. Two Chogs face off on a hidden 48 hours of real $CHOG history:
- Call the one you think stacks more $CHOG, then watch the race.
- The real dates are revealed at the end.
- A correct call adds 10 points (points only, up to 100 a day).

4. ROB IT (2 min)
Open <APP_URL>/heist ("Rob this Chog"). The House Chog, CHOG #891 (token 1399), keeps real $CHOG in its own wallet on Monad mainnet. Try to talk its AI into sending it to you: 280 characters per message, 3–6 messages per heist. When the AI says yes, the page shows the exact transfer out of the wallet that the AI's key would send, simulated against Monad mainnet at a pinned block:
- Tokenbound refuses it with NotAuthorized(): the AI's key isn't the wallet's owner.
- The same transfer from the real owner goes through, as a control.

The AI's only real door is our guard: a sell within the owner's limits is allowed, and it stays in the same wallet. Nothing is ever broadcast. You don't have to con the AI first: "Act as the AI" runs the same mainnet check at any time.

5. RIDE the Bell (1 min)
Open <APP_URL>/bell. At 15:00 UTC every day, every Chog publishes a 24-hour $CHOG call. To ride:
- Pick the Chog you trust. Your fan card lives in a cookie.
- Your ride counts from the next hourly close.
- 24 hours later the real price settles every call: Oracle of the Day, Most Rekt, points and streaks. A settled live Bell also shows its Oracle Purse: real $CHOG the team sends into the Oracle's own ERC-6551 wallet.

Past Bells are under /bell/<YYYY-MM-DD>. Live usage numbers are at <APP_URL>/stats. Points have no cash value.

IF YOU HOLD A CHOG (optional, about 5 minutes, a little MON for gas)

1. Open <APP_URL>/chog/<your token id> and connect the wallet that holds the Chog.
2. Create its wallet: one transaction that creates and initializes its ERC-6551 account through Multicall3.
3. Wake its AI: sign a free message (not a transaction). Its LLM on 0G Compute can think right away with "Think now", and it thinks again at every Bell. Each decision shows its 0G receipt: provider, request ID and cost. It paper-trades the wallet's $CHOG at live prices.
4. Optional, real trading: use the five-step setup on the same page.
   - Let AnimrTradeGuard trade, then set your limits.
   - Fund the wallet with $CHOG and/or WMON.
   - Sign to switch the AI to on-chain.
   - You can disable or revoke at any time.

If you sell the Chog, its wallet, tokens, record and AI history go with it. The new owner's limits start blank. To take your Chog off Animr's public pages, use "Hide my Chog" on /stats (one free signature).

AnimrTradeGuard: 0x92D3d4Af4B3b0F29Ec020e407803e135af61987b (https://monadscan.com/address/0x92D3d4Af4B3b0F29Ec020e407803e135af61987b), source verified on Sourcify. <APP_URL>/guard reads its roles, pause switch and the House Chog's vault live. House Chog: CHOG #891 · token 1399, wallet https://monadscan.com/address/0xa46aE2364eDa19C7d8fCe7F5878C93E50aB2AD71. Its AI trades that real $CHOG two-way through the guard, at most 10% per trade and 30% per day, and every swap lands back in the same wallet. Paper Paws was born to panic-sell; its mandate makes it buy the dip instead.

WHAT'S REAL AND WHAT'S SIMULATED

Real:
- Chog NFTs, their traits and art (the collection's own IPFS metadata, no AI-generated art)
- ERC-6551 wallets and balances on Monad mainnet (chain 143)
- hourly CHOG/WMON candles and Bell settlement prices
- 0G Compute LLM calls and their receipts
- the heist's mainnet simulation (read-only)
- trades through AnimrTradeGuard for vaults switched to on-chain, including the House Chog's, and Oracle Purse transfers

Simulated:
- League, Time Machine and Versus results, labelled "simulated on real $CHOG candles (1% fee + impact)": a replay of each genome's rules on real data, not a track record
- paper trading for claimed Chogs that haven't switched to on-chain (live prices, simulated fills)
- Bell days before <FIRST_LIVE_BELL>, rebuilt from real candles and labelled "Replayed Bell"

Points are never money and never a wager.

TROUBLESHOOTING

- "The House Chog is napping": today's AI budget for the heist ($3 of 0G calls) is spent. It resets at 00:00 UTC. "Act as the AI" still runs the full mainnet check.
- "Think now" refuses: each Chog can think on demand only every few minutes, and there is a global daily cap on manual runs. Agents still think at every Bell. Chogs trading on-chain think only on schedule.
- The heist says "no claim made": the check only claims a refusal when the House Chog's wallet is deployed, initialized and holds $CHOG at that block. If you see this, the House Chog isn't funded yet. Contact us below.
- Numbers differ from the video: windows roll forward every hour (the 30- and 45-day windows start at a UTC midnight), so replays and ranks move. Genome g1-7de62b never changes.
- Missing Chog images: the IPFS gateway rate-limits bursts, so reload.
- The ride window has closed: rides on a Bell open for 12 hours after its 15:00 UTC ring. A ride you take later goes to the next Bell.

FOR THE CODE

Repo: <REPO_URL>
- README.md: run locally with npm install, then .env.local from .env.example, then npm run dev. Every key is optional.
- ARCHITECTURE.md: data flow, security model and costs.
- contracts/: AnimrTradeGuard.sol and its 37 Foundry tests, which fork live Monad mainnet state (README.md has the commands).

Contact: <CONTACT>

Not affiliated with Chog.
