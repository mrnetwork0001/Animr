// SPDX-License-Identifier: GPL-2.0-or-later
// Trimmed from Uniswap/v3-periphery, branch 0.8: contracts/libraries/OracleLibrary.sol
// https://github.com/Uniswap/v3-periphery/blob/0.8/contracts/libraries/OracleLibrary.sol
// Changes: only the two functions AnimrTradeGuard needs are kept.
//   - meanTick(): the arithmetic-mean-tick part of consult(), taking the two tickCumulatives so the
//     caller can wrap pool.observe() in try/catch. The math and rounding are unchanged.
//   - getQuoteAtTick(): unchanged.
pragma solidity ^0.8.0;

import {FullMath} from "./FullMath.sol";
import {TickMath} from "./TickMath.sol";

/// @title Oracle library
/// @notice Provides functions to integrate with V3 pool oracle
library OracleLibrary {
    /// @notice Arithmetic mean tick between two observations, as computed by OracleLibrary.consult
    /// @param tickCumulativeStart tickCumulative `secondsAgo` seconds ago (pool.observe([secondsAgo, 0])[0])
    /// @param tickCumulativeEnd tickCumulative now (pool.observe([secondsAgo, 0])[1])
    /// @param secondsAgo Length of the averaging window, must be > 0
    /// @return arithmeticMeanTick The arithmetic mean tick from (block.timestamp - secondsAgo) to block.timestamp
    function meanTick(int56 tickCumulativeStart, int56 tickCumulativeEnd, uint32 secondsAgo)
        internal
        pure
        returns (int24 arithmeticMeanTick)
    {
        require(secondsAgo != 0, "BP");

        int56 tickCumulativesDelta = tickCumulativeEnd - tickCumulativeStart;

        arithmeticMeanTick = int24(tickCumulativesDelta / int56(uint56(secondsAgo)));
        // Always round to negative infinity
        if (tickCumulativesDelta < 0 && (tickCumulativesDelta % int56(uint56(secondsAgo)) != 0)) arithmeticMeanTick--;
    }

    /// @notice Given a tick and a token amount, calculates the amount of token received in exchange
    /// @param tick Tick value used to calculate the quote
    /// @param baseAmount Amount of token to be converted
    /// @param baseToken Address of an ERC20 token contract used as the baseAmount denomination
    /// @param quoteToken Address of an ERC20 token contract used as the quoteAmount denomination
    /// @return quoteAmount Amount of quoteToken received for baseAmount of baseToken
    function getQuoteAtTick(int24 tick, uint128 baseAmount, address baseToken, address quoteToken)
        internal
        pure
        returns (uint256 quoteAmount)
    {
        uint160 sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);

        // Calculate quoteAmount with better precision if it doesn't overflow when multiplied by itself
        if (sqrtRatioX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtRatioX96) * sqrtRatioX96;
            quoteAmount = baseToken < quoteToken
                ? FullMath.mulDiv(ratioX192, baseAmount, 1 << 192)
                : FullMath.mulDiv(1 << 192, baseAmount, ratioX192);
        } else {
            uint256 ratioX128 = FullMath.mulDiv(sqrtRatioX96, sqrtRatioX96, 1 << 64);
            quoteAmount = baseToken < quoteToken
                ? FullMath.mulDiv(ratioX128, baseAmount, 1 << 128)
                : FullMath.mulDiv(1 << 128, baseAmount, ratioX128);
        }
    }
}
