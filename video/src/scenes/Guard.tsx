import React from "react";
import { Img, Sequence, staticFile } from "remotion";
import { C, display, mono, sans } from "../theme";
import { Browser, markOf } from "../ui/Footage";
import { Glow, easeIn } from "../ui/Bound";
import { Card, Fill, In, Kicker, short, tx, utc, useCue } from "./common";

/** Under the hood: AnimrTradeGuard read live, the holder-only withdrawal, and a 0G receipt. */
export const Guard: React.FC = () => {
  const { f, rel } = useCue("guard");
  const tTrade = rel("trade.");
  const tOnly = rel("Only");
  const tLast = rel("Last");
  const tReceipt = rel("receipt.");
  const tEvery = rel("every", 1);
  const w = tx("Withdraw 1 WMON");
  const decisions = markOf("chog", "chog.decisions");
  return (
    <Fill bg={C.bg}>
      <Glow x="30%" y="45%" color="rgba(77,25,177,0.32)" size="50% 60%" />
      <div style={{ position: "absolute", left: 90, top: 92 }}><In at={0}><Kicker>AnimrTradeGuard · 0x92D3…987b · verified on Sourcify</Kicker></In></div>
      <Sequence from={0} durationInFrames={tEvery - 4} layout="none">
        <Browser name="guard" url="useanimr.vercel.app/guard" width={1080} left={90} top={150} startFrom={markOf("guard", "guard.vault") - 40}
          cams={[{ f: 0, z: 1 }, { f: 60, rect: { x: 40, y: 100, w: 1100, h: 640 }, z: 1.3 }, { f: 200, rect: { x: 40, y: 300, w: 1100, h: 500 }, z: 1.4 }]} />
      </Sequence>
      <Sequence from={tEvery - 10} layout="none">
        <Browser name="chog" url="useanimr.vercel.app/chog/1399" width={1080} left={90} top={150} startFrom={decisions + 40}
          cams={[{ f: 0, rect: { x: 40, y: 60, w: 1100, h: 700 }, z: 1.3 }, { f: 90, rect: { x: 40, y: 260, w: 1000, h: 520 }, z: 1.5 }]} />
      </Sequence>
      <Card at={tTrade - 8} left={1240} top={160} width={600}>
        <div style={{ fontFamily: mono, fontSize: 15, letterSpacing: "0.12em", color: "rgba(255,255,255,0.55)" }}>THE AI KEY CAN CALL</div>
        <div style={{ marginTop: 6, fontFamily: mono, fontSize: 40, color: C.teal }}>trade()</div>
        <div style={{ marginTop: 6, fontFamily: sans, fontSize: 19, color: "rgba(255,255,255,0.7)", lineHeight: 1.4 }}>$CHOG ⇄ WMON on one pool. No recipient, no token, no calldata. The swap lands back in the same wallet.</div>
      </Card>
      <Card at={tOnly - 4} left={1240} top={400} width={600} accent={C.success}>
        <div style={{ fontFamily: mono, fontSize: 15, letterSpacing: "0.12em", color: "rgba(255,255,255,0.55)" }}>WITHDRAW · HOLDER ONLY · THE WALLET'S execute()</div>
        <div style={{ marginTop: 8, fontFamily: display, fontSize: 34 }}>1 WMON → 0xc742…960C</div>
        <div style={{ marginTop: 6, fontFamily: mono, fontSize: 15, color: "rgba(255,255,255,0.55)", opacity: easeIn(f, tLast) }}>OCT 22 · {utc(w.timestampISO)} · BLOCK {w.blockNumber.toLocaleString("en-US")}</div>
        <div style={{ marginTop: 4, fontFamily: mono, fontSize: 16, color: C.success, opacity: easeIn(f, tLast) }}>{short(w.hash, 14, 10)}</div>
      </Card>
      <Card at={tReceipt - 10} left={1240} top={650} width={600} accent={C.violetB}>
        <div style={{ fontFamily: mono, fontSize: 15, letterSpacing: "0.12em", color: "rgba(255,255,255,0.55)" }}>EVERY AI DECISION · 0G RECEIPT</div>
        <div style={{ marginTop: 8, fontFamily: display, fontSize: 30 }}>glm-5.3 · 0G Compute · $0.0025 a call</div>
        <div style={{ marginTop: 4, fontFamily: sans, fontSize: 17, color: "rgba(255,255,255,0.6)" }}>“Flat tape, no trigger, paws stay put.” Laser Pounce, hold, 55% sure</div>
      </Card>
      <div style={{ position: "absolute", left: 90, top: 880, display: "flex", alignItems: "center", gap: 44, opacity: easeIn(f, 20) }}>
        <span style={{ fontFamily: mono, fontSize: 14, letterSpacing: "0.16em", color: "rgba(255,255,255,0.45)" }}>UNDER THE HOOD</span>
        <Img src={staticFile("logos/monad.svg")} style={{ height: 26 }} />
        <Img src={staticFile("logos/tokenbound.svg")} style={{ height: 24 }} />
        <Img src={staticFile("logos/0g.svg")} style={{ height: 30 }} />
        <span style={{ fontFamily: mono, fontSize: 15, color: "rgba(255,255,255,0.6)" }}>ERC-6551 · Next.js · viem · Foundry: 37 + 12 fork tests on live mainnet</span>
      </div>
    </Fill>
  );
};
