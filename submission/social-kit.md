# Social kit: launch copy

This copy is for bringing real people to Animr before judging. Post it from the team's own accounts. Every line follows the rules below. Times are UTC. Fill `<placeholders>` from the live app at posting time.

## Rules: read before posting

**Where and how**

- **Ask first.** Ask a Chog Discord mod before posting there. Post once, in the channel they name (showcase or hackathon). Do the same for any other community.
- **No DMs, no mass-tagging, no reply spam.** Use a one-liner only in a conversation that's already about Chogs, $CHOG or Chogathon, and only once per conversation.
- **Tags:** tag only the accounts the organizers ask entrants to tag, and never imply that Chog endorses Animr. Every main post says **"Not affiliated with Chog"**.
- **Lead with the hook.** Open with "What kind of trader is your Chog?", not "your Chog gets a wallet". Never name, compare or knock another Chogathon entry.

**Honest by default**

- **Label replays.** Wherever the League, the Time Machine or Versus comes up, say *"simulated on real $CHOG candles (1% fee + impact)"*. A replay is not a track record.
- **Points only.** Bell and Versus points have no cash value, and fans never receive $CHOG.
- **Words we never use:** bet, odds, wager, payout, gamble, jackpot, prize money, profit, earn, returns, gains, guaranteed, airdrop, "free $CHOG", or any price call ("$CHOG will pump").
- **0G:** say "a 0G receipt for every LLM decision". Never say "TEE verified".
- **"Live" means live today.**
  - Post 6 goes out only once `/heist` shows the House Chog rather than "moving in". Until then, use 6b, or drop post 6 and renumber the thread.
  - Mention an Oracle Purse only after its transfer is confirmed on the explorer.
- **Every number comes from the live app** at posting time: `/api/bell/today`, the Bell page and `/stats`. Never round up or invent usage.

**Brand safety**

- **Use only unflagged Chogs** in posts, cards and screenshots. For any token ID, run `jq '.flaggedTokenIds | index(<id>)' data/brand-safety.json` from the repo root: it must print `null`. These are pre-checked:

  | Token ID | Name |
  | --- | --- |
  | 1820 | CHOG #1312 |
  | 1342 | CHOG #834 |
  | 241 | CHOG #1702 |
  | 255 | CHOG #1716 |
  | 45 | CHOG #1506 |
  | 2 | CHOG #1463 |
  | 8 | CHOG #1469 |

- **Never type a flagged trait value.** Quote traits only as Animr displays them.
- **Caption Chogs the app's way:** "CHOG #1312 · token 1820" (marketplace name, then token ID).
- **Never roast holders:**
  - Never tag or name a holder, and never post a wallet.
  - Leave Most Rekt out of posts, and never mock a Chog's result.
  - Prefer your own Chogs, or ones that beat holding.
- **Respect hidden Chogs.** If a page says a holder hid their Chog, pick another.
- **Use Animr's own share cards.** No Chog logos, no AI-generated Chog art.

## Fill-ins

| Placeholder | Fill with |
| --- | --- |
| `<id>` | An unflagged Chog's token ID, from the table above or checked with `jq` |
| `CHOG #<n> · token <id>` | The label on the Chog's genome card, Chog page or Versus card. **Not the Bell page:** Bell cards may show "Chog #<token id>", which is the token ID, not the CHOG # name. Take the token ID from the Bell, then read "CHOG #n · token id" at `https://useanimr.vercel.app/chog/<token id>` |
| `<boutId>` | The ID in the link that **Share this bout** copies after you play a Versus bout. The card shows how the race ended. |
| `<bullPct>`, `<bearPct>` | `/api/bell/today`, once `kind` is `"live"` (command below the table) |
| `<actualPct>`, Oracle, `<callPct>` | The settled Bell at `https://useanimr.vercel.app/bell/2026-10-21`. For the Oracle's name, open `/chog/<its token id>` (see the row above) |
| `<PURSE_AMOUNT>`, `<EXPLORER_TX_URL>` | The Purse script's output, and the transfer on the Bell page, once confirmed |
| `<CONTACT>` | The same contact as in `judge-instructions.md` |

To read today's split:

```bash
curl -s https://<your production domain>/api/bell/today | jq '{day, kind, bullPct, bearPct}'
```

