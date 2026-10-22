import { ACTIVATION_MAX_AGE_MS } from "@/lib/agent/auth";
import { MIN_CONFIDENCE } from "@/lib/agent/brain";
import { PAPER_FEE_BPS, UNFUNDED_MESSAGE } from "@/lib/agent/paper";
import { MAX_DECISIONS_PER_AGENT } from "@/lib/agent/store";
import { MANUAL_RUN_INTERVAL_MS } from "@/lib/agent/types";
import { ZG_DEFAULT_MODEL } from "@/lib/agent/zg-compute";
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
              ["Hourly tick", "Every awake agent", <span key="t"><Code>GET /api/agent/tick</Code>, called by an external hourly pulse with <Code>CRON_SECRET</Code></span>],
              ["Daily Bell ring", "Every awake agent", "One run per Bell makes its call; it never trades past the ring's deadline"],
              ["Think now", "Paper agents only", `Once per ${MANUAL_RUN_INTERVAL_MS / 60_000} minutes per Chog, a per-network limit and a global daily cap (ANIMR_MANUAL_RUNS_PER_DAY, default 400)`],
            ]}
          />
          <P>
            Each cycle is: market snapshot, brain, guardrails, execution, store. Each run holds a per-agent lock. Animr keeps
            up to {MAX_DECISIONS_PER_AGENT} decisions per agent; the page shows the newest.
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
            On-chain agents think only on schedule, never through Think now. The engine refuses to trade a wallet where the
            operator key itself holds a Tokenbound permission.
          </P>
          <Callout title="The House Chog's mandate">
            <p>
              The team&apos;s own on-chain agent, the House Chog ({HOUSE.label}), trades two-way under limits of 10% per trade
              and 30% per day. A code rule turns any real-money sell into a hold while $CHOG is down over the last hour or
              day, so it buys dips and sells only into pumps.
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
          ["Source", "Verified on Sourcify (exact match)"],
          ["License", "GPL-2.0-or-later (it links vendored Uniswap v3 libraries)"],
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
          <StepList
            steps={[
              { title: "Create the wallet", body: <p>If needed, create and initialize the Chog&apos;s account (see <DocLink href="/docs/chog-wallet">Your Chog&apos;s wallet</DocLink>).</p> },
              { title: <><Code>wallet.setPermissions([guard], [true])</Code></>, body: <p>Sent by the holder directly, not through a forwarder.</p> },
              { title: <><Code>guard.configure(wallet, limits)</Code></>, body: <p>Only accepts canonical Tokenbound accounts of Chog Genesis tokens: registry v0.3.1, AccountProxy, salt 0, this chain.</p> },
              { title: "Fund the wallet", body: <p>With $CHOG and/or WMON (the guard trades the two ERC-20s, not native MON).</p> },
              { title: "Switch the AI to on-chain", body: <p>Sign the mode switch on the Chog page.</p> },
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
              You withdraw through the wallet itself, not the guard: the profile&apos;s vault panel has a Withdraw form that
              calls the wallet&apos;s own <Code>execute()</Code>, which only the Chog&apos;s current holder may call.
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
              ["Standard", "Minimal ERC-1155, name \"Animr Trophies\", symbol ANIMR-TROPHY. Token ID = trophy kind; a balance counts how often it was won."],
              ["Recipient", "The contract derives the Chog's canonical Tokenbound address itself (registry v0.3.1, AccountProxy, salt 0, this chain), so it can only ever mint into real Chog wallets. The wallet doesn't have to exist yet."],
              ["Idempotency", "keccak256(abi.encode(kind, context)) can be used once. Context is the UTC day as YYYYMMDD for daily kinds, the Chog's token ID for First real trade."],
              ["Soulbound", "Transfers and approvals revert with Soulbound()"],
              ["Roles", "The owner (two-step transfer) enables kinds, sets the metadata URI and rotates the minter. The minter, the app's operator key, can only award. They can never be the same address."],
              ["Metadata", <span key="m"><Code>/api/trophies/meta/&lt;id&gt;</Code> and the badge art at <Code>/api/trophies/art/&lt;id&gt;</Code></span>],
            ]}
          />
          <P>
            12 Foundry tests cover awards to counterfactual and deployed wallets, one mint per key, soulbinding, trophies
            following the NFT and the roles. Minting is idempotent in the app too: it checks <Code>awarded</Code> before
            sending and retries a failed mint later. With <Code>NEXT_PUBLIC_TROPHIES_ADDRESS</Code> unset, the cabinet and
            awards are off.
          </P>
          <P>
            Read it on <Ext href={`${LINKS.explorer}/address/${ADDR.trophies}`}>{LINKS.explorerName}</Ext>.
          </P>
        </>
      ),
    },
  ],
};
