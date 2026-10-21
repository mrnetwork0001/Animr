import { randomChogId } from "@/components/dna/shared";
import type { FanState } from "@/lib/bell/types";
import type { ChogSnapshot, Genome } from "@/lib/dna/types";
import { decodeBoutId, encodeBoutId } from "@/lib/rewind/id";
import type {
  VersusBout,
  VersusBoutPreview,
  VersusFighter,
  VersusFrame,
  VersusPickResponse,
  VersusReveal,
  VersusStats,
  VersusTrade,
} from "@/lib/rewind/types";
import { VersusApiError } from "./api";
import type { Side } from "./shared";

// Dev-only sample bouts in the exact /api/versus shapes (lib/rewind/types.ts), so the VERSUS UI works
// before the engine's routes do. api.ts loads this module only outside production and only when a
// VERSUS route is missing; the arena then shows a "sample data" banner. Ids are real bout ids
// (lib/rewind/id.ts) and fighters are real (names, art and archetypes from /api/dna); the race itself
// is a synthetic, deterministic walk, not the engine's replay.

const START_CHOG = 1000;
const HOURS = 48;
const FEE = 0.01;
const IMPACT = 0.003;

function random(seed: string) {
  let a = 2166136261;
  for (let i = 0; i < seed.length; i++) a = Math.imul(a ^ seed.charCodeAt(i), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gaussian = (rand: () => number) => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const pick = <T,>(rand: () => number, items: readonly T[]) => items[Math.floor(rand() * items.length)];

const fighters = new Map<number, Promise<VersusFighter>>();

/** The real Chog (name, art, archetype) from the DNA API; a plain stand-in if that fails. */
function fighter(tokenId: number): Promise<VersusFighter> {
  let hit = fighters.get(tokenId);
  if (!hit) {
    hit = fetch(`/api/dna/${tokenId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const { chog, genome } = (await res.json()) as { chog: ChogSnapshot; genome: Genome };
        return {
          tokenId,
          name: chog.name,
          image: chog.image,
          archetype: genome.archetype,
          style: genome.style,
          genomeVersion: genome.version,
        };
      })
      .catch(() => ({
        tokenId,
        name: `Chog #${tokenId}`,
        image: "",
        archetype: "Swing Trader",
        style: "balanced" as const,
        genomeVersion: "sample",
      }));
    fighters.set(tokenId, hit);
  }
  return hit;
}

/** Sample windows start at 15:00 UTC on a day between Aug 28 and Oct 11, 2026. */
const FIRST_HOUR = Date.UTC(2026, 7, 28, 15) / 3_600_000;
const randomHour = () => FIRST_HOUR + 24 * Math.floor(Math.random() * 45);

async function preview(a: number, b: number, hour: number): Promise<VersusBoutPreview> {
  const [fa, fb] = await Promise.all([fighter(a), fighter(b)]);
  return { id: encodeBoutId({ a, b, hour }), a: fa, b: fb, windowLabel: "48 hours of real $CHOG history", startChog: START_CHOG };
}

const SCENARIOS = ["pump-dump", "dump-rip", "grind-up", "bleed", "chop"] as const;

/** A dramatic 48-hour price index (100 at the start). */
function pricePath(rand: () => number, scenario: (typeof SCENARIOS)[number]): number[] {
  const turn = 14 + Math.floor(rand() * 20);
  const prices = [100];
  for (let i = 1; i <= HOURS; i++) {
    const drift =
      scenario === "pump-dump"
        ? i < turn ? 0.011 : -0.012
        : scenario === "dump-rip"
          ? i < turn ? -0.011 : 0.012
          : scenario === "grind-up"
            ? 0.004
            : scenario === "bleed"
              ? -0.004
              : (100 - prices[i - 1]) * 0.002;
    prices.push(Math.max(5, prices[i - 1] * (1 + drift + gaussian(rand) * 0.017)));
  }
  return prices;
}

