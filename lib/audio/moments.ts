/*
 * Animr's sound moments, synthesized in code with Web Audio (no audio files, nothing to license): a bell strike, a
 * K.O. hit, a refusal, a trophy chime and a ride confirm. Every renderer takes a BaseAudioContext, so the same code
 * plays live (AudioContext, lib/audio/engine.ts) and renders offline (OfflineAudioContext) for the level check.
 * Each moment is trimmed to peak near -12 dBFS (TRIM, measured offline); the chain is linear, so nothing clips.
 */

export const SOUND_NAMES = ["bell", "ko", "refused", "trophy", "ride"] as const;
export type SoundName = (typeof SOUND_NAMES)[number];

/** How long each moment sounds, in seconds (its last source stops then). */
export const MOMENT_SECONDS: Record<SoundName, number> = { bell: 1.3, ko: 0.5, refused: 0.55, trophy: 1.25, ride: 0.3 };

/** Per-moment output gain, set so each peaks at about -12 dBFS (0.25 linear); the ride sits a touch softer. */
const TRIM: Record<SoundName, number> = { bell: 0.07, ko: 0.19, refused: 0.28, trophy: 0.14, ride: 0.2 };

/** Where exponential decays end: -66 dB below the peak. */
const FLOOR = 0.0005;

type Envelope = { at: number; attack: number; decay: number; peak: number };

/** A gain with a percussive envelope: a linear attack to `peak`, then an exponential decay to silence over `decay`. */
function envelope(ctx: BaseAudioContext, out: AudioNode, { at, attack, decay, peak }: Envelope): GainNode {
  const node = ctx.createGain();
  node.gain.setValueAtTime(0, at);
  node.gain.linearRampToValueAtTime(peak, at + attack);
  node.gain.exponentialRampToValueAtTime(peak * FLOOR, at + attack + decay);
  node.connect(out);
  return node;
}

function gain(ctx: BaseAudioContext, out: AudioNode, value: number): GainNode {
  const node = ctx.createGain();
  node.gain.value = value;
  node.connect(out);
  return node;
}

/** One oscillator from `at` to `until`; `detune` in cents. */
function tone(ctx: BaseAudioContext, out: AudioNode, type: OscillatorType, hz: number, at: number, until: number, detune = 0): OscillatorNode {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(hz, at);
  if (detune) osc.detune.setValueAtTime(detune, at);
  osc.connect(out);
  osc.start(at);
  osc.stop(until);
  return osc;
}

/** An oscillator whose pitch glides exponentially from `from` to `to` over `over` seconds. */
function sweep(ctx: BaseAudioContext, out: AudioNode, type: OscillatorType, from: number, to: number, over: number, at: number, until: number): OscillatorNode {
  const osc = tone(ctx, out, type, from, at, until);
  osc.frequency.exponentialRampToValueAtTime(to, at + over);
  return osc;
}

function filter(ctx: BaseAudioContext, out: AudioNode, type: BiquadFilterType, hz: number, q = 0.7): BiquadFilterNode {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = hz;
  node.Q.value = q;
  node.connect(out);
  return node;
}

// Half a second of white noise per context, from a fixed-seed LCG: live and offline renders sound the same.
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    const length = Math.ceil(ctx.sampleRate * 0.5);
    buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x9e3779b9;
    for (let i = 0; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = (seed / 4294967296) * 2 - 1;
    }
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

function noise(ctx: BaseAudioContext, out: AudioNode, at: number, until: number): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  source.connect(out);
  source.start(at);
  source.stop(until);
  return source;
}

// --- the moments --------------------------------------------------------------------------------

/** A bell's partials (ratio to the prime, level, -60 dB decay in seconds): hum, prime, tierce, quint, nominal, uppers. */
const BELL_PARTIALS: readonly [number, number, number][] = [
  [0.5, 0.32, 1.25],
  [1, 1, 1.15],
  [1.183, 0.5, 0.95],
  [1.506, 0.28, 0.75],
  [2, 0.42, 0.6],
  [2.514, 0.2, 0.42],
  [2.662, 0.16, 0.38],
  [3.011, 0.14, 0.3],
  [4.166, 0.08, 0.2],
];

/** The Bell: a struck bell, inharmonic partials that each decay at their own rate, a short metallic strike on top. */
function bell(ctx: BaseAudioContext, out: AudioNode, t0: number) {
  const prime = 940;
  const until = t0 + MOMENT_SECONDS.bell;
  const trim = gain(ctx, out, TRIM.bell);
  for (const [ratio, level, decay] of BELL_PARTIALS) {
    tone(ctx, envelope(ctx, trim, { at: t0, attack: 0.002, decay, peak: level }), "sine", prime * ratio, t0, until);
    // The prime and the tierce come as doublets (a real bell's slow beat): a quieter copy, 3 cents sharp.
    if (ratio === 1 || ratio === 1.183) {
      tone(ctx, envelope(ctx, trim, { at: t0, attack: 0.002, decay: decay * 0.9, peak: level * 0.5 }), "sine", prime * ratio, t0, until, 3);
    }
  }
  const strike = filter(ctx, envelope(ctx, trim, { at: t0, attack: 0.001, decay: 0.03, peak: 0.6 }), "bandpass", 2800, 1.1);
  noise(ctx, strike, t0, t0 + 0.05);
}

