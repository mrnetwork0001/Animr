import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { T } from "../timing";
import { mono, SCENE_LABEL, SCENE_TONE, TONE } from "../theme";
import { clamp } from "./motion";

const tc = (f: number) => {
  const s = Math.floor(f / 30);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `00:${pad(Math.floor(s / 60))}:${pad(s % 60)}:${pad(f % 30)}`;
};

/** Corner furniture: the scene tag, the reel name with a running timecode, the event and the URL. */
export const Chrome: React.FC<{ hideAfter?: number }> = ({ hideAfter }) => {
  const f = useCurrentFrame();
  const sc = T.scenes.find((s) => f >= s.from && f < s.from + s.durationInFrames) ?? T.scenes[T.scenes.length - 1];
  const tone = TONE[SCENE_TONE[sc.id] ?? "dark"];
  const tagIn = interpolate(f - sc.from, [4, 16], [0, 1], clamp);
  const op = hideAfter != null ? interpolate(f, [hideAfter, hideAfter + 12], [1, 0], clamp) : 1;
  const base: React.CSSProperties = { position: "absolute", fontFamily: mono, fontSize: 15, letterSpacing: "0.06em", color: tone.muted, opacity: op, textTransform: "uppercase" };
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ ...base, left: 48, top: 36 }}>
        <span style={{ opacity: 0.85 }}>// animr</span>
        <span style={{ marginLeft: 18, opacity: tagIn }}>{SCENE_LABEL[sc.id]}</span>
      </div>
      <div style={{ ...base, right: 48, top: 36 }}>ANIMR_REEL.MOV&nbsp;&nbsp;<span style={{ color: tone.ink, opacity: 0.8 }}>{tc(f)}</span></div>
      <div style={{ ...base, left: 48, bottom: 34, fontSize: 13 }}>chogathon 2026 · monad mainnet · chain 143</div>
      <div style={{ ...base, right: 48, bottom: 34, fontSize: 13, textTransform: "none" }}>useanimr.vercel.app</div>
    </AbsoluteFill>
  );
};
