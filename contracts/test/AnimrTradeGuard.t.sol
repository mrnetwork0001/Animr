// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm, console2} from "forge-std/Test.sol";
import {AnimrTradeGuard} from "../src/AnimrTradeGuard.sol";
import {OracleLibrary} from "../src/lib/OracleLibrary.sol";
import {TickMath} from "../src/lib/TickMath.sol";

// Fork tests against live Monad mainnet state:
//   forge test --fork-url https://rpc.monad.xyz
// Everything is real (Chog Genesis, $CHOG, WMON, the ERC-6551 registry, Tokenbound v0.3.1, the Capricorn CL
// pool and router) except the guard, which is deployed fresh on the fork.

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IWMON is IERC20 {
    function deposit() external payable;
}

interface IERC721 {
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
}

interface IRegistry {
    function createAccount(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external returns (address);
    function account(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId)
        external
        view
        returns (address);
}

interface IAccountProxy {
    function initialize(address implementation) external;
}

interface ITBA {
    function execute(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        payable
        returns (bytes memory);
    function setPermissions(address[] calldata callers, bool[] calldata permissions) external;
    function permissions(address owner, address caller) external view returns (bool);
    function owner() external view returns (address);
    function lock(uint256 lockedUntil) external;
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4);
    function isValidSigner(address signer, bytes calldata context) external view returns (bytes4);
}

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256);
}

interface IQuoterV2 {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
        external
        returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate);
}

interface IPool {
    function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool);
    function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory, uint160[] memory);
    function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external;
}

/// @dev Claims to be the TBA of Chog #1 and to be owned by whoever deployed it.
contract FakeChogAccount {
    address public immutable owner;
    address public immutable nft;

    constructor(address nft_) {
        owner = msg.sender;
        nft = nft_;
    }

    function token() external view returns (uint256, address, uint256) {
        return (block.chainid, nft, 1);
    }
}

/// @dev Bare-bones ERC-721 that can own a Tokenbound account (for nested-ownership tests).
contract MockParentNft {
    mapping(uint256 => address) public ownerOf;

    function mint(address to, uint256 id) external {
        ownerOf[id] = to;
    }
}

/// @dev A router the guard is not supposed to trust: it can pull less than amountIn or pay less than
///      amountOutMinimum. Paid from its own WMON balance.
contract LyingRouter {
    address public immutable factory;
    uint256 public pullShortBy;
    uint256 public payShortBy;

    constructor(address factory_) {
        factory = factory_;
    }

    function setShortfalls(uint256 pullShortBy_, uint256 payShortBy_) external {
        (pullShortBy, payShortBy) = (pullShortBy_, payShortBy_);
    }

    function exactInputSingle(ISwapRouter.ExactInputSingleParams calldata p) external payable returns (uint256 out) {
        IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn - pullShortBy);
        out = p.amountOutMinimum - payShortBy;
        IERC20(p.tokenOut).transfer(p.recipient, out);
    }
}

