import { PAPER_FEE_BPS } from "@/lib/agent/paper";
import {
  BELL_HOUR_UTC,
  HORIZON_HOURS,
  MAX_FORECAST_PCT,
  REPLAY_DAYS,
  RIDE_WINDOW_HOURS,
  STREAK_BONUS_MAX,
  STREAK_BONUS_PER_DAY,
} from "@/lib/bell/rules";
import { TRAIT_TYPES } from "@/lib/breed/genetics";
import { ASK_LIMITS, CHAT_MODELS } from "@/lib/chog-chat/types";
import { CHOG_SUPPLY } from "@/lib/chog-id";
import { DEFAULT_WINDOW, REPLAY_WINDOWS } from "@/lib/dna/backtest";
import { GENOME_VERSION, REPLAY } from "@/lib/dna/genome";
import { TRAIT_ALPHA_MIN_COUNT } from "@/lib/dna/population";
import { DEFENDER_MODELS, HEIST_LIMITS, HEIST_TAGLINE } from "@/lib/heist/config";
import { DRAMA_WINDOWS, SETTLE_HOURS } from "@/lib/rewind/windows";
import { VERSUS_DAILY_POINTS_CAP, VERSUS_HOURS, VERSUS_POINTS_PER_WIN } from "@/lib/rewind/rules";
import { ADDR, HOUSE, PURSE_CHOG } from "../facts";
import type { DocContent } from "../frame";
import { Address, Callout, Code, DocLink, DocTable, P, StepList } from "../primitives";
import { LeagueNow } from "./live";

const supply = CHOG_SUPPLY.toLocaleString("en-US");
const start = REPLAY.startChog.toLocaleString("en-US");
const feePct = PAPER_FEE_BPS / 100;
const windows = REPLAY_WINDOWS.join(", ");
/** When rides close for a Bell rung on time: the ring hour plus the ride window, on the clock. */
const rideCloseHour = (BELL_HOUR_UTC + RIDE_WINDOW_HOURS) % 24;

// ---------------------------------------------------------------- League and Traits