If the organizers use an official tag or account, swap it in for "Chogathon 2026" in post 1 (for example "A #Chogathon entry."). Keep every post at 280 characters or fewer. X counts each link as 23 characters, and the counts below assume that.

## When to post

| When (UTC) | Where | What |
| --- | --- | --- |
| Wed Oct 21, once DEPLOY.md step 6 is green | X profile, plus Discord if the mods allow pins | Pinned explainer |
| **Wed Oct 21, 15:05–15:30** (the first live Bell has rung) | X | The thread, then the "Bell live" post as a reply to it |
| Wed Oct 21, after a mod's OK | Chog Discord, the channel the mod names | The Discord post, once |
| Wed Oct 21, around 23:00 | X, as a reply to the thread | "Four hours left" (rides close at 03:00) |
| **Thu Oct 22, once `/bell/2026-10-21` says settled** (from about 15:11) | X | "Bell settled", then the Purse reply only if it's confirmed |
| Any time | Conversations already about Chogs or Chogathon | One one-liner per conversation |
| Through Fri Oct 23 | Everywhere you posted | The feedback ask. Save 3–5 dated quotes, with permission, for `<FEEDBACK>` in `description.md`. |

## X thread: "What kind of trader is your Chog?"

**1/7** (278/280)
```text
What kind of trader is your Chog?

Animr turns all 1,969 Chog Genesis NFTs into traders: each one's traits compile into its trading strategy, and the real $CHOG market keeps score. No wallet needed.

https://useanimr.vercel.app

A Chogathon 2026 entry. Not affiliated with Chog. 1/7
```

**2/7: Meet** (272/280)
```text
Meet: eyes pick the signal (laser eyes chase breakouts, side-eyes fade the crowd), auras set the trigger, hats set the size (crowns trade big, beanies nibble).

The League ranks all 1,969 against just holding $CHOG, simulated on real candles.

https://useanimr.vercel.app/league

2/7
```

**3/7: Rewind** (263/280). Use an unflagged `<id>`, ideally one that beat holding.
```text
Rewind: press play and watch a Chog trade the real hourly CHOG/WMON chart, trade by trade, in its own voice, then race it against a rival.

Simulated on real $CHOG candles (1% fee + impact): a replay of its rules, not a track record.

https://useanimr.vercel.app/replay/<id>

3/7
```

**4/7: Versus** (261/280). Use a bout you played, with two unflagged Chogs.
```text
VERSUS: two Chogs, the same hidden 48 hours of real $CHOG history. Call the one that stacks more $CHOG, watch the race, then see the real dates.

This one: CHOG #<n> · token <id> vs CHOG #<n> · token <id>. Your turn, points only:

https://useanimr.vercel.app/versus/<boutId>

4/7
```

**5/7: Ride** (245/280). Post it only after the 15:01 ring.
```text
Ride: every day at 15:00 UTC the Daily Bell rings. All 1,969 Chogs call $CHOG for the next 24 hours, you ride the one you trust (no wallet, points only), and the real market settles every call.

Today's Bell is live:
https://useanimr.vercel.app/bell

5/7
```

**6/7: Rob** (266/280). Post it only when `/heist` shows the House Chog.
```text
Rob this Chog: the House Chog keeps real $CHOG in its own ERC-6551 wallet on Monad. Talk its AI into handing it over. When the AI caves, the page simulates the transfer on mainnet and Monad refuses.

The AI can be fooled. The NFT can't.

https://useanimr.vercel.app/heist

6/7
```

**6b/7: Rob, while `/heist` still says "moving in"** (273/280). Its AI already chats; the mainnet check switches on once the House Chog's wallet holds $CHOG. Or drop post 6 and renumber to /6.
```text
Rob this Chog: talk the House Chog's AI out of its $CHOG. It's still moving in: the AI already takes your best lines, and once its ERC-6551 wallet holds real $CHOG, Monad mainnet checks every yes it gives.

The AI can be fooled. The NFT can't.

https://useanimr.vercel.app/heist

6/7
```

**7/7: Holders and safety** (271/280)
```text
Holders: wake your Chog's AI with one free signature. It thinks with glm-5.3 on 0G Compute, with a 0G receipt for every LLM decision. Real trades go only through our guard contract: the AI can trade, never withdraw.

https://useanimr.vercel.app/guard

Not affiliated with Chog. 7/7
```

## Discord post

