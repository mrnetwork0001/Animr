/*
 * The ambient: an original, generative piece in A minor, made live with Web Audio (no audio file, nothing to license).
 *
 *   Harmony   a slow progression, Am – F – C – G (i – VI – III – VII), each chord about 8 s (a 32 s cycle), with
 *             substitutions drawn afresh each time round (F→Dm, G→Em, C→Em) and jittered lengths, so no two cycles
 *             match and it never feels looped.
 *   Pad       three oscillators (two saws and a triangle, a few cents apart), one per chord tone, voice-led to the
 *             nearest tones of the next chord and glided there; through one low-pass whose cutoff breathes under a
 *             ~25 s LFO.
 *   Melody    a soft sine pluck every 3–7 s (sometimes a quick second note), chosen from the chord's tones (65%) or
 *             the A minor scale, walking from the previous note; an octave partial gives it a little light.
 *   Space     one feedback delay (0.42 s, darkened repeats), fed by the melody and a touch of the pad.
 *
 * About 14 nodes while it plays, plus 4 per melody note for ~2 s. TRIM sets the mix to peak near -12 dBFS; the engine's
 * volume (default 0.25) takes it to about -24 dBFS. It starts from silence with a fade and stops with one. Timing is a
 * lookahead scheduler on the audio clock, so a throttled background tab stays in time. Works on any BaseAudioContext:
 * the same code renders offline (OfflineAudioContext + scheduleTo) for the level check.
 */

export type Rng = () => number;

/** A triad as pitch classes (0 = C): root, third, fifth. */
type Chord = readonly [number, number, number];

const CHORDS = {
  Am: [9, 0, 4],
  F: [5, 9, 0],
  C: [0, 4, 7],
  G: [7, 11, 2],
  Dm: [2, 5, 9],
  Em: [4, 7, 11],
} as const satisfies Record<string, Chord>;
type ChordName = keyof typeof CHORDS;

const CYCLE: readonly ChordName[] = ["Am", "F", "C", "G"];
/** Per base chord: the substitute and how often it is drawn. */
const SUBSTITUTE: Partial<Record<ChordName, [ChordName, number]>> = { F: ["Dm", 0.3], G: ["Em", 0.25], C: ["Em", 0.15] };
/** A natural minor. */
const SCALE: readonly number[] = [9, 11, 0, 2, 4, 5, 7];

const CHORD_SECONDS = 8;
const CHORD_JITTER = 0.8;
/** How far ahead events are placed on the audio clock, and how often the scheduler tops that up. */
const LOOKAHEAD_SECONDS = 90;
const TICK_MS = 5000;

// Pad: MIDI range and the opening voicing (A2 E3 C4); the oscillator per voice and its detune in cents.
const PAD_LO = 43;
const PAD_HI = 64;
const PAD_START: readonly number[] = [45, 52, 60];
const PAD_TYPES: readonly OscillatorType[] = ["sawtooth", "triangle", "sawtooth"];
const PAD_DETUNE: readonly number[] = [-6, 0, 6];
const PAD_GLIDE = 0.7;
const PAD_CUTOFF = 520;
const PAD_LFO_DEPTH = 170;
// Melody: A4..E6.
const MELODY_LO = 69;
const MELODY_HI = 88;
const MELODY_START = 76;

// Levels, measured offline: the sum peaks near -12 dBFS before the engine's volume.
const PAD_LEVEL = 0.16;
const MELODY_LEVEL = 0.28;
const PAD_SEND = 0.18;
const DELAY_SECONDS = 0.42;
const FEEDBACK = 0.38;
const WET = 0.32;
const TRIM = 0.35;

/** Where exponential decays end: -66 dB below the peak. */
const FLOOR = 0.0005;

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** The MIDI note of pitch class `pc` inside [lo, hi] closest to `from`. */
function nearest(from: number, pc: number, lo: number, hi: number): number {
  let best = lo;
  let distance = Number.POSITIVE_INFINITY;
  for (let midi = lo + ((((pc - lo) % 12) + 12) % 12); midi <= hi; midi += 12) {
    const d = Math.abs(midi - from);
    if (d < distance) {
      distance = d;
      best = midi;
    }
  }
  return best;
}