export const league: DocContent = {
  intro: (
    <P lead={`The League replays all ${supply} Chogs over the same real candles and ranks them by one number.`}>
      That number is the Chog&apos;s edge over just holding $CHOG. Open it at <DocLink href="/league">/league</DocLink>;
      Random Chog opens a Chog&apos;s Time Machine.
    </P>
  ),
  sections: [
    {
      id: "how-a-replay-works",
      title: "How a replay works",
      body: (
        <>
          <StepList
            steps={[
              {
                title: "Real hourly candles",
                body: (
                  <p>
                    Hourly OHLCV for the CHOG/WMON pool comes from GeckoTerminal, priced in WMON per $CHOG. The public API
                    only serves 180 days, so the history is committed in <Code>data/chog-ohlcv-1h.json</Code> and the live
                    API tops it up. If the API fails, the committed file is the fallback.
                  </p>
                ),
              },
              {
                title: "One decision per hourly close",
                body: (
                  <p>
                    At every close the genome&apos;s instinct decides to buy, sell or hold. The first 24 hours of history
                    are only warm-up, because the genome reads the 24-hour change.
                  </p>
                ),
              },
              {
                title: `${feePct}% fee plus price impact`,
                body: (
                  <p>
                    A paper venue fills each trade with the pool&apos;s {feePct}% fee and a constant-product price impact
                    against about {(REPLAY.liquidityWmon / 1_000_000).toLocaleString("en-US")}M WMON of depth. Bigger trades
                    move the price more.
                  </p>
                ),
              },
              {
                title: `Every Chog starts with ${start} $CHOG`,
                body: (
                  <p>
                    Just holding stays at {start} $CHOG, so the final value is the edge. The same limits as a live agent
                    apply: the genome&apos;s cooldown, its trade size and exposure cap, and the confidence floor.
                  </p>
                ),
              },
            ]}
          />
          <P lead="The replay is deterministic.">
            The same genome over the same candles always makes the same trades. Results are cached per genome version,
            window and last candle.
          </P>
        </>
      ),
    },
    {
      id: "vs-holding",
      title: "What “vs holding” means",
      body: (
        <>
          <P lead="Edge = final value in $CHOG ÷ starting $CHOG − 1.">
            The final value counts the Chog&apos;s $CHOG plus any WMON it holds, priced in $CHOG at the last close. A Chog
            that never trades scores 0%. Every trade pays the fee and the price impact, so trading only helps if it ends with
            more $CHOG than it started with.
          </P>
          <LeagueNow />
        </>
      ),
    },
    {
      id: "windows",
      title: "Windows",
      body: (
        <>
          <P>
            Three windows: {windows}. The default is {DEFAULT_WINDOW}. The 30- and 45-day windows start at a UTC midnight,
            so their start moves once a day while their end moves every hour. Ranks therefore shift through the day; the
            genome itself never changes.
          </P>
          <Callout tone="honest">
            <p>League results are simulated on real $CHOG candles ({feePct}% fee + impact). They are a replay of rules over real data, not a track record.</p>
          </Callout>
        </>
      ),
    },
    {
      id: "traits",
      title: "Trait Alpha",
      body: (
        <P lead="Trait Alpha shows which trait values win.">
          For every trait value carried by at least {TRAIT_ALPHA_MIN_COUNT} Chogs, <DocLink href="/traits">/traits</DocLink>{" "}
          shows the median edge of those Chogs and the share that beat holding, in the same window. Rarer values are left
          out because their median would be noise. Trait names pass through the brand-safety filter.
        </P>
      ),
    },
    {
      id: "league-tabs",
      title: "Claimed Chogs, the market and hidden Chogs",
      body: (
        <ul>
          <li>
            <strong>Claimed vs Wild.</strong> The League can be filtered to claimed Chogs. A Chog nobody has claimed is
            shown as Wild: it trades on instinct, its genome&apos;s rules.
          </li>
          <li>
            <strong><DocLink href="/leaderboard">/leaderboard</DocLink></strong> lists every claimed AI by its PnL vs
            holding, paper and on-chain.
          </li>
          <li>
            <strong><DocLink href="/market">/market</DocLink></strong> shows Chog Genesis NFTs listed on OpenSea right now,
            ranked by how their genome did against holding.
          </li>
          <li>
            <strong>Hidden Chogs.</strong> A Chog its holder hid is left out of the rows. Every other row keeps its rank
            among all {supply}, and the headline stats stay the whole collection&apos;s.
          </li>
        </ul>
      ),
    },
  ],
};

// ---------------------------------------------------------------- Trading DNA

const genes: [string, string, string][] = [
  ["Signal", "Eyes", "What it reacts to: momentum, contrarian, panic, trend, dip, vibes, sleeper, or swing trader when no eye rule matches."],
  ["Horizon", "Side", "Facing right reads the hourly candle (an hourly move counts 3.5 times); otherwise it reads the last 24 hours."],
  ["Trigger", "Aura", "How big a daily move it waits for: hair trigger 6%, alert 9%, unbothered 12% (no aura), ice cold 15%, fine-tuned by its trait mix."],
  ["Size", "Head, else Tier", "Share of a balance per trade: big trades 40%, standard 25%, nibbles 12%. The Tier caps how much of the stack may sit in MON."],
  ["Exit", "Mouth, or a jeet Head", "Takes profit by buying $CHOG back once it is 4%, 6%, 12% or 25% cheaper than at its last trade."],
  ["Bias", "Accessory", "Permabull, permabear, knife catcher or neutral: shifts its buy and sell triggers."],
  ["Tempo", "Head, Accessory or Eyes", "Time between trades: the longer of its style's cooldown (2, 4 or 8 hours) and its trait's tempo."],
  ["Nerve", "WAGMI Head, skull or radioactive trait", "How it takes a loss: never sells at a loss, never sells into a drop, twitchy, or steady."],
];

