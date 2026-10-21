import type {
  BellCall,
  BellCallSort,
  BellCallsResponse,
  BellStandingsResponse,
  BellSummary,
  ChogBellRecord,
  ChogBellResponse,
  FanResponse,
  FanStanding,
  FanState,
} from "@/lib/bell/types";
import { BellApiError } from "./api";
import { BELL_HOUR_UTC, RIDE_WINDOW_HOURS, scheduledDay, shiftDay } from "./format";

// Dev-only sample data in the exact /api/bell + /api/fan shapes (lib/bell/types.ts), so the Bell UI
// works before the Bell API does. api.ts loads this module only outside production and only when a
// Bell route is missing; every Bell view then shows a "sample data" banner. Deterministic per day.

const CHOGS = 1969;
const CLAIMED = [7, 77, 420, 1234];
const TOP_ORACLES = [42, 314, 1969];
const LIVE_DAYS = 3;
const PAST_DAYS = 10;
const PAGE = 50;
const HOUR = 3_600_000;
const IMAGES = "ipfs://bafybeihau2egcccbdxymeckmmbrqytbfor5gkt3en6d5fsbueymdbq7g6e";

const BULL = [
  "Bears are out of ammo.",
  "Green candle energy. Up only.",
  "Smelled the bottom. Loading up.",
  "Volume is waking up, and so am I.",
  "Laser eyes locked on the upside.",
  "Higher lows, louder Chogs.",
];
const BEAR = [
  "This pump smells like exit liquidity.",
  "Gravity always wins.",
  "Napping until it dumps.",
  "Too green, too fast. Fading it.",
  "Sellers are lining up at the top.",
  "My tears saw this coming.",
];
const FLAT = ["Crab market. I brought snacks.", "Nothing happens. Again.", "Sideways is a position too."];
const FANS = ["moonchog", "gmonad", "dipbuyer", "chogzilla", "ser_ape", "paperpaws", "nadfan", "bellringer", "rektless"];

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
const round = (v: number, digits = 1) => Math.round(v * 10 ** digits) / 10 ** digits;
const currentDay = () => scheduledDay(Date.now());
const notFound = () => new BellApiError("No Bell rang on that day.", 404);

const SORTS: Record<BellCallSort, (a: BellCall, b: BellCall) => number> = {
  bold: (a, b) => Math.abs(b.forecastPct) - Math.abs(a.forecastPct) || a.tokenId - b.tokenId,
  bull: (a, b) => b.forecastPct - a.forecastPct || a.tokenId - b.tokenId,
  bear: (a, b) => a.forecastPct - b.forecastPct || a.tokenId - b.tokenId,
  tokenId: (a, b) => a.tokenId - b.tokenId,
  points: (a, b) => (b.points ?? -1) - (a.points ?? -1) || a.tokenId - b.tokenId,
};

type SampleDay = { summary: BellSummary; calls: BellCall[] };

/** Like the engine: replay Bells were never open for rides; live ones closed after the window. */
const settledClose = (ring: number, offset: number, window: number) => (offset <= LIVE_DAYS ? ring + window : ring);
const days = new Map<string, SampleDay>();

function sampleDay(day: string): SampleDay {
  const offset = Math.round((Date.parse(currentDay()) - Date.parse(day)) / (24 * HOUR));
  if (!(offset >= 0 && offset <= PAST_DAYS)) throw notFound();
  const cached = days.get(day);
  if (cached) return cached;

  const rand = random(day);
  const settled = offset > 0;
  const actualPct = settled ? round(gaussian(rand) * 4.5) : null;
  const herd = gaussian(rand) * 2.5;
  const calls = Array.from({ length: CHOGS }, (_, i): BellCall => {
    const tokenId = i + 1;
    const metadataId = ((tokenId * 761) % CHOGS) + 1;
    const forecastPct = round(Math.max(-15, Math.min(15, herd + gaussian(rand) * 4)));
    const lines = forecastPct > 0.5 ? BULL : forecastPct < -0.5 ? BEAR : FLAT;
    const claimed = CLAIMED.includes(tokenId);
    const call: BellCall = {
      tokenId,
      name: `CHOG #${metadataId}`,
      image: `${IMAGES}/${metadataId}.webp`,
      forecastPct,
      conviction: round(0.25 + rand() * 0.7, 2),
      thesis: lines[Math.floor(rand() * lines.length)],
      source: claimed ? "llm" : "genome",
      claimed,
    };
    if (actualPct === null) return call;
    const errorPts = round(Math.abs(forecastPct - actualPct));
    const hit = Math.sign(forecastPct) === Math.sign(actualPct);
    return { ...call, errorPts, hit, points: Math.max(0, Math.round(100 - 4 * errorPts)) + (hit ? 20 : 0) };
  });

  const histogram = Array.from({ length: 11 }, (_, i) => ({ bucketPct: -10 + 2 * i, count: 0 }));
  for (const call of calls) histogram[Math.max(0, Math.min(10, Math.floor((call.forecastPct + 10) / 2)))].count++;
  const byError = settled ? [...calls].sort((a, b) => (a.errorPts ?? 0) - (b.errorPts ?? 0)) : [];
  const ring = Date.parse(`${day}T${BELL_HOUR_UTC}:00:00Z`);
  // Keeps today's sample rideable all day, so the ride flow can be tried at any hour.
  const window = RIDE_WINDOW_HOURS * HOUR;
  const ridesClose = offset === 0 ? Math.max(ring + window, Date.now() + 2 * HOUR) : settledClose(ring, offset, window);
  const entryPrice = round(0.0736 * (1 + gaussian(rand) * 0.04), 6);
  const summary: BellSummary = {
    day,
    rungAt: new Date(ring).toISOString(),
    horizonAt: new Date(ring + 24 * HOUR).toISOString(),
    rideWindowClosesAt: new Date(ridesClose).toISOString(),
    status: settled ? "settled" : "open",
    kind: offset <= LIVE_DAYS ? "live" : "replay",
    entryPrice,
    settlePrice: actualPct === null ? null : round(entryPrice * (1 + actualPct / 100), 6),
    actualPct,
    calls: calls.length,
    bullPct: round((calls.filter((c) => c.forecastPct > 0).length / calls.length) * 100),
    bearPct: round((calls.filter((c) => c.forecastPct < 0).length / calls.length) * 100),
    histogram,
    boldest: [...calls].sort(SORTS.bold).slice(0, 6),
    featured: [...CLAIMED, ...TOP_ORACLES].map((id) => calls[id - 1]),
    oracle: byError[0],
    mostRekt: byError[byError.length - 1],
  };
  const result = { summary, calls };
  days.set(day, result);
  return result;
}

