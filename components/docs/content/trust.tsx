import { ADDR } from "../facts";
import type { DocContent } from "../frame";
import { Address, Callout, Code, DocLink, DocTable, P } from "../primitives";

export const trust: DocContent = {
  sections: [
    {
      id: "real-vs-simulated",
      title: "What's real and what's simulated",
      body: (
        <DocTable
          caption="Real and simulated"
          head={["Real, on Monad mainnet", "Simulated or points only"]}
          rows={[
            ["Chog NFTs, their traits and art (the collection's own metadata)", "League, Time Machine, Versus and Breed: genomes replayed on real hourly candles, 1% fee + impact"],
            ["Every Chog's ERC-6551 wallet and its balances", "Paper trading for claimed AIs that haven't switched to on-chain (live prices, simulated fills)"],
            ["Hourly CHOG/WMON candles and Bell settlement prices", "Bell and Versus points: no cash value, never a wager"],
            ["0G Compute LLM calls and their receipts", "Bells before the first live ring, rebuilt from real candles and labelled as replays"],
            ["The heist's mainnet simulation (read-only eth_call, never broadcast)", ""],
            ["Trades through AnimrTradeGuard, Oracle Purse transfers and trophy mints", ""],
          ]}
        />
      ),
    },
    {
      id: "ai",
      title: "What the AI can and can't do",
      body: (
        <>
          <ul>
            <li><strong>It holds no key to any Chog wallet.</strong> Wallets obey their NFT&apos;s holder; the AI&apos;s operator key has no Tokenbound permission.</li>
            <li><strong>It can only call <Code>guard.trade()</Code></strong>, and only for wallets whose current holder opted in: a $CHOG/WMON swap within the holder&apos;s limits whose output lands back in the same wallet.</li>
            <li><strong>It can&apos;t withdraw, transfer, approve, pick a recipient or send arbitrary calldata.</strong> The guard has no such function.</li>
            <li><strong>The chat AIs can only produce text.</strong> The heist defender and Ask this Chog have no tools and no keys.</li>
            <li><strong>It never stalls.</strong> If the model fails, the Chog&apos;s genome decides, and the feed says so.</li>
          </ul>
          <P>See <DocLink href="/docs/rob-this-chog">Rob this Chog</DocLink> for the on-chain proof.</P>
        </>
      ),
    },
    {
      id: "keys",
      title: "Keys and who holds them",
      body: (
        <>
          <DocTable
            caption="Keys"
            head={["Key", "Held by", "Can", "Cannot"]}
            rows={[
              [<span key="o">Operator<br /><Address address={ADDR.operator} /></span>, "Animr's server (a hot wallet with gas only)", "Call guard.trade() within holders' limits; mint trophies", "Move funds out of any wallet, change limits, pause"],
              [<span key="a">Guard admin<br /><Address address={ADDR.admin} /></span>, "The team's main wallet", "Pause trading, rotate the operator", "Move funds, trade, change limits, become the operator"],
              [<span key="h">House key<br /><Address address={ADDR.houseKey} /></span>, "The team, on a laptop, for scripts only", "Pay Oracle Purses, own AnimrTrophies (enable kinds, set metadata, rotate the minter)", "Anything in the app: the app never reads it"],
              ["NFT holder", "You", "Everything on your Chog's wallet, plus every opt-in", "Act on another holder's Chog"],
            ]}
          />
          <P>
            The app server can&apos;t sign as any holder: every holder action needs the holder&apos;s own signature or
            transaction, checked against <Code>ownerOf</Code>. Signed messages expire after 10 minutes. Cron routes compare{" "}
            <Code>CRON_SECRET</Code> in constant time.
          </P>
        </>
      ),
    },
    {
      id: "brand-safety",
      title: "Brand safety and Hide my Chog",
      body: (
        <>
          <P lead="Every one of the 327 distinct trait values is classified.">
            14 get display-friendly names wherever a trait becomes text, including AI prompts; unknown values are hidden if
            they match a deny-list, so the filter fails closed. Some Chogs stay listed and searchable but are never a random
            pick, a featured slot or a showcase. Genomes still come from the raw traits.
          </P>
          <P lead="Hide my Chog.">
            On <DocLink href="/stats">/stats</DocLink>, a holder signs one free message (checked against{" "}
            <Code>ownerOf</Code>) and the Chog leaves the League, the Bell, Versus, replays, share cards and random picks.
            Signing again brings it back. A hide survives a sale; the new holder can undo it.
          </P>
        </>
      ),
    },
    {
      id: "faq",
      title: "FAQ",
      body: (
        <>
          <P lead="Do I need a Chog?">Not to play. Everything under Play works without a wallet. Waking an AI and real trading need the NFT.</P>
          <P lead="What does the AI cost?">
            Each decision is one 0G call, a fraction of a cent, with its exact cost on the receipt. Animr pays for the
            model calls. Waking the AI is a free signature; creating the wallet, granting the guard and depositing are
            ordinary Monad transactions.
          </P>
          <P lead="Does the AI run in a TEE?">
            Each receipt names the provider and its label from 0G&apos;s public list (TeeML or TeeTLS). The Router publishes no
            per-call verdict, so Animr never claims a verified run unless the receipt itself says so. Receipts are stored
            as the Router reports them, not independently verified.
          </P>
          <P lead="What happens when I sell my Chog?">
            The buyer gets the wallet and every token in it, its trophies, its record and its AI history. Your guard grant,
            limits and buy-only mode go dormant; the buyer signs to take over the AI and opts in under their own limits.
          </P>
          <P lead="Are points worth anything?">No. Bell and Versus points are a game score with no cash value, never a wager. Fans never receive $CHOG.</P>
          <Callout tone="honest" title="Not affiliated with Chog">
            <p>Animr is an independent project built for Chogathon 2026. Chog art and names belong to their owners, and Animr uses no AI-generated Chog art.</p>
          </Callout>
        </>
      ),
    },
  ],
};
