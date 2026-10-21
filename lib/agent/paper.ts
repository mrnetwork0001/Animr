import type { AgentRecord, MarketSnapshot, Portfolio, Trade } from "./types";

/** Swap fee of the deepest $CHOG pool (CHOG/WMON 1% on Capricorn), charged on every paper fill. */
export const PAPER_FEE_BPS = 100;

/** An order the paper venue refuses; its message is safe to show to users. */
export class PaperTradeError extends Error {
  name = "PaperTradeError";
}

/** What an unfunded paper agent shows and says instead of trading. */
export const UNFUNDED_MESSAGE = "Fund this Chog's wallet to start";

export const EMPTY_PORTFOLIO: Portfolio = { chog: "0", quote: "0" };

/** Holds nothing: no $CHOG and no quote asset. */
export function isEmptyPortfolio(portfolio: Portfolio): boolean {
  return !(Number(portfolio.chog) > 0) && !(Number(portfolio.quote) > 0);
}

/**
 * A paper agent with nothing to trade: its wallet held no $CHOG or WMON when its paper book was due to start. It
 * doesn't trade (nor think on demand or on the hourly tick) until the wallet is funded; every run re-reads the wallet.
 */
export function isUnfunded(agent: Pick<AgentRecord, "mode" | "portfolio" | "bankroll">): boolean {
  return agent.mode === "paper" && (agent.bankroll !== "wallet" || isEmptyPortfolio(agent.portfolio));
}

/**
 * Migration for stored agents. Paper books used to start from an invented 1,000 $CHOG "demo bankroll" when the
 * wallet was empty (bankroll "demo", or no bankroll field on the oldest records). There is no invented money any
 * more: such a book reads as unfunded (empty, value 0, no result vs holding) until its wallet holds real $CHOG or
 * WMON, when its next run restarts the book from those balances. Applied on every read; idempotent.
 */
export function migrateAgent(agent: AgentRecord): AgentRecord {
  if (agent.mode !== "paper" || agent.bankroll === "wallet" || agent.bankroll === "unfunded") return agent;
  return {
    ...agent,
    bankroll: "unfunded",
    portfolio: EMPTY_PORTFOLIO,
    startValueChog: 0,
    lastValueChog: 0,
    pnlPct: 0,
    lastValueUsd: null,
  };
}

/** Decimal string in whole-token units, without exponent notation or float noise. */
export function toAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return value.toFixed(9).replace(/\.?0+$/, "");
}

/** Portfolio value in $CHOG-equivalent units, or null without a MON price. */
export function portfolioValueChog(portfolio: Portfolio, priceQuote: number | null): number | null {
  const chog = Number(portfolio.chog) || 0;
  const quote = Number(portfolio.quote) || 0;
  if (quote === 0) return chog;
  return priceQuote ? chog + quote / priceQuote : null;
}

export type PaperFill = {
  trade: Trade;
  portfolio: Portfolio;
  /** Share of the balance actually sold, in bps (lower than requested when depth forced a smaller fill). */
  filledBps: number;
};

/**
 * Simulates a swap against the snapshot price. Price impact follows a constant-product
 * pool holding half of `liquidityUsd` on each side, and the order is shrunk until the
 * impact fits within `maxSlippageBps`. With unknown depth it assumes the worst fill the
 * agent accepted.
 */
export function simulatePaperTrade(params: {
  side: "buy" | "sell";
  sizeBps: number;
  maxSlippageBps: number;
  portfolio: Portfolio;
  market: MarketSnapshot;
}): PaperFill {
  const { side, portfolio, market } = params;
  const price = market.priceQuote;
  if (!price) throw new PaperTradeError("No MON price for $CHOG, so the paper trade can't be filled");

  const chog = Number(portfolio.chog) || 0;
  const quote = Number(portfolio.quote) || 0;
  const balance = side === "sell" ? chog : quote;
  const maxImpact = Math.min(Math.max(params.maxSlippageBps, 0), 10_000) / 10_000;
  let amountIn = (balance * Math.min(Math.max(params.sizeBps, 0), 10_000)) / 10_000;

  // USD value of 1 unit of the token being sold.
  const unitUsd = market.priceUsd === null ? null : side === "sell" ? market.priceUsd : market.priceUsd / price;
  let impact = maxImpact;
  if (market.liquidityUsd && market.liquidityUsd > 0 && unitUsd) {
    const depthUsd = market.liquidityUsd / 2;
    const notionalUsd = amountIn * unitUsd;
    impact = notionalUsd / (depthUsd + notionalUsd);
    if (impact > maxImpact) {
      // Largest order whose impact equals the limit: N / (D + N) = s  =>  N = s * D / (1 - s).
      amountIn = Math.min(amountIn, (maxImpact * depthUsd) / (1 - maxImpact) / unitUsd);
      impact = maxImpact;
    }
  }
  if (!(amountIn > 1e-9)) throw new PaperTradeError("Trade size is too small to fill");

  const fee = PAPER_FEE_BPS / 10_000;
  const amountOut =
    side === "sell" ? amountIn * price * (1 - impact) * (1 - fee) : (amountIn * (1 - fee)) / (price * (1 + impact));
  // Execution price in MON per $CHOG, fees included.
  const executionPrice = side === "sell" ? amountOut / amountIn : amountIn / amountOut;

  return {
    trade: {
      mode: "paper",
      side,
      amountIn: toAmount(amountIn),
      amountOut: toAmount(amountOut),
      tokenIn: side === "sell" ? "CHOG" : "MON",
      tokenOut: side === "sell" ? "MON" : "CHOG",
      price: Number(executionPrice.toPrecision(8)),
    },
    portfolio:
      side === "sell"
        ? { chog: toAmount(chog - amountIn), quote: toAmount(quote + amountOut) }
        : { chog: toAmount(chog + amountOut), quote: toAmount(quote - amountIn) },
    filledBps: Math.round((amountIn / balance) * 10_000),
  };
}