export const sampleToday = (): BellSummary => sampleDay(currentDay()).summary;
export const sampleBell = (day: string): BellSummary => sampleDay(day).summary;

export function sampleCalls(day: string, sort: BellCallSort, cursor?: string): BellCallsResponse {
  const start = Number(cursor) || 0;
  const sorted = [...sampleDay(day).calls].sort(SORTS[sort]);
  return { calls: sorted.slice(start, start + PAGE), next: start + PAGE < sorted.length ? String(start + PAGE) : undefined };
}

/** Records over the settled sample days, newest `span` days. */
function records(span: number): ChogBellRecord[] {
  const all = Array.from({ length: CHOGS }, (_, i) => ({
    tokenId: i + 1,
    calls: 0,
    hits: 0,
    oracleWins: 0,
    avgErrorPts: 0,
    totalPoints: 0,
  }));
  for (let offset = 1; offset <= span; offset++) {
    const { summary, calls } = sampleDay(shiftDay(currentDay(), -offset));
    for (const call of calls) {
      const record = all[call.tokenId - 1];
      record.avgErrorPts = (record.avgErrorPts * record.calls + (call.errorPts ?? 0)) / (record.calls + 1);
      record.calls++;
      record.hits += call.hit ? 1 : 0;
      record.totalPoints += call.points ?? 0;
      record.oracleWins += summary.oracle?.tokenId === call.tokenId ? 1 : 0;
    }
  }
  return all.map((r) => ({ ...r, avgErrorPts: round(r.avgErrorPts) }));
}

export function sampleChog(tokenId: number): ChogBellResponse {
  if (!(tokenId >= 1 && tokenId <= CHOGS)) throw new BellApiError("Unknown Chog.", 404);
  return { today: sampleDay(currentDay()).calls[tokenId - 1], record: records(PAST_DAYS)[tokenId - 1] };
}

let fan: FanState | undefined;

function fanState(): FanState {
  fan ??= {
    fanId: "sample-fan-7c1e",
    points: 257,
    streak: 2,
    history: [
      { day: shiftDay(currentDay(), -1), tokenId: 1234, points: 149 },
      { day: shiftDay(currentDay(), -2), tokenId: 77, points: 108 },
    ],
  };
  return fan;
}

function fanBoard(): FanStanding[] {
  const { fanId, nickname, points, streak } = fanState();
  const others = FANS.map((name, i) => ({ fanId: `sample-${i}`, nickname: name, points: 900 - i * 87, streak: (i * 3) % 6 }));
  return [...others, { fanId, nickname, points, streak }]
    .sort((a, b) => b.points - a.points)
    .map((fan, i) => ({ ...fan, rank: i + 1 }));
}

function fanResponse(): FanResponse {
  const board = fanBoard();
  const me = fanState();
  return { ...structuredClone(me), rank: board.findIndex((fan) => fan.fanId === me.fanId) + 1, fans: board.length };
}

export const sampleFan = (): FanResponse => fanResponse();

export function sampleStandings(): BellStandingsResponse {
  const current = sampleDay(currentDay()).calls;
  const chogs = records(PAST_DAYS)
    .sort((a, b) => b.totalPoints - a.totalPoints || a.tokenId - b.tokenId)
    .slice(0, 50)
    .map((record, i) => ({ ...record, name: current[record.tokenId - 1].name, image: current[record.tokenId - 1].image, rank: i + 1 }));
  return { chogs, fans: fanBoard().slice(0, 5) };
}

/** Like the engine: the open Bell inside its ride window, else the next Bell (booked as `next`). */
export function sampleRide(tokenId: number): FanResponse {
  const bell = sampleToday();
  const state = fanState();
  if (Date.now() >= Date.parse(bell.rideWindowClosesAt)) {
    const day = shiftDay(bell.day, 1);
    if (state.next?.day === day) throw new BellApiError("You already ride a Chog at the next Bell.", 409);
    state.next = { day, tokenId };
    state.history = [{ day, tokenId }, ...state.history];
    return fanResponse();
  }
  if (state.ride?.day === bell.day) throw new BellApiError("You already ride a Chog at this Bell.", 409);
  state.ride = { day: bell.day, tokenId };
  state.history = [{ day: bell.day, tokenId }, ...state.history];
  return fanResponse();
}

/** Like the engine: letters, numbers, spaces, _ and -, at most 20 characters; "" clears it. */
export function sampleNickname(nickname: string): FanResponse {
  const name = nickname.replace(/[^\p{L}\p{N} _-]+/gu, "").replace(/\s+/g, " ").trim().slice(0, 20).trim();
  if (nickname.trim() && !name) throw new BellApiError("Use letters, numbers, spaces, _ or - in your nickname.", 400);
  const state = fanState();
  if (name) state.nickname = name;
  else delete state.nickname;
  return fanResponse();
}