/** The K.O.: a low sine thump that drops in pitch, a shorter body an octave up, and a noise impact swept down. */
function ko(ctx: BaseAudioContext, out: AudioNode, t0: number) {
  const until = t0 + MOMENT_SECONDS.ko;
  const trim = gain(ctx, out, TRIM.ko);
  sweep(ctx, envelope(ctx, trim, { at: t0, attack: 0.003, decay: 0.42, peak: 1 }), "sine", 150, 42, 0.12, t0, until);
  sweep(ctx, envelope(ctx, trim, { at: t0, attack: 0.002, decay: 0.2, peak: 0.35 }), "sine", 300, 84, 0.1, t0, until);
  const impact = filter(ctx, envelope(ctx, trim, { at: t0, attack: 0.001, decay: 0.16, peak: 0.8 }), "lowpass", 5000, 1.2);
  impact.frequency.exponentialRampToValueAtTime(250, t0 + 0.1);
  noise(ctx, impact, t0, t0 + 0.2);
}

/** Refused: a short low thud, then a descending two-note "nope" (a fourth down), kept dull. */
function refused(ctx: BaseAudioContext, out: AudioNode, t0: number) {
  const until = t0 + MOMENT_SECONDS.refused;
  const trim = gain(ctx, out, TRIM.refused);
  sweep(ctx, envelope(ctx, trim, { at: t0, attack: 0.003, decay: 0.22, peak: 1 }), "sine", 95, 48, 0.09, t0, until);
  const dull = filter(ctx, trim, "lowpass", 1400, 0.7);
  tone(ctx, envelope(ctx, dull, { at: t0 + 0.06, attack: 0.008, decay: 0.14, peak: 0.5 }), "triangle", 311.1, t0 + 0.06, until);
  tone(ctx, envelope(ctx, dull, { at: t0 + 0.21, attack: 0.008, decay: 0.2, peak: 0.5 }), "triangle", 233.1, t0 + 0.21, until);
}

/** One chime note: the fundamental with a second and third partial, each decaying faster than the last. */
function chime(ctx: BaseAudioContext, out: AudioNode, hz: number, at: number, level: number, until: number) {
  tone(ctx, envelope(ctx, out, { at, attack: 0.004, decay: 0.9, peak: level }), "sine", hz, at, until);
  tone(ctx, envelope(ctx, out, { at, attack: 0.004, decay: 0.5, peak: level * 0.3 }), "sine", hz * 2, at, until);
  tone(ctx, envelope(ctx, out, { at, attack: 0.004, decay: 0.3, peak: level * 0.1 }), "sine", hz * 3, at, until);
}

/** Trophy: a bright rising chime, C6 E6 G6 and a lighter C7 on top. */
function trophy(ctx: BaseAudioContext, out: AudioNode, t0: number) {
  const until = t0 + MOMENT_SECONDS.trophy;
  const trim = gain(ctx, out, TRIM.trophy);
  chime(ctx, trim, 1046.5, t0, 1, until);
  chime(ctx, trim, 1318.5, t0 + 0.1, 1, until);
  chime(ctx, trim, 1568, t0 + 0.2, 1, until);
  chime(ctx, trim, 2093, t0 + 0.32, 0.55, until);
}

/** Ride: a soft two-note confirm (C5 up to G5), rounded off by a low-pass. */
function ride(ctx: BaseAudioContext, out: AudioNode, t0: number) {
  const until = t0 + MOMENT_SECONDS.ride;
  const soft = filter(ctx, gain(ctx, out, TRIM.ride), "lowpass", 2200, 0.7);
  tone(ctx, envelope(ctx, soft, { at: t0, attack: 0.006, decay: 0.12, peak: 0.8 }), "sine", 523.3, t0, until);
  tone(ctx, envelope(ctx, soft, { at: t0 + 0.07, attack: 0.006, decay: 0.18, peak: 1 }), "sine", 784, t0 + 0.07, until);
}

const RENDERERS: Record<SoundName, (ctx: BaseAudioContext, out: AudioNode, t0: number) => void> = { bell, ko, refused, trophy, ride };

/** Builds one moment into `out`, starting at audio time `t0`. Its nodes stop and free themselves. */
export function renderMoment(name: SoundName, ctx: BaseAudioContext, out: AudioNode, t0: number): void {
  RENDERERS[name](ctx, out, t0);
}