export const tradingDna: DocContent = {
  intro: (
    <P lead="A Chog's genome is a pure function of its traits.">
      The genome compiler (<Code>lib/dna/genome.ts</Code>) reads a readable rule table: trait values match rules, rules
      set genes, and the first match wins. The current version is <Code>{GENOME_VERSION}</Code>.
    </P>
  ),
  sections: [
    {
      id: "genes",
      title: "The 8 genes",
      body: (
        <>
          <DocTable caption="Genes" head={["Gene", "Set by", "What it does"]} rows={genes} />
          <P>
            Every gene on a genome card names the trait that set it, when one did. A Chog without that trait gets the
            default.
          </P>
        </>
      ),
    },
    {
      id: "traits-to-genes",
      title: "How traits map to genes",
      body: (
        <>
          <ul>
            <li>
              <strong>Eyes pick the signal.</strong> Crying or worried eyes panic-sell; laser eyes chase breakouts;
              side-eyes and smirks fade the crowd; tired or closed eyes sleep through the noise; hearts and stars buy dips;
              visors, glasses and goggles ride trends; clown and dizzy eyes trade on a seeded coin flip.
            </li>
            <li>
              <strong>Auras set the trigger.</strong> Burning and fiery auras jump at small moves; cool, aqua and ice
              auras wait for big ones.
            </li>
            <li>
              <strong>Hats size the trades.</strong> Crowns, diamonds and MEGA caps trade 40% of a balance; beanies and
              bucket hats nibble 12%.
            </li>
            <li>
              <strong>Mouths take profit.</strong> Gold teeth and coins take it early; drool, bubbles and tongues let it
              run.
            </li>
            <li>
              <strong>Accessories add a bias or a pace.</strong> A green candle makes a permabull, a red one a permabear,
              a blade a knife catcher; a cigar or pipe slows it to 12 hours between trades.
            </li>
          </ul>
          <P>
            The Tier sets the exposure cap (Legendary 80%, Epic 65%, Rare 55%, Uncommon 45%, Common 40% of the stack in
            MON) and a conviction bonus. A seed from all of the Chog&apos;s traits fine-tunes its trigger by up to ±15%.
          </P>
        </>
      ),
    },
    {
      id: "archetype",
      title: "Archetype and style",
      body: (
        <>
          <P lead="Each genome gets a name and a style.">
            The archetype is the signal&apos;s name with an optional prefix from its strongest other gene, for example
            &ldquo;Royal Laser Chaser&rdquo; or &ldquo;Paper Paws&rdquo;. The style (aggressive, balanced or cautious)
            comes from a score over its signal, trigger, size and tempo, and sets its default cooldown.
          </P>
          <P>
            The ten 1:1 Legendaries have no visual traits, so they get signature traits from their names, and their genes
            are labelled as such.
          </P>
        </>
      ),
    },
    {
      id: "determinism",
      title: "Versioned and deterministic",
      body: (
        <>
          <P lead={`GENOME_VERSION is g<rev>-<hash>, currently ${GENOME_VERSION}.`}>
            The hash is a keccak256 of the whole rule table and the replay constants. Change any rule or number and the
            version changes, and it is shown next to every result. Anyone can re-run a genome from the token&apos;s traits
            and get the same trader.
          </P>
          <P lead="One genome drives everything.">
            The replay engine, the live rules brain, the AI&apos;s character sheet and the Daily Bell forecast all read the
            same genome. Brand-safe display names never change the genome: it is derived from the raw traits.
          </P>
        </>
      ),
    },
  ],
};

// ---------------------------------------------------------------- Time Machine

export const timeMachine: DocContent = {
  intro: (
    <P lead="The Time Machine replays one Chog on the real chart, trade by trade.">
      Open <Code>/replay/&lt;token id&gt;</Code>, for example <DocLink href="/replay/1820">/replay/1820</DocLink>, or
      press Random Chog in the League.
    </P>
  ),
  sections: [
    {
      id: "what-you-see",
      title: "What you see",
      body: (
        <ul>
          <li>Its genome card: 8 genes, each naming the trait that set it, its archetype and its League rank.</li>
          <li>Press play: its trades appear on the hourly CHOG/WMON chart as they happen, narrated in its own voice.</li>
          <li>Play, pause, change speed or scrub the timeline. The run ends with a verdict: its edge over just holding, with a link to share.</li>
          <li>
            Switch windows ({windows}). The engine is the same one the League uses, so the numbers match its League row.
          </li>
        </ul>
      ),
    },
    {
      id: "race",
      title: "Race two Chogs",
      body: (
        <P>
          Add <Code>?vs=&lt;token id&gt;</Code> to race a rival on the same candles, for example{" "}
          <DocLink href="/replay/2?vs=8">/replay/2?vs=8</DocLink>. Both genomes see exactly the same hours, so the
          difference is only their traits.
        </P>
      ),
    },
    {
      id: "notes",
      title: "Notes",
      body: (
        <>
          <P>
            Every replay has a share card, and the replay API is <Code>GET /api/dna/&lt;tokenId&gt;/replay?window=</Code>. A
            Chog its holder hid has no public replay.
          </P>
          <Callout tone="honest">
            <p>Simulated on real $CHOG candles ({feePct}% fee + impact). No tokens move.</p>
          </Callout>
        </>
      ),
    },
  ],
};

