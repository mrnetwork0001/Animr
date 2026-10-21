import type { TradingStyle } from "@/lib/agent/types";
import type {
  ChogSnapshot,
  Gene,
  Genome,
  PopulationResponse,
  PopulationRow,
  ReplayMoment,
  ReplayPoint,
  ReplayResult,
  ReplayTrade,
  TraitAlphaRow,
} from "@/lib/dna/types";
import type { GenomeResponse, TraitAlphaResponse } from "./api";
import { CHOG_COUNT, parseWindow, type WindowKey } from "./shared";

// Test fixtures for the /api/dna/* contract: deterministic, shaped exactly like the real responses,
// priced on a downsampled copy of the real CHOG/WMON closes (Sep 5 – Oct 19, 4h steps). The DNA UI
// was built against these before app/api/dna/* existed; no app code imports them. Use them in tests
// or mocks: fixtureFor("/api/dna/7/replay?window=45d").

const T0 = 1788559200;
const STEP = 4 * 3600;
const CLOSES = `732,841,750,736,738,728,829,789,753,883,844,935,868,772,815,874,791,663,673,634,611,632,670,588,612,607,626,645,678,705,654,679,683,588,627,631,645,743,705,694,642,652,638,652,630,636,642,624,618,617,635,645,630,646,667,660,639,606,668,669,663,631,654,673,649,661,617,618,621,684,666,729,712,708,665,644,740,685,682,686,674,677,710,632,626,618,618,642,619,615,592,593,584,653,674,669,703,740,735,670,659,614,626,633,663,682,670,645,697,666,681,687,691,688,677,687,683,696,709,718,699,705,646,658,658,726,705,695,659,665,689,701,696,694,675,678,799,780,846,797,795,810,726,732,730,721,759,771,785,889,712,828,703,815,948,979,872,858,850,796,778,735,758,774,754,757,783,841,845,812,841,863,908,866,825,843,825,802,812,753,794,749,782,726,785,764,796,786,702,754,745,585,607,678,644,617,660,686,724,731,711,691,683,671,669,704,710,692,726,726,740,712,713,825,795,706,687,682,690,682,663,683,659,657,659,660,666,662,679,690,693,723,695,694,686,746,692,710,710,701,704,721,712,749,742,742,730,707,726,728`
  .split(",")
  .map((n) => Number(n) / 10_000);

const IMAGE_CID = "bafybeihau2egcccbdxymeckmmbrqytbfor5gkt3en6d5fsbueymdbq7g6e";
const VERSION = "fx-0c9a51e";