const SELL_LINES = [
  "Too green, too fast. Taking chips off.",
  "This pump smells like exit liquidity.",
  "Selling strength, napping in MON.",
  "Gravity always wins. Lightening up.",
];
const BUY_LINES = [
  "Bears look tired. Buying back.",
  "Dip spotted. Reloading $CHOG.",
  "Smelled the bottom. Loading up.",
  "Back in, louder this time.",
];
const LEAD_LINES = ["Lead change. Catch me if you can.", "Front of the pack. Stay humble, genome.", "Passing on the inside."];
const CALM_LINES = ["Holding still while the chart throws a tantrum.", "Patience is a position too.", "Not my setup. Snacks out."];

type Run = { values: number[]; trades: VersusTrade[]; fees: number };

/** One fighter's simple trait-flavored rules over the path: momentum when aggressive, fading when cautious. */
function run(side: Side, f: VersusFighter, prices: number[], rand: () => number): Run {
  const lookback = f.style === "aggressive" ? 3 : f.style === "balanced" ? 8 : 16;
  const threshold = (f.style === "aggressive" ? 3.5 : f.style === "balanced" ? 6 : 9) * (0.8 + rand() * 0.4);
  const size = f.style === "aggressive" ? 0.45 : f.style === "balanced" ? 0.3 : 0.2;
  const fade = f.style === "cautious" || (f.style === "balanced" && rand() < 0.5);
  const cooldown = f.style === "aggressive" ? 2 : f.style === "balanced" ? 4 : 8;
  let chog = START_CHOG;
  let mon = 0;
  let fees = 0;
  let last = -Infinity;
  const values: number[] = [];
  const trades: VersusTrade[] = [];
  for (let i = 0; i <= HOURS; i++) {
    const price = prices[i];
    if (i >= lookback && i - last >= cooldown) {
      const move = (price / prices[i - lookback] - 1) * 100;
      const wantsSell = fade ? move > threshold : move < -threshold;
      const wantsBuy = fade ? move < -threshold : move > threshold;
      if (wantsSell && chog > START_CHOG * 0.3) {
        const amount = chog * size;
        chog -= amount;
        mon += amount * price * (1 - FEE - IMPACT);
        fees += amount * FEE;
        trades.push({ fighter: side, i, side: "sell", reason: pick(rand, SELL_LINES) });
        last = i;
      } else if (wantsBuy && mon > 0) {
        const spend = mon * Math.min(1, size * 2);
        mon -= spend;
        chog += (spend / price) * (1 - FEE - IMPACT);
        fees += (spend / price) * FEE;
        trades.push({ fighter: side, i, side: "buy", reason: pick(rand, BUY_LINES) });
        last = i;
      }
    }
    values.push(chog + mon / price);
  }
  return { values, trades, fees };
}

