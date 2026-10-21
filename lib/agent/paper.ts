import type { MarketSnapshot, Portfolio, Trade } from "./types";

/** Swap fee of the deepest $CHOG pool (CHOG/WMON 1% on Capricorn), charged on every paper fill. */
export const PAPER_FEE_BPS = 100;

const DEFAULT_START_CHOG = 1000;

/** An order the paper venue refuses; its message is safe to show to users. */
export class PaperTradeError extends Error {
  name = "PaperTradeError";
}

/** Demo bankroll for new paper agents whose account holds no $CHOG: ANIMR_PAPER_START_CHOG $CHOG (default 1000) and 0 MON. */
export function paperStartPortfolio(): Portfolio {
  const configured = Number(process.env.ANIMR_PAPER_START_CHOG);
  const chog = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_START_CHOG;
  return { chog: toAmount(chog), quote: "0" };
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