const TRAITS: Record<string, string[]> = {
  Eyes: ["fire laser", "Purple laser", "Side Eye", "Smirk", "Tired", "Dead", "Round Tear", "Heart", "Happy", "Normal Eye"],
  Head: ["Crown", "JEET Cap", "WAGMI Cap", "Dollar Cap", "Beanie", "Bucket", "10k TPS Cap", "Peace hat"],
  Mouth: ["Gold Tooth", "BTC Coin", "Mon coin", "Drooling", "Bubblegum", "Smile", "Worried"],
  Aura: ["Burning Aura", "Fiery Aura", "Cool Aura", "Aqua Aura", "Smoke", "Violet"],
  Accessory: ["Green Candle", "Red Candle", "Knife", "Cigar"],
  Side: ["Left", "Right"],
  Tier: ["Common", "Common", "Common", "Uncommon", "Uncommon", "Rare", "Epic", "Legendary"],
  Background: ["Mint", "Light Purple", "Rosy Pink", "Light Magenta"],
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fixtureChog(id: number): ChogSnapshot {
  const rand = rng(id * 2654435761);
  const metadataId = String(((id * 7919) % CHOG_COUNT) + 1);
  const traits: Record<string, string> = {};
  for (const [type, values] of Object.entries(TRAITS)) {
    if ((type === "Accessory" && rand() > 0.15) || (type === "Aura" && rand() > 0.5)) continue;
    traits[type] = values[Math.floor(rand() * values.length)];
  }
  return { id, metadataId, name: `CHOG #${metadataId}`, image: `ipfs://${IMAGE_CID}/${metadataId}.webp`, traits };
}

type Plan = { momentum: boolean; lookback: number; trigger: number; size: number; style: TradingStyle; archetype: string };

function plan(chog: ChogSnapshot): Plan {
  const eyes = (chog.traits.Eyes ?? "").toLowerCase();
  const momentum = eyes.includes("laser") || eyes.includes("heart") || eyes.includes("happy");
  const fiery = /burning|fiery/i.test(chog.traits.Aura ?? "");
  const royal = /crown|dollar/i.test(chog.traits.Head ?? "");
  const sleepy = /tired|dead/.test(eyes);
  const trigger = sleepy ? 0.12 : fiery ? 0.03 : 0.06;
  const style: TradingStyle = fiery || royal ? "aggressive" : sleepy ? "cautious" : "balanced";
  const archetype = momentum
    ? fiery
      ? "Breakout Chaser"
      : "Trend Rider"
    : sleepy
      ? "Dip Sleeper"
      : eyes.includes("side") || eyes.includes("smirk")
        ? "Contrarian"
        : "Mean Reverter";
  return { momentum, lookback: chog.traits.Side === "Left" ? 6 : 2, trigger, size: royal ? 0.5 : 0.25, style, archetype };
}

function fixtureGenome(chog: ChogSnapshot): Genome {
  const p = plan(chog);
  const t = (type: string) => (chog.traits[type] ? { type, value: chog.traits[type] } : undefined);
  const genes: Gene[] = [
    {
      key: "signal",
      label: "Signal",
      value: p.momentum ? 82 : 24,
      display: p.momentum ? "Momentum chaser" : "Mean reversion",
      trait: t("Eyes"),
      explanation: p.momentum ? "Buys strength and sells weakness." : "Buys dips and sells rips.",
    },
    {
      key: "trigger",
      label: "Trigger",
      value: Math.round(100 - p.trigger * 600),
      display: `${Math.round(p.trigger * 100)}% move`,
      trait: t("Aura"),
      explanation: "How big a move it needs before it acts.",
    },
    {
      key: "size",
      label: "Size",
      value: p.size * 160,
      display: `${Math.round(p.size * 100)}% per trade`,
      trait: t("Head"),
      explanation: "How much of its stack it moves at once.",
    },
    {
      key: "lookback",
      label: "Memory",
      value: p.lookback * 12,
      display: `${p.lookback * 4}h lookback`,
      trait: t("Side"),
      explanation: "How far back it looks to judge a move.",
    },
    {
      key: "exit",
      label: "Exit",
      value: 55,
      display: "Greedy take-profit",
      trait: t("Mouth"),
      explanation: "Takes profit once a trade is up 12%.",
    },
    {
      key: "cooldown",
      label: "Patience",
      value: p.style === "cautious" ? 90 : 40,
      display: p.style === "cautious" ? "Naps 24h" : "Waits 4h",
      trait: t("Tier"),
      explanation: "Rests between trades so fees don't eat it.",
    },
  ];
  return { version: VERSION, archetype: p.archetype, style: p.style, genes, params: { trigger: p.trigger } };
}

const LINES = {
  buy: ["Blood in the streets. Buying.", "Cheap $CHOG, don't mind if I do.", "BREAKOUT! Loading up."],
  sell: ["Too hot. Taking chips off.", "Told you. Out.", "Selling into the pump."],
};

function fixtureReplay(id: number, window: WindowKey): ReplayResult {
  const chog = fixtureChog(id);
  const p = plan(chog);
  const start = window === "30d" ? CLOSES.length - 180 : 0;
  const closes = CLOSES.slice(start);
  let chogBal = 10_000;
  let mon = 0;
  let fees = 0;
  let peak = 10_000;
  let maxDd = 0;
  let cooldown = 0;
  const points: ReplayPoint[] = [];
  const trades: ReplayTrade[] = [];
  closes.forEach((price, i) => {
    const t = T0 + (start + i) * STEP;
    const past = closes[Math.max(0, i - p.lookback)];
    const move = price / past - 1;
    cooldown--;
    if (i > 0 && cooldown <= 0 && Math.abs(move) > p.trigger) {
      const wantsBuy = p.momentum ? move > 0 : move < 0;
      const rand = rng(id + i)();
      if (wantsBuy && mon > 0) {
        const amountIn = mon * Math.max(p.size * 2, 0.5);
        const fee = (amountIn / price) * 0.012;
        mon -= amountIn;
        chogBal += amountIn / price - fee;
        fees += fee;
        trades.push({ t, side: "buy", price: price * 1.012, amountIn, amountOut: amountIn / price - fee, reason: LINES.buy[Math.floor(rand * 3)] });
        cooldown = 3;
      } else if (!wantsBuy && chogBal > 0) {
        const amountIn = chogBal * p.size;
        fees += amountIn * 0.012;
        chogBal -= amountIn;
        mon += amountIn * price * 0.988;
        trades.push({ t, side: "sell", price: price * 0.988, amountIn, amountOut: amountIn * price * 0.988, reason: LINES.sell[Math.floor(rand * 3)] });
        cooldown = 3;
      }
    }
    const value = chogBal + mon / price;
    peak = Math.max(peak, value);
    maxDd = Math.min(maxDd, (value / peak - 1) * 100);
    points.push({ t, price, value });
  });
  const endValueChog = points[points.length - 1].value;
  const edgePct = (endValueChog / 10_000 - 1) * 100;
  const moments: ReplayMoment[] = trades
    .filter((_, i) => i % Math.max(1, Math.ceil(trades.length / 5)) === 0)
    .map((trade) => ({ t: trade.t, text: trade.reason }));
  const verdict =
    edgePct <= -25
      ? `REKT ${Math.round(edgePct)}%`
      : edgePct < 0
        ? `Bled ${Math.round(edgePct)}% vs holding`
        : trades.length < 6
          ? `Napped to +${Math.round(edgePct)}% vs holding`
          : `Outtraded holding by +${Math.round(edgePct)}%`;
  return {
    tokenId: id,
    genomeVersion: VERSION,
    window: { from: points[0].t, to: points[points.length - 1].t, candles: closes.length * 4, label: `${window === "30d" ? "Sep 19" : "Sep 5"} – Oct 19 (hourly, real CHOG/WMON)` },
    startChog: 10_000,
    endValueChog,
    edgePct,
    maxDrawdownPct: maxDd,
    feesPaidChog: fees,
    trades,
    points,
    moments,
    verdict,
  };
}

const populationCache = new Map<WindowKey, PopulationResponse>();

function fixturePopulation(window: WindowKey): PopulationResponse {
  const cached = populationCache.get(window);
  if (cached) return cached;
  const rows: PopulationRow[] = [];
  for (let id = 1; id <= CHOG_COUNT; id++) {
    const chog = fixtureChog(id);
    const replay = fixtureReplay(id, window);
    const p = plan(chog);
    rows.push({
      tokenId: id,
      name: chog.name,
      image: chog.image,
      archetype: p.archetype,
      style: p.style,
      edgePct: replay.edgePct,
      trades: replay.trades.length,
      rank: 0,
      claimed: id % 397 === 7,
    });
  }
  rows.sort((a, b) => b.edgePct - a.edgePct || a.tokenId - b.tokenId);
  rows.forEach((row, i) => (row.rank = i + 1));
  const edges = rows.map((r) => r.edgePct);
  const replay = fixtureReplay(1, window);
  const response: PopulationResponse = {
    genomeVersion: VERSION,
    window: replay.window,
    computedAt: "2026-10-19T14:00:00.000Z",
    rows,
    stats: {
      beatHoldPct: (edges.filter((e) => e > 0).length / edges.length) * 100,
      medianEdgePct: edges[Math.floor(edges.length / 2)],
      bestEdgePct: edges[0],
      worstEdgePct: edges[edges.length - 1],
    },
  };
  populationCache.set(window, response);
  return response;
}

function fixtureTraits(window: WindowKey): TraitAlphaResponse {
  const population = fixturePopulation(window);
  const groups = new Map<string, number[]>();
  for (const row of population.rows) {
    for (const [type, value] of Object.entries(fixtureChog(row.tokenId).traits)) {
      const key = `${type}\u0000${value}`;
      groups.set(key, [...(groups.get(key) ?? []), row.edgePct]);
    }
  }
  const rows: TraitAlphaRow[] = [...groups].map(([key, edges]) => {
    const [traitType, value] = key.split("\u0000");
    const sorted = edges.sort((a, b) => a - b);
    return {
      traitType,
      value,
      count: edges.length,
      medianEdgePct: sorted[Math.floor(sorted.length / 2)],
      beatHoldPct: (edges.filter((e) => e > 0).length / edges.length) * 100,
    };
  });
  return { genomeVersion: VERSION, window: population.window, rows };
}

/** The fixture for a /api/dna/* URL, or undefined. */
export function fixtureFor(url: string): unknown {
  const { pathname, searchParams } = new URL(url, "http://fixture.local");
  const window = parseWindow(searchParams.get("window"));
  if (pathname === "/api/dna/population") return fixturePopulation(window);
  if (pathname === "/api/dna/traits") return fixtureTraits(window);
  const match = /^\/api\/dna\/(\d+)(\/replay)?$/.exec(pathname);
  const id = match ? Number(match[1]) : 0;
  if (id < 1 || id > CHOG_COUNT) return undefined;
  if (match?.[2]) return fixtureReplay(id, window);
  const chog = fixtureChog(id);
  return { chog, genome: fixtureGenome(chog) } satisfies GenomeResponse;
}
