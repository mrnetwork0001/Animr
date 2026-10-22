import React from "react";
import { Sequence } from "remotion";
import { C, GRAD, display, mono, sans } from "../theme";
import { Browser, clip, markOf } from "../ui/Footage";
import { ChogCard, Glow, Motes, Pending, Tether, WalletChip, easeIn } from "../ui/Bound";
import { Words } from "../ui/Words";
import { Fill, In, Kicker, short, utc, useCue } from "./common";
import prize from "../../data/purse.json";

interface Tx { hash: string; blockNumber: number; timestampISO: string }
interface Prize {
  status: string;
  purse: (Tx & { to: string; amount: string; chogId?: number; name?: string }) | null;
  trophies: (Tx & { chogId: number; name: string; kind: number; kindName: string; forThisBell?: boolean })[];
}
const P = prize as unknown as Prize;
/** Genome names as the settled Bell page shows them. */
const TITLE: Record<number, string> = { 873: "Velvet Whiskers", 1806: "Blitz Mane" };
const title = (id?: number, name?: string) => (id && TITLE[id] ? `${TITLE[id]} · ${name}` : name);

/**
 * The prize: a soulbound trophy and a 500 $CHOG Oracle Purse into the Oracle's own wallet. Until the Oct 21 Bell
 * settles (Oct 22 ~15:11 UTC) and the purse pays (~15:20 UTC), a labelled placeholder; after `npm run prize`
 * (data/purse.json + clips settled and scan_purse) the real page and transfer play here.
 */
export const Purse: React.FC = () => {
  const { f, rel } = useCue("purse");
  const tTrophy = rel("trophy");
  const tPurse = rel("Purse");
  const tAuto = rel("automatically.");
  const tPrize = rel("prize");
  const real = P.status === "found" && !!P.purse && !!clip("settled");
  const mine = P.trophies.filter((t) => t.forThisBell);
  const best = (mine.length ? mine : P.trophies).find((t) => t.kind === 1);
  const winner = P.purse?.chogId ?? best?.chogId;
  const amount = P.purse ? Number(P.purse.amount).toLocaleString("en-US") : "500";
  return (
    <Fill bg={GRAD}>
      <Glow x="30%" y="50%" color="rgba(159,240,236,0.18)" size="40% 50%" />
      <Motes n={20} seed="purse" color="#fff" opacity={0.25} />
      <div style={{ position: "absolute", left: 90, top: 92 }}><In at={0}><Kicker color="rgba(255,255,255,0.75)">The Oracle of the Day · Bell of Oct 21</Kicker></In></div>
      <div style={{ position: "absolute", left: 90, top: 190, width: 760 }}>
        <div style={{ fontFamily: display, fontSize: 80, letterSpacing: "-0.04em", lineHeight: 1.05 }}>
          <Words text="Best call wins." at={rel("best")} every={4} accent={{ "wins.": C.teal }} />
        </div>
        <In at={tTrophy} style={{ marginTop: 40, display: "flex", gap: 22, alignItems: "center" }}>
          <svg width={64} height={64} viewBox="0 0 24 24"><path d="M7 3h10v4a5 5 0 0 1-10 0zM5 4H3v2a4 4 0 0 0 4 4M19 4h2v2a4 4 0 0 1-4 4M12 12v4M8 21h8l-1-5H9z" fill="none" stroke={C.teal} strokeWidth={1.6} strokeLinejoin="round" /></svg>
          <div>
            <div style={{ fontFamily: display, fontSize: 36 }}>A soulbound trophy</div>
            <div style={{ fontFamily: sans, fontSize: 19, color: "rgba(255,255,255,0.7)" }}>
              {real && best ? <>Best call · {title(best.chogId, best.name)} · <span style={{ fontFamily: mono }}>{short(best.hash, 8, 6)}</span></> : "AnimrTrophies (ERC-1155) · minted into the Chog's own wallet"}
            </div>
          </div>
        </In>
        <In at={tPurse} style={{ marginTop: 30, display: "flex", gap: 22, alignItems: "center" }}>
          <div style={{ fontFamily: display, fontSize: 64, color: C.teal, letterSpacing: "-0.04em", minWidth: 150 }}>{amount}</div>
          <div>
            <div style={{ fontFamily: display, fontSize: 36 }}>$CHOG Oracle Purse</div>
            <div style={{ fontFamily: sans, fontSize: 19, color: "rgba(255,255,255,0.7)" }}>
              {real && P.purse ? <>Oct 22 · {utc(P.purse.timestampISO)} · block {P.purse.blockNumber.toLocaleString("en-US")}</> : "sent automatically from the House key after settlement"}
            </div>
          </div>
        </In>
        <In at={tPrize} style={{ marginTop: 34, fontFamily: mono, fontSize: 16, letterSpacing: "0.1em", color: "rgba(255,255,255,0.75)" }}>FANS NEVER RECEIVE $CHOG · THE PRIZE BELONGS TO THE NFT</In>
      </div>
      {real ? (
        <>
          {/* the settled Bell: Best call with its purse line, then the transfer on Monadscan */}
          <Sequence from={0} durationInFrames={tAuto + 4} layout="none">
            <Browser name="settled" url="useanimr.vercel.app/bell/2026-10-21" width={860} left={980} top={150} startFrom={Math.max(0, markOf("settled", "settled.purse") - 20)}
              cams={[{ f: 0, rect: { x: 40, y: 190, w: 760, h: 330 }, z: 1.75 }, { f: 120, rect: { x: 40, y: 190, w: 760, h: 330 }, z: 1.95 }]} />
          </Sequence>
          {clip("scan_purse") ? (
            <Sequence from={tAuto - 6} layout="none">
              <Browser name="scan_purse" url={`monadscan.com/tx/${short(P.purse!.hash, 10, 6)}`} width={860} left={980} top={150} light
                cams={[{ f: 0, rect: { x: 40, y: 140, w: 1000, h: 520 }, z: 1.45 }]} />
            </Sequence>
          ) : null}
          <WalletChip x={980} y={720} p={easeIn(f, tPurse - 6)} width={400} label="House key" address="0xbcfD3a38…E3CdC1e259" sub={`${amount} $CHOG → ${title(P.purse!.chogId, P.purse!.name) ?? "the Oracle"}'s wallet`} />
          <Tether a={[1380, 770]} b={[1640, 790]} p={easeIn(f, tPurse, 24)} pulseAt={tPurse + 24} bend={0.3} />
          {winner ? <ChogCard id={winner} size={170} x={1720} y={790} p={easeIn(f, tPurse + 10, 22)} rot={4} glow={0.8} /> : null}
        </>
      ) : (
        <>
          <WalletChip x={980} y={720} p={easeIn(f, tPurse - 6)} width={420} label="House key" address="0xbcfD3a38…E3CdC1e259" sub="holds 9,500 $CHOG for prizes" />
          <Tether a={[1400, 760]} b={[1600, 560]} p={easeIn(f, tPurse, 24)} pulseAt={tPurse + 24} bend={0.25} />
          <Pending x={1010} y={150} w={820} h={480} p={easeIn(f, 6)} title="The Oct 21 Bell settles · trophy + 500 $CHOG purse"
            sub="Real capture after 2026-10-22 15:20 UTC: the settled /bell page with the Oracle of the Day, the AI recap, and the purse transfer on Monadscan. Swapped in before the final render." />
        </>
      )}
    </Fill>
  );
};
