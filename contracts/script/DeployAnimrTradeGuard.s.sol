// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AnimrTradeGuard} from "../src/AnimrTradeGuard.sol";

/// @notice Deploys AnimrTradeGuard on Monad mainnet (chain 143). The deployer becomes the admin.
/// @dev Dry run (simulates against live state, sends nothing):
///        OPERATOR_ADDRESS=0x... ADMIN_ADDRESS=0x... forge script script/DeployAnimrTradeGuard.s.sol \
///          --rpc-url monad --sender <deployer>
///      Real deployment adds `--broadcast` plus a signer (e.g. `--account <keystore>` or `--ledger`).
///      Monad charges the gas limit, not gas used, so keep the estimate forge prints.
///
///      OPERATOR_ADDRESS (required): the AI's hot key, the only address that can call trade(). It must not be the
///        deployer: the deployer becomes the admin, and a leaked operator key must not also hold the kill switch.
///      ADMIN_ADDRESS (optional, recommended): a Safe or cold key. The script starts a two-step admin transfer to
///        it; that address then calls acceptAdmin() on the guard.
///
///      Before the demo, also run script/GrowPoolOracle.s.sol (once, at least a day ahead): the pool keeps only 64
///      price observations, which bursts of swaps can push out of the 30-minute TWAP window.
contract DeployAnimrTradeGuard is Script {
    uint256 constant MONAD_CHAIN_ID = 143;

    // Trading venue: Capricorn CL (nad.fun's Uniswap v3 fork) CHOG/WMON 1% pool.
    address constant CHOG = 0x350035555E10d9AfAF1566AaebfCeD5BA6C27777;
    address constant WMON = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;
    address constant SWAP_ROUTER = 0xdac97b6a3951641B177283028A8f428332333071;
    address constant POOL = 0x116e7D070f1888B81E1E0324F56d6746B2D7d8f1;
    uint24 constant FEE = 10_000;

    // Accounts: Chog Genesis TBAs from the ERC-6551 registry v0.3.1 with Tokenbound's AccountProxy, salt 0.
    address constant CHOG_NFT = 0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763;
    address constant ERC6551_REGISTRY = 0x000000006551c19487814612e58FE06813775758;
    address constant TOKENBOUND_ACCOUNT_PROXY = 0x55266d75D1a14E4572138116aF39863Ed6596E7F;

    function run() external returns (AnimrTradeGuard guard) {
        require(block.chainid == MONAD_CHAIN_ID, "not Monad mainnet");
        address operator = vm.envAddress("OPERATOR_ADDRESS");
        address newAdmin = vm.envOr("ADMIN_ADDRESS", address(0));
        require(operator != address(0), "OPERATOR_ADDRESS is zero");
        require(newAdmin != operator, "ADMIN_ADDRESS must not be the operator");

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        require(deployer != operator, "deploy from a key other than the operator: the deployer becomes the admin");
        guard = new AnimrTradeGuard(
            operator, CHOG, WMON, SWAP_ROUTER, POOL, FEE, CHOG_NFT, ERC6551_REGISTRY, TOKENBOUND_ACCOUNT_PROXY
        );
        if (newAdmin != address(0) && newAdmin != deployer) guard.transferAdmin(newAdmin);
        vm.stopBroadcast();

        console2.log("AnimrTradeGuard:", address(guard));
        console2.log("admin:", guard.admin());
        console2.log("pending admin (must call acceptAdmin):", guard.pendingAdmin());
        console2.log("operator:", guard.operator());
    }
}