// ---------------------------------------------------------------- Versus

export const versus: DocContent = {
  intro: (
    <P lead={`Two Chogs trade the same hidden ${VERSUS_HOURS} hours of real $CHOG history.`}>
      You call the one that stacks more $CHOG, watch the race, and then the real dates are revealed. Start at{" "}
      <DocLink href="/versus">/versus</DocLink>.
    </P>
  ),
  sections: [
    {
      id: "hidden-windows",
      title: "Hidden windows",
      body: (
        <>
          <P lead={`Every bout is ${VERSUS_HOURS} hourly steps of real CHOG/WMON history.`}>
            Windows are ranked for drama: stretches with both a pump and a dump, scored the same whichever way the market
            went. The list keeps the top {DRAMA_WINDOWS}, spaced apart so no two share much of their hours, and every
            window ends at least {SETTLE_HOURS} hours before the newest candle.
          </P>
          <P>
            Before your pick the bout shows no dates, and prices are an index that starts at 100, so you can&apos;t look the
            answer up.
          </P>
        </>
      ),
    },
    {
      id: "picks-and-points",
      title: "Picks and points",
      body: (
        <ul>
          <li>Your first pick on a bout counts. A correct call adds {VERSUS_POINTS_PER_WIN} points, up to {VERSUS_DAILY_POINTS_CAP} points per UTC day; picks past the cap still count in your record.</li>
          <li>Points go to the same cookie fan card as the Daily Bell. No wallet, no sign-up.</li>
          <li>Spectating (<Code>?spectate=1</Code>) shows the whole race with no pick and no points, and uses up that bout&apos;s pick.</li>
        </ul>
      ),
    },
    {
      id: "pairs-and-links",
      title: "Pairs and shared links",
      body: (
        <>
          <P>
            A random bout pairs two Chogs with different signals, never a brand-safety flagged or hidden one. To choose the
            fighters, call <Code>GET /api/versus/new?a=&lt;id&gt;&amp;b=&lt;id&gt;</Code>; name only one for a random rival.
          </P>
          <P>
            A bout ID encodes both Chogs and the window&apos;s first hour, scrambled so a shared link doesn&apos;t give the
            dates away. Any <Code>/versus/&lt;id&gt;</Code> link replays the same bout.
          </P>
          <Callout tone="honest">
            <p>Points only, never money. Races are simulated on real $CHOG candles ({feePct}% fee + impact).</p>
          </Callout>
        </>
      ),
    },
  ],
};

// ---------------------------------------------------------------- Breed

