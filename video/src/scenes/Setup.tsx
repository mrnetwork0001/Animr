import React from "react";
import { Sequence, interpolate } from "remotion";
import { C, display, mono, sans } from "../theme";
import { clamp, expo } from "../ui/motion";
import { Browser } from "../ui/Footage";
import { easeIn } from "../ui/Bound";
import { Words } from "../ui/Words";
import { Fill, In, Kicker, short, tx, utc, useCue } from "./common";

/** The spine: the House Chog's holder, on-chain, last night. Real hashes, blocks and figures. */
export const Setup: React.FC = () => {
  const { f, rel } = useCue("setup");
  const tCreate = rel("Create");
  const tGuard = rel("guard");
  const tLimits = rel("limits:");
  const tDeposit = rel("Deposit");
  const tSig = rel("signatures:");
  const create = tx("Create the Token Bound"), guard = tx("Authorize AnimrTradeGuard"), limits = tx("Set trading limits");
  const chog = tx("Deposit 15,000 CHOG"), wmon = tx("Deposit 1,001 WMON");
  const rows = [
    { at: tCreate, t: create, what: "Create the Chog's wallet", fig: "ERC-6551 account 0xa46a…AD71" },
    { at: tGuard, t: guard, what: "Let the guard trade", fig: "setPermissions([guard], [true])" },
    { at: tLimits, t: limits, what: "Set limits", fig: "10% a trade · 30% a day · 600 s · 2% slippage" },
    { at: tDeposit, t: chog, what: "Fund the vault", fig: "15,000 $CHOG" },
    { at: tDeposit + 22, t: wmon, what: "", fig: "1,001 WMON (wrapped from MON)" },
  ];
  const Y0 = 270, RH = 104;
  const line = interpolate(f, [tCreate - 6, tSig + 20], [0, 1], { ...clamp, easing: expo });
  const shots: { at: number; name: string; url: string; cams: { f: number; rect?: { x: number; y: number; w: number; h: number }; z?: number }[]; startFrom?: number }[] = [
    { at: 0, name: "owner", url: "useanimr.vercel.app · logged in as the holder", startFrom: 1590, cams: [{ f: 0, rect: { x: 1150, y: 30, w: 450, h: 520 }, z: 1.7 }] },
    { at: tCreate - 8, name: "scan_create", url: `monadscan.com/tx/${short(create.hash, 10, 6)}`, cams: [{ f: 0, rect: { x: 40, y: 140, w: 1000, h: 520 }, z: 1.45 }] },
    { at: tGuard - 8, name: "scan_guard", url: `monadscan.com/tx/${short(guard.hash, 10, 6)}`, cams: [{ f: 0, rect: { x: 40, y: 140, w: 1000, h: 520 }, z: 1.45 }] },
    { at: tLimits - 8, name: "scan_limits", url: `monadscan.com/tx/${short(limits.hash, 10, 6)}`, cams: [{ f: 0, rect: { x: 40, y: 140, w: 1000, h: 520 }, z: 1.45 }] },
    { at: tDeposit - 8, name: "scan_deposit", url: `monadscan.com/tx/${short(chog.hash, 10, 6)}`, cams: [{ f: 0, rect: { x: 40, y: 140, w: 1000, h: 520 }, z: 1.45 }] },
    { at: tSig - 30, name: "owner", url: "useanimr.vercel.app/chog/1399 · holder view", startFrom: 880, cams: [{ f: 0, rect: { x: 40, y: 60, w: 1060, h: 800 }, z: 1.35 }, { f: 70, rect: { x: 80, y: 250, w: 1020, h: 300 }, z: 1.55 }] },
  ];
  return (
    <Fill bg={C.paper} color={C.paperInk}>
      <div style={{ position: "absolute", left: 90, top: 92 }}><In at={0}><Kicker color="rgba(13,12,17,0.55)" dot={C.violetA}>The House Chog's holder · 0xc742…960C · Oct 21, UTC</Kicker></In></div>
      <div style={{ position: "absolute", left: 90, top: 140, fontFamily: display, fontSize: 64, letterSpacing: "-0.035em" }}>
        <Words text="Last night, on Monad." at={rel("Last")} every={4} accent={{ "monad.": C.violetA }} />
      </div>
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
        <line x1={112} x2={112} y1={Y0 + 20} y2={Y0 + 20 + (rows.length * RH + 40) * line} stroke={C.violetB} strokeWidth={3} strokeLinecap="round" />
      </svg>
      {rows.map((r, i) => {
        const p = easeIn(f, r.at - 4, 20);
        return (
          <div key={i} style={{ position: "absolute", left: 90, top: Y0 + i * RH, width: 820, display: "flex", gap: 26, opacity: p, transform: `translateX(${(1 - p) * -30}px)` }}>
            <div style={{ width: 44, height: 44, borderRadius: 22, background: C.violetA, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontSize: 18, boxShadow: "0 0 0 6px rgba(77,25,177,0.15)" }}>✓</div>
            <div>
              <div style={{ fontFamily: mono, fontSize: 15, letterSpacing: "0.06em", color: "rgba(13,12,17,0.5)" }}>{utc(r.t.timestampISO)} · BLOCK {r.t.blockNumber.toLocaleString("en-US")} · <span style={{ color: C.violetA }}>{short(r.t.hash, 10, 6)}</span></div>
              <div style={{ marginTop: 4, fontFamily: display, fontSize: 32, letterSpacing: "-0.02em" }}>{r.what ? <>{r.what} <span style={{ color: "rgba(13,12,17,0.55)", fontSize: 24 }}>· {r.fig}</span></> : <span style={{ color: "rgba(13,12,17,0.55)", fontSize: 24 }}>+ {r.fig}</span>}</div>
            </div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 90, top: Y0 + rows.length * RH + 6, width: 820, display: "flex", gap: 26, opacity: easeIn(f, tSig - 4, 20) }}>
        <div style={{ width: 44, height: 44, borderRadius: 22, border: `3px solid ${C.violetA}`, color: C.violetA, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, fontSize: 18 }}>✎</div>
        <div>
          <div style={{ fontFamily: mono, fontSize: 15, letterSpacing: "0.06em", color: "rgba(13,12,17,0.5)" }}>TWO FREE SIGNATURES · OFF-CHAIN · NO GAS</div>
          <div style={{ marginTop: 4, fontFamily: display, fontSize: 32, letterSpacing: "-0.02em" }}>Wake the AI · switch it on-chain</div>
        </div>
      </div>
      {shots.map((sh, i) => {
        const end = i + 1 < shots.length ? shots[i + 1].at + 10 : undefined;
        return (
          <Sequence key={i} from={Math.max(0, sh.at)} durationInFrames={end ? end - Math.max(0, sh.at) : undefined} layout="none">
            <Browser name={sh.name} url={sh.url} width={880} left={960} top={250} light startFrom={sh.startFrom ?? 0} cams={sh.cams} />
          </Sequence>
        );
      })}
      <div style={{ position: "absolute", left: 960, top: 800, width: 880, fontFamily: sans, fontSize: 18, color: "rgba(13,12,17,0.55)", opacity: easeIn(f, tCreate) }}>
        Real transactions on Monad mainnet, read back from the chain. The holder view is the owner's own screen recording.
      </div>
    </Fill>
  );
};