const PERMUTATIONS: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

/** Voice leading: every chord tone covered once, each voice moving as little as it can. */
function voiceLead(prev: readonly number[], chord: Chord): number[] {
  let best: number[] = [];
  let cost = Number.POSITIVE_INFINITY;
  for (const order of PERMUTATIONS) {
    const next = prev.map((midi, i) => nearest(midi, chord[order[i]], PAD_LO, PAD_HI));
    const moved = next.reduce((sum, midi, i) => sum + Math.abs(midi - prev[i]), 0);
    if (moved < cost) {
      cost = moved;
      best = next;
    }
  }
  return best;
}

type Slot = { at: number; end: number; chord: Chord };
type Note = { oscs: OscillatorNode[]; at: number };

export class Ambient {
  private readonly ctx: BaseAudioContext;
  private readonly rng: Rng;
  private readonly fade: GainNode;
  private readonly padFilter: BiquadFilterNode;
  private readonly melodyBus: GainNode;
  private padOscs: OscillatorNode[] = [];
  private lfo: OscillatorNode | null = null;
  private readonly notes = new Set<Note>();
  private slots: Slot[] = [];
  private voices: readonly number[] = PAD_START;
  private settled = false;
  private step = 0;
  private lastMelody = MELODY_START;
  private nextChordAt = 0;
  private nextNoteAt = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  /** True between start() and stop(). */
  playing = false;

  constructor(ctx: BaseAudioContext, out: AudioNode, rng: Rng = Math.random) {
    this.ctx = ctx;
    this.rng = rng;

    const trim = ctx.createGain();
    trim.gain.value = TRIM;
    trim.connect(out);
    this.fade = ctx.createGain();
    this.fade.gain.value = 0;
    this.fade.connect(trim);

    // Pad: oscillators (made per start) → low-pass → level → mix, with a small send into the delay.
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.value = PAD_CUTOFF;
    this.padFilter.Q.value = 0.9;
    const padGain = ctx.createGain();
    padGain.gain.value = PAD_LEVEL;
    this.padFilter.connect(padGain);
    padGain.connect(this.fade);

    // Melody bus: dry into the mix and fully into the delay.
    this.melodyBus = ctx.createGain();
    this.melodyBus.gain.value = MELODY_LEVEL;
    this.melodyBus.connect(this.fade);

    // Space: one feedback delay with darkened repeats.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = DELAY_SECONDS;
    const darken = ctx.createBiquadFilter();
    darken.type = "lowpass";
    darken.frequency.value = 1800;
    const feedback = ctx.createGain();
    feedback.gain.value = FEEDBACK;
    delay.connect(darken);
    darken.connect(feedback);
    feedback.connect(delay);
    const wet = ctx.createGain();
    wet.gain.value = WET;
    delay.connect(wet);
    wet.connect(this.fade);
    this.melodyBus.connect(delay);
    const padSend = ctx.createGain();
    padSend.gain.value = PAD_SEND;
    padGain.connect(padSend);
    padSend.connect(delay);
  }

  /** Starts from silence, fading in over `fadeSeconds`. Live contexts get a scheduler; offline ones use scheduleTo(). */
  start(fadeSeconds = 1.5): void {
    if (this.playing) return;
    this.playing = true;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // An oscillator plays once, so the pad voices and the LFO are fresh each start.
    this.padOscs = PAD_TYPES.map((type, i) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.detune.value = PAD_DETUNE[i];
      osc.connect(this.padFilter);
      osc.onended = () => osc.disconnect();
      osc.start(now);
      return osc;
    });
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.035 + this.rng() * 0.02;
    const depth = ctx.createGain();
    depth.gain.value = PAD_LFO_DEPTH;
    lfo.connect(depth);
    depth.connect(this.padFilter.frequency);
    lfo.onended = () => {
      lfo.disconnect();
      depth.disconnect();
    };
    lfo.start(now);
    this.lfo = lfo;

    const gain = this.fade.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(0, now);
    gain.linearRampToValueAtTime(1, now + fadeSeconds);