export const breed: DocContent = {
  intro: (
    <P lead="Breed makes a child from two Chogs and replays all three on the same chart.">
      Open <DocLink href="/breed">/breed</DocLink> and pick two Chogs, or share <Code>/breed?a=&lt;id&gt;&amp;b=&lt;id&gt;</Code>.
    </P>
  ),
  sections: [
    {
      id: "genetics",
      title: "Genetics rules",
      body: (
        <ul>
          <li>
            The child has the same {TRAIT_TYPES.length} trait types as every Chog. Each one comes whole from one parent.
          </li>
          <li>
            Which parent passes a trait is a hash of the two token IDs (lower first) and the trait type. The same pair
            always makes the same child, in either order.
          </li>
          <li>A parent without a trait type passes the absence: the child has none either.</li>
          <li>
            The child&apos;s name takes the first word of one parent&apos;s name and the rest of the other&apos;s, picked by
            the same hash. If that only repeats a parent&apos;s name, it becomes &ldquo;Jr.&rdquo;.
          </li>
        </ul>
      ),
    },
    {
      id: "trading",
      title: "How the child trades",
      body: (
        <>
          <P>
            The child&apos;s Trading DNA comes from the same genome compiler as every Chog. The child and both parents
            replay the same real candles with the same engine as the League, over the default {DEFAULT_WINDOW} window. The
            verdict says whether the child beat both parents, landed between them, or did worse than both.
          </P>
          <Callout tone="honest">
            <p>Nothing is minted and nothing trades: the child exists only on the page. Simulated on real $CHOG candles.</p>
          </Callout>
        </>
      ),
    },
  ],
};

// ---------------------------------------------------------------- Daily Bell

