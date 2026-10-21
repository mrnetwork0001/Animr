// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {AnimrTrophies} from "../src/AnimrTrophies.sol";

// Fork tests against live Monad mainnet state:
//   forge test --match-contract AnimrTrophies --fork-url https://rpc.monad.xyz -vv
// Real Chog Genesis NFT, ERC-6551 registry v0.3.1 and Tokenbound AccountV3; only AnimrTrophies is deployed fresh.

interface IChogNft {
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
}

interface IRegistry6551 {
    function createAccount(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external returns (address);
}

interface IAccountProxyInit {
    function initialize(address implementation) external;
}

interface ITokenbound {
    function execute(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        payable
        returns (bytes memory);
    function owner() external view returns (address);
}

contract AnimrTrophiesForkTest is Test {
    address constant REGISTRY = 0x000000006551c19487814612e58FE06813775758;
    address constant ACCOUNT_PROXY = 0x55266d75D1a14E4572138116aF39863Ed6596E7F;
    address constant ACCOUNT_IMPL = 0x41C8f39463A868d3A88af00cd0fe7102F30E44eC; // AccountV3Upgradable
    address constant CHOG_NFT = 0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763;
    bytes32 constant ERC1967_IMPL_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    bytes4 constant TB_NOT_AUTHORIZED = 0xea8e4eb5; // Tokenbound NotAuthorized()

    uint256 constant HOUSE_CHOG = 1399;
    uint256 constant OTHER_CHOG = 2;
    string constant URI = "https://animr.example/api/trophies/meta/{id}";

    // Production roles (AGENTS brief): owner wallet and the app's operator key.
    address constant OWNER = 0xc742AdA2872a042dD36D2E706907b4036968960C;
    address constant OPERATOR = 0x2523bBdD941783C4E565180D2a1b18DE86319cC2;

    AnimrTrophies trophies;
    address attacker = makeAddr("attacker");
    address buyer = makeAddr("buyer");

    function setUp() public {
        if (block.chainid != 143) vm.createSelectFork("monad");
        vm.prank(OWNER);
        trophies = new AnimrTrophies(OPERATOR, URI, CHOG_NFT, REGISTRY, ACCOUNT_PROXY);
    }

    // ------------------------------------------------------------------ minting

    function test_AwardToCounterfactualAccount_ThenCreateIt() public {
        address account = trophies.accountOf(OTHER_CHOG);
        assertEq(account.code.length, 0, "test assumes Chog #2's wallet isn't deployed");

        uint256 kind = trophies.BEST_CALL();
        bytes32 key = trophies.awardKey(kind, 20261021);
        vm.expectEmit(true, true, true, true, address(trophies));
        emit AnimrTrophies.TransferSingle(OPERATOR, address(0), account, kind, 1);
        vm.expectEmit(true, true, true, true, address(trophies));
        emit AnimrTrophies.TrophyAwarded(OTHER_CHOG, kind, account, 20261021, key);
        uint256 gasBefore = gasleft();
        vm.prank(OPERATOR);
        address minted = trophies.award(OTHER_CHOG, kind, 20261021);
        console2.log("award gas, counterfactual wallet (forge EVM):", gasBefore - gasleft());

        assertEq(minted, account);
        assertEq(trophies.balanceOf(account, 1), 1);
        assertTrue(trophies.awarded(trophies.awardKey(1, 20261021)));

        // Creating the wallet later changes nothing: the balance is already there and the NFT owner controls it.
        assertEq(_deployAccount(OTHER_CHOG), account);
        assertEq(ITokenbound(account).owner(), IChogNft(CHOG_NFT).ownerOf(OTHER_CHOG));
        assertEq(trophies.balanceOf(account, 1), 1);
    }

    function test_AwardToDeployedAccount() public {
        address account = _deployAccount(HOUSE_CHOG);
        assertGt(account.code.length, 0);

        uint256 kind = trophies.SURVIVED_HEIST();
        uint256 gasBefore = gasleft();
        vm.prank(OPERATOR);
        trophies.award(HOUSE_CHOG, kind, 20261021);
        console2.log("award gas, deployed Tokenbound wallet (forge EVM):", gasBefore - gasleft());

        assertEq(trophies.balanceOf(account, 3), 1);
        address[] memory holders = new address[](2);
        uint256[] memory ids = new uint256[](2);
        (holders[0], ids[0]) = (account, 3);
        (holders[1], ids[1]) = (account, 4);
        uint256[] memory balances = trophies.balanceOfBatch(holders, ids);
        assertEq(balances[0], 1);
        assertEq(balances[1], 0);
    }

    /// A wallet created but never initialized delegates to address(0) and returns nothing: not a safe ERC-1155
    /// recipient. The app's award is skipped (and retried) in that state; the owner initializes it with one tx.
    function test_RevertWhen_AccountCreatedButNotInitialized() public {
        address account =
            IRegistry6551(REGISTRY).createAccount(ACCOUNT_PROXY, bytes32(0), block.chainid, CHOG_NFT, OTHER_CHOG);
        vm.expectRevert(abi.encodeWithSelector(AnimrTrophies.UnsafeRecipient.selector, account));
        vm.prank(OPERATOR);
        trophies.award(OTHER_CHOG, 1, 20261021);
    }

    function test_RevertWhen_ChogDoesNotExist() public {
        vm.startPrank(OPERATOR);
        vm.expectRevert();
        trophies.award(0, 1, 20261021);
        vm.expectRevert();
        trophies.award(1970, 1, 20261021);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ idempotency

    function test_EachAwardKeyMintsOnce() public {
        address account = trophies.accountOf(HOUSE_CHOG);
        vm.startPrank(OPERATOR);
        trophies.award(HOUSE_CHOG, 3, 20261021);

        bytes32 key = trophies.awardKey(3, 20261021);
        vm.expectRevert(abi.encodeWithSelector(AnimrTrophies.AlreadyAwarded.selector, key));
        trophies.award(HOUSE_CHOG, 3, 20261021);
        // The key is (kind, context), not the Chog: a second Chog can't take the same day's trophy either.
        vm.expectRevert(abi.encodeWithSelector(AnimrTrophies.AlreadyAwarded.selector, key));
        trophies.award(OTHER_CHOG, 3, 20261021);

        // Another day, and another kind on the same day, are new awards: counts add up.
        trophies.award(HOUSE_CHOG, 3, 20261022);
        trophies.award(HOUSE_CHOG, 1, 20261021);
        vm.stopPrank();
        assertEq(trophies.balanceOf(account, 3), 2);
        assertEq(trophies.balanceOf(account, 1), 1);

        // Once-per-Chog kinds use the Chog's id as the context.
        vm.startPrank(OPERATOR);
        trophies.award(HOUSE_CHOG, 4, HOUSE_CHOG);
        vm.expectRevert(abi.encodeWithSelector(AnimrTrophies.AlreadyAwarded.selector, trophies.awardKey(4, HOUSE_CHOG)));
        trophies.award(HOUSE_CHOG, 4, HOUSE_CHOG);
        vm.stopPrank();
        assertEq(trophies.balanceOf(account, 4), 1);
    }

    // ------------------------------------------------------------------ soulbound

    function test_TrophiesCannotBeTransferredOrApproved() public {
        address account = _deployAccount(HOUSE_CHOG);
        vm.prank(OPERATOR);
        trophies.award(HOUSE_CHOG, 1, 20261021);
        address nftOwner = IChogNft(CHOG_NFT).ownerOf(HOUSE_CHOG);

        // Not even the NFT owner, acting through the wallet that holds them, can move or approve them.
        vm.startPrank(nftOwner);
        vm.expectRevert(AnimrTrophies.Soulbound.selector);
        ITokenbound(account)
            .execute(
                address(trophies), 0, abi.encodeCall(AnimrTrophies.safeTransferFrom, (account, attacker, 1, 1, "")), 0
            );
        vm.expectRevert(AnimrTrophies.Soulbound.selector);
        ITokenbound(account)
            .execute(address(trophies), 0, abi.encodeCall(AnimrTrophies.setApprovalForAll, (attacker, true)), 0);
        vm.stopPrank();

        uint256[] memory ids = new uint256[](1);
        uint256[] memory values = new uint256[](1);
        (ids[0], values[0]) = (1, 1);
        vm.startPrank(account);
        vm.expectRevert(AnimrTrophies.Soulbound.selector);
        trophies.safeBatchTransferFrom(account, attacker, ids, values, "");
        vm.stopPrank();

        assertFalse(trophies.isApprovedForAll(account, attacker));
        assertEq(trophies.balanceOf(account, 1), 1);
        assertEq(trophies.balanceOf(attacker, 1), 0);
    }

    /// The point of the feature: sell the Chog and its trophies go with it. The buyer controls the wallet that holds
    /// them; the seller no longer does.
    function test_TrophiesFollowTheNft() public {
        address account = _deployAccount(HOUSE_CHOG);
        vm.startPrank(OPERATOR);
        trophies.award(HOUSE_CHOG, 1, 20261021);
        trophies.award(HOUSE_CHOG, 3, 20261021);
        vm.stopPrank();
        address seller = IChogNft(CHOG_NFT).ownerOf(HOUSE_CHOG);
        assertEq(ITokenbound(account).owner(), seller);

        vm.prank(seller);
        IChogNft(CHOG_NFT).transferFrom(seller, buyer, HOUSE_CHOG);

        assertEq(ITokenbound(account).owner(), buyer);
        assertEq(trophies.accountOf(HOUSE_CHOG), account);
        assertEq(trophies.balanceOf(account, 1), 1);
        assertEq(trophies.balanceOf(account, 3), 1);

        // The buyer can act through the wallet; the seller can't.
        vm.deal(account, 1 ether);
        vm.prank(buyer);
        ITokenbound(account).execute(buyer, 0.1 ether, "", 0);
        assertEq(buyer.balance, 0.1 ether);
        vm.prank(seller);
        vm.expectRevert(TB_NOT_AUTHORIZED);
        ITokenbound(account).execute(seller, 0.1 ether, "", 0);

        // New trophies keep landing in the same wallet, now the buyer's.
        vm.prank(OPERATOR);
        trophies.award(HOUSE_CHOG, 1, 20261022);
        assertEq(trophies.balanceOf(account, 1), 2);
    }

    // ------------------------------------------------------------------ roles

    function test_OnlyTheMinterAwards() public {
        address nftOwner = IChogNft(CHOG_NFT).ownerOf(HOUSE_CHOG);
        address[3] memory callers = [OWNER, attacker, nftOwner];
        for (uint256 i; i < callers.length; i++) {
            vm.expectRevert(AnimrTrophies.NotMinter.selector);
            vm.prank(callers[i]);
            trophies.award(HOUSE_CHOG, 1, 20261021);
        }
    }

    function test_OwnerAdmin() public {
        assertEq(trophies.owner(), OWNER);
        assertEq(trophies.minter(), OPERATOR);

        // Only the owner manages; the minter can't.
        address[2] memory notOwners = [OPERATOR, attacker];
        for (uint256 i; i < notOwners.length; i++) {
            vm.startPrank(notOwners[i]);
            vm.expectRevert(AnimrTrophies.NotOwner.selector);
            trophies.setKind(5, true);
            vm.expectRevert(AnimrTrophies.NotOwner.selector);
            trophies.setURI("x");
            vm.expectRevert(AnimrTrophies.NotOwner.selector);
            trophies.setMinter(attacker);
            vm.expectRevert(AnimrTrophies.NotOwner.selector);
            trophies.transferOwnership(attacker);
            vm.stopPrank();
        }

        // Kinds: disabled ones can't be awarded; new ones can be added.
        vm.prank(OWNER);
        trophies.setKind(2, false);
        vm.expectRevert(abi.encodeWithSelector(AnimrTrophies.KindDisabled.selector, 2));
        vm.prank(OPERATOR);
        trophies.award(HOUSE_CHOG, 2, 20261021);
        vm.expectRevert(abi.encodeWithSelector(AnimrTrophies.KindDisabled.selector, 7));
        vm.prank(OPERATOR);
        trophies.award(HOUSE_CHOG, 7, 1);
        vm.prank(OWNER);
        trophies.setKind(7, true);
        assertEq(trophies.maxKind(), 7);
        vm.prank(OPERATOR);
        trophies.award(HOUSE_CHOG, 7, 1);

        // URI refresh.
        vm.expectEmit(true, true, true, true, address(trophies));
        emit AnimrTrophies.URI("https://new/{id}", 1);
        vm.prank(OWNER);
        trophies.setURI("https://new/{id}");
        assertEq(trophies.uri(3), "https://new/{id}");

        // Minter rotation; the owner can never be the minter.
        vm.startPrank(OWNER);
        vm.expectRevert(AnimrTrophies.InvalidMinter.selector);
        trophies.setMinter(OWNER);
        trophies.setMinter(buyer);
        vm.stopPrank();
        vm.expectRevert(AnimrTrophies.NotMinter.selector);
        vm.prank(OPERATOR);
        trophies.award(HOUSE_CHOG, 1, 20261021);
        vm.prank(buyer);
        trophies.award(HOUSE_CHOG, 1, 20261021);
    }

    function test_TwoStepOwnership() public {
        vm.prank(OWNER);
        trophies.transferOwnership(attacker);
        assertEq(trophies.owner(), OWNER);
        vm.expectRevert(AnimrTrophies.NotPendingOwner.selector);
        vm.prank(buyer);
        trophies.acceptOwnership();
        vm.prank(attacker);
        trophies.acceptOwnership();
        assertEq(trophies.owner(), attacker);
        assertEq(trophies.pendingOwner(), address(0));

        // The minter can't become the owner.
        vm.prank(attacker);
        trophies.transferOwnership(OPERATOR);
        vm.expectRevert(AnimrTrophies.InvalidMinter.selector);
        vm.prank(OPERATOR);
        trophies.acceptOwnership();
    }

    function test_RevertWhen_DeployerIsTheMinter() public {
        vm.expectRevert(AnimrTrophies.InvalidMinter.selector);
        vm.prank(OPERATOR);
        new AnimrTrophies(OPERATOR, URI, CHOG_NFT, REGISTRY, ACCOUNT_PROXY);
        vm.expectRevert(AnimrTrophies.InvalidMinter.selector);
        new AnimrTrophies(address(0), URI, CHOG_NFT, REGISTRY, ACCOUNT_PROXY);
    }

    function test_Metadata() public view {
        assertEq(trophies.uri(1), URI);
        assertTrue(trophies.supportsInterface(0x01ffc9a7));
        assertTrue(trophies.supportsInterface(0xd9b67a26));
        assertTrue(trophies.supportsInterface(0x0e89341c));
        assertFalse(trophies.supportsInterface(0x80ac58cd)); // not ERC-721
        assertEq(trophies.accountOf(HOUSE_CHOG), 0xa46aE2364eDa19C7d8fCe7F5878C93E50aB2AD71);
    }

    // ------------------------------------------------------------------ helpers

    /// Creates and initializes the Chog's Tokenbound wallet, like lib/erc6551.ts createAndInitializeAccountRequest.
    function _deployAccount(uint256 tokenId) internal returns (address account) {
        account = IRegistry6551(REGISTRY).createAccount(ACCOUNT_PROXY, bytes32(0), block.chainid, CHOG_NFT, tokenId);
        if (vm.load(account, ERC1967_IMPL_SLOT) == bytes32(0)) IAccountProxyInit(account).initialize(ACCOUNT_IMPL);
        assertEq(account, trophies.accountOf(tokenId));
    }
}
