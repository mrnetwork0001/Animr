import { LIMIT_PRESETS, SETUP_STEPS, describeLimits } from "@/components/onchain/setup-steps";
import { ACTIVATION_MAX_AGE_MS } from "@/lib/agent/auth";
import { MIN_CONFIDENCE } from "@/lib/agent/brain";
import { PAPER_FEE_BPS, UNFUNDED_MESSAGE } from "@/lib/agent/paper";
import { MAX_DECISIONS_PER_AGENT } from "@/lib/agent/store";
import { MANUAL_RUN_INTERVAL_MS } from "@/lib/agent/types";
import { ZG_DEFAULT_MODEL } from "@/lib/agent/zg-compute";
import { BELL_HOUR_UTC } from "@/lib/bell/rules";
import { DEFAULT_GUARD_LIMITS, GUARD_LIMIT_CEILINGS, TRADE_DEADLINE_SECONDS } from "@/lib/contracts/animr-trade-guard";
import { TROPHIES } from "@/lib/trophies/config";
import { ADDR, HOUSE, LINKS } from "../facts";
import type { DocContent } from "../frame";
import { Address, Callout, Code, CodeBlock, DocLink, DocTable, Ext, P, StepList, Tag } from "../primitives";

const pct = (bps: number) => `${bps / 100}%`;

// ---------------------------------------------------------------- Your Chog's wallet

export const chogWallet: DocContent = {
  intro: (
    <P lead="Every Chog owns a smart-contract wallet: an ERC-6551 token bound account.">
      Its address is fixed by the Chog&apos;s token ID, so it exists before anyone deploys it, and whoever holds the NFT
      controls it. Look up any Chog&apos;s wallet at <DocLink href="/app">/app</DocLink> or on its own page,{" "}
      <Code>/chog/&lt;token id&gt;</Code>.
    </P>
  ),
  sections: [
    {
      id: "address",
      title: "How the address is computed",
      body: (
        <>
          <P>
            The canonical ERC-6551 Registry v0.3.1 deploys each account with CREATE2. Animr rebuilds the registry&apos;s
            183-byte ERC-1167 init code and computes the same address locally, with no RPC call
            (<Code>computeTokenBoundAccount</Code> in <Code>lib/erc6551.ts</Code>). It matches{" "}
            <Code>registry.account(...)</Code> for these inputs:
          </P>
          <DocTable
            caption="Account inputs"
            head={["Input", "Value"]}
            rows={[
              ["Registry", <Address key="r" address={ADDR.registry} kind="contract" />],
              ["Implementation (Tokenbound AccountProxy)", <Address key="p" address={ADDR.accountProxy} kind="contract" />],
              ["Salt", <Code key="s">0x00…00 (bytes32 zero)</Code>],
              ["Chain ID", "143 (Monad mainnet)"],
              ["Token contract (Chog Genesis)", <Address key="n" address={ADDR.chogNft} kind="contract" />],
              ["Token ID", "1 to 1,969"],
            ]}
          />
          <P>
            Tokens sent to the address before the account exists are safe: they are usable once it is created. For example,
            the House Chog ({HOUSE.label}) has the wallet <Address address={HOUSE.wallet} kind="wallet" />.
          </P>
        </>
      ),
    },
    {
      id: "create",
      title: "Create and initialize in one transaction",
      body: (
        <>
          <P lead="A Tokenbound V3 account needs two calls, and Animr sends them as one.">
            The registry deploys an AccountProxy clone; until the proxy is initialized with the AccountV3 implementation,
            every call to it &ldquo;succeeds&rdquo; and does nothing. The Chog page sends a single Multicall3{" "}
            <Code>aggregate3</Code> with:
          </P>
          <StepList
            steps={[
              { title: <><Code>registry.createAccount(...)</Code>, when nothing is deployed yet</> },
              {
                title: (
                  <>
                    <Code>AccountProxy.initialize(AccountV3Upgradable)</Code>
                  </>
                ),
                body: (
                  <p>
                    Implementation <Address address={ADDR.accountV3} kind="contract" />, through Multicall3{" "}
                    <Address address={ADDR.multicall3} kind="contract" />.
                  </p>
                ),
              },
            ]}
          />
          <P>
            Both calls are permissionless, so anyone could send them; only the NFT&apos;s holder controls the account
            afterwards. Animr shows each account as <Tag>none</Tag> (no code), <Tag>uninitialized</Tag> (proxy deployed, no
            implementation) or <Tag tone="teal">ready</Tag>. Animr deploys no account contracts of its own.
          </P>
        </>
      ),
    },
    {
      id: "what-transfers",
      title: "What moves with the NFT",
      body: (
        <>
          <DocTable
            caption="What a sale moves"
            head={["Goes to the buyer", "Stays behind or goes dormant"]}
            rows={[
              ["The wallet and every token in it: $CHOG, WMON, MON", "Guard grant, limits and buy-only mode (keyed by wallet and holder)"],
              ["Trophies minted into the wallet", "Tokenbound permissions the seller granted (keyed by holder)"],
              ["Its genome, League and Bell record", "The seller's control of the AI, until the buyer signs to take it over"],
              ["Its AI's decision history", ""],
            ]}
          />
          <P>
            A &ldquo;Hide my Chog&rdquo; opt-out survives a sale; the new holder can undo it. See{" "}
            <DocLink href="/docs/trust">Trust model and FAQ</DocLink>.
          </P>
          <P lead="Only the holder moves tokens out.">
            The Chog page&apos;s <strong>Withdraw to your wallet</strong> form calls the wallet&apos;s own <Code>execute()</Code>,
            which Tokenbound accepts from the current holder alone; AnimrTradeGuard has no withdraw function. Step by step:{" "}
            <DocLink href="/docs/holder-guide#withdraw">Holder guide</DocLink>.
          </P>
        </>
      ),
    },
  ],
};