export const dailyBell: DocContent = {
  intro: (
    <P lead={`Every day at ${BELL_HOUR_UTC}:00 UTC every Chog publishes a ${HORIZON_HOURS}-hour $CHOG call.`}>
      Fans ride the Chog they trust, and {HORIZON_HOURS} hours later the real price settles every call. Open it at{" "}
      <DocLink href="/bell">/bell</DocLink>; past Bells are at <Code>/bell/&lt;YYYY-MM-DD&gt;</Code>.
    </P>
  ),
  sections: [
    {
      id: "ring",
      title: `The ring at ${BELL_HOUR_UTC}:00 UTC`,
      body: (
        <>
          <P>
            The ring waits 60 seconds so the candle that closes at {BELL_HOUR_UTC}:00 is in the data. Then every one of the{" "}
            {supply} Chogs makes a call: a % move over the next {HORIZON_HOURS} hours, a conviction and a one-line thesis.
          </P>
          <ul>
            <li>Unclaimed Chogs call from their genome.</li>
            <li>Claimed Chogs call through one run of their AI on 0G Compute, a few at a time with a timeout. If the AI fails, the genome makes the call.</li>
            <li>Every forecast is clamped to ±{MAX_FORECAST_PCT}%.</li>
          </ul>
          <P>
            On production the external pulse calls the Bell route at minute 1 of every hour, so the ring lands at{" "}
            {BELL_HOUR_UTC}:01 UTC. Vercel&apos;s own {BELL_HOUR_UTC}:00 cron fires anywhere within that hour on the Hobby
            plan, so the pulse is what makes the time predictable. A deployment that comes up after {BELL_HOUR_UTC}:00
            rings that day&apos;s Bell at its first trigger: late, but still live, and its calls count from that later price.
          </P>
        </>
      ),
    },
    {
      id: "settlement",
      title: "Settlement",
      body: (
        <>
          <P lead={`A call settles on the real hourly close ${HORIZON_HOURS} hours after the ring.`}>
            Settlement waits 10 minutes past the horizon and only trusts candles fetched at least 5 minutes after it. If the
            pool had no trade in that hour, the Bell settles on the last close, provided it is no more than 6 hours old,
            once data fetched 2 hours later still shows no trade.
          </P>
          <P lead="Score: points = max(0, 100 − 4 × miss in % points), plus 20 when the direction is right.">
            Each Bell names an Oracle of the Day (the closest call) and a Most Rekt (the furthest; between equal misses, the
            more confident call is more rekt). Season records track oracle wins.
          </P>
          <P lead={`On production that is ${BELL_HOUR_UTC}:11 UTC the next day: the ${HORIZON_HOURS}-hour horizon plus the 10-minute grace, on the pulse's minute-11 run.`}>
            The same maintenance run mints the Best call and Most rekt trophies into the winners&apos; wallets (
            <DocLink href="/docs/trophies">Trophy cabinet</DocLink>), the AI recap is written on the first request after
            settlement, and the Oracle Purse follows (below).
          </P>
        </>
      ),
    },
    {
      id: "rides",
      title: "Rides and points",
      body: (
        <ul>
          <li>Ride one Chog per Bell, within {RIDE_WINDOW_HOURS} hours of the ring: until {String(rideCloseHour).padStart(2, "0")}:00 UTC for a Bell rung on time. Your fan card is an httpOnly cookie; your public fan ID is a hash of it.</li>
          <li>A ride counts from the first hourly close after you pick, so a late ride can&apos;t cash in on a move it already saw.</li>
          <li>Your ride scores your Chog&apos;s call with the formula above, against the move from your ride&apos;s start to settlement.</li>
          <li>Streak bonus: +{STREAK_BONUS_PER_DAY} for each consecutive Bell you rode, up to +{STREAK_BONUS_MAX}.</li>
          <li>A ride taken after the window closes, or before the first live Bell, is booked on the next Bell.</li>
        </ul>
      ),
    },
    {
      id: "live-vs-replay",
      title: "Live and replayed Bells",
      body: (
        <P>
          The {REPLAY_DAYS} days before the first live ring are rebuilt from real candles with genome calls only and are
          labelled &ldquo;Replayed Bell&rdquo;. A live Bell shows its provisional move since the ring until it settles.
          Replayed Bells never award trophies or purses.
        </P>
      ),
    },
    {
      id: "oracle-purse",
      title: "Oracle Purse",
      body: (
        <>
          <P lead="After a live Bell settles, real $CHOG goes into the Oracle's own wallet.">
            The amount is <Code>ORACLE_PURSE_CHOG</Code>, whole $CHOG per settled live Bell; unset or <Code>0</Code> means no
            purse is promised.{" "}
            {PURSE_CHOG
              ? `This deployment is configured for ${PURSE_CHOG} $CHOG per Bell.`
              : "This deployment has no purse configured, so its Bells promise none."}{" "}
            It is paid from the House key into the winning Chog&apos;s ERC-6551 wallet, so the purse belongs to the NFT and
            passes to its next holder. It is a transfer by the team, not contract logic.
          </P>
          <ul>
            <li>
              It is sent automatically: after settlement, a scheduled job the team runs executes{" "}
              <Code>scripts/send-oracle-purse.mts</Code>, which picks the winner, simulates the transfer, sends it and
              records the transaction hash.
            </li>
            <li>The winner is the Oracle of the Day the Bell page shows. The House Chog never pays itself (its runner-up wins instead), and a Chog its holder hid is never named.</li>
            <li>One purse per Bell: the record is claimed before the broadcast, so a re-run can&apos;t pay twice. Replayed Bells never get one.</li>
            <li>The Bell page shows the purse as &ldquo;on its way&rdquo; from settlement, then &ldquo;sent&rdquo; with the transaction once it is recorded. If nothing is recorded within 48 hours it says so plainly rather than keep promising.</li>
            <li>Fans never receive $CHOG.</li>
          </ul>
          <P>
            The live Bell&apos;s Oracle of the Day and Most Rekt also get a soulbound trophy in their wallets. See{" "}
            <DocLink href="/docs/trophies">Trophy cabinet</DocLink>.
          </P>
        </>
      ),
    },
    {
      id: "triggers",
      title: "What triggers a Bell",
      body: (
        <>
          <ul>
            <li>Vercel Cron calls <Code>GET /api/bell/cron</Code> at 15:00 and 16:00 UTC; on the Hobby plan each fires anywhere within its hour.</li>
            <li>
              An external hourly pulse calls the same route at minutes 1 and 11 (<Code>1,11 * * * *</Code>), with{" "}
              <Code>CRON_SECRET</Code> as a Bearer header: the ring at {BELL_HOUR_UTC}:01, the settlement at {BELL_HOUR_UTC}:11,
              and a catch-up every other hour. A second pulse at minute 30 (<Code>30 * * * *</Code>) calls{" "}
              <Code>GET /api/agent/tick</Code> for the agents, not the Bell.
            </li>
            <li>Visiting a Bell page also catches up anything that is due.</li>
          </ul>
          <P>Ringing and settling are idempotent and hold a lock, so overlapping triggers are safe.</P>
          <Callout tone="honest">
            <p>Points only: a game score, never money and never a wager.</p>
          </Callout>
        </>
      ),
    },
  ],
};

// ---------------------------------------------------------------- Rob this Chog

