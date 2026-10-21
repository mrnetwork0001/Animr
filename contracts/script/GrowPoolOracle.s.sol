// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

interface IObservablePool {
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );
    function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external;
}

/// @notice One-time, permissionless hardening of the CHOG/WMON pool's price oracle for AnimrTradeGuard.
/// @dev The pool keeps 64 observations and writes at most one per second (on swaps that move the tick). 64 such
///      swaps within 30 minutes, organic or deliberate, push the oldest observation inside the guard's 30-minute
///      TWAP window: observe(1800) then reverts and every trade fails closed with "TWAP unavailable". With 1801
///      slots the ring always spans at least 30 minutes.
///
///      The new slots only take effect once the ring index wraps past the old cardinality (about 20 more
///      tick-moving swaps today), so run this at least a day before it matters. It takes three transactions: one
///      call adding all ~1,740 slots needs ~30.5M gas, over Monad's 30M per-transaction cap. Measured with
///      eth_estimateGas on Monad: ~17.5k gas per slot, ~10.6M per 600-slot step, ~30.7M in total (about 3.1 MON at
///      100 gwei; Monad charges the gas limit, so consider --gas-estimate-multiplier 110).
///
///      Dry run: forge script script/GrowPoolOracle.s.sol --rpc-url monad --sender <address>
///      Real run: add --broadcast and a signer (any funded key; nobody gains any role from this).
contract GrowPoolOracle is Script {
    address constant POOL = 0x116e7D070f1888B81E1E0324F56d6746B2D7d8f1;
    uint16 constant TARGET = 1801; // TWAP_WINDOW (1800 s) + 1
    uint16 constant STEP = 600; // slots per transaction: well under the 30M cap even on Ethereum's gas schedule

    function run() external {
        require(block.chainid == 143, "not Monad mainnet");
        (,,, uint16 cardinality, uint16 next,,) = IObservablePool(POOL).slot0();
        console2.log("observation cardinality now / next:", cardinality, next);

        vm.startBroadcast();
        while (next < TARGET) {
            next = TARGET - next > STEP ? next + STEP : TARGET;
            IObservablePool(POOL).increaseObservationCardinalityNext(next);
            console2.log("observationCardinalityNext ->", next);
        }
        vm.stopBroadcast();
    }
}
