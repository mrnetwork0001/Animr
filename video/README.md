# Animr demo film

A 2:53 film made with [Remotion](https://www.remotion.dev) for the Chogathon 2026 judges: a Chog gets a wallet of its own, what Animr does with all 1,969 of them, the four games, the heist that Monad refuses, and the House Chog's holder putting its AI on-chain, replayed from the real transactions.

Deliverables: `out/animr-demo-4k.mp4`, `out/animr-demo-1080p.mp4`, `out/animr-thumbnail.png` (and `.jpg`). YouTube title, description and chapters: `youtube.txt`.

## What is real

- **The on-chain story (scenes 01, 09, 10):** every hash, block, time and figure is read back from Monad mainnet into `data/onchain.json` (receipts, decoded logs and `eth_call`s; checked 2026-10-22 01:40 UTC). The House Chog is Chog Genesis token 1399 (CHOG #891, "Laser Pounce"), held by `0xc742…960C`; its ERC-6551 wallet `0xa46a…AD71` was created at 22:41:25 UTC on Oct 21 (block 115,447,994), the guard was authorized at 22:44:04, limits set at 22:48:41 (10% / 30% / 600 s / 2%), 15,000 $CHOG deposited at 22:55:06 and 1,001 WMON at 23:04:32, and 1 WMON withdrawn through the wallet's own `execute()` at 00:21:36 on Oct 22. Waking the AI and switching it on-chain are off-chain signatures, so they have no hash.
- **The app:** recorded from the live production site, https://useanimr.vercel.app, on 2026-10-22 between 01:50 and 02:30 UTC (`scripts/capture.mjs`, headless Chrome at 1600×900, device scale 2): the landing deck and its newest 0G receipt, the first-visit walkthrough, Versus (a random bout: Sharp Tail vs Laser Snout, real dates Sep 2 to Sep 4, 2026), Breed (tokens 93 and 1415), the live Bell of Oct 21 with one real ride (Turbo Ears, CHOG #1305), Rob this Chog (one pitch, the AI's real reply, then "Run the check": `NotAuthorized()` and `TradeRejected("exceeds per-trade cap")` at block 115,486,776, never broadcast), `/guard`, and the House Chog's profile with its 0G receipts. Writes were limited to one ride, one Versus pick, one heist message and one Ask-this-Chog question.
- **The holder view:** the owner's own screen recording of the logged-in app (`public/footage/owner/owner-holder-view.mp4`, 2026-10-22 ~03:57 UTC): `/app`, the House Chog's holder panel and the account menu.
- **Monadscan:** the explorer pages of the real setup transactions, captured live.
- **The prize (scenes 06 and 07):** the Oct 21 Bell settled on Oct 22: Best call Velvet Whiskers (CHOG #365, token 873, called -1.7%) and Most Rekt Blitz Mane (token 1806), both trophies minted at 15:11:04 UTC, and the 500 $CHOG Oracle Purse sent from the House key at 15:20:04 UTC (block 115,645,677, tx `0xbc486bec…871a`), found with `scripts/purse.mjs` into `data/purse.json`. The settled Bell page was recorded just after; it still read "Purse on its way", and the Monadscan clip shows the transfer.
- **Numbers:** 1,969 Chogs and "49% beat holding" (the landing's backtest: each Chog's trading DNA replayed on real hourly $CHOG prices, Sep 7 to Oct 22, 2026, with the pool's 1% fee and price impact) are from the live landing page, re-recorded at 14:44 UTC on Oct 22; replays, Versus and Breed are labelled as simulated on screen.
- **Art and logos:** real Chog Genesis images (the app's own copies, token ids checked against `data/brand-safety.json`), the House Chog's image from the collection's IPFS metadata, Animr's lockup and mark, the Monad, Tokenbound and 0G logos from the app, and the Chog logo from chog.xyz, unaltered.
- **Narration, music and sound:** ElevenLabs. The narrator is Sarah; the House Chog's real opening line on `/heist` is read by Callum; the score is ElevenLabs Music; the effects are ElevenLabs sound generation.

## Build it

The ElevenLabs key is read at runtime from `/Users/mrnetwork/Syntura/video/.env` and never stored here.

```
npm install
npm run vo && npm run music && npm run sfx && npm run timing   # audio and timing
npm run capture && npm run encode                              # live app footage (production URL)
npm run studio                                                 # preview
npm run draft                                                  # half-scale check render
npm run prize                                                  # after the Oct 21 Bell settles and the purse pays (~15:20 UTC Oct 22)
npm run render4k && npm run finish && npm run 1080p             # 4K master, -14 LUFS, 1080p
```

`npm run prize` runs `scripts/purse.mjs` (read-only RPC: the purse transfer from the House key and the TrophyAwarded mints, into `data/purse.json`, plus the winners' art), records the settled `/bell/2026-10-21` page and the explorer pages (`ONLY=settled,scan_prize`), and encodes them. Scene 07 and the end of scene 06 switch from the placeholder to the real capture automatically. `capture.mjs` refuses to run without `ONLY`, so the one-time writes are never repeated.

`script.json` holds every spoken line (`say` spells a word the way it is pronounced); `src/timing.json` places each word on the frame it is spoken, and the scenes animate on those words.