contract AnimrTradeGuardForkTest is Test {
    // Monad mainnet (chain 143)
    address constant REGISTRY = 0x000000006551c19487814612e58FE06813775758;
    address constant ACCOUNT_PROXY = 0x55266d75D1a14E4572138116aF39863Ed6596E7F;
    address constant ACCOUNT_IMPL = 0x41C8f39463A868d3A88af00cd0fe7102F30E44eC; // AccountV3Upgradable
    address constant CHOG_NFT = 0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763;
    address constant CHOG = 0x350035555E10d9AfAF1566AaebfCeD5BA6C27777;
    address constant WMON = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;
    address constant POOL = 0x116e7D070f1888B81E1E0324F56d6746B2D7d8f1;
    address constant ROUTER = 0xdac97b6a3951641B177283028A8f428332333071;
    address constant FACTORY = 0x6B5F564339DbAD6b780249827f2198a841FEB7F3;
    address constant QUOTER = 0xB430EDD2b54cdB3B25703fb3342ca3a88663A04D;
    uint24 constant FEE = 10_000;
    uint256 constant TOKEN_ID = 1;

    bytes32 constant ERC1967_IMPL_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    bytes4 constant TB_NOT_AUTHORIZED = 0xea8e4eb5; // Tokenbound NotAuthorized()
    bytes4 constant TB_ACCOUNT_LOCKED = 0x6315bfbb; // Tokenbound AccountLocked()
    bytes32 constant TRANSFER_EVENT = keccak256("Transfer(address,address,uint256)");
    bytes32 constant APPROVAL_EVENT = keccak256("Approval(address,address,uint256)");

    uint256 constant START_CHOG = 100_000e18;

    AnimrTradeGuard guard;
    address tba;
    address nftOwner;
    address admin = makeAddr("admin");
    address operator = makeAddr("operator");
    address attacker = makeAddr("attacker");
    address buyer = makeAddr("buyer");
    uint256[2] routerBalancesAtStart;

    function setUp() public {
        if (block.chainid != 143) vm.createSelectFork("monad");
        // No swaps happen on the fork unless a test makes them, so after 31 minutes the 30-minute TWAP equals the
        // current spot price. Real trading just before the fork block cannot make the tests flaky.
        vm.warp(block.timestamp + 31 minutes);

        nftOwner = IERC721(CHOG_NFT).ownerOf(TOKEN_ID);
        vm.prank(admin);
        guard = new AnimrTradeGuard(operator, CHOG, WMON, ROUTER, POOL, FEE, CHOG_NFT, REGISTRY, ACCOUNT_PROXY);

        tba = _deployTba(TOKEN_ID, bytes32(0));
        deal(CHOG, tba, START_CHOG);
        routerBalancesAtStart = [IERC20(CHOG).balanceOf(ROUTER), IERC20(WMON).balanceOf(ROUTER)];

        // The owner's two steps: grant the guard on the TBA (Tokenbound), then set limits on the guard.
        vm.startPrank(nftOwner);
        _setPermission(tba, address(guard), true);
        guard.configure(tba, _limits(1_000, 3_000, 10 minutes, 200)); // 10%/trade, 30%/day, 10 min, 2%
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ happy path

    function test_HappyPath_SellChogThenBuyBack() public {
        assertEq(ITBA(tba).owner(), nftOwner);
        assertEq(guard.maxAmountIn(tba, true), 10_000e18);

        // Sell 10% of the CHOG. The guard's result must match the pool's own quote exactly.
        uint256 sellAmount = 10_000e18;
        (bool ok, string memory reason) = guard.canTrade(tba, true, sellAmount);
        assertTrue(ok, reason);
        uint256 expectedWmon = _quote(CHOG, WMON, sellAmount);
        assertGt(expectedWmon, guard.quoteFloor(tba, true, sellAmount));

        vm.expectEmit(true, true, true, true, address(guard));
        emit AnimrTradeGuard.Traded(tba, nftOwner, true, sellAmount, expectedWmon);
        uint256 wmonOut = _trade(true, sellAmount);

        assertEq(wmonOut, expectedWmon);
        assertEq(IERC20(CHOG).balanceOf(tba), START_CHOG - sellAmount);
        assertEq(IERC20(WMON).balanceOf(tba), wmonOut);
        _assertNothingLeftBehind();
        console2.log("sold 10,000 CHOG for WMON (1e18):", wmonOut);

        // Buy CHOG back with as much WMON as the limits allow (10% of the WMON balance), after the min interval.
        vm.warp(block.timestamp + 10 minutes);
        uint256 buyAmount = guard.maxAmountIn(tba, false);
        assertEq(buyAmount, wmonOut / 10);
        uint256 expectedChog = _quote(WMON, CHOG, buyAmount);
        uint256 chogOut = _trade(false, buyAmount);

        assertEq(chogOut, expectedChog);
        assertEq(IERC20(CHOG).balanceOf(tba), START_CHOG - sellAmount + chogOut);
        assertEq(IERC20(WMON).balanceOf(tba), wmonOut - buyAmount);
        _assertNothingLeftBehind();
        console2.log("bought back CHOG (1e18):", chogOut);
    }

    // ------------------------------------------------------------------ access

    function test_RevertWhen_CallerIsNotTheOperator() public {
        address[4] memory callers = [nftOwner, admin, attacker, tba];
        for (uint256 i; i < callers.length; i++) {
            vm.expectRevert(AnimrTradeGuard.NotOperator.selector);
            vm.prank(callers[i]);
            guard.trade(tba, true, 1_000e18, 0, block.timestamp);
        }
        // The operator key itself has no rights on the TBA: only the guard was granted.
        vm.expectRevert(TB_NOT_AUTHORIZED);
        vm.prank(operator);
        ITBA(tba).execute(CHOG, 0, abi.encodeCall(IERC20.transfer, (operator, 1)), 0);
    }

    // ------------------------------------------------------------------ size and pacing limits

    function test_PerTradeCap() public {
        uint256 cap = START_CHOG * 1_000 / 10_000;
        assertEq(guard.maxAmountIn(tba, true), cap);

        (bool ok, string memory reason) = guard.canTrade(tba, true, cap + 1);
        assertFalse(ok);
        assertEq(reason, "exceeds per-trade cap");
        _expectRejected("exceeds per-trade cap");
        vm.prank(operator);
        guard.trade(tba, true, cap + 1, 0, block.timestamp);

        // The TBA holds no WMON yet, so it cannot buy anything.
        (ok, reason) = guard.canTrade(tba, false, 1);
        assertEq(reason, "no balance");
        _expectRejected("no balance");
        vm.prank(operator);
        guard.trade(tba, false, 1, 0, block.timestamp);

        _trade(true, cap); // exactly the cap is fine
        assertEq(IERC20(CHOG).balanceOf(tba), START_CHOG - cap);
    }

    /// The daily budget is one budget for both directions, in WMON at the TWAP: selling CHOG and buying it straight
    /// back draws on it twice, so a leaked operator key can only churn one budget's worth of value per 24h.
    function test_DailyBudgetIsSharedByBuysAndSells() public {
        vm.prank(nftOwner);
        guard.configure(tba, _limits(5_000, 2_500, 0, 200)); // 50% per trade, 25% of the vault's value per 24h

        // The vault holds only CHOG, so the budget is worth 25k CHOG at the TWAP; one sale can use all of it.
        uint256 capacity = _capacity(2_500);
        uint256 sell = guard.maxAmountIn(tba, true);
        assertEq(sell, _wmonToChog(capacity));
        assertApproxEqRel(sell, 25_000e18, 1e6);
        uint256 wmonOut = _trade(true, sell);

        AnimrTradeGuard.Vault memory v = guard.vaultOf(tba, nftOwner);
        assertEq(v.budgetUsed, _chogToWmon(sell));
        assertEq(v.budgetUpdatedAt, block.timestamp);

        // Used up in both directions: the WMON just received cannot buy the CHOG back.
        assertEq(guard.maxAmountIn(tba, true), 0);
        assertEq(guard.maxAmountIn(tba, false), 0);
        (bool ok, string memory reason) = guard.canTrade(tba, false, wmonOut / 100);
        assertFalse(ok);
        assertEq(reason, "exceeds daily cap");
        _expectRejected("exceeds daily cap");
        vm.prank(operator);
        guard.trade(tba, false, wmonOut / 100, 0, block.timestamp);

        // The budget frees up linearly over 24h: after 6 hours a quarter of it is back.
        vm.warp(block.timestamp + 6 hours);
        uint256 quarter = _capacity(2_500) / 4;
        assertApproxEqAbs(guard.maxAmountIn(tba, false), quarter, 1);
        _trade(false, quarter);
        assertEq(guard.maxAmountIn(tba, false), 0);

        // 24h after the last trade, the whole capacity is available again.
        vm.warp(block.timestamp + 1 days);
        assertEq(guard.maxAmountIn(tba, true), _wmonToChog(_capacity(2_500)));
    }

    /// A token bucket, not a fixed window: spending the budget just before 24h are up does not unlock a second full
    /// budget a second later.
    function test_DailyBudgetHasNoBurstAtTheWindowEdge() public {
        vm.prank(nftOwner);
        guard.configure(tba, _limits(5_000, 2_000, 0, 200)); // 50% per trade, 20% of the vault's value per 24h
        uint256 t0 = block.timestamp;
        _trade(true, guard.maxAmountIn(tba, true)); // the whole budget at once
        assertEq(guard.maxAmountIn(tba, true), 0);

        // Almost 24h later almost all of it has freed up: spend it.
        vm.warp(t0 + 1 days - 1);
        _trade(true, guard.maxAmountIn(tba, true));

        // One second later only 1/86400 of the capacity is available, in either direction.
        vm.warp(t0 + 1 days);
        uint256 capacity = _capacity(2_000);
        assertLe(guard.maxAmountIn(tba, false), capacity / 1 days + 1);
        assertLe(guard.maxAmountIn(tba, true), _wmonToChog(capacity / 1 days + 1));
        (bool ok, string memory reason) = guard.canTrade(tba, true, 1e18);
        assertFalse(ok);
        assertEq(reason, "exceeds daily cap");
    }

    function test_MinInterval() public {
        _trade(true, 1_000e18);
        uint256 t0 = block.timestamp;

        (bool ok, string memory reason) = guard.canTrade(tba, true, 1_000e18);
        assertFalse(ok);
        assertEq(reason, "min interval not elapsed");
        _expectRejected("min interval not elapsed");
        vm.prank(operator);
        guard.trade(tba, true, 1_000e18, 0, block.timestamp);

        // The interval applies across both directions.
        _expectRejected("min interval not elapsed");
        vm.prank(operator);
        guard.trade(tba, false, 1e18, 0, block.timestamp);

        vm.warp(t0 + 10 minutes - 1);
        _expectRejected("min interval not elapsed");
        vm.prank(operator);
        guard.trade(tba, true, 1_000e18, 0, block.timestamp);

        vm.warp(t0 + 10 minutes);
        _trade(true, 1_000e18);
        assertEq(guard.vaultOf(tba, nftOwner).lastTradeAt, t0 + 10 minutes);
    }

    function test_RevertWhen_DeadlinePassed() public {
        vm.warp(block.timestamp + 1);
        _expectRejected("deadline passed");
        vm.prank(operator);
        guard.trade(tba, true, 1_000e18, 0, block.timestamp - 1);
        // The deadline is handed to the router as well.
        uint256 deadline = block.timestamp + 2 minutes;
        uint256 floor = guard.quoteFloor(tba, true, 1_000e18);
        ISwapRouter.ExactInputSingleParams memory params = _swapParams(true, 1_000e18, floor);
        params.deadline = deadline;
        vm.expectCall(ROUTER, abi.encodeCall(ISwapRouter.exactInputSingle, (params)));
        vm.prank(operator);
        guard.trade(tba, true, 1_000e18, 0, deadline);
    }

    // ------------------------------------------------------------------ price protection

    function test_FloorReplacesALowOperatorMinimum() public {
        uint256 amount = 10_000e18;
        uint256 floor = guard.quoteFloor(tba, true, amount);

        // The floor is the TWAP quote minus the 1% pool fee minus the owner's 2%. With the TWAP equal to the spot
        // price, that is ~98% of what the pool actually pays (the pool's quote also includes ~0.03% price impact).
        uint256 poolQuote = _quote(CHOG, WMON, amount);
        assertApproxEqRel(floor, poolQuote * 98 / 100, 0.001e18);

        // The operator asks for 1 wei; the router is still told to require the floor.
        vm.expectCall(ROUTER, abi.encodeCall(ISwapRouter.exactInputSingle, (_swapParams(true, amount, floor))));
        vm.prank(operator);
        uint256 out = guard.trade(tba, true, amount, 1, block.timestamp);
        assertGe(out, floor);
    }

    function test_OperatorMinimumAboveTheFloorIsKept() public {
        uint256 amount = 10_000e18;
        uint256 poolQuote = _quote(CHOG, WMON, amount);
        assertGt(poolQuote, guard.quoteFloor(tba, true, amount));

        // One wei more than the pool can pay: the router refuses.
        vm.expectRevert(bytes("Too little received"));
        vm.prank(operator);
        guard.trade(tba, true, amount, poolQuote + 1, block.timestamp);

        // Exactly what the pool pays: goes through with the operator's (higher) minimum.
        vm.expectCall(ROUTER, abi.encodeCall(ISwapRouter.exactInputSingle, (_swapParams(true, amount, poolQuote))));
        vm.prank(operator);
        assertEq(guard.trade(tba, true, amount, poolQuote, block.timestamp), poolQuote);
    }

    function test_FloorBindsWhenPriceImpactExceedsTheSlippageBound() public {
        deal(CHOG, tba, 1_000_000e18);
        vm.prank(nftOwner);
        guard.configure(tba, _limits(5_000, 10_000, 0, 10)); // owner tolerates only 0.1%

        // 200k CHOG moves this pool by well over 0.1%, so even with minAmountOut = 0 the swap cannot fill.
        uint256 big = 200_000e18;
        assertLt(_quote(CHOG, WMON, big), guard.quoteFloor(tba, true, big));
        (bool ok,) = guard.canTrade(tba, true, big);
        assertTrue(ok); // the guard's checks pass; the floor is enforced by the router
        vm.expectRevert(bytes("Too little received"));
        vm.prank(operator);
        guard.trade(tba, true, big, 0, block.timestamp);
        assertEq(IERC20(CHOG).balanceOf(tba), 1_000_000e18);

        // A small trade with negligible impact still fills above the floor.
        uint256 small = 1_000e18;
        uint256 floor = guard.quoteFloor(tba, true, small);
        assertGe(_trade(true, small), floor);
    }

    function test_RevertWhen_SpotWasPushedDown() public {
        // Attacker dumps 2M CHOG right before the AI's trade: spot drops far below the 30-minute TWAP.
        int24 twapBefore = _twapTick();
        _attackerSwap(true, 2_000_000e18);
        assertEq(_twapTick(), twapBefore, "same-block manipulation does not move the TWAP");
        assertGt(int256(twapBefore) - int256(_spotTick()), 200);

        (bool ok, string memory reason) = guard.canTrade(tba, true, 10_000e18);
        assertFalse(ok);
        assertEq(reason, "spot price deviates from TWAP");
        _expectRejected("spot price deviates from TWAP");
        vm.prank(operator);
        guard.trade(tba, true, 10_000e18, 0, block.timestamp);
        assertEq(IERC20(CHOG).balanceOf(tba), START_CHOG);

        // Buying is not refused: CHOG is cheaper than the TWAP says, which favours the vault.
        _fundTbaWithWmon(1_000e18);
        uint256 buy = 100e18;
        (ok, reason) = guard.canTrade(tba, false, buy);
        assertTrue(ok, reason);
        assertGt(_trade(false, buy), OracleLibrary.getQuoteAtTick(twapBefore, uint128(buy), WMON, CHOG));

        // If the new price holds for a full TWAP window, the TWAP catches up and selling resumes.
        vm.warp(block.timestamp + 31 minutes);
        (ok, reason) = guard.canTrade(tba, true, 10_000e18);
        assertTrue(ok, reason);
    }

    function test_SpotPushedUp_BuysRefusedSellsAllowed() public {
        _fundTbaWithWmon(10_000e18);
        int24 twap = _twapTick();
        // Attacker buys CHOG with 200k WMON: spot jumps far above the TWAP, so buys are refused.
        _attackerSwap(false, 200_000e18);
        assertGt(int256(_spotTick()) - int256(twap), 200);

        _expectRejected("spot price deviates from TWAP");
        vm.prank(operator);
        guard.trade(tba, false, 100e18, 0, block.timestamp);

        // Selling CHOG into the pump favours the vault: allowed, and it fills above the TWAP price.
        uint256 amount = 1_000e18;
        assertGt(_trade(true, amount), OracleLibrary.getQuoteAtTick(twap, uint128(amount), CHOG, WMON));
    }

    function test_FrontRunInsideTheBoundCannotFillBelowTheFloor() public {
        deal(CHOG, tba, 1_000_000e18);
        uint256 big = 100_000e18; // the per-trade cap (10% of 1M)
        uint256 small = 100e18;
        uint256 floorBig = guard.quoteFloor(tba, true, big);
        uint256 floorSmall = guard.quoteFloor(tba, true, small);

        // The attacker moves the price down ~1.99%, just inside the owner's 2% (200 tick) deviation bound.
        int24 twap = _twapTick();
        _pushSpotTo(twap - 199);
        (bool ok, string memory reason) = guard.canTrade(tba, true, big);
        assertTrue(ok, reason);

        // Selling 100k into the depressed pool would fill below the floor: refused although the operator passed 0.
        assertLt(_quote(CHOG, WMON, big), floorBig);
        vm.expectRevert(bytes("Too little received"));
        vm.prank(operator);
        guard.trade(tba, true, big, 0, block.timestamp);

        // A trade that still clears the floor fills: the most a front-runner can take is maxSlippageBps.
        assertGe(_trade(true, small), floorSmall);
    }

    /// After the market moves in the vault's favour, the floor follows the last minute's price, not the stale
    /// 30-minute TWAP: a sandwich cannot take the move plus the slippage bound.
    function test_FloorFollowsTheLastMinuteWhenItFavoursTheVault() public {
        uint256 amount = 10_000e18;
        int24 twap = _twapTick();

        // The market rises ~1.9% and holds for a minute.
        _pushSpotTo(twap + 190);
        vm.warp(block.timestamp + 1 minutes);
        uint256 marketQuote = _quote(CHOG, WMON, amount);
        uint256 floor = guard.quoteFloor(tba, true, amount);
        assertApproxEqRel(floor, marketQuote * 98 / 100, 0.002e18); // fee + 2% below the market
        uint256 twapFloor = OracleLibrary.getQuoteAtTick(_twapTick(), uint128(amount), CHOG, WMON) * 99 * 98 / 1e4;
        assertGt(floor, twapFloor * 1_015 / 1_000);

        // A sandwicher front-runs the sale by pushing spot 1.9% below the 30-minute TWAP: refused.
        _pushSpotTo(twap - 190);
        (bool ok, string memory reason) = guard.canTrade(tba, true, amount);
        assertFalse(ok);
        assertEq(reason, "spot price deviates from TWAP");
        _expectRejected("spot price deviates from TWAP");
        vm.prank(operator);
        guard.trade(tba, true, amount, 0, block.timestamp);

        // A smaller push, inside the bound, still has to clear the floor: the vault loses at most the bound.
        _pushSpotTo(twap + 190 - 150);
        uint256 out = _trade(true, amount);
        assertGe(out, floor);
        assertGe(out, marketQuote * 9_800 / 10_000);
    }

    /// A move the TWAPs have not seen yet (same block) is the operator's to protect: a minimum from a fresh
    /// QuoterV2 quote stops the same sandwich.
    function test_OperatorMinimumFromAFreshQuoteStopsASandwich() public {
        uint256 amount = 10_000e18;
        int24 twap = _twapTick();
        _pushSpotTo(twap + 190);
        uint256 minOut = _quote(CHOG, WMON, amount) * 9_900 / 10_000; // 1% off a fresh quote
        _pushSpotTo(twap - 190);
        vm.expectRevert(bytes("Too little received"));
        vm.prank(operator);
        guard.trade(tba, true, amount, minOut, block.timestamp);
    }

    // ------------------------------------------------------------------ oracle availability

    /// The pool's oracle keeps few observations. Enough tick-moving swaps push the oldest one inside the 30-minute
    /// window; then nothing can be priced and every path fails closed until the window clears.
    function test_TwapUnavailableFailsClosed() public {
        (,,, uint16 cardinality, uint16 cardinalityNext,,) = IPool(POOL).slot0();
        vm.skip(cardinality > 256, "the pool's oracle has already been grown");
        if (cardinalityNext > cardinality) {
            // Mainnet's ring growth is pending since 2026-10-19 (script/GrowPoolOracle.s.sol), so a burst would just
            // expand it. Undo the pending growth on the fork (Uniswap v3 slot0: cardinalityNext is bits 216-231) to
            // test the fail-closed path of an ungrown pool; the next test covers the grown one.
            uint256 slot0Word = uint256(vm.load(POOL, bytes32(0)));
            uint256 nextMask = uint256(type(uint16).max) << 216;
            vm.store(POOL, bytes32(0), bytes32((slot0Word & ~nextMask) | (uint256(cardinality) << 216)));
            (,,,, uint16 nextAfter,,) = IPool(POOL).slot0();
            assertEq(nextAfter, cardinality);
        }
        uint256 firstWrite = block.timestamp + 1;
        _writeObservations(cardinality);

        (bool ok, string memory reason) = guard.canTrade(tba, true, 1_000e18);
        assertFalse(ok);
        assertEq(reason, "TWAP unavailable");
        assertEq(guard.maxAmountIn(tba, true), 0);
        vm.expectRevert(abi.encodeWithSelector(AnimrTradeGuard.TradeRejected.selector, "TWAP unavailable"));
        guard.quoteFloor(tba, true, 1_000e18);
        _expectRejected("TWAP unavailable");
        vm.prank(operator);
        guard.trade(tba, true, 1_000e18, 0, block.timestamp);

        // Once the first of those observations is 30 minutes old, trading resumes.
        vm.warp(firstWrite + 30 minutes - 1);
        (ok,) = guard.canTrade(tba, true, 1_000e18);
        assertFalse(ok);
        vm.warp(firstWrite + 30 minutes);
        (ok, reason) = guard.canTrade(tba, true, 1_000e18);
        assertTrue(ok, reason);
    }

    /// What script/GrowPoolOracle.s.sol does: once the pool keeps more observations than a burst can write within
    /// 30 minutes, the burst no longer breaks the TWAP. The script grows the ring to 1801 (one write per second for
    /// 30 minutes); 400 is enough here and keeps the test fast (a fork fetches every new slot over RPC).
    function test_GrownOracleKeepsTheTwapThroughBursts() public {
        // On mainnet the ring may already be grown further (GrowPoolOracle targets 1801); growing never shrinks it.
        (,,,, uint16 nextBefore,,) = IPool(POOL).slot0();
        uint16 target = nextBefore > 400 ? nextBefore : 400;
        IPool(POOL).increaseObservationCardinalityNext(400);
        _writeObservations(300);
        (,,, uint16 cardinality,,,) = IPool(POOL).slot0();
        assertEq(cardinality, target);

        (bool ok, string memory reason) = guard.canTrade(tba, true, 1_000e18);
        assertTrue(ok, reason);
        vm.prank(operator);
        uint256 g = gasleft();
        guard.trade(tba, true, 1_000e18, 0, block.timestamp);
        g -= gasleft();
        console2.log("gas: trade() sell with a grown, busy oracle =", g);
        assertLt(g, 330_000);
    }

    // ------------------------------------------------------------------ kill switches

    function test_GlobalPause() public {
        vm.expectRevert(AnimrTradeGuard.NotAdmin.selector);
        vm.prank(operator);
        guard.setPaused(true);
        vm.expectRevert(AnimrTradeGuard.NotAdmin.selector);
        vm.prank(nftOwner);
        guard.setPaused(true);

        vm.prank(admin);
        guard.setPaused(true);
        assertTrue(guard.paused());
        (bool ok, string memory reason) = guard.canTrade(tba, true, 1_000e18);
        assertFalse(ok);
        assertEq(reason, "paused");
        assertEq(guard.maxAmountIn(tba, true), 0);
        _expectRejected("paused");
        vm.prank(operator);
        guard.trade(tba, true, 1_000e18, 0, block.timestamp);

        vm.prank(admin);
        guard.setPaused(false);
        _trade(true, 1_000e18);
    }

    function test_OwnerDisable() public {
        vm.expectRevert(AnimrTradeGuard.NotAccountOwner.selector);
        vm.prank(operator);
        guard.disable(tba);

        vm.prank(nftOwner);
        guard.disable(tba);
        assertFalse(guard.limitsOf(tba).enabled);
        (bool ok, string memory reason) = guard.canTrade(tba, true, 1_000e18);
        assertFalse(ok);
        assertEq(reason, "trading not enabled");
        _expectRejected("trading not enabled");
        vm.prank(operator);
        guard.trade(tba, true, 1_000e18, 0, block.timestamp);

        // Re-enabling works...
        vm.prank(nftOwner);
        guard.configure(tba, _limits(1_000, 3_000, 10 minutes, 200));
        _trade(true, 1_000e18);

        // ...and revoking the guard on the TBA (Tokenbound) stops it as well.
        vm.warp(block.timestamp + 10 minutes);
        vm.prank(nftOwner);
        _setPermission(tba, address(guard), false);
        (ok, reason) = guard.canTrade(tba, true, 1_000e18);
        assertFalse(ok);
        assertEq(reason, "guard not authorized on TBA");
        vm.expectRevert(TB_NOT_AUTHORIZED);
        vm.prank(operator);
        guard.trade(tba, true, 1_000e18, 0, block.timestamp);
    }

    function test_TbaLockBlocksTrading() public {
        vm.prank(nftOwner);
        ITBA(tba).lock(block.timestamp + 1 days);
        (bool ok, string memory reason) = guard.canTrade(tba, true, 1_000e18);
        assertFalse(ok);
        assertEq(reason, "TBA locked");
        vm.expectRevert(TB_ACCOUNT_LOCKED);
        vm.prank(operator);
        guard.trade(tba, true, 1_000e18, 0, block.timestamp);
    }

    // ------------------------------------------------------------------ NFT sale and ownership

    function test_NftSale_LimitsAndPermissionGoDormant() public {
        _trade(true, 10_000e18); // the seller's AI has been trading

        vm.prank(nftOwner);
        IERC721(CHOG_NFT).transferFrom(nftOwner, buyer, TOKEN_ID);
        assertEq(ITBA(tba).owner(), buyer);
        vm.warp(block.timestamp + 1 days);

        // Both the guard limits and the Tokenbound permission are keyed by the seller, so both are dormant.
        assertFalse(guard.limitsOf(tba).enabled);
        assertTrue(guard.vaultOf(tba, nftOwner).limits.enabled);
        assertTrue(ITBA(tba).permissions(nftOwner, address(guard)));
        assertFalse(ITBA(tba).permissions(buyer, address(guard)));
        _expectRejected("trading not enabled");
        vm.prank(operator);
        guard.trade(tba, true, 1_000e18, 0, block.timestamp);

        // The seller can no longer change anything.
        vm.expectRevert(AnimrTradeGuard.NotAccountOwner.selector);
        vm.prank(nftOwner);
        guard.configure(tba, _limits(5_000, 10_000, 0, 200));
        vm.expectRevert(AnimrTradeGuard.NotAccountOwner.selector);
        vm.prank(nftOwner);
        guard.disable(tba);

        // The buyer opts in. Until they also grant the guard on the TBA, Tokenbound refuses it.
        vm.prank(buyer);
        guard.configure(tba, _limits(500, 1_000, 0, 100));
        (bool ok, string memory reason) = guard.canTrade(tba, true, 1_000e18);
        assertFalse(ok);
        assertEq(reason, "guard not authorized on TBA");
        vm.expectRevert(TB_NOT_AUTHORIZED);
        vm.prank(operator);
        guard.trade(tba, true, 1_000e18, 0, block.timestamp);

        vm.prank(buyer);
        _setPermission(tba, address(guard), true);
        uint256 chogBefore = IERC20(CHOG).balanceOf(tba);
        uint256 wmonBefore = IERC20(WMON).balanceOf(tba);
        uint256 out = _trade(true, 1_000e18);
        assertEq(IERC20(CHOG).balanceOf(tba), chogBefore - 1_000e18);
        assertEq(IERC20(WMON).balanceOf(tba), wmonBefore + out);
        // The buyer's limits and history are their own: a fresh budget with only this trade in it.
        AnimrTradeGuard.Vault memory v = guard.vaultOf(tba, buyer);
        assertEq(v.limits.maxTradeBps, 500);
        assertEq(v.lastTradeAt, block.timestamp);
        assertEq(v.budgetUsed, _chogToWmon(1_000e18));
    }

    /// Tokenbound only resolves the root owner through its own implementation, so for a Chog held by another
    /// AccountProxy TBA the grant is keyed by that parent account and survives a sale of the parent NFT. The
    /// guard therefore refuses owners that are themselves ERC-6551 accounts.
    function test_NestedOwnershipIsRefused() public {
        address alice = makeAddr("alice");
        MockParentNft parent = new MockParentNft();
        parent.mint(alice, 7);
        address parentTba =
            IRegistry(REGISTRY).createAccount(ACCOUNT_PROXY, bytes32(0), block.chainid, address(parent), 7);
        IAccountProxy(parentTba).initialize(ACCOUNT_IMPL);
        assertEq(ITBA(parentTba).owner(), alice);

        // Chog #1 moves into the parent account: the previous owner's limits go dormant with the move.
        vm.prank(nftOwner);
        IERC721(CHOG_NFT).transferFrom(nftOwner, parentTba, TOKEN_ID);
        assertEq(ITBA(tba).owner(), parentTba);
        _expectRejected("trading not enabled");
        vm.prank(operator);
        guard.trade(tba, true, 1_000e18, 0, block.timestamp);

        // Opting in through the parent account is refused.
        vm.expectRevert(AnimrTradeGuard.NestedAccount.selector);
        vm.prank(alice);
        ITBA(parentTba)
            .execute(address(guard), 0, abi.encodeCall(guard.configure, (tba, _limits(1_000, 3_000, 0, 200))), 0);
        assertFalse(guard.limitsOf(tba).enabled);
    }

    // ------------------------------------------------------------------ buy-only mode

    /// The owner's buy-only switch: the AI keeps buying CHOG with the vault's WMON, but no sale of CHOG gets through,
    /// in either path and whatever its size.
    function test_BuyOnly_RefusesSellsButNotBuys() public {
        _fundTbaWithWmon(1_000e18);
        assertFalse(guard.isBuyOnly(tba));

        vm.expectEmit(true, true, true, true, address(guard));
        emit AnimrTradeGuard.BuyOnlySet(tba, nftOwner, true);
        vm.prank(nftOwner);
        guard.setBuyOnly(tba, true);
        assertTrue(guard.isBuyOnly(tba));
        assertEq(guard.maxAmountIn(tba, true), 0);

        // Sales from 1 wei up to exactly the per-trade cap: all refused as sales, before any size check, in both paths.
        uint256[3] memory sells = [uint256(1), 1_000e18, 10_000e18];
        for (uint256 i; i < sells.length; i++) {
            (bool refusedOk, string memory refusal) = guard.canTrade(tba, true, sells[i]);
            assertFalse(refusedOk);
            assertEq(refusal, "buy-only vault");
            _expectRejected("buy-only vault");
            vm.prank(operator);
            guard.trade(tba, true, sells[i], 0, block.timestamp);
        }
        assertEq(IERC20(CHOG).balanceOf(tba), START_CHOG);

        // Buying works as before: up to 10% of the WMON, at exactly the pool's price.
        uint256 buy = guard.maxAmountIn(tba, false);
        assertEq(buy, 100e18);
        (bool ok, string memory reason) = guard.canTrade(tba, false, buy);
        assertTrue(ok, reason);
        uint256 expectedChog = _quote(WMON, CHOG, buy);
        assertEq(_trade(false, buy), expectedChog);
        assertEq(IERC20(CHOG).balanceOf(tba), START_CHOG + expectedChog);
        assertEq(IERC20(WMON).balanceOf(tba), 1_000e18 - buy);
        _assertNothingLeftBehind();

        // Switched off, the AI may sell again.
        vm.expectEmit(true, true, true, true, address(guard));
        emit AnimrTradeGuard.BuyOnlySet(tba, nftOwner, false);
        vm.prank(nftOwner);
        guard.setBuyOnly(tba, false);
        assertFalse(guard.isBuyOnly(tba));
        vm.warp(block.timestamp + 10 minutes);
        (ok, reason) = guard.canTrade(tba, true, 1_000e18);
        assertTrue(ok, reason);
        _trade(true, 1_000e18);
        assertEq(IERC20(CHOG).balanceOf(tba), START_CHOG + expectedChog - 1_000e18);
    }

    /// Only the current owner flips the switch, through configure()'s checks: a leaked operator key or the admin can
    /// neither lift it nor turn it on, and only canonical Chog accounts held directly by their owner take it.
    function test_BuyOnly_OnlyTheOwnerCanSetIt() public {
        vm.prank(nftOwner);
        guard.setBuyOnly(tba, true);

        address[5] memory notOwners = [operator, admin, attacker, buyer, tba];
        for (uint256 i; i < notOwners.length; i++) {
            vm.expectRevert(AnimrTradeGuard.NotAccountOwner.selector);
            vm.prank(notOwners[i]);
            guard.setBuyOnly(tba, false);
        }
        assertTrue(guard.isBuyOnly(tba));

        // Not the canonical TBA of a Chog: refused, even for whoever that account says its owner is.
        vm.prank(attacker);
        FakeChogAccount fake = new FakeChogAccount(CHOG_NFT);
        address otherSalt = _deployTba(TOKEN_ID, bytes32(uint256(1)));
        address uninitialized =
            IRegistry(REGISTRY).createAccount(ACCOUNT_PROXY, bytes32(0), block.chainid, CHOG_NFT, 1_000_001);
        address[4] memory notChog = [attacker, address(fake), otherSalt, uninitialized];
        address[4] memory callers = [attacker, attacker, nftOwner, attacker];
        for (uint256 i; i < notChog.length; i++) {
            vm.expectRevert(AnimrTradeGuard.NotChogAccount.selector);
            vm.prank(callers[i]);
            guard.setBuyOnly(notChog[i], true);
            assertFalse(guard.isBuyOnly(notChog[i]));
        }

        // A Chog held by another ERC-6551 account is refused, as in configure().
        address alice = makeAddr("alice");
        MockParentNft parent = new MockParentNft();
        parent.mint(alice, 7);
        address parentTba =
            IRegistry(REGISTRY).createAccount(ACCOUNT_PROXY, bytes32(0), block.chainid, address(parent), 7);
        IAccountProxy(parentTba).initialize(ACCOUNT_IMPL);
        vm.prank(nftOwner);
        IERC721(CHOG_NFT).transferFrom(nftOwner, parentTba, TOKEN_ID);
        vm.expectRevert(AnimrTradeGuard.NestedAccount.selector);
        vm.prank(alice);
        ITBA(parentTba).execute(address(guard), 0, abi.encodeCall(guard.setBuyOnly, (tba, true)), 0);
        assertFalse(guard.isBuyOnly(tba));
    }

    /// Like the limits, the switch belongs to the owner who set it: a buyer of the NFT starts without it, and the
    /// seller can no longer change it.
    function test_BuyOnly_NftSaleResetsIt() public {
        vm.prank(nftOwner);
        guard.setBuyOnly(tba, true);

        vm.prank(nftOwner);
        IERC721(CHOG_NFT).transferFrom(nftOwner, buyer, TOKEN_ID);
        assertFalse(guard.isBuyOnly(tba));
        vm.expectRevert(AnimrTradeGuard.NotAccountOwner.selector);
        vm.prank(nftOwner);
        guard.setBuyOnly(tba, false);

        // Once the buyer opts in, the AI may sell for them.
        vm.startPrank(buyer);
        _setPermission(tba, address(guard), true);
        guard.configure(tba, _limits(1_000, 3_000, 0, 200));
        vm.stopPrank();
        (bool ok, string memory reason) = guard.canTrade(tba, true, 1_000e18);
        assertTrue(ok, reason);
        _trade(true, 1_000e18);

        // The buyer's own switch.
        vm.expectEmit(true, true, true, true, address(guard));
        emit AnimrTradeGuard.BuyOnlySet(tba, buyer, true);
        vm.prank(buyer);
        guard.setBuyOnly(tba, true);
        _expectRejected("buy-only vault");
        vm.prank(operator);
        guard.trade(tba, true, 1_000e18, 0, block.timestamp);

        // Dormant, not deleted, like the limits and Tokenbound's grant: it applies again if the NFT comes back.
        vm.startPrank(buyer);
        guard.setBuyOnly(tba, false);
        IERC721(CHOG_NFT).transferFrom(buyer, nftOwner, TOKEN_ID);
        vm.stopPrank();
        assertTrue(guard.isBuyOnly(tba));
    }

    /// Only setBuyOnly() changes the switch: new limits, or disabling and re-enabling trading, leave it on. A paused
    /// guard or a disabled vault is reported first.
    function test_BuyOnly_SurvivesConfigureAndDisable() public {
        bool ok;
        string memory reason;
        vm.startPrank(nftOwner);
        guard.setBuyOnly(tba, true);
        guard.configure(tba, _limits(5_000, 10_000, 0, 200));
        assertTrue(guard.isBuyOnly(tba));
        guard.disable(tba);
        assertTrue(guard.isBuyOnly(tba));
        (, reason) = guard.canTrade(tba, true, 1_000e18);
        assertEq(reason, "trading not enabled");
        guard.configure(tba, _limits(1_000, 3_000, 10 minutes, 200));
        vm.stopPrank();
        assertTrue(guard.isBuyOnly(tba));
        assertEq(guard.limitsOf(tba).maxTradeBps, 1_000);

        vm.prank(admin);
        guard.setPaused(true);
        (, reason) = guard.canTrade(tba, true, 1_000e18);
        assertEq(reason, "paused");
        vm.prank(admin);
        guard.setPaused(false);

        (ok, reason) = guard.canTrade(tba, true, 1_000e18);
        assertFalse(ok);
        assertEq(reason, "buy-only vault");
    }

    /// Whatever the amount, a sale from a buy-only vault fails with exactly "buy-only vault".
    function testFuzz_BuyOnlyRefusesEverySale(uint256 amount) public {
        vm.prank(nftOwner);
        guard.setBuyOnly(tba, true);
        (bool ok, string memory reason) = guard.canTrade(tba, true, amount);
        assertFalse(ok);
        assertEq(reason, "buy-only vault");
        assertEq(guard.maxAmountIn(tba, true), 0);
        _expectRejected("buy-only vault");
        vm.prank(operator);
        guard.trade(tba, true, amount, 0, block.timestamp);
    }

    // ------------------------------------------------------------------ funds can only be swapped in place

    /// The only token movements a trade can cause: tokenIn TBA -> pool and tokenOut pool -> TBA, plus the TBA's
    /// approval to the router going to amountIn and back to 0. trade() takes no recipient, token, router, path or
    /// calldata, so there is nothing an operator could pass to send funds anywhere else.
    function testFuzz_TradeOnlyMovesTokensBetweenTbaAndPool(uint256 amount, bool sellChog) public {
        _fundTbaWithWmon(10_000e18);
        (address tokenIn, address tokenOut) = sellChog ? (CHOG, WMON) : (WMON, CHOG);
        amount = bound(amount, 1e15, guard.maxAmountIn(tba, sellChog));
        uint256 inBefore = IERC20(tokenIn).balanceOf(tba);
        uint256 outBefore = IERC20(tokenOut).balanceOf(tba);

        vm.recordLogs();
        uint256 out = _trade(sellChog, amount);
        (uint256 transfers, uint256 approvals) = _checkTokenEvents(vm.getRecordedLogs(), sellChog, amount, out);
        assertEq(transfers, 2);
        assertGe(approvals, 2);

        assertEq(IERC20(tokenIn).balanceOf(tba), inBefore - amount);
        assertEq(IERC20(tokenOut).balanceOf(tba), outBefore + out);
        _assertNothingLeftBehind();
    }

    /// Every CHOG/WMON event of a trade must be tokenIn TBA -> pool (amountIn), tokenOut pool -> TBA (out), or
    /// the TBA's approval of tokenIn to the router (amountIn or 0).
    function _checkTokenEvents(Vm.Log[] memory logs, bool sellChog, uint256 amountIn, uint256 out)
        internal
        view
        returns (uint256 transfers, uint256 approvals)
    {
        (address tokenIn, address tokenOut) = sellChog ? (CHOG, WMON) : (WMON, CHOG);
        for (uint256 i; i < logs.length; i++) {
            Vm.Log memory l = logs[i];
            if (l.emitter != CHOG && l.emitter != WMON) continue;
            bool isTransfer = l.topics[0] == TRANSFER_EVENT;
            assertTrue(l.topics.length == 3 && (isTransfer || l.topics[0] == APPROVAL_EVENT), "unexpected token event");
            address from = address(uint160(uint256(l.topics[1])));
            address to = address(uint160(uint256(l.topics[2])));
            uint256 value = abi.decode(l.data, (uint256));
            if (isTransfer) {
                bool pays = l.emitter == tokenIn && from == tba && to == POOL && value == amountIn;
                bool receives = l.emitter == tokenOut && from == POOL && to == tba && value == out;
                assertTrue(pays || receives, "unexpected token transfer");
                transfers++;
            } else {
                assertEq(l.emitter, tokenIn, "approval on the wrong token");
                assertEq(from, tba, "approval from the wrong owner");
                assertEq(to, ROUTER, "approval to the wrong spender");
                assertTrue(value == amountIn || value == 0, "unexpected approval amount");
                approvals++;
            }
        }
    }

    function test_GuardCannotSignForTheTba() public {
        // Tokenbound also treats a permissioned caller as a valid signer of the TBA...
        assertEq(ITBA(tba).isValidSigner(address(guard), ""), bytes4(0x523e3260));
        // ...but the guard implements no ERC-1271, so no Permit2 / Seaport / off-chain approval can be signed
        // "by the guard" on the TBA's behalf.
        bytes memory contractSig =
            abi.encodePacked(bytes32(uint256(uint160(address(guard)))), bytes32(uint256(65)), uint8(0), hex"00");
        assertEq(ITBA(tba).isValidSignature(keccak256("permit2 transfer"), contractSig), bytes4(0));

        // And it has no fallback: nothing but its declared functions can be called on it.
        (bool ok,) = address(guard)
            .call(
                abi.encodeWithSignature(
                    "execute(address,uint256,bytes,uint8)", CHOG, 0, abi.encodeCall(IERC20.transfer, (attacker, 1)), 0
                )
            );
        assertFalse(ok);
    }

    function test_ApprovalIsResetToZero() public {
        // Even an allowance the owner set on purpose is cleared: the guard never leaves one behind.
        vm.prank(nftOwner);
        ITBA(tba).execute(CHOG, 0, abi.encodeCall(IERC20.approve, (ROUTER, 5e18)), 0);
        assertEq(IERC20(CHOG).allowance(tba, ROUTER), 5e18);

        _trade(true, 10_000e18);
        assertEq(IERC20(CHOG).allowance(tba, ROUTER), 0);

        vm.warp(block.timestamp + 10 minutes);
        _trade(false, IERC20(WMON).balanceOf(tba) / 10);
        assertEq(IERC20(WMON).allowance(tba, ROUTER), 0);
    }

    /// The guard judges a swap by the TBA's balances. Native MON left on the router makes it pay a WMON-in swap
    /// itself (Uniswap's PeripheryPayments), so the TBA would spend nothing: refused.
    function test_SettlementCatchesARouterPayingFromItsOwnBalance() public {
        _fundTbaWithWmon(1_000e18);
        vm.deal(ROUTER, 50e18);
        vm.expectRevert(AnimrTradeGuard.SettlementMismatch.selector);
        vm.prank(operator);
        guard.trade(tba, false, 50e18, 0, block.timestamp);
    }

    /// A router that ignores amountOutMinimum or takes less than amountIn is caught as well.
    function test_SettlementCatchesALyingRouter() public {
        LyingRouter liar = new LyingRouter(FACTORY);
        vm.prank(admin);
        AnimrTradeGuard g =
            new AnimrTradeGuard(operator, CHOG, WMON, address(liar), POOL, FEE, CHOG_NFT, REGISTRY, ACCOUNT_PROXY);
        vm.startPrank(nftOwner);
        _setPermission(tba, address(g), true);
        g.configure(tba, _limits(1_000, 3_000, 0, 200));
        vm.stopPrank();
        _fundWithWmon(address(liar), 1_000e18);
        uint256 amount = 1_000e18;
        uint256 floor = g.quoteFloor(tba, true, amount);

        liar.setShortfalls(0, 1); // pays 1 wei less than the minimum
        vm.expectRevert(AnimrTradeGuard.SettlementMismatch.selector);
        vm.prank(operator);
        g.trade(tba, true, amount, 0, block.timestamp);

        liar.setShortfalls(1, 0); // takes 1 wei less than amountIn
        vm.expectRevert(AnimrTradeGuard.SettlementMismatch.selector);
        vm.prank(operator);
        g.trade(tba, true, amount, 0, block.timestamp);

        liar.setShortfalls(0, 0); // honest at the minimum
        vm.prank(operator);
        assertEq(g.trade(tba, true, amount, 0, block.timestamp), floor);
        assertEq(IERC20(CHOG).allowance(tba, address(liar)), 0);
    }

    // ------------------------------------------------------------------ configuration

    function test_ConfigureEnforcesHardCeilings() public {
        AnimrTradeGuard.Limits[6] memory bad = [
            _limits(0, 3_000, 0, 200),
            _limits(5_001, 3_000, 0, 200),
            _limits(1_000, 0, 0, 200),
            _limits(1_000, 10_001, 0, 200),
            _limits(1_000, 3_000, 0, 0),
            _limits(1_000, 3_000, 0, 201)
        ];
        for (uint256 i; i < bad.length; i++) {
            vm.expectRevert(AnimrTradeGuard.InvalidLimits.selector);
            vm.prank(nftOwner);
            guard.configure(tba, bad[i]);
        }
        // The ceilings themselves are allowed.
        vm.prank(nftOwner);
        guard.configure(tba, _limits(5_000, 10_000, 0, 200));
        assertEq(guard.limitsOf(tba).maxTradeBps, 5_000);
    }

    function test_ConfigureOnlyByOwnerAndOnlyForChogAccounts() public {
        address[3] memory notOwners = [operator, admin, attacker];
        for (uint256 i; i < notOwners.length; i++) {
            vm.expectRevert(AnimrTradeGuard.NotAccountOwner.selector);
            vm.prank(notOwners[i]);
            guard.configure(tba, _limits(1_000, 3_000, 0, 200));
        }

        // An EOA, a contract impersonating Chog #1's TBA, a Tokenbound account with another salt, and an
        // uninitialized Chog TBA are all refused.
        assertTrue(guard.isChogAccount(tba));
        vm.prank(attacker);
        FakeChogAccount fake = new FakeChogAccount(CHOG_NFT);
        address otherSalt = _deployTba(TOKEN_ID, bytes32(uint256(1)));
        address uninitialized =
            IRegistry(REGISTRY).createAccount(ACCOUNT_PROXY, bytes32(0), block.chainid, CHOG_NFT, 1_000_001);
        assertEq(vm.load(uninitialized, ERC1967_IMPL_SLOT), bytes32(0));
        address[4] memory notChog = [attacker, address(fake), otherSalt, uninitialized];
        for (uint256 i; i < notChog.length; i++) {
            assertFalse(guard.isChogAccount(notChog[i]));
            vm.expectRevert(AnimrTradeGuard.NotChogAccount.selector);
            vm.prank(attacker);
            guard.configure(notChog[i], _limits(1_000, 3_000, 0, 200));
        }
        // canTrade answers without reverting for such addresses.
        (bool ok, string memory reason) = guard.canTrade(address(fake), true, 1e18);
        assertFalse(ok);
        assertEq(reason, "trading not enabled");
        (ok, reason) = guard.canTrade(attacker, true, 1e18);
        assertFalse(ok);
    }

    // ------------------------------------------------------------------ admin

    function test_AdminRotatesOperatorAndTransfersAdminInTwoSteps() public {
        address newOperator = makeAddr("newOperator");
        vm.expectRevert(AnimrTradeGuard.NotAdmin.selector);
        vm.prank(operator);
        guard.setOperator(newOperator);

        // The admin can never also be the operator.
        vm.expectRevert(AnimrTradeGuard.InvalidOperator.selector);
        vm.prank(admin);
        guard.setOperator(admin);

        vm.prank(admin);
        guard.setOperator(newOperator);
        vm.expectRevert(AnimrTradeGuard.NotOperator.selector);
        vm.prank(operator);
        guard.trade(tba, true, 1_000e18, 0, block.timestamp);
        vm.prank(newOperator);
        guard.trade(tba, true, 1_000e18, 0, block.timestamp);

        // ...nor can the operator become the admin.
        vm.prank(admin);
        guard.transferAdmin(newOperator);
        vm.expectRevert(AnimrTradeGuard.InvalidOperator.selector);
        vm.prank(newOperator);
        guard.acceptAdmin();

        address newAdmin = makeAddr("newAdmin");
        vm.prank(admin);
        guard.transferAdmin(newAdmin);
        assertEq(guard.admin(), admin);
        assertEq(guard.pendingAdmin(), newAdmin);
        vm.expectRevert(AnimrTradeGuard.NotPendingAdmin.selector);
        vm.prank(attacker);
        guard.acceptAdmin();

        vm.prank(newAdmin);
        guard.acceptAdmin();
        assertEq(guard.admin(), newAdmin);
        assertEq(guard.pendingAdmin(), address(0));
        vm.expectRevert(AnimrTradeGuard.NotAdmin.selector);
        vm.prank(admin);
        guard.setPaused(true);
    }

    function test_ConstructorRejectsABadVenueOrTheOperatorAsDeployer() public {
        vm.expectRevert(AnimrTradeGuard.InvalidVenue.selector);
        new AnimrTradeGuard(operator, CHOG, WMON, ROUTER, address(0xdead), FEE, CHOG_NFT, REGISTRY, ACCOUNT_PROXY);
        vm.expectRevert(AnimrTradeGuard.InvalidVenue.selector);
        new AnimrTradeGuard(operator, CHOG, WMON, ROUTER, POOL, 3_000, CHOG_NFT, REGISTRY, ACCOUNT_PROXY);
        // The deployer becomes the admin, so the operator key must not deploy.
        vm.expectRevert(AnimrTradeGuard.InvalidOperator.selector);
        vm.prank(operator);
        new AnimrTradeGuard(operator, CHOG, WMON, ROUTER, POOL, FEE, CHOG_NFT, REGISTRY, ACCOUNT_PROXY);
    }

    // ------------------------------------------------------------------ gas

    /// Ethereum-schedule gas (what forge measures). Monad prices cold state access higher: see TRADE_GAS_LIMIT in
    /// lib/contracts/animr-trade-guard.ts for the limits measured on Monad itself.
    function test_GasOfTrade() public {
        _fundTbaWithWmon(1_000e18);
        vm.prank(operator);
        uint256 g = gasleft();
        guard.trade(tba, true, 10_000e18, 0, block.timestamp);
        g -= gasleft();
        console2.log("gas: trade() sell 10k CHOG, first trade =", g);
        assertLt(g, 320_000);

        vm.warp(block.timestamp + 10 minutes);
        vm.prank(operator);
        g = gasleft();
        guard.trade(tba, false, 50e18, 0, block.timestamp);
        g -= gasleft();
        console2.log("gas: trade() buy with 50 WMON =", g);
        assertLt(g, 250_000);

        vm.warp(block.timestamp + 10 minutes);
        vm.prank(operator);
        g = gasleft();
        guard.trade(tba, true, 5_000e18, 0, block.timestamp);
        g -= gasleft();
        console2.log("gas: trade() sell 5k CHOG, third trade =", g);
        assertLt(g, 200_000);
    }

    // ------------------------------------------------------------------ helpers

    function _limits(uint16 maxTradeBps, uint16 maxDailyBps, uint32 minInterval, uint16 maxSlippageBps)
        internal
        pure
        returns (AnimrTradeGuard.Limits memory)
    {
        return AnimrTradeGuard.Limits({
            enabled: true,
            maxTradeBps: maxTradeBps,
            maxDailyBps: maxDailyBps,
            minInterval: minInterval,
            maxSlippageBps: maxSlippageBps
        });
    }

    /// Tokenbound's createAccount flow: registry.createAccount(AccountProxy, ...) then
    /// AccountProxy.initialize(AccountV3Upgradable). Both are permissionless.
    function _deployTba(uint256 tokenId, bytes32 salt) internal returns (address account) {
        account = IRegistry(REGISTRY).createAccount(ACCOUNT_PROXY, salt, block.chainid, CHOG_NFT, tokenId);
        if (vm.load(account, ERC1967_IMPL_SLOT) == bytes32(0)) IAccountProxy(account).initialize(ACCOUNT_IMPL);
        assertEq(account, IRegistry(REGISTRY).account(ACCOUNT_PROXY, salt, block.chainid, CHOG_NFT, tokenId));
    }

    function _setPermission(address account, address caller, bool allowed) internal {
        address[] memory callers = new address[](1);
        callers[0] = caller;
        bool[] memory perms = new bool[](1);
        perms[0] = allowed;
        ITBA(account).setPermissions(callers, perms);
    }

    function _trade(bool sellChog, uint256 amountIn) internal returns (uint256) {
        vm.prank(operator);
        return guard.trade(tba, sellChog, amountIn, 0, block.timestamp);
    }

    function _expectRejected(string memory reason) internal {
        vm.expectRevert(abi.encodeWithSelector(AnimrTradeGuard.TradeRejected.selector, reason));
    }

    function _swapParams(bool sellChog, uint256 amountIn, uint256 minOut)
        internal
        view
        returns (ISwapRouter.ExactInputSingleParams memory)
    {
        (address tokenIn, address tokenOut) = sellChog ? (CHOG, WMON) : (WMON, CHOG);
        return ISwapRouter.ExactInputSingleParams(tokenIn, tokenOut, FEE, tba, block.timestamp, amountIn, minOut, 0);
    }

    /// Exact output of the pool for this swap right now (QuoterV2 simulates the real swap).
    function _quote(address tokenIn, address tokenOut, uint256 amountIn) internal returns (uint256 amountOut) {
        (amountOut,,,) = IQuoterV2(QUOTER)
            .quoteExactInputSingle(IQuoterV2.QuoteExactInputSingleParams(tokenIn, tokenOut, amountIn, FEE, 0));
    }

    /// The guard's daily capacity for the TBA right now: bps of its CHOG and WMON, in WMON at the 30-minute TWAP.
    function _capacity(uint256 maxDailyBps) internal view returns (uint256) {
        uint256 value = _chogToWmon(IERC20(CHOG).balanceOf(tba)) + IERC20(WMON).balanceOf(tba);
        return value * maxDailyBps / 10_000;
    }

    function _chogToWmon(uint256 amount) internal view returns (uint256) {
        return OracleLibrary.getQuoteAtTick(_twapTick(), uint128(amount), CHOG, WMON);
    }

    function _wmonToChog(uint256 amount) internal view returns (uint256) {
        return OracleLibrary.getQuoteAtTick(_twapTick(), uint128(amount), WMON, CHOG);
    }

    function _fundTbaWithWmon(uint256 amount) internal {
        _fundWithWmon(tba, amount);
    }

    function _fundWithWmon(address to, uint256 amount) internal {
        vm.deal(address(this), amount);
        IWMON(WMON).deposit{value: amount}();
        IERC20(WMON).transfer(to, amount);
    }

    /// A third party swaps through the same pool (front-run / manipulation).
    function _attackerSwap(bool sellChog, uint256 amountIn) internal {
        _attackerSwapToLimit(sellChog, amountIn, 0);
    }

    /// Attacker trades until the pool price reaches exactly `targetTick`.
    function _pushSpotTo(int24 targetTick) internal {
        bool sellChog = targetTick < _spotTick();
        _attackerSwapToLimit(sellChog, sellChog ? 50_000_000e18 : 5_000_000e18, TickMath.getSqrtRatioAtTick(targetTick));
        assertApproxEqAbs(int256(_spotTick()), int256(targetTick), 1);
    }

    function _attackerSwapToLimit(bool sellChog, uint256 amountIn, uint160 sqrtPriceLimitX96) internal {
        (address tokenIn, address tokenOut) = sellChog ? (CHOG, WMON) : (WMON, CHOG);
        if (sellChog) {
            deal(CHOG, attacker, amountIn);
        } else {
            vm.deal(attacker, amountIn);
            vm.prank(attacker);
            IWMON(WMON).deposit{value: amountIn}();
        }
        vm.startPrank(attacker);
        IERC20(tokenIn).approve(ROUTER, amountIn);
        ISwapRouter(ROUTER)
            .exactInputSingle(
                ISwapRouter.ExactInputSingleParams(
                    tokenIn, tokenOut, FEE, attacker, block.timestamp, amountIn, 0, sqrtPriceLimitX96
                )
            );
        vm.stopPrank();
    }

    /// `n` swaps, one per second, that each move the tick and so each write one oracle observation: the first
    /// moves the price just below a tick boundary, the rest flip it back and forth across it for a few wei.
    function _writeObservations(uint256 n) internal {
        deal(CHOG, attacker, 10_000e18);
        vm.deal(attacker, 1_000e18);
        vm.startPrank(attacker);
        IWMON(WMON).deposit{value: 1_000e18}();
        IERC20(CHOG).approve(ROUTER, type(uint256).max);
        IERC20(WMON).approve(ROUTER, type(uint256).max);
        for (uint256 i; i < n; i++) {
            vm.warp(block.timestamp + 1);
            int24 tick = _spotTick();
            bool down = i % 2 == 0;
            ISwapRouter(ROUTER)
                .exactInputSingle(
                    ISwapRouter.ExactInputSingleParams(
                        down ? CHOG : WMON,
                        down ? WMON : CHOG,
                        FEE,
                        attacker,
                        block.timestamp,
                        down ? 10_000e18 : 1_000e18,
                        0,
                        down ? TickMath.getSqrtRatioAtTick(tick) - 1 : TickMath.getSqrtRatioAtTick(tick + 1)
                    )
                );
        }
        vm.stopPrank();
    }

    function _spotTick() internal view returns (int24 tick) {
        (, tick,,,,,) = IPool(POOL).slot0();
    }

    function _twapTick() internal view returns (int24) {
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = 30 minutes;
        (int56[] memory cumulatives,) = IPool(POOL).observe(secondsAgos);
        return OracleLibrary.meanTick(cumulatives[0], cumulatives[1], 30 minutes);
    }

    /// No allowance survives a trade, and neither the guard, the operator nor the router ends up holding tokens.
    function _assertNothingLeftBehind() internal view {
        address[2] memory tokens = [CHOG, WMON];
        for (uint256 i; i < 2; i++) {
            assertEq(IERC20(tokens[i]).allowance(tba, ROUTER), 0, "allowance left");
            assertEq(IERC20(tokens[i]).balanceOf(address(guard)), 0, "guard holds tokens");
            assertEq(IERC20(tokens[i]).balanceOf(operator), 0, "operator holds tokens");
            assertEq(IERC20(tokens[i]).balanceOf(ROUTER), routerBalancesAtStart[i], "router kept tokens");
        }
    }
}
