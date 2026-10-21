// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AnimrTrophies} from "../src/AnimrTrophies.sol";

/// @notice Deploys AnimrTrophies on Monad mainnet (chain 143). The deployer becomes the owner.
/// @dev Dry run (simulates against live state, sends nothing):
///        MINTER_ADDRESS=0x2523bBdD941783C4E565180D2a1b18DE86319cC2 \
///        TROPHIES_URI='https://<app-domain>/api/trophies/meta/{id}' \
///        forge script script/DeployTrophies.s.sol --rpc-url monad --sender 0xc742AdA2872a042dD36D2E706907b4036968960C
///      Real deployment adds `--broadcast` plus a signer (e.g. `--account <keystore>` or `--ledger`).
///      Monad charges the gas limit, not gas used, so keep the estimate forge prints.
///
///      MINTER_ADDRESS (required): the app's operator key (OPERATOR_PRIVATE_KEY's address), the only address that can
///        award trophies. It must not be the deployer.
///      TROPHIES_URI (required): ERC-1155 metadata template served by the app, ending in /api/trophies/meta/{id}.
///      OWNER_ADDRESS (optional): starts a two-step ownership transfer to it (it then calls acceptOwnership()).
///      After deploying, set NEXT_PUBLIC_TROPHIES_ADDRESS in the app to the printed address.
contract DeployTrophies is Script {
    uint256 constant MONAD_CHAIN_ID = 143;
    address constant CHOG_NFT = 0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763;
    address constant ERC6551_REGISTRY = 0x000000006551c19487814612e58FE06813775758;
    address constant TOKENBOUND_ACCOUNT_PROXY = 0x55266d75D1a14E4572138116aF39863Ed6596E7F;

    function run() external returns (AnimrTrophies trophies) {
        require(block.chainid == MONAD_CHAIN_ID, "not Monad mainnet");
        address minter = vm.envAddress("MINTER_ADDRESS");
        string memory uri = vm.envString("TROPHIES_URI");
        address newOwner = vm.envOr("OWNER_ADDRESS", address(0));
        require(minter != address(0), "MINTER_ADDRESS is zero");
        require(bytes(uri).length > 0, "TROPHIES_URI is empty");
        require(newOwner != minter, "OWNER_ADDRESS must not be the minter");

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        require(deployer != minter, "deploy from a key other than the minter: the deployer becomes the owner");
        trophies = new AnimrTrophies(minter, uri, CHOG_NFT, ERC6551_REGISTRY, TOKENBOUND_ACCOUNT_PROXY);
        if (newOwner != address(0) && newOwner != deployer) trophies.transferOwnership(newOwner);
        vm.stopBroadcast();

        console2.log("AnimrTrophies:", address(trophies));
        console2.log("owner:", trophies.owner());
        console2.log("pending owner (must call acceptOwnership):", trophies.pendingOwner());
        console2.log("minter:", trophies.minter());
        console2.log("uri:", trophies.uri(1));
    }
}