export const robThisChog: DocContent = {
  intro: (
    <>
      <P lead={`${HEIST_TAGLINE}`}>
        The House Chog{HOUSE.name ? `, ${HOUSE.name} (${HOUSE.label}),` : ` (${HOUSE.label})`} keeps $CHOG in its own
        Tokenbound wallet on Monad mainnet. Anyone can try to talk its AI into handing it over at{" "}
        <DocLink href="/heist">/heist</DocLink>.
      </P>
      <P lead="Public by design, and only ever the House Chog.">
        Anyone can play, with no wallet and no sign-up. The target is fixed by <Code>HOUSE_CHOG_TOKEN_ID</Code>: no
        holder&apos;s Chog can be picked, and the defender has no keys and no tools, so a lost argument costs nothing but
        pride.
      </P>
    </>
  ),
  sections: [
    {
      id: "rules",
      title: "The rules",
      body: (
        <ul>
          <li>Messages of at most {HEIST_LIMITS.maxMessageChars} characters, {HEIST_LIMITS.minTurns} to {HEIST_LIMITS.maxTurns} messages per heist. The defender&apos;s patience comes from its genome&apos;s cooldown; the House Chog&apos;s AI gives {HOUSE.patience}.</li>
          <li>Per-IP limits on messages, heists and proofs, and a global cap of {HEIST_LIMITS.globalProofsPerMinute} proofs a minute to protect the public RPC.</li>
          <li>
            A daily 0G budget (<Code>HEIST_DAILY_USD_CAP</Code>, default $3) is reserved before each reply. When it is spent,
            the House Chog naps until 00:00 UTC. Run the check still works while it naps.
          </li>
          <li>If its wallet isn&apos;t created and funded yet, the page says it is still moving in and makes no claim.</li>
        </ul>
      ),
    },
    {
      id: "the-ai",
      title: "The AI you are talking to",
      body: (
        <P lead="The defender is not the trading brain.">
          It is a separate persona with no tools and no keys, and it can only produce text. It runs on 0G Compute (
          {DEFENDER_MODELS.map((m, i) => (
            <span key={m}>
              {i > 0 && ", then "}
              <Code>{m}</Code>
            </span>
          ))}
          , then a template defender). Each reply is structured (reply, intent, amount, temptation), then cleaned and
          moderated.
        </P>
      ),
    },
    {
      id: "the-proof",
      title: "The proof: AI said yes, Monad said no",
      body: (
        <>
          <P>
            When the AI caves, or when you press <strong>Run the check</strong>, the server runs read-only{" "}
            <Code>eth_call</Code>s against Monad mainnet, all pinned to one block:
          </P>
          <StepList
            steps={[
              {
                title: "The wallet must be real",
                body: <p>The House Chog&apos;s wallet must be deployed, initialized and hold $CHOG. Otherwise no claim is made, because an empty or uninitialized account accepts everything.</p>,
              },
              {
                title: "Is the AI key a signer?",
                body: <p><Code>isValidSigner(aiKey)</Code> runs first, so a key the wallet accepts is never reported as refused.</p>,
              },
              {
                title: "The theft attempt",
                body: (
                  <p>
                    <Code>wallet.execute($CHOG.transfer(recipient, amount))</Code> sent from the AI key must fail with{" "}
                    <Code>NotAuthorized()</Code>. The same call from <Code>owner()</Code> must succeed, as a control: the
                    refusal is about the key, not the transfer.
                  </p>
                ),
              },
              {
                title: "The one legitimate door",
                body: (
                  <p>
                    The proof also simulates <Code>guard.trade(wallet, sell, …)</Code> from the same key, for the vault&apos;s
                    whole $CHOG balance (or the amount the AI agreed to). Against the House Chog&apos;s limits, 10% per
                    trade, the whole vault is refused with the guard&apos;s decoded reason,{" "}
                    <Code>TradeRejected(&quot;exceeds per-trade cap&quot;)</Code>. A sell within the limits would be allowed,
                    and even then its output lands back in the same wallet.
                  </p>
                ),
              },
            ]}
          />
          <P>
            So the proof is two <Code>eth_call</Code>s from the AI key, the wallet&apos;s <Code>execute()</Code> and the
            guard&apos;s <Code>trade()</Code>, plus the owner&apos;s control call, all at one block. Nothing is ever broadcast.
            The page shows the block number and explorer links. Every attempt, cave and refusal is counted: the header
            badge shows today&apos;s attempts and <DocLink href="/stats">/stats</DocLink> the totals.
          </P>
        </>
      ),
    },
    {
      id: "why-not-authorized",
      title: "Why the answer is NotAuthorized",
      body: (
        <>
          <P lead="A Tokenbound wallet obeys its NFT's owner and nobody else by default.">
            The AI key isn&apos;t the owner, and the owner never gave it Tokenbound permission. The only permission the
            owner grants is to AnimrTradeGuard, which can only build a swap whose output returns to the same wallet. So a
            talked-round AI has nothing to sign that moves the $CHOG out.
          </P>
          <P>
            The AI key the proof uses is the guard&apos;s own <Code>operator()</Code> at that block (today{" "}
            <Address address={ADDR.operator} />
            ), so it is the real key the House Chog&apos;s AI trades with.
          </P>
        </>
      ),
    },
    {
      id: "hall-of-fame",
      title: "Hall of Fame and trophies",
      body: (
        <P>
          A robber who got a yes can put the AI&apos;s caving reply on the wall under a nickname (never their own words).
          Replies the LLM wrote stay held until a moderator approves them. A live proof also mints the House Chog a
          &ldquo;Survived a heist&rdquo; trophy, at most once per UTC day.
        </P>
      ),
    },
  ],
};

