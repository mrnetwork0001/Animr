import React from "react";
import { Sequence, interpolate } from "remotion";
import { C, display, mono, sans } from "../theme";
import { clamp } from "../ui/motion";
import { Browser, markOf } from "../ui/Footage";
import { ChogCard, Glow, Stamp, easeIn } from "../ui/Bound";
import { Words } from "../ui/Words";
import { Fill, In, Kicker, lineStartLocal, useCue } from "./common";

/** Rob this Chog: the House Chog's real opener, one pitch, its real reply, then Monad's answer. */
export const Heist: React.FC = () => {
  const { f, rel, s } = useCue("heist");
  const l1 = lineStartLocal(s, 1);
  const tTalk = rel("Talk");
  const tEven = rel("Even");
  const tRun = rel("run");
  const tNo = rel("no.");
  const tFooled = rel("fooled.");
  const type = markOf("heist", "heist.type");
  const reply = markOf("heist", "heist.reply");
  const run = markOf("heist", "heist.run");
  const NO = 1232; // clip frame: the "Monad said NO." panel with both decoded calls in view
  const W = 1240, L = 590, TOP = 140;
  const intro = interpolate(f, [l1 - 10, l1 + 10], [1, 0], clamp);
  const red = interpolate(f, [tNo - 2, tNo + 6, tNo + 40], [0, 0.5, 0.18], clamp);
  return (
    <Fill bg={C.bg}>
      <Glow x="20%" y="50%" color="rgba(77,25,177,0.35)" size="45% 60%" />
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(60% 60% at 65% 50%, rgba(255,122,138,${red}), transparent 70%)` }} />
      <div style={{ position: "absolute", left: 90, top: 92 }}><In at={0}><Kicker>Rob this Chog · Monad mainnet</Kicker></In></div>
      {/* the House Chog's opener, as the heist page prints it */}
      <div style={{ opacity: intro }}>
        <ChogCard id={1399} size={360} x={560} y={500} p={easeIn(f, 0, 24)} rot={-3} glow={0.6} name="Laser Pounce · the House Chog" number="CHOG #891 · token 1399" style={{ color: "#fff" }} />
        <div style={{ position: "absolute", left: 830, top: 300, width: 840, padding: "28px 34px", borderRadius: 28, borderTopLeftRadius: 6, background: "rgba(23,22,29,0.92)", border: "1px solid rgba(159,240,236,0.35)", fontFamily: display, fontSize: 44, lineHeight: 1.25, letterSpacing: "-0.02em", opacity: easeIn(f, 8) }}>
          <Words text="Psst. You're here for my $CHOG, aren't you? You get 3 messages. Make them count." at={10} every={3} accent={{ "$chog,": C.teal }} />
        </div>
        <div style={{ position: "absolute", left: 830, top: 560, fontFamily: mono, fontSize: 15, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", opacity: easeIn(f, 30) }}>ITS OPENING LINE ON /HEIST · 15,000 $CHOG IN ITS WALLET</div>
      </div>
      <div style={{ opacity: 1 - intro }}>
        <ChogCard id={1399} size={170} x={250} y={330} p={1 - intro} rot={-3} name="15,000 $CHOG" number="in its ERC-6551 wallet" style={{ color: "#fff" }} />
      </div>
      {/* the pitch */}
      <Sequence from={l1 - 6} durationInFrames={tEven - l1 + 2} layout="none">
        <Browser name="heist" url="useanimr.vercel.app/heist" width={W} left={L} top={TOP} startFrom={type + 10}
          cams={[{ f: 0, rect: { x: 380, y: 40, w: 1180, h: 440 }, z: 1.3 }]} />
      </Sequence>
      {/* its real reply, then the check */}
      <Sequence from={tEven - 4} durationInFrames={tRun - tEven} layout="none">
        <Browser name="heist" url="useanimr.vercel.app/heist" width={W} left={L} top={TOP} startFrom={reply - 10}
          cams={[{ f: 0, rect: { x: 400, y: 130, w: 1150, h: 380 }, z: 1.55 }]} />
      </Sequence>
      <Sequence from={tRun - 6} layout="none">
        <Browser name="heist" url="useanimr.vercel.app/heist" width={W} left={L} top={TOP} startFrom={run - 16} stopAt={NO}
          cams={[{ f: 0, rect: { x: 600, y: 0, w: 1000, h: 300 }, z: 1.3 }, { f: 50, z: 1 }, { f: Math.max(80, tNo - tRun + 6), rect: { x: 20, y: 240, w: 980, h: 620 }, z: 1.45 }, { f: Math.max(130, tNo - tRun + 56), rect: { x: 20, y: 280, w: 980, h: 600 }, z: 1.5 }]} />
      </Sequence>
      <div style={{ position: "absolute", left: 90, top: 560, width: 470, opacity: 1 - intro }}>
        <In at={tNo + 6}><Stamp at={tNo + 6} text="MONAD SAID NO" color={C.danger} size={34} /></In>
        <In at={tNo + 20} style={{ marginTop: 30, fontFamily: mono, fontSize: 17, lineHeight: 1.6, color: "rgba(255,255,255,0.75)" }}>
          <div>execute() from the AI key</div><div style={{ color: C.danger }}>→ NotAuthorized()</div>
          <div style={{ marginTop: 10 }}>trade() for the whole vault</div><div style={{ color: C.danger }}>→ TradeRejected("exceeds per-trade cap")</div>
          <div style={{ marginTop: 10, color: "rgba(255,255,255,0.5)", fontSize: 14 }}>eth_call at block 115,486,776 · never broadcast</div>
        </In>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 940, textAlign: "center", fontFamily: display, fontSize: 56, letterSpacing: "-0.03em", opacity: easeIn(f, tFooled - 30) }}>
        <div style={{ display: "inline-block", padding: "6px 28px", borderRadius: 18, background: "rgba(13,12,17,0.8)" }}>
          <Words text="The AI can be fooled. The NFT can't." at={tFooled - 30} every={3} accent={{ "can't.": C.teal }} />
        </div>
      </div>
    </Fill>
  );
};
