import { TOUR_STEP_COUNT } from "@/components/tour/steps";
import { MANUAL_RUN_INTERVAL_MS } from "@/lib/agent/types";
import { BELL_HOUR_UTC, HORIZON_HOURS } from "@/lib/bell/rules";
import { CHOG_SUPPLY } from "@/lib/chog-id";
import { REPLAY } from "@/lib/dna/genome";
import { HEIST_TITLE } from "@/lib/heist/config";
import { VERSUS_DAILY_POINTS_CAP, VERSUS_HOURS, VERSUS_POINTS_PER_WIN } from "@/lib/rewind/rules";
import { ADDR, HOUSE, LINKS } from "../facts";
import type { DocContent } from "../frame";
import { Address, Callout, Code, DocLink, DocTable, Ext, P, StepList } from "../primitives";
import { LeagueNow } from "./live";

const supply = CHOG_SUPPLY.toLocaleString("en-US");

// ---------------------------------------------------------------- Welcome to Animr (/docs)

export const welcome: DocContent = {
  intro: (
    <>
      <P lead={`Animr turns all ${supply} Chog Genesis NFTs into traders.`}>
        Each Chog&apos;s on-chain traits compile into a published, versioned trading genome, and each Chog owns its own
        ERC-6551 wallet on Monad mainnet. Anyone can meet the Chogs, replay them on the real chart, race them, ride their
        daily calls and try to rob one, with no wallet and no sign-up. Holders can also give their Chog an AI brain and,
        if they choose, let it trade the real $CHOG in its wallet through a guard contract that never lets it withdraw.
      </P>
    </>
  ),
  sections: [
    {
      id: "one-score",
      title: "One score: $CHOG stacked vs just holding",
      body: (
        <>
          <P lead="Every result in Animr is measured the same way.">
            A Chog&apos;s score is its value at the end, in $CHOG (its $CHOG plus any WMON priced in $CHOG), divided by
            the $CHOG it started with, minus one. Fees and price impact count, so the only way up is to end with more
            $CHOG than holding would have kept.
          </P>
          <P>
            In a replay every Chog starts from the same {REPLAY.startChog.toLocaleString("en-US")} $CHOG. Just holding
            stays at {REPLAY.startChog.toLocaleString("en-US")}, so the final value is the edge. Most Chogs lose to holding
            over a given window, which is what makes the winners interesting.
          </P>
          <LeagueNow />
        </>
      ),
    },
    {
      id: "nft-is-the-trader",
      title: "The NFT is the trader",
      body: (
        <>
          <P lead="Without the NFT there is no trader, no wallet and no authority.">
            Animr isn&apos;t an app with an NFT attached. The Chog is its trader&apos;s DNA, the key to its wallet and the
            only voice its AI obeys.
          </P>
          <ul>
            <li>
              <strong>No NFT, no trader.</strong> The genome is a pure function of the token&apos;s traits, so the same
              Chog always trades the same way. See <DocLink href="/docs/trading-dna">Trading DNA</DocLink>.
            </li>
            <li>
              <strong>No NFT, no wallet.</strong> The wallet address is derived by the canonical ERC-6551 registry from the
              Chog contract and token ID. Whoever holds the NFT controls the wallet. See{" "}
              <DocLink href="/docs/chog-wallet">Your Chog&apos;s wallet</DocLink>.
            </li>
            <li>
              <strong>No NFT, no authority.</strong> Waking the AI, switching it to on-chain trading, granting the guard and
              setting limits all need the current holder, checked against <Code>ownerOf</Code> on-chain.
            </li>
            <li>
              <strong>One transfer moves everything.</strong> A sale hands over the trader, its wallet and every token in
              it, its record and its trophies. The seller&apos;s guard settings go dormant, and the buyer opts in again
              under their own limits.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "what-you-can-do",
      title: "What you can do",
      body: (
        <DocTable
          caption="Animr's features"
          head={["Feature", "What it is", "Wallet"]}
          rows={[
            [<DocLink key="l" href="/docs/league">League and Traits</DocLink>, `All ${supply} Chogs ranked against just holding; which trait values win.`, "No"],
            [<DocLink key="t" href="/docs/time-machine">Time Machine</DocLink>, "One Chog replayed trade by trade on the real chart, or two raced.", "No"],
            [<DocLink key="v" href="/docs/versus">Versus</DocLink>, `Two Chogs race a hidden ${VERSUS_HOURS} hours of real $CHOG history. Call the winner.`, "No"],
            [<DocLink key="b" href="/docs/breed">Breed</DocLink>, "Two Chogs make a child that trades the same chart.", "No"],
            [<DocLink key="d" href="/docs/daily-bell">Daily Bell</DocLink>, `Every Chog calls $CHOG's next ${HORIZON_HOURS} hours at ${BELL_HOUR_UTC}:00 UTC. Ride one for points.`, "No"],
            [<DocLink key="r" href="/docs/rob-this-chog">{HEIST_TITLE}</DocLink>, "Con the House Chog's AI, then watch Monad refuse the transfer.", "No"],
            [<DocLink key="a" href="/docs/ask-this-chog">Ask this Chog</DocLink>, "Ask a Chog's AI about its trades and its DNA.", "No"],
            [<DocLink key="w" href="/docs/chog-wallet">Your Chog&apos;s wallet</DocLink>, "Create the Chog's ERC-6551 wallet in one transaction.", "Holder"],
            [<DocLink key="c" href="/docs/claim-its-ai">Claim its AI</DocLink>, "One free signature gives the Chog an LLM brain on 0G Compute.", "Holder"],
            [<DocLink key="g" href="/docs/trade-guard">AnimrTradeGuard</DocLink>, "Let the AI trade the wallet's real $CHOG within your limits.", "Holder"],
          ]}
        />
      ),
    },
    {
      id: "where-everything-lives",
      title: "Where everything lives",
      body: (
        <>
          <P>
            Everything runs on Monad mainnet (chain 143). Addresses link to {LINKS.explorerName}, the explorer the app
            uses.
          </P>
          <DocTable
            caption="Where everything lives"
            head={["What", "Where"]}
            rows={[
              ["Live app", <Ext key="app" href={LINKS.app}>{LINKS.app.replace("https://", "")}</Ext>],
              [
                "Key pages",
                <span key="pages">
                  <DocLink href="/app">/app</DocLink> (look up any Chog), <DocLink href="/league">/league</DocLink>,{" "}
                  <DocLink href="/traits">/traits</DocLink>, <DocLink href="/versus">/versus</DocLink>,{" "}
                  <DocLink href="/bell">/bell</DocLink>, <DocLink href="/heist">/heist</DocLink>,{" "}
                  <DocLink href="/guard">/guard</DocLink>, <DocLink href="/stats">/stats</DocLink>,{" "}
                  <DocLink href="/tour">/tour</DocLink>
                </span>,
              ],
              ["Chog Genesis NFT (ERC-721)", <Address key="nft" address={ADDR.chogNft} kind="contract" />],
              ["$CHOG (ERC-20, 18 decimals)", <Address key="chog" address={ADDR.chogToken} kind="contract" />],
              ["CHOG/WMON pool (Capricorn CL, 1% fee)", <Address key="pool" address={ADDR.pool} kind="contract" />],
              ["ERC-6551 Registry v0.3.1", <Address key="reg" address={ADDR.registry} kind="contract" />],
              ["Tokenbound AccountProxy (implementation)", <Address key="proxy" address={ADDR.accountProxy} kind="contract" />],
              ["Tokenbound AccountV3Upgradable", <Address key="v3" address={ADDR.accountV3} kind="contract" />],
              ["AnimrTradeGuard", <Address key="guard" address={ADDR.guard} kind="contract" />],
              ["AnimrTrophies", <Address key="trophies" address={ADDR.trophies} kind="contract" />],
              [`House Chog wallet (${HOUSE.label})`, <Address key="house" address={HOUSE.wallet} kind="wallet" />],
              ["Explorer", <Ext key="exp" href={LINKS.explorer}>{LINKS.explorer.replace("https://", "")}</Ext>],
            ]}
          />
          <P>
            More addresses (WMON, the swap router, QuoterV2, Multicall3 and the keys) are in{" "}
            <DocLink href="/docs/contracts-and-api">Contracts and API</DocLink>.
          </P>
        </>
      ),
    },
    {
      id: "honesty",
      title: "What to keep in mind",
      body: (
        <Callout tone="honest" title="Simulated where it says so">
          <p>
            The League, Time Machine, Versus and Breed replay each genome over real hourly CHOG/WMON candles with the
            pool&apos;s 1% fee and price impact. They are simulations, not a track record. Bell and Versus points have no
            cash value. Animr is an independent Chogathon 2026 project and is not affiliated with Chog. The full list is in{" "}
            <DocLink href="/docs/trust">Trust model and FAQ</DocLink>.
          </p>
        </Callout>
      ),
    },
  ],
};

// ---------------------------------------------------------------- How it works

export const howItWorks: DocContent = {
  sections: [
    {
      id: "flow",
      title: "End to end",
      body: (
        <StepList
          steps={[
            {
              title: "Traits become a genome",
              body: (
                <p>
                  A committed snapshot (<Code>data/chogs.json</Code>) holds all {supply} Chogs and their 13 traits, read from
                  each token&apos;s on-chain metadata. The genome compiler turns those traits into 8 genes: signal, horizon,
                  trigger, size, exit, bias, tempo and nerve.
                </p>
              ),
            },
            {
              title: "The genome replays the real chart",
              body: (
                <p>
                  At every hourly close of the CHOG/WMON pool the genome&apos;s instinct decides to buy, sell or hold. A
                  paper venue fills the trade with the 1% fee and price impact, and the result is valued in $CHOG. This
                  drives the League, the Time Machine, Versus and Breed.
                </p>
              ),
            },
            {
              title: "Every Chog makes a daily call",
              body: (
                <p>
                  At {BELL_HOUR_UTC}:00 UTC the Daily Bell rings: every Chog publishes a {HORIZON_HOURS}-hour $CHOG call
                  from its genome, or from its AI if a holder has woken it. {HORIZON_HOURS} hours later the real price
                  settles every call.
                </p>
              ),
            },
            {
              title: "Every Chog has a wallet",
              body: (
                <p>
                  The ERC-6551 registry derives one wallet address per Chog. A holder creates and initializes it in one
                  transaction. Tokens can be sent to the address even before then.
                </p>
              ),
            },
            {
              title: "A holder wakes its AI",
              body: (
                <p>
                  One free signed message from the current holder gives the Chog an LLM brain on 0G Compute. It
                  paper-trades from the wallet&apos;s real balances at live prices, and every decision keeps its 0G receipt.
                </p>
              ),
            },
            {
              title: "Optionally, it trades for real",
              body: (
                <p>
                  The holder grants AnimrTradeGuard, sets limits and signs a switch to on-chain mode. From then on the
                  AI&apos;s key can call one function, <Code>trade()</Code>, which swaps CHOG and WMON inside the same
                  wallet within those limits.
                </p>
              ),
            },
            {
              title: "A sale moves everything",
              body: (
                <p>
                  The buyer receives the NFT, its wallet and every token in it, its record and its trophies. The
                  seller&apos;s guard settings go dormant because they are keyed to the holder.
                </p>
              ),
            },
          ]}
        />
      ),
    },
    {
      id: "picture",
      title: "The picture",
      body: (
        <>
          <DocTable
            caption="How the pieces connect"
            head={["Piece", "Feeds", "Notes"]}
            rows={[
              ["Chog NFT", "Genome, wallet, authority", "13 traits; the token ID derives the wallet; ownerOf gates every holder action"],
              ["Genome", "Replays, Bell calls, the AI's character sheet", "One genome drives the rules brain, the LLM prompt and the Bell forecast"],
              ["Hourly candles", "League, Time Machine, Versus, Breed, Bell settlement", "GeckoTerminal for the CHOG/WMON pool, with a committed history file"],
              ["AI brain", "Decisions with 0G receipts", "LLM on 0G Compute; the genome's rules decide if the model fails"],
              ["Guardrails", "Every decision", "Confidence floor, size cap, slippage range and cooldown, whatever decided"],
              ["Execution", "Paper fill or guard.trade()", "Swap output always lands back in the same wallet"],
            ]}
          />
          <P>
            Details of each step: <DocLink href="/docs/architecture">Architecture</DocLink>,{" "}
            <DocLink href="/docs/claim-its-ai">Claim its AI</DocLink> and{" "}
            <DocLink href="/docs/trade-guard">AnimrTradeGuard</DocLink>.
          </P>
        </>
      ),
    },
    {
      id: "who-does-what",
      title: "Who can do what",
      body: (
        <DocTable
          caption="Roles"
          head={["Who", "Needs", "Can"]}
          rows={[
            ["Visitor", "Nothing", "Every Play feature. Bell and Versus picks use an anonymous cookie, never a wallet."],
            ["Holder", "The wallet that holds the Chog", "Create its wallet, wake its AI, opt in to guarded trading, hide it from public pages"],
            ["Buyer of a Chog", "The NFT", "Everything above, after signing again; the seller's limits don't carry over"],
            ["Animr's server", "Its operator key, gas only", "Run brains, ring and settle Bells, call guard.trade() within each holder's limits"],
          ]}
        />
      ),
    },
  ],
};

// ---------------------------------------------------------------- Judge quick start

export const judgeQuickStart: DocContent = {
  intro: (
    <Callout title="Start with the guided tour">
      <p>
        <DocLink href="/tour">/tour</DocLink> walks through Animr in {TOUR_STEP_COUNT} stops, each opening the real page.
        No Chog, wallet or sign-up needed. It works on desktop and phones.
      </p>
    </Callout>
  ),
  sections: [
    {
      id: "sixty-seconds",
      title: "The 60-second version",
      body: (
        <StepList
          steps={[
            {
              title: <DocLink href="/heist">Rob this Chog</DocLink>,
              body: (
                <p>
                  Press <strong>Run the check</strong>. Monad mainnet refuses the AI key&apos;s transfer of the House
                  Chog&apos;s $CHOG out of its wallet: Tokenbound answers <Code>NotAuthorized()</Code>, and the same call
                  from the real owner goes through. Nothing is broadcast.
                </p>
              ),
            },
            {
              title: <DocLink href="/replay/2?vs=8">Time Machine race</DocLink>,
              body: <p>Press play. Two Chogs&apos; trait-compiled genomes race on real hourly $CHOG candles.</p>,
            },
            {
              title: <DocLink href="/bell">Daily Bell</DocLink>,
              body: <p>Ride a Chog on today&apos;s {BELL_HOUR_UTC}:00 UTC call. Your fan card is a cookie, not a wallet.</p>,
            },
          ]}
        />
      ),
    },
    {
      id: "no-wallet-path",
      title: "The full no-wallet path",
      body: (
        <DocTable
          caption="No-wallet path"
          head={["Stop", "Open", "What to look at"]}
          rows={[
            ["Meet", <DocLink key="1" href="/league">/league</DocLink>, "Press Random Chog. Its genome card shows 8 genes, each naming the trait that set it, and its League rank."],
            ["Traits", <DocLink key="2" href="/traits">/traits</DocLink>, "Which trait values win across all genomes."],
            ["Rewind", <DocLink key="3" href="/replay/1820">/replay/1820</DocLink>, "Press play. Switch windows (30d, 45d, max) or race a rival."],
            ["Versus", <DocLink key="4" href="/versus">/versus</DocLink>, `Call the Chog that stacks more $CHOG over a hidden ${VERSUS_HOURS} hours. A correct call adds ${VERSUS_POINTS_PER_WIN} points, up to ${VERSUS_DAILY_POINTS_CAP} a day.`],
            ["Ride", <DocLink key="5" href="/bell">/bell</DocLink>, "Pick a Chog to ride. Past Bells are under /bell/<YYYY-MM-DD>."],
            ["Rob", <DocLink key="6" href="/heist">/heist</DocLink>, "Chat with the House Chog, or press Run the check to run the mainnet check directly."],
            ["Guard", <DocLink key="7" href="/guard">/guard</DocLink>, "Reads AnimrTradeGuard's roles, pause switch and the House Chog's vault live from the chain."],
            ["Numbers", <DocLink key="8" href="/stats">/stats</DocLink>, "Live usage: fans, rides, Versus picks, heist attempts, claimed agents and 0G spend."],
          ]}
        />
      ),
    },
    {
      id: "names",
      title: "Two numbers per Chog",
      body: (
        <P lead="Marketplaces call Chogs by the number in their metadata name.">
          Animr&apos;s URLs and contracts use the token ID (1 to {supply}). They never coincide: &ldquo;CHOG #1462&rdquo; is
          token 1. The genome card, the Chog page and Versus show both, and the <DocLink href="/app">/app</DocLink> lookup
          and the League search accept either. The House Chog is {HOUSE.label}.
        </P>
      ),
    },
    {
      id: "if-you-hold",
      title: "If you hold a Chog",
      body: (
        <>
          <P>
            Open <Code>/chog/&lt;token id&gt;</Code> and connect the wallet that holds it. You need a little MON for gas.
          </P>
          <StepList
            steps={[
              { title: "Create its wallet", body: <p>One transaction creates and initializes its ERC-6551 account through Multicall3.</p> },
              { title: "Wake its AI", body: <p>Sign a free message. It can think right away with Think now, and every decision shows its 0G receipt.</p> },
              {
                title: "Optional: real trading",
                body: <p>Grant AnimrTradeGuard, set limits, fund the wallet with $CHOG or WMON and sign the switch to on-chain. You can disable or revoke at any time.</p>,
              },
            ]}
          />
        </>
      ),
    },
    {
      id: "troubleshooting",
      title: "If something looks off",
      body: (
        <ul>
          <li>
            <strong>Numbers differ from the video.</strong> Replay windows roll forward every hour, so ranks move. The
            genome version doesn&apos;t.
          </li>
          <li>
            <strong>The House Chog is napping.</strong> The heist&apos;s daily 0G budget is spent; it resets at 00:00 UTC.
            Run the check still runs the full mainnet check.
          </li>
          <li>
            <strong>Think now refuses.</strong> Each Chog can think on demand once every {MANUAL_RUN_INTERVAL_MS / 60_000}{" "}
            minutes, and there is a global daily cap. Chogs trading on-chain think only on schedule.
          </li>
          <li>
            <strong>Images are missing.</strong> The IPFS gateway rate-limits bursts. Reload.
          </li>
        </ul>
      ),
    },
  ],
};