// ---------------------------------------------------------------- Ask this Chog

export const askThisChog: DocContent = {
  intro: (
    <P lead="Every Chog's page has a chat box: ask it about its trades, its DNA or its record.">
      Open <Code>/chog/&lt;token id&gt;</Code> (the House Chog&apos;s is{" "}
      <DocLink href={`/chog/${HOUSE.tokenId}`}>/chog/{HOUSE.tokenId}</DocLink>) and scroll to{" "}
      <strong>Ask this Chog</strong>. It answers in its own voice from its real record, and that record is labelled as
      simulated where it is.
    </P>
  ),
  sections: [
    {
      id: "what-it-knows",
      title: "What it knows",
      body: (
        <ul>
          <li>Its genome and archetype, with brand-safe trait names.</li>
          <li>Its {DEFAULT_WINDOW} replay on real candles: edge, rank and its latest trades.</li>
          <li>If it has been claimed, its AI&apos;s latest decisions.</li>
          <li>Whether you hold it: if your connected wallet holds the Chog (checked with <Code>ownerOf</Code> on the server), it greets you as its holder.</li>
        </ul>
      ),
    },
    {
      id: "limits",
      title: "Limits",
      body: (
        <DocTable
          caption="Ask this Chog limits"
          head={["Limit", "Value"]}
          rows={[
            ["Question length", `${ASK_LIMITS.maxMessageChars} characters`],
            ["Questions per conversation", String(ASK_LIMITS.maxTurns)],
            ["Per visitor (IP)", "12 per 10 minutes, 40 per day"],
            ["0G calls across all visitors", <span key="cap"><Code>CHOG_CHAT_DAILY_CALLS</Code> per UTC day (default 1,500)</span>],
          ]}
        />
      ),
    },
    {
      id: "read-only",
      title: "Read-only by construction",
      body: (
        <>
          <P>
            The chat has no tools, no keys and no wallet access: the model can only produce text. It runs on 0G Compute (
            {CHAT_MODELS.map((model, i) => (
              <span key={model}>
                {i > 0 && ", then "}
                <Code>{model}</Code>
              </span>
            ))}
            ). When 0G isn&apos;t available or the
            daily cap is spent, it answers from its stats with templates, and the reply says so. Replies are moderated, and a
            Chog its holder hid doesn&apos;t answer.
          </P>
          <Callout>
            <p>
              The API is <Code>POST /api/chog/&lt;tokenId&gt;/ask</Code> with <Code>{"{ sessionId?, message, viewer? }"}</Code>.
            </p>
          </Callout>
        </>
      ),
    },
  ],
};