function reveal(rand: () => number, prices: number[], hour: number): VersusReveal {
  const from = hour * 3_600_000;
  const to = from + HOURS * 3_600_000;
  const peak = Math.max(...prices);
  const trough = Math.min(...prices);
  const peakAt = prices.indexOf(peak);
  const troughAt = prices.indexOf(trough);
  const pct = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(Math.round(value))}%`;
  const [first, second] =
    peakAt < troughAt
      ? [pct(peak - 100), pct((trough / peak - 1) * 100)]
      : [pct(trough - 100), pct((peak / trough - 1) * 100)];
  const day1 = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const year = new Date(to).getUTCFullYear();
  const priceStart = round(0.0011 + rand() * 0.0006, 6);
  return {
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    label: `${day1.format(from)} – ${day1.format(to)}, ${year}: ${first} then ${second}`,
    priceStart,
    priceEnd: round((priceStart * prices[HOURS]) / 100, 7),
  };
}

const bouts = new Map<string, Promise<VersusBout>>();

/** GET /api/versus/[id]?spectate=1 */
export function sampleBout(id: string): Promise<VersusBout> {
  const parsed = decodeBoutId(id);
  if (!parsed) return Promise.reject(new VersusApiError("That isn't a VERSUS bout id.", 404));
  let hit = bouts.get(id);
  if (!hit) {
    hit = (async () => {
      const base = await preview(parsed.a, parsed.b, parsed.hour);
      const rand = random(id);
      const prices = pricePath(rand, SCENARIOS[parsed.hour % SCENARIOS.length]);
      const ra = run("a", base.a, prices, rand);
      const rb = run("b", base.b, prices, rand);
      const frames: VersusFrame[] = prices.map((price, i) => ({
        i,
        priceIndex: round(price, 3),
        a: round(ra.values[i], 3),
        b: round(rb.values[i], 3),
      }));
      const moments: VersusBout["moments"] = [];
      let leader: Side | null = null;
      for (const frame of frames) {
        const ahead: Side | null = Math.abs(frame.a - frame.b) < 2 ? leader : frame.a > frame.b ? "a" : "b";
        if (ahead && leader && ahead !== leader && frame.i > 4 && moments.length < 4) {
          moments.push({ i: frame.i, fighter: ahead, text: pick(rand, LEAD_LINES) });
        }
        leader = ahead;
      }
      for (const side of ["a", "b"] as const) {
        if (!(side === "a" ? ra : rb).trades.length) moments.push({ i: 6 + Math.floor(rand() * 20), fighter: side, text: pick(rand, CALM_LINES) });
      }
      moments.sort((x, y) => x.i - y.i);
      const end = frames[frames.length - 1];
      const aEdgePct = round((end.a / START_CHOG - 1) * 100);
      const bEdgePct = round((end.b / START_CHOG - 1) * 100);
      return {
        ...base,
        frames,
        trades: [...ra.trades, ...rb.trades].sort((x, y) => x.i - y.i),
        moments,
        result: {
          winner: Math.abs(aEdgePct - bEdgePct) < 0.05 ? "draw" : aEdgePct > bEdgePct ? "a" : "b",
          aEdgePct,
          bEdgePct,
          aFeesChog: round(ra.fees),
          bFeesChog: round(rb.fees),
        },
        reveal: reveal(rand, prices, parsed.hour),
      };
    })();
    bouts.set(id, hit);
  }
  return hit;
}

let dealt = 0;

/** GET /api/versus/random */
export function sampleRandom(): Promise<VersusBoutPreview> {
  const a = randomChogId();
  dealt++;
  return preview(a, randomChogId(a), randomHour());
}

/** GET /api/versus/new?a=&b= (either alone: a random rival) */
export function samplePair(a: number | null, b: number | null): Promise<VersusBoutPreview> {
  const valid = (id: number | null) => id === null || (Number.isInteger(id) && id >= 1 && id <= 1969);
  if ((a === null && b === null) || !valid(a) || !valid(b)) {
    return Promise.reject(new VersusApiError("Chog token ids run from 1 to 1969.", 400));
  }
  if (a === b) return Promise.reject(new VersusApiError("A Chog can't race itself: pick two different Chogs.", 400));
  const left = a ?? randomChogId(b!);
  dealt++;
  return preview(left, b ?? randomChogId(left), randomHour());
}

/** GET /api/versus/[id] */
export async function samplePreview(id: string): Promise<VersusBoutPreview> {
  const { id: boutId, a, b, windowLabel, startChog } = await sampleBout(id);
  return { id: boutId, a, b, windowLabel, startChog };
}

const picks = new Map<string, Side>();
let samplePoints = 0;
let sampleCorrect = 0;

/** POST /api/versus/[id]/pick */
export async function samplePick(id: string, side: Side): Promise<VersusPickResponse> {
  const bout = await sampleBout(id);
  const first = picks.get(id);
  if (!first) picks.set(id, side);
  const correct = first ? null : bout.result.winner === side;
  const awarded = correct ? 10 : 0;
  samplePoints += awarded;
  if (correct) sampleCorrect++;
  let fan: FanState = { fanId: "fan_sample", points: 0, streak: 0, history: [] };
  try {
    const res = await fetch("/api/fan", { cache: "no-store" });
    if (res.ok) fan = (await res.json()) as FanState;
  } catch {
    // The sample fan card is enough.
  }
  return {
    bout,
    correct,
    fan: { ...fan, points: fan.points + samplePoints },
    awarded,
    pick: first ?? side,
    record: { picks: picks.size, correct: sampleCorrect, points: samplePoints, pointsToday: samplePoints, dailyCap: 100 },
  };
}

/** GET /api/versus/stats */
export async function sampleStats(): Promise<VersusStats> {
  return { bouts: dealt, picks: picks.size };
}