    this.voices = PAD_START;
    this.settled = false;
    this.slots = [];
    this.nextChordAt = now;
    this.nextNoteAt = now + 1.5 + this.rng() * 2;
    this.scheduleTo(now + LOOKAHEAD_SECONDS);

    const offline = typeof OfflineAudioContext !== "undefined" && ctx instanceof OfflineAudioContext;
    if (!offline) this.timer = setInterval(() => this.scheduleTo(this.ctx.currentTime + LOOKAHEAD_SECONDS), TICK_MS);
  }

  /** Fades out over `fadeSeconds`, then every source stops. */
  stop(fadeSeconds = 1.5): void {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    this.timer = undefined;

    const now = this.ctx.currentTime;
    const gain = this.fade.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0, now + fadeSeconds);

    const stopAt = now + fadeSeconds + 0.05;
    for (const osc of this.padOscs) osc.stop(stopAt);
    this.padOscs = [];
    this.lfo?.stop(stopAt);
    this.lfo = null;
    // Notes already placed on the clock (up to 90 s ahead) end as soon as they would start.
    for (const note of this.notes) for (const osc of note.oscs) osc.stop(Math.max(stopAt, note.at + 0.01));
    this.slots = [];
  }

  /** Places every chord change and melody note up to audio time `until`. */
  scheduleTo(until: number): void {
    if (!this.playing) return;
    while (this.nextChordAt < until) {
      const chord = this.nextChord();
      const length = CHORD_SECONDS + (this.rng() * 2 - 1) * CHORD_JITTER;
      this.setChord(chord, this.nextChordAt);
      this.slots.push({ at: this.nextChordAt, end: this.nextChordAt + length, chord });
      this.nextChordAt += length;
    }
    while (this.nextNoteAt < until) {
      const at = this.nextNoteAt;
      const slot = this.slots.find((s) => s.at <= at && at < s.end);
      this.note(at, slot?.chord ?? CHORDS.Am);
      // Mostly 3–7 s apart; one in four is answered by a quick second note.
      this.nextNoteAt += this.rng() < 0.25 ? 0.5 + this.rng() * 0.4 : 3 + this.rng() * 4;
    }
    const now = this.ctx.currentTime;
    this.slots = this.slots.filter((s) => s.end > now - 1);
  }

  private nextChord(): Chord {
    const base = CYCLE[this.step % CYCLE.length];
    this.step += 1;
    const sub = SUBSTITUTE[base];
    return CHORDS[sub && this.rng() < sub[1] ? sub[0] : base];
  }

  private setChord(chord: Chord, at: number): void {
    const next = voiceLead(this.voices, chord);
    this.padOscs.forEach((osc, i) => {
      if (this.settled) osc.frequency.setTargetAtTime(hz(next[i]), at, PAD_GLIDE);
      else osc.frequency.setValueAtTime(hz(next[i]), at);
    });
    this.voices = next;
    this.settled = true;
  }

  private note(at: number, chord: Chord): void {
    const ctx = this.ctx;
    const r = this.rng;
    const pool = r() < 0.65 ? chord : SCALE;
    const pc = pool[Math.floor(r() * pool.length)];
    const target = Math.min(MELODY_HI, Math.max(MELODY_LO, this.lastMelody + Math.round((r() * 2 - 1) * 6)));
    const midi = nearest(target, pc, MELODY_LO, MELODY_HI);
    this.lastMelody = midi;

    const peak = 0.5 + r() * 0.5;
    const decay = 1.2 + r() * 1.2;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + 0.006);
    env.gain.exponentialRampToValueAtTime(peak * FLOOR, at + 0.006 + decay);
    env.connect(this.melodyBus);
    const octave = ctx.createGain();
    octave.gain.value = 0.18;
    octave.connect(env);

    const until = at + 0.006 + decay + 0.05;
    const oscs = [hz(midi), hz(midi) * 2].map((frequency, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = frequency;
      osc.connect(i === 0 ? env : octave);
      osc.start(at);
      osc.stop(until);
      return osc;
    });
    const entry: Note = { oscs, at };
    this.notes.add(entry);
    oscs[0].onended = () => {
      this.notes.delete(entry);
      env.disconnect();
      octave.disconnect();
    };
  }
}