// ---------------------------------------------------------------- Holder guide

/** A stepper row's title, as components/onchain/setup-steps.ts spells it, so the docs can't drift from the page. */
const stepTitle = (id: (typeof SETUP_STEPS)[number]["id"]) => SETUP_STEPS.find((step) => step.id === id)?.title ?? id;

/** The limits form's presets, by label ("Cautious, Balanced, Bold"). */
const presets = LIMIT_PRESETS.map((preset) => preset.label).join(", ");

export const holderGuide: DocContent = {
  intro: (
    <P lead="Everything a holder does happens on the Chog's own page.">
      Open <Code>/chog/&lt;token id&gt;</Code> and log in with the wallet that holds the Chog. The section{" "}
      <strong>Let it trade real $CHOG</strong> is a six-step stepper: it reads the chain, shows the next step, and every
      step is one transaction or one free signature from that wallet. Nothing needs an explorer. This page follows the
      stepper in the order the app does, then covers the live panel, withdrawing and the questions holders ask.
    </P>
  ),
  sections: [
    {
      id: "login",
      title: "Log in and connect the holder's wallet",
      body: (
        <>
          <P>
            <strong>Log in</strong> in the header opens Privy: a browser or external wallet, an email code, Google, X or
            Discord. A login without a wallet gets an embedded one. The holder steps need the wallet that holds the Chog,
            so connect or link that one: every action is checked against <Code>ownerOf</Code>, and the stepper says
            &ldquo;You hold this Chog&rdquo; when the connected wallet is the holder, or &ldquo;Read-only&rdquo; when it
            isn&apos;t.
          </P>
          <ul>
            <li>The wallet must be on Monad mainnet (chain 143); the page offers the switch if it isn&apos;t.</li>
            <li>Transactions need a little MON for gas. Signatures are free.</li>
            <li>A self-hosted Animr without Privy configured shows a plain browser-wallet menu instead.</li>
          </ul>
        </>
      ),
    },
    {
      id: "steps",
      title: "The six steps, as the page shows them",
      body: (
        <StepList
          steps={[
            {
              title: stepTitle("create-account"),
              body: (
                <p>
                  One transaction: <Code>registry.createAccount</Code> and <Code>AccountProxy.initialize</Code> through
                  Multicall3. The button is <strong>Create the wallet</strong>, or <strong>Finish wallet setup</strong> for
                  an account that exists but was never initialized. Tokens sent to the address earlier are already there.
                  Details: <DocLink href="/docs/chog-wallet">Your Chog&apos;s wallet</DocLink>.
                </p>
              ),
            },
            {
              title: stepTitle("grant-guard"),
              body: (
                <p>
                  One transaction, <strong>Authorize the guard</strong>: <Code>setPermissions([guard], [true])</Code> on
                  the wallet, so AnimrTradeGuard (never the AI&apos;s key) may execute for it. Send it from the holder&apos;s
                  wallet directly; a permission set through a relayer or a batch contract doesn&apos;t count. The page
                  re-reads the chain before it calls the step done.
                </p>
              ),
            },
            {
              title: stepTitle("configure"),
              body: (
                <p>
                  One transaction, <Code>guard.configure</Code>. The form starts from the app default,{" "}
                  {describeLimits(DEFAULT_GUARD_LIMITS)}, with the presets {presets}; the contract&apos;s ceilings are on{" "}
                  <DocLink href="/docs/trade-guard#limits">AnimrTradeGuard</DocLink>. Each later change is one
                  transaction. The House Chog&apos;s page adds an optional buy-only lock row (<Code>setBuyOnly</Code>),
                  which stays off.
                </p>
              ),
            },
            {
              title: stepTitle("fund"),
              body: (
                <>
                  <p>
                    The guard trades $CHOG and WMON, so the vault needs one of them, and both to trade both ways. Three
                    ways in, all from the holder&apos;s wallet:
                  </p>
                  <ul>
                    <li>
                      <strong>Deposit:</strong> $CHOG or WMON, one ERC-20 transfer to the Chog&apos;s wallet. The token the
                      vault still lacks is preselected.
                    </li>
                    <li>
                      <strong>Only have MON? Wrap &amp; deposit:</strong> two transactions, WMON&apos;s <Code>deposit()</Code>{" "}
                      (1:1) and then the transfer. Max keeps 0.1 MON for gas. If the second one is cancelled, the WMON stays
                      in your wallet and Deposit can send it.
                    </li>
                    <li>
                      <strong>MON already in the vault</strong> can be wrapped in place: one transaction through the
                      wallet&apos;s own <Code>execute()</Code>; nothing leaves the wallet.
                    </li>
                  </ul>
                  <p>The step is done as soon as the vault holds either token (a buy-only vault needs WMON).</p>
                </>
              ),
            },
            {
              title: "Wake the AI",
              body: (
                <p>
                  One free signature (a message, not a transaction). The AI starts in paper mode on the vault&apos;s real
                  balances: live prices, simulated fills, no tokens move. You can do this before the vault is ready; the
                  row counts as done whenever the agent is active. Details:{" "}
                  <DocLink href="/docs/claim-its-ai">Claim its AI</DocLink>.
                </p>
              ),
            },
            {
              title: stepTitle("go-onchain"),
              body: (
                <p>
                  One free signature, <strong>Sign &amp; go on-chain</strong>. From its next scheduled decision its trades
                  execute as real swaps in this wallet, through the guard and within your limits, and its PnL restarts
                  from the vault&apos;s value at the switch. The server refuses the switch until the guard setup is ready.
                </p>
              ),
            },
          ]}
        />
      ),
    },
    {
      id: "fund-row",
      title: "The finished Fund row",
      body: (
        <>
          <P>
            Once the vault holds something, the Fund row shows its balances and reopens on demand. Its button reads{" "}
            <strong>Add WMON</strong> or <strong>Add $CHOG</strong> while only one token is in, else{" "}
            <strong>Deposit or withdraw</strong>. With one token the AI trades one way, and the row says so:
          </P>
          <ul>
            <li>&ldquo;With $CHOG alone it can sell but not buy: add WMON to trade both ways.&rdquo;</li>
            <li>&ldquo;With WMON alone it can buy but has nothing to sell: add $CHOG to trade both ways.&rdquo;</li>
          </ul>
          <P>The switch to on-chain repeats the warning. A buy-only vault only ever spends WMON, so it isn&apos;t nudged for $CHOG.</P>
        </>
      ),
    },
    {
      id: "live",
      title: "Live",
      body: (
        <>
          <P lead="With everything in place the chip reads Live · real $CHOG.">
            The live panel names the AI that trades, shows the limits in one line and the vault&apos;s $CHOG and WMON, and
            gives the holder three buttons:
          </P>
          <DocTable
            caption="Live panel"
            head={["Button", "What it does", "Costs"]}
            rows={[
              ["Edit limits", "A new guard.configure with the changed limits", "One transaction"],
              ["Deposit or withdraw", "Opens the same Deposit, Wrap & deposit and Withdraw forms as the Fund step", "One or two transactions per action"],
              ["Back to paper trading", "Signs the paper-mode message; the AI keeps thinking, fills are simulated again", "Free signature"],
            ]}
          />
          <P>
            Below it, <strong>Stop the AI</strong>: <strong>Disable trading</strong> (<Code>guard.disable</Code>, keeps the
            guard&apos;s permission; save limits again to resume) or <strong>Revoke the guard</strong> (
            <Code>setPermissions([guard], [false])</Code>). Either takes effect from the next block, and your tokens stay
            where they are. If Animr pauses the guard, the chip reads Paused by Animr: your settings are kept, and the
            pause can never move funds.
          </P>
        </>
      ),
    },
    {
      id: "withdraw",
      title: "Withdraw to your wallet",
      body: (
        <>
          <P lead="Only the holder can take tokens out, and only through the wallet itself.">
            The <strong>Withdraw to your wallet</strong> form sits under Deposit or withdraw, in the Fund step and in the
            live panel, once the vault holds $CHOG or WMON. Pick the token, type the amount (or Max), and the page sends
            one transaction: the Chog wallet&apos;s own <Code>execute(token, 0, transfer(you, amount), CALL)</Code>, which
            Tokenbound accepts from the Chog&apos;s current holder alone. The page re-reads the vault&apos;s balances before
            it reports success.
          </P>
          <ul>
            <li>
              AnimrTradeGuard has no withdraw function, so the AI and the guard never can. See{" "}
              <DocLink href="/docs/trade-guard#execution">AnimrTradeGuard</DocLink>.
            </li>
            <li>The form moves $CHOG and WMON. Native MON in the vault isn&apos;t traded; wrap it in place first if the AI should use it.</li>
            <li>
              Withdrawing while the AI is on-chain is fine: its next decision sees the new balances, and the engine rebases
              its PnL when the vault moves outside trading rather than counting it as a trade.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "schedule",
      title: "When it thinks",
      body: (
        <>
          <DocTable
            caption="When an agent thinks"
            head={["Mode", "Decides", "Think now"]}
            rows={[
              ["Paper", `Every hour on the agent tick, once at the ${BELL_HOUR_UTC}:00 UTC Bell, and on demand`, `Yes: once every ${MANUAL_RUN_INTERVAL_MS / 60_000} minutes per Chog, under a global daily cap`],
              ["On-chain", "Every hour on the agent tick and once at the Bell", "No, the button answers 403: a public button must never choose when an AI sends a real trade"],
            ]}
          />
          <P>
            On production the tick is an external pulse at minute 30 of every hour, and real trades are sent only from the
            production deployment. Details, including the House Chog&apos;s mandate:{" "}
            <DocLink href="/docs/claim-its-ai#loop">Claim its AI</DocLink>.
          </P>
        </>
      ),
    },
    {
      id: "costs",
      title: "What each step costs",
      body: (
        <DocTable
          caption="Transactions and signatures"
          head={["Step", "What you confirm", "Gas"]}
          rows={[
            [stepTitle("create-account"), "1 transaction (Multicall3)", "Yes"],
            [stepTitle("grant-guard"), "1 transaction (setPermissions)", "Yes"],
            [stepTitle("configure"), "1 transaction (configure), and 1 per later change", "Yes"],
            [stepTitle("fund"), "1 transaction per deposit; 2 for Wrap & deposit", "Yes"],
            ["Wake the AI", "1 signed message", "No"],
            [`${stepTitle("go-onchain")}, or back to paper`, "1 signed message", "No"],
            ["Withdraw, Disable, Revoke", "1 transaction each", "Yes"],
            ["The AI's decisions", "Nothing: Animr pays the 0G calls, and the operator key pays the gas of guard.trade()", "No"],
          ]}
        />
      ),
    },
    {
      id: "holder-faq",
      title: "Holder FAQ",
      body: (
        <>
          <P lead="How do I withdraw?">
            Under Deposit or withdraw, with the Withdraw to your wallet form above: one transaction through the wallet&apos;s
            own <Code>execute()</Code>, holder only. The guard can&apos;t do it for you, and neither can the AI.
          </P>
          <P lead="Why did the Fund step advance before I added WMON?">
            The step is done as soon as the vault holds either token, because the AI can already trade one way (a buy-only
            vault needs WMON). The finished row says which token is missing and reopens with Add WMON or Add $CHOG, and the
            on-chain switch repeats the warning.
          </P>
          <P lead="Why can't I press Think now on an on-chain agent?">
            An AI that sends real trades decides only on its schedule, the hourly tick and the Daily Bell, and the button
            answers 403 for it. Switch back to paper trading if you want on-demand runs.
          </P>
          <P lead="Do I need to accept anything on the explorer?">
            No. Every holder step is a transaction or a signature from the Chog&apos;s page. The only explorer steps were the
            team&apos;s, accepting the two-step ownership handovers of its own contracts (AnimrTrophies, and the guard&apos;s
            admin role).
          </P>
          <P lead="Can I stop it?">
            Yes, at any time: Back to paper trading (free), Disable trading or Revoke the guard (one transaction each).
            Selling the Chog also makes your guard settings dormant.
          </P>
          <P lead="What happens when I sell?">
            The buyer gets the wallet and everything in it; your grant, limits and buy-only mode go dormant, and the buyer
            signs to take over the AI. See <DocLink href="/docs/trust#faq">Trust model and FAQ</DocLink>.
          </P>
        </>
      ),
    },
  ],
};

// ---------------------------------------------------------------- Claim its AI

export const claimItsAi: DocContent = {
  intro: (
    <P lead="Waking a Chog's AI takes one free signature from its holder.">
      It is a signed message, not a transaction. The AI then paper-trades the wallet&apos;s real balances at live prices,
      and it trades on-chain only if the holder sets up the guard and signs a second switch.
    </P>
  ),
  sections: [
    {
      id: "signature",
      title: "The signed message",
      body: (
        <>
          <P>
            On <Code>/chog/&lt;token id&gt;</Code>, <strong>Wake the AI</strong> asks the holder&apos;s wallet to sign:
          </P>
          <CodeBlock label="Activation message">
            {`Animr: activate the AI agent for my Chog.
Chog: #<token id>
Account: <the Chog's wallet>
Owner: <your address>
Issued at: <ISO time>`}
          </CodeBlock>
          <ul>
            <li>It is valid for {ACTIVATION_MAX_AGE_MS / 60_000} minutes after it was issued.</li>
            <li>The server checks <Code>ownerOf</Code> on-chain and recomputes the wallet address. Smart-wallet signatures (ERC-1271 and ERC-6492) are accepted.</li>
            <li>A buyer of the Chog signs the same message to take over its AI.</li>
          </ul>
        </>
      ),
    },
    {
      id: "funded",
      title: "Paper trading and the unfunded state",
      body: (
        <>
          <P lead="A new agent starts from the real $CHOG and WMON in the Chog's wallet.">
            Its fills are simulated at the live price with the pool&apos;s {PAPER_FEE_BPS / 100}% fee and price impact; no
            tokens move. With an empty wallet the agent is unfunded: it doesn&apos;t trade, and the page says &ldquo;
            {UNFUNDED_MESSAGE}&rdquo;. Its first run after the wallet is funded starts the paper book from those balances.
          </P>
          <P>Its score is the same as everywhere: PnL vs just holding $CHOG.</P>
        </>
      ),
    },
    {
      id: "brain",
      title: "The brain on 0G Compute",
      body: (
        <>
          <P>
            The model is <Code>ZG_MODEL</Code> on the 0G Compute Router (default <Code>{ZG_DEFAULT_MODEL}</Code>), called
            through the Vercel AI SDK&apos;s OpenAI-compatible provider.
          </P>
          <ul>
            <li>The prompt carries the genome as a character sheet, the genome&apos;s own reflex for this moment, the market snapshot and the agent&apos;s portfolio. Trait names are brand-safe.</li>
            <li>The answer is a schema-validated object: action, size, slippage, confidence, a thesis and a 24-hour forecast.</li>
            <li>If the model fails or takes longer than 20 seconds, the genome&apos;s rules decide, and the decision feed labels it.</li>
          </ul>
        </>
      ),
    },
    {
      id: "guardrails",
      title: "Guardrails on every decision",
      body: (
        <DocTable
          caption="Guardrails"
          head={["Rule", "Value"]}
          rows={[
            ["Confidence floor", `At least ${MIN_CONFIDENCE}, otherwise hold`],
            ["Trade size", "At most the genome's size gene, as a share of the balance being sold"],
            ["Slippage tolerance", "Between 10 and 300 basis points"],
            ["Cooldown", "2, 4 or 8 hours by style. A 1-hour move of 5% or more may end it early, never sooner than 15 minutes after the last trade."],
            ["Balance", "No buy without WMON, no sell without $CHOG"],
          ]}
        />
      ),
    },
    {
      id: "loop",
      title: "When it thinks",
      body: (
        <>
          <DocTable
            caption="Decision triggers"
            head={["Trigger", "Who", "Notes"]}
            rows={[
              ["Hourly tick", "Every awake agent", <span key="t"><Code>GET /api/agent/tick</Code>, called by an external hourly pulse with <Code>CRON_SECRET</Code>; on production at minute 30 of every hour</span>],
              ["Daily Bell ring", "Every awake agent", `One run per Bell makes its call; it never trades past the ring's deadline. On production the ring is ${BELL_HOUR_UTC}:01 UTC.`],
              ["Think now", "Paper agents only", `Once per ${MANUAL_RUN_INTERVAL_MS / 60_000} minutes per Chog, a per-network limit and a global daily cap (ANIMR_MANUAL_RUNS_PER_DAY, default 400). An on-chain agent answers 403: it decides on the tick and at the Bell only.`],
            ]}
          />
          <P>
            Each cycle is: market snapshot, brain, guardrails, execution, store. Each run holds a per-agent lock. Animr keeps
            up to {MAX_DECISIONS_PER_AGENT} decisions per agent; the page shows the newest. The pulse is external because
            Vercel&apos;s Hobby crons are daily and fire anywhere within their hour; its schedules are on{" "}
            <DocLink href="/docs/architecture#schedule">Architecture</DocLink>.
          </P>
        </>
      ),
    },
    {
      id: "onchain",
      title: "Switching to on-chain",
      body: (
        <>
          <P lead="On-chain mode needs the guard set up first.">
            After the holder grants AnimrTradeGuard, sets limits and funds the wallet (see{" "}
            <DocLink href="/docs/trade-guard">AnimrTradeGuard</DocLink>), they sign a second message that starts
            &ldquo;Animr: switch my Chog&apos;s AI agent to on-chain trading.&rdquo; The switch resets the PnL baseline to the
            vault&apos;s value at that moment. Signing the paper version switches it back.
          </P>
          <P>For each on-chain trade the server:</P>
          <ul>
            <li>clamps the size to the guard&apos;s <Code>maxAmountIn</Code> and requires <Code>canTrade()</Code>;</li>
            <li>quotes on QuoterV2 and sets <Code>minAmountOut</Code> to the quote minus the brain&apos;s tolerance, with a deadline {TRADE_DEADLINE_SECONDS} seconds past the latest block;</li>
            <li>simulates the call from the operator, then sends <Code>guard.trade()</Code> under a lock so nonces stay in order;</li>
            <li>reads the result from the guard&apos;s <Code>Traded</Code> event.</li>
          </ul>
          <P>
            On-chain agents think only on schedule, the hourly tick and the Bell, never through Think now. Real trades are
            sent only from the production deployment (<Code>ANIMR_ENV</Code> or <Code>VERCEL_ENV</Code> ={" "}
            <Code>production</Code>, <Code>lib/runtime-env.ts</Code>): a laptop or a preview that holds the operator key
            refuses to broadcast. The engine also refuses to trade a wallet where the operator key itself holds a
            Tokenbound permission.
          </P>
          <Callout title="The House Chog's mandate">
            <p>
              The team&apos;s own on-chain agent, the House Chog ({HOUSE.label}), trades two-way under limits of 10% per trade
              and 30% per day. Its prompt carries the mandate (buy dips, sell only into sharp pumps), and a rule in the
              engine, <Code>houseDipRule</Code>, enforces it: for the House Chog in on-chain mode, a sell decision becomes a
              hold while $CHOG is down over the last hour or the last 24 hours, or while either change can&apos;t be read.
              The decision is stored as a hold with the rule&apos;s reason, for example &ldquo;House rule: no real-money sells
              into a dip&rdquo;. Buys are never touched.
            </p>
            <p>
              Its first decision on production, on Oct 21, 2026 at 23:35 UTC, was an LLM hold whose thesis cited the rule:
              it &ldquo;blocks any sell while $CHOG is soft&rdquo;. Its decisions and receipts are on{" "}
              <DocLink href={`/chog/${HOUSE.tokenId}`}>/chog/{HOUSE.tokenId}</DocLink>.
            </p>
          </Callout>
        </>
      ),
    },
    {
      id: "receipts",
      title: "0G receipts",
      body: (
        <>
          <P lead="Every LLM decision is stored with the receipt the 0G Router returns.">
            It holds the request ID, the serving provider&apos;s address and the cost of the call; the exact cost is on every receipt. The
            decision feed labels each provider TeeML, TeeTLS or standard from 0G&apos;s public provider list.
          </P>
          <Callout tone="honest">
            <p>
              A provider label describes how that provider serves calls; it is not a check of this call. Animr shows
              &ldquo;TEE verified&rdquo; only when the Router&apos;s receipt itself reports <Code>tee_verified: true</Code>,
              and it stores receipts without verifying them independently.
            </p>
          </Callout>
          <P lead="The landing page shows the newest one.">
            The receipt card on <DocLink href="/">the landing page</DocLink> is the newest stored LLM decision across every
            claimed Chog that may be featured, read per request: the action and thesis, then the receipt&apos;s model,
            provider, the provider&apos;s label from 0G&apos;s list, request ID and cost. With no such decision yet it shows one
            muted line instead of a sample.
          </P>
        </>
      ),
    },
  ],
};

// ---------------------------------------------------------------- AnimrTradeGuard

const ceilings = GUARD_LIMIT_CEILINGS;
const defaults = DEFAULT_GUARD_LIMITS;

export const tradeGuard: DocContent = {
  intro: (
    <>
      <P lead="The AI can trade your Chog's wallet. It can never withdraw from it.">
        AnimrTradeGuard is the only door between a Chog&apos;s AI and its wallet. The holder grants Tokenbound permission
        to the guard, never to the AI&apos;s key, and the guard only ever builds a swap whose output lands back in the same
        wallet. Its live status is at <DocLink href="/guard">/guard</DocLink>.
      </P>
      <DocTable
        caption="Deployment"
        head={["Fact", "Value"]}
        rows={[
          ["Address (Monad mainnet)", <Address key="g" address={ADDR.guard} kind="contract" />],
          ["Deployed", "Oct 19, 2026, block 114,783,301"],
          ["Source", "Verified on Sourcify (exact match, Oct 19, 2026); Monadscan shows the verified source"],
          ["License", "GPL-2.0-or-later (it links vendored Uniswap v3 libraries)"],
          ["Who sends trades", "The operator key, from the production deployment only (ANIMR_ENV or VERCEL_ENV = production)"],
        ]}
      />
    </>
  ),
  sections: [
    {
      id: "roles",
      title: "Roles",
      body: (
        <DocTable
          caption="Guard roles"
          head={["Role", "Can", "Cannot"]}
          rows={[
            [
              <span key="o">Operator (the AI&apos;s key)<br /><Address address={ADDR.operator} /></span>,
              "Call trade() for wallets whose current holder opted in, within their limits",
              "Withdraw, transfer, approve, pick a recipient, token, router or calldata, lower the price floor, or sell from a buy-only wallet",
            ],
            [
              <span key="a">Admin (the team&apos;s main wallet)<br /><Address address={ADDR.admin} /></span>,
              "Pause all trading, rotate the operator, hand over admin in two steps",
              "Move funds, trade, change anyone's limits, or become the operator",
            ],
            ["NFT holder", "Grant or revoke the guard, configure limits, disable, turn buy-only on or off", "Act on another holder's Chog; settings stop applying the moment it is sold"],
          ]}
        />
      ),
    },
    {
      id: "setup",
      title: "Holder setup",
      body: (
        <>
          <P>
            The Chog page runs this as a six-step stepper, with Wake the AI between funding and the switch; the{" "}
            <DocLink href="/docs/holder-guide">Holder guide</DocLink> follows it button by button. In contract terms:
          </P>
          <StepList
            steps={[
              { title: "Create the wallet", body: <p>If needed, create and initialize the Chog&apos;s account (see <DocLink href="/docs/chog-wallet">Your Chog&apos;s wallet</DocLink>).</p> },
              { title: <><Code>wallet.setPermissions([guard], [true])</Code></>, body: <p>Sent by the holder directly, not through a forwarder.</p> },
              { title: <><Code>guard.configure(wallet, limits)</Code></>, body: <p>Only accepts canonical Tokenbound accounts of Chog Genesis tokens: registry v0.3.1, AccountProxy, salt 0, this chain.</p> },
              { title: "Fund the wallet", body: <p>With $CHOG and/or WMON (the guard trades the two ERC-20s, not native MON). The page can also wrap MON into WMON on the way in.</p> },
              { title: "Switch the AI to on-chain", body: <p>Sign the mode switch on the Chog page, after waking the AI.</p> },
            ]}
          />
          <P>
            Optionally, at any time, <Code>guard.setBuyOnly(wallet, true)</Code>: the AI can then still buy $CHOG with the
            wallet&apos;s WMON but never sell $CHOG. It is off by default, and off for the House Chog.
          </P>
        </>
      ),
    },
    {
      id: "limits",
      title: "Limits",
      body: (
        <>
          <DocTable
            caption="Guard limits"
            head={["Limit", "What it bounds", "Ceiling", "App default"]}
            rows={[
              ["maxTradeBps", "amountIn per trade, as a share of the balance being sold", pct(ceilings.maxTradeBps), pct(defaults.maxTradeBps)],
              ["maxDailyBps", "Value traded per 24 hours, buys and sells together, as a share of the vault's value at the 30-minute TWAP", pct(ceilings.maxDailyBps), pct(defaults.maxDailyBps)],
              ["minInterval", "Seconds between two trades", "None", `${defaults.minInterval / 60} minutes`],
              ["maxSlippageBps", "Output shortfall vs the TWAP quote, and how far spot may sit on the wrong side of it", pct(ceilings.maxSlippageBps), pct(defaults.maxSlippageBps)],
            ]}
          />
          <P>
            The daily budget is one token bucket that frees up continuously, so there is no burst at the edge of a 24-hour
            window. Ceilings are constants in the contract; <Code>configure</Code> rejects anything above them.
          </P>
        </>
      ),
    },
    {
      id: "checks",
      title: "What trade() checks",
      body: (
        <DocTable
          caption="trade() checks"
          head={["Check", "Rule"]}
          rows={[
            ["Caller", "Only the operator"],
            ["Pause", "The admin's global kill switch"],
            ["Enabled", "The current holder configured this wallet. State is keyed by (wallet, holder), so this fails after a sale."],
            ["Buy-only", "If the holder turned it on, sells revert with \"buy-only vault\""],
            ["Size and budget", "Within maxTradeBps and the daily bucket"],
            ["Pace", "minInterval since the last trade"],
            ["TWAP", "observe([1800, 60, 0]) on the pool. If it can't serve 30 minutes, the trade fails closed (\"TWAP unavailable\")."],
            ["Spot check", "Spot may not sit more than maxSlippageBps ticks on the vault's unfavourable side of the reference price"],
            ["Floor", "The quote at the better of the 30- and 1-minute TWAPs, minus the pool fee and maxSlippageBps. The swap uses max(minAmountOut, floor): the operator can raise it, never lower it."],
            ["Deadline", "block.timestamp ≤ deadline, also passed to the router"],
          ]}
        />
      ),
    },
    {
      id: "execution",
      title: "Execution and settlement",
      body: (
        <>
          <P lead="The guard makes the wallet run exactly three calls.">
            <Code>tokenIn.approve(router, amountIn)</Code>, then <Code>router.exactInputSingle(…, recipient = the same wallet)</Code>,
            then <Code>tokenIn.approve(router, 0)</Code>. The venue is immutable: $CHOG, WMON, the router, the pool and its
            fee. At construction the guard checks that the router&apos;s factory maps to that pool.
          </P>
          <P lead="Settlement is judged from the wallet's own balances.">
            Exactly <Code>amountIn</Code> spent, at least the minimum received and the allowance back to zero; anything else
            reverts with <Code>SettlementMismatch</Code>. State is written before the external calls, behind a reentrancy
            lock.
          </P>
          <Callout title="There is no withdraw function">
            <p>
              <Code>trade()</Code> takes no recipient, token, router, path or calldata. The only thing the operator can make
              a wallet do is swap between $CHOG and WMON into itself.
            </p>
            <p>
              You withdraw through the wallet itself, not the guard: the Chog page&apos;s <strong>Withdraw to your wallet</strong>{" "}
              form (under Deposit or withdraw) calls the wallet&apos;s own <Code>execute()</Code>, which Tokenbound accepts
              from the Chog&apos;s current holder alone. Step by step:{" "}
              <DocLink href="/docs/holder-guide#withdraw">Holder guide</DocLink>.
            </p>
          </Callout>
        </>
      ),
    },
    {
      id: "kill-switches",
      title: "Kill switches",
      body: (
        <ul>
          <li><strong>Holder:</strong> <Code>guard.disable(wallet)</Code>, or revoke with <Code>wallet.setPermissions([guard], [false])</Code>, at any time.</li>
          <li><strong>Admin:</strong> <Code>setPaused(true)</Code> stops every trade. The admin can never be the operator, and the deploy script refuses an operator that is also the deployer.</li>
          <li><strong>Sale:</strong> limits, the grant and buy-only mode go dormant automatically; the buyer opts in again.</li>
          <li><strong>Nested holders:</strong> a holder that is itself an ERC-6551 account is refused, because selling the NFT above it would not reset anything.</li>
        </ul>
      ),
    },
    {
      id: "oracle-and-tests",
      title: "Oracle hardening and tests",
      body: (
        <>
          <P>
            <Code>GrowPoolOracle.s.sol</Code> grew the pool&apos;s observation ring to 1,801 slots on Oct 19, 2026, so bursts
            of swaps can&apos;t push the 30-minute TWAP out of reach.
          </P>
          <P>
            37 Foundry tests (2 of them fuzz tests) fork live Monad mainnet state and use the real Chog Genesis, $CHOG, WMON,
            registry, Tokenbound and pool. They cover the happy path, every limit, sandwich and spot manipulation, the TWAP
            failing closed, pause, disable, NFT sale dormancy, nested ownership, buy-only mode (including a fuzz test that
            every sell from a buy-only wallet is refused) and a fuzz test that a trade only moves tokens between the wallet
            and the pool. Result: 37 fork tests, 36 pass, 1 skipped by design (0 failures), Oct 21 2026. The skipped one,
            the TWAP failing closed, needs an ungrown oracle and skips itself now the live pool&apos;s ring is past 256 slots.
          </P>
          <CodeBlock label="Run them">{"cd contracts\nforge test --fork-url https://rpc.monad.xyz -vv"}</CodeBlock>
        </>
      ),
    },
  ],
};

// ---------------------------------------------------------------- Trophy cabinet

export const trophies: DocContent = {
  intro: (
    <P lead="A Chog's history lives inside the NFT.">
      AnimrTrophies mints soulbound ERC-1155 trophies into the Chog&apos;s own ERC-6551 wallet, so when the Chog is sold its
      trophies go with it. The cabinet shows on each Chog&apos;s page.
    </P>
  ),
  sections: [
    {
      id: "kinds",
      title: "Trophy kinds",
      body: (
        <DocTable
          caption="Trophy kinds"
          head={["ID", "Trophy", "Awarded when", "How often"]}
          rows={TROPHIES.map((trophy) => [
            String(trophy.kind),
            trophy.name,
            trophy.blurb,
            trophy.scope === "daily" ? "Once per UTC day" : "Once per Chog",
          ])}
        />
      ),
    },
    {
      id: "triggers",
      title: "Award triggers",
      body: (
        <ul>
          <li><strong>Best call and Most rekt:</strong> after a live Daily Bell settles, its Oracle of the Day and its Most Rekt. Replayed Bells never award.</li>
          <li><strong>Survived a heist:</strong> when the House Chog&apos;s AI said yes and the mainnet proof showed the transfer refused.</li>
          <li><strong>First real trade:</strong> the Chog&apos;s first trade through AnimrTradeGuard.</li>
        </ul>
      ),
    },
    {
      id: "contract",
      title: "The contract",
      body: (
        <>
          <DocTable
            caption="AnimrTrophies"
            head={["Fact", "Value"]}
            rows={[
              ["Address (Monad mainnet)", <Address key="t" address={ADDR.trophies} kind="contract" />],
              ["Source", "Verified on Sourcify (exact match, Oct 21, 2026); Monadscan shows the verified source"],
              ["Standard", "Minimal ERC-1155, name \"Animr Trophies\", symbol ANIMR-TROPHY. Token ID = trophy kind; a balance counts how often it was won."],
              ["Recipient", "The contract derives the Chog's canonical Tokenbound address itself (registry v0.3.1, AccountProxy, salt 0, this chain), so it can only ever mint into real Chog wallets. The wallet doesn't have to exist yet."],
              ["Idempotency", "keccak256(abi.encode(kind, context)) can be used once. Context is the UTC day as YYYYMMDD for daily kinds, the Chog's token ID for First real trade."],
              ["Soulbound", "Transfers and approvals revert with Soulbound()"],
              [
                "Roles",
                <span key="roles">
                  The owner (two-step transfer) enables kinds, sets the metadata URI and rotates the minter. It is the team&apos;s
                  main wallet, the guard&apos;s admin, <Address address={ADDR.admin} />, after a handover the team accepted on
                  the explorer. The minter, the operator key <Address address={ADDR.operator} />, can only award. They can
                  never be the same address.
                </span>,
              ],
              ["Metadata", <span key="m">The URI set on the contract is <Code>{LINKS.app}/api/trophies/meta/{"{id}"}</Code>; the badge art is at <Code>/api/trophies/art/&lt;id&gt;</Code></span>],
            ]}
          />
          <P>
            12 Foundry tests cover awards to counterfactual and deployed wallets, one mint per key, soulbinding, trophies
            following the NFT and the roles; 12 of 12 pass against Oct 21, 2026 mainnet state. Minting is idempotent in the
            app too: it checks <Code>awarded</Code> before sending and retries a failed mint later. Awards are sent only from
            the production deployment, the same gate as guarded trades (<Code>lib/runtime-env.ts</Code>). With{" "}
            <Code>NEXT_PUBLIC_TROPHIES_ADDRESS</Code> unset, the cabinet and awards are off.
          </P>
          <P>
            Read it on <Ext href={`${LINKS.explorer}/address/${ADDR.trophies}`}>{LINKS.explorerName}</Ext>.
          </P>
        </>
      ),
    },
  ],
};