Post this in the channel a mod names, once. Discord shows a preview for every link: keep the Bell card and wrap the other links in angle brackets (`<https://your-domain/app>`) to hide their previews. Drop the **Rob** line while `/heist` says "moving in".

```text
**Animr: what kind of trader is your Chog?**
Our Chogathon 2026 entry, built on the real Chog Genesis collection on Monad mainnet. Every Chog's traits compile into its own trading strategy, and the real $CHOG market keeps score. Nothing to connect to try it:
- **Meet:** look up any Chog by token ID or CHOG # name: https://useanimr.vercel.app/app
- **Rewind:** watch it trade the real CHOG/WMON chart, simulated on real candles (1% fee + impact): https://useanimr.vercel.app/replay/<id>
- **Ride:** the Daily Bell rings at 15:00 UTC. Ride the Chog you trust for points (no cash value): https://useanimr.vercel.app/bell
- **Rob:** try to talk the House Chog's AI out of its $CHOG, then watch Monad refuse: https://useanimr.vercel.app/heist
Holders can wake their Chog's AI with one free signature, or hide their Chog from Animr's public pages at any time on https://useanimr.vercel.app/stats.
Feedback, good or bad, is very welcome here or at <CONTACT>. Not affiliated with Chog.
```

## One-liners for replies

Use one per conversation, and only where it answers what people are already discussing.

```text
What kind of trader is your Chog? Its traits pick the signal, the trigger and the size. Look it up by token ID or CHOG # name, no wallet needed: https://useanimr.vercel.app/app
```

```text
Today's Daily Bell: all 1,969 Chogs called $CHOG for the next 24 hours, and the real market settles every call. Ride one, points only: https://useanimr.vercel.app/bell
```

```text
The AI can be fooled. The NFT can't. Try to talk the House Chog out of its $CHOG, then watch Monad say no: https://useanimr.vercel.app/heist
```

The third one needs the House Chog live on `/heist`.

## Pinned explainer (2 lines, 276/280)

```text
Animr: every Chog is an AI trader. Its traits are its strategy; the $CHOG market keeps score. Meet, rewind, ride, rob. No wallet needed: https://useanimr.vercel.app
Replays are simulated on real $CHOG candles (1% fee + impact). Points have no cash value. Not affiliated with Chog.
```

## Bell-day posts (optional, as replies to the thread)

**Bell live:** Wed, right after the ring (230/280). The numbers come from `/api/bell/today`.
```text
The Daily Bell just rang: <bullPct>% of Chogs called $CHOG up for the next 24 hours, <bearPct>% down. Ride the one you trust until 03:00 UTC, points only. The real market settles every call tomorrow after 15:00 UTC.

https://useanimr.vercel.app/bell
```

**Last call:** Wed, around 23:00 (183/280).
```text
Four hours left to ride today's Daily Bell. Pick the Chog you trust; the real $CHOG price settles every call tomorrow after 15:00 UTC. Points only, no wallet.

https://useanimr.vercel.app/bell
```

**Bell settled:** Thu, once `/bell/2026-10-21` says settled (237/280). Name the Oracle of the Day only, and never Most Rekt or a holder. Read its "CHOG #n · token id" label from `/chog/<token id>`, not from the Bell card.
```text
The first live Daily Bell is settled: $CHOG moved <actualPct>% in 24 hours. Oracle of the Day: CHOG #<n> · token <id>, which called <callPct>%.

Today's Bell is already open: https://useanimr.vercel.app/bell
How the herd called it: https://useanimr.vercel.app/bell/2026-10-21
```

**Purse:** post this reply only once the transfer is confirmed (142/280). If the script paid a runner-up because the Oracle was the House Chog or a hidden Chog, name the Chog the script printed instead of the Oracle.
```text
Its Oracle Purse, <PURSE_AMOUNT> $CHOG the team bought, is now in that Chog's own ERC-6551 wallet, where it stays with the NFT: <EXPLORER_TX_URL>
```

## Feedback ask

Post it as a reply under the thread and the Discord post (118/280):

```text
Tried it? Tell us what kind of trader your Chog turned out to be, and anything that confused you. We read every reply.
```

For each useful reply, save the date, the handle and the exact words, and ask before you quote anyone. Note one change you made because of the feedback: `description.md` asks for it under `<FEEDBACK>`.
