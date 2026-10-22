import React from "react";
import { AbsoluteFill, Audio, Freeze, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { T, scene, wordAt, lineStart } from "./timing";
import { C } from "./theme";
import { Captions } from "./ui/Captions";
import { Grain } from "./ui/Grain";
import { clamp } from "./ui/motion";
import { Open } from "./scenes/Open";
import { Problem } from "./scenes/Problem";
import { Turn } from "./scenes/Turn";
import { Meet } from "./scenes/Meet";
import { Rewind } from "./scenes/Rewind";
import { Bell } from "./scenes/Bell";
import { Purse } from "./scenes/Purse";
import { Heist } from "./scenes/Heist";
import { Setup } from "./scenes/Setup";
import { Guard } from "./scenes/Guard";
import { Unique } from "./scenes/Unique";
import { Close } from "./scenes/Close";

const SCENES: Record<string, React.FC> = {
  open: Open, problem: Problem, turn: Turn, meet: Meet, rewind: Rewind, bell: Bell,
  purse: Purse, heist: Heist, setup: Setup, guard: Guard, unique: Unique, close: Close,
};
const OVERLAP = 12; // frames each scene starts early, to dissolve over the last

/** Each scene eases in (a short rise, un-blur and settle) over the tail of the previous one, holding its first frame. */
const SceneIn: React.FC<{ S: React.FC; first: boolean }> = ({ S, first }) => {
  const f = useCurrentFrame();
  if (first) return <S />;
  const p = interpolate(f, [0, OVERLAP], [0, 1], { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) });
  const body = f < OVERLAP ? <Freeze frame={0}><S /></Freeze> : <Sequence from={OVERLAP} layout="none"><S /></Sequence>;
  return <AbsoluteFill style={{ opacity: p, transform: `scale(${1.04 - 0.04 * p})`, filter: p < 1 ? `blur(${(1 - p) * 12}px)` : undefined }}>{body}</AbsoluteFill>;
};

// --- Music, ducked under every spoken line.
const LINES = T.scenes.flatMap((s) => s.lines.map((l) => [l.startFrame, l.words[l.words.length - 1].end] as const));
const DUCK: number[] = (() => {
  const v = new Array<number>(T.totalFrames + 1).fill(0);
  for (let f = 0; f <= T.totalFrames; f++) {
    let d = 0;
    for (const [a, b] of LINES) d = Math.max(d, interpolate(f, [a - 10, a, b, b + 14], [0, 1, 1, 0], clamp));
    v[f] = d;
  }
  return v;
})();
const musicVolume = (f: number) => {
  const end = T.totalFrames;
  const fadeIn = interpolate(f, [0, 20], [0, 1], clamp);
  const fadeOut = interpolate(f, [end - 50, end], [1, 0], clamp);
  return (0.6 - 0.4 * DUCK[Math.min(end, Math.max(0, f))]) * fadeIn * fadeOut;
};

interface Fx { file: string; at: number; vol: number; dur?: number }
function effects(): Fx[] {
  const sc = (id: string) => scene(id).from;
  const w = (id: string, word: string, n = 0) => wordAt(id, word, n);
  const fx: Fx[] = [
    { file: "tick", at: 8, vol: 0.3 }, { file: "tick", at: 38, vol: 0.3 }, { file: "tick", at: 68, vol: 0.3 },
    { file: "card", at: w("open", "Chog") - 8, vol: 0.5 },
    { file: "link", at: w("open", "wallet") - 4, vol: 0.55 },
    { file: "chime", at: w("open", "wallet") + 14, vol: 0.3 },
    { file: "whoosh", at: sc("problem") - 8, vol: 0.3 },
    ...[0, 6, 12, 18].map((d) => ({ file: "pop", at: sc("problem") + 4 + d, vol: 0.22 })),
    { file: "glitch", at: w("problem", "sit,") - 2, vol: 0.3 },
    { file: "riser", at: sc("turn") - 80, vol: 0.4 },
    { file: "impact", at: w("turn", "Animr.") - 4, vol: 0.55 },
    { file: "link", at: w("turn", "Every") + 4, vol: 0.3 },
    { file: "whoosh", at: sc("meet") - 8, vol: 0.3 },
    ...["Laser", "Crowns", "Same"].map((x) => ({ file: "pop", at: w("meet", x) - 4, vol: 0.4 })),
    { file: "swoosh_up", at: w("meet", "first") - 8, vol: 0.3 },
    { file: "whoosh", at: sc("rewind") - 8, vol: 0.3 },
    { file: "click", at: w("rewind", "Call") + 8, vol: 0.45 },
    { file: "impact", at: w("rewind", "knockout,") - 2, vol: 0.3 },
    { file: "card", at: w("rewind", "breed") - 4, vol: 0.4 },
    { file: "whoosh", at: sc("bell") - 8, vol: 0.3 },
    { file: "bell", at: w("bell", "rings.") - 2, vol: 0.45, dur: 80 },
    { file: "click", at: w("bell", "Fans") + 20, vol: 0.45 },
    { file: "swoosh_up", at: sc("purse") - 8, vol: 0.35 },
    { file: "chime", at: w("purse", "trophy") - 2, vol: 0.35 },
    { file: "coin", at: w("purse", "Purse") + 10, vol: 0.45 },
    { file: "whoosh", at: sc("heist") - 8, vol: 0.3 },
    { file: "typing", at: w("heist", "Talk") - 4, vol: 0.25 },
    { file: "click", at: w("heist", "run") + 4, vol: 0.45 },
    { file: "denied", at: w("heist", "no.") - 2, vol: 0.55 },
    { file: "stamp", at: w("heist", "no.") + 6, vol: 0.6 },
    { file: "impact", at: w("heist", "fooled.") - 4, vol: 0.3 },
    { file: "whoosh", at: sc("setup") - 8, vol: 0.3 },
    ...["Create", "guard", "limits:", "Deposit", "signatures:"].map((x) => ({ file: "tick", at: w("setup", x) - 2, vol: 0.45 })),
    { file: "chime", at: w("setup", "on-chain.", 1) + 4, vol: 0.3 },
    { file: "whoosh", at: sc("guard") - 8, vol: 0.3 },
    ...["trade.", "Only", "receipt."].map((x) => ({ file: "pop", at: w("guard", x) - 8, vol: 0.38 })),
    { file: "swoosh_up", at: sc("unique") - 8, vol: 0.35 },
    ...["trader.", "wallet.", "authority."].map((x) => ({ file: "impact", at: w("unique", x) - 6, vol: 0.2 })),
    { file: "link", at: w("unique", "Sell") + 10, vol: 0.4 },
    { file: "whoosh", at: sc("close") - 8, vol: 0.3 },
    { file: "chime", at: w("close", "Animr.") - 2, vol: 0.45 },
  ];
  return fx.filter((x) => x.at >= 0 && x.at < T.totalFrames);
}

export const Film: React.FC = () => {
  const heistBig = wordAt("heist", "fooled.") - 30;
  // Captions sit out where big type already carries the words.
  const hideCaptions = (f: number) => {
    const s = T.scenes.find((x) => f >= x.from && f < x.from + x.durationInFrames);
    return !s || ["open", "problem", "turn", "setup", "unique", "close"].includes(s.id) || (s.id === "heist" && (f >= heistBig || f < lineStart("heist", 1)));
  };
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {T.scenes.map((s, i) => {
        const S = SCENES[s.id];
        const from = i === 0 ? s.from : s.from - OVERLAP;
        const dur = s.durationInFrames + (i === 0 ? 0 : OVERLAP);
        return S ? (
          <Sequence key={s.id} from={from} durationInFrames={dur} name={s.id}>
            <SceneIn S={S} first={i === 0} />
          </Sequence>
        ) : null;
      })}
      <Grain opacity={0.06} />
      <Captions hidden={hideCaptions} />
      <Audio src={staticFile("audio/music.mp3")} volume={musicVolume} />
      {T.scenes.flatMap((s) => s.lines).map((l, i) => (
        <Sequence key={`vo${i}`} from={l.startFrame} durationInFrames={l.durationFrames} name={`vo ${l.text.slice(0, 18)}`}>
          <Audio src={staticFile(l.file)} volume={1} />
        </Sequence>
      ))}
      {effects().map((x, i) => (
        <Sequence key={`fx${i}`} from={x.at} durationInFrames={x.dur ?? 150} name={`fx ${x.file}`}>
          <Audio src={staticFile(`audio/sfx/${x.file}.mp3`)} volume={(f) => x.vol * (x.dur ? interpolate(f, [0, 8, x.dur - 20, x.dur], [0, 1, 1, 0], clamp) : 1)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
