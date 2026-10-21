// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.24;

import {FullMath} from "./lib/FullMath.sol";
import {OracleLibrary} from "./lib/OracleLibrary.sol";
import {
    IERC20Like,
    IERC6551RegistryLike,
    ISwapRouterLike,
    ITokenboundAccountLike,
    IUniswapV3FactoryLike,
    IUniswapV3PoolLike
} from "./interfaces/External.sol";

/// @title AnimrTradeGuard
/// @notice The AI can trade your Chog's vault but can never withdraw from it, enforced on-chain.
/// @dev Every Chog Genesis NFT owns a Tokenbound ERC-6551 account (TBA). Tokenbound's only delegation,
///      TBA.setPermissions(callers, [true]), makes a caller an unrestricted executor of the TBA. The NFT owner
///      grants it to this guard instead of the AI's hot key. The AI's key (the operator) can only call trade(),
///      and the guard builds the TBA's calls itself, always the same three:
///
///          tokenIn.approve(router, amountIn)
///          router.exactInputSingle(tokenIn -> tokenOut, recipient = the same TBA)
///          tokenIn.approve(router, 0)
///
///      on one immutable CHOG/WMON pool. trade() takes no recipient, token, router, path or calldata, so the
///      operator can only swap between CHOG and WMON inside the same TBA. Each trade is also bounded by limits
///      the owner sets (size per trade, value traded per 24h in both directions together, time between trades)
///      and by a minimum output derived from the pool's TWAPs, which the operator can raise but never lower.
///
///      Owner setup: TBA.setPermissions([guard], [true]) (sent by the owner directly, not via a forwarder),
///      then guard.configure(tba, limits). Optionally, guard.setBuyOnly(tba, true) at any time: the AI can then
///      still buy CHOG with the vault's WMON but never sell CHOG. Limits, the buy-only switch and trade history are
///      keyed by (TBA, current NFT owner), like Tokenbound's permissions, so they go dormant when the NFT is sold
///      and the buyer has to opt in again. An owner that is itself an ERC-6551 account is refused: selling the NFT
///      above it would not reset either.
///
///      The admin can only rotate the operator and pause all trading, and can never be the operator. A
///      compromised admin or operator can at worst make bounded swaps that land back in the same TBA.
///
///      The 30-minute TWAP needs observe(1800) to succeed. Grow the pool's oracle to >= 1801 observations
///      (script/GrowPoolOracle.s.sol) so that bursts of swaps cannot push the oldest observation out of reach.
contract AnimrTradeGuard {
    // ------------------------------------------------------------------ types

    /// @notice Per-vault limits, set by the NFT owner.
    struct Limits {
        bool enabled;
        /// Max amountIn per trade, in bps of the TBA's current balance of the token being sold.
        uint16 maxTradeBps;
        /// Max value traded per 24h, buys and sells together, in bps of the vault's value (its CHOG and WMON, priced
        /// in WMON at the 30-minute TWAP). The budget frees up continuously: capacity / 24h.
        uint16 maxDailyBps;
        /// Min seconds between two trades.
        uint32 minInterval;
        /// Max output shortfall vs the reference TWAP quote (after the pool fee), in bps. Also how far the spot price
        /// may be on the vault's unfavourable side of the reference price, in ticks (1 tick = 0.01% of price).
        uint16 maxSlippageBps;
    }

    struct Vault {
        Limits limits;
        uint64 lastTradeAt;
        uint64 budgetUpdatedAt; // when budgetUsed was written
        uint128 budgetUsed; // daily budget in use at budgetUpdatedAt, in WMON (wei)
    }

    /// @dev What is stored per (TBA, owner). The buy-only switch sits outside Limits and Vault so that configure(),
    ///      limitsOf() and vaultOf() keep their ABI. It takes the slot right after the vault's two, so on Monad it is
    ///      almost always on the same storage page (128 slots) and trade() reads it warm.
    struct VaultState {
        Vault vault;
        bool buyOnly;
    }

    /// @dev Result of the pre-trade checks shared by trade() and canTrade() (computed without side effects).
    struct Plan {
        address owner;
        address tokenIn;
        address tokenOut;
        uint256 balanceIn; // TBA balance of tokenIn before the trade
        uint256 balanceOut; // TBA balance of tokenOut before the trade
        uint256 budgetUsed; // daily budget in use once this trade is booked
        uint256 floor; // minimum output derived from the TWAPs
    }

    // -------------------------------------------------------------- constants

    uint256 public constant BPS = 10_000;
    /// @notice Hard ceilings on what an owner can configure.
    uint16 public constant MAX_TRADE_BPS = 5_000; // one trade sells at most half of a balance
    uint16 public constant MAX_DAILY_BPS = 10_000; // the vault's whole value per 24h
    uint16 public constant MAX_SLIPPAGE_BPS = 200; // 2%
    /// @notice Averaging windows: the long one anchors the price, the short one tracks where the market is now.
    uint32 public constant TWAP_WINDOW = 30 minutes;
    uint32 public constant RECENT_WINDOW = 1 minutes;
    uint256 public constant DAILY_WINDOW = 1 days;

    bytes4 private constant VALID_SIGNER = 0x523e3260; // IERC6551Account.isValidSigner.selector

    // ------------------------------------------------------------- immutables

    /// @notice The trading venue: one Capricorn CL (Uniswap v3 fork) pool and its SwapRouter.
    address public immutable chog;
    address public immutable wmon;
    address public immutable router;
    address public immutable pool;
    uint24 public immutable fee;

    /// @notice Which TBAs can be configured: Tokenbound accounts of chogNft tokens, from the canonical
    ///         registry, AccountProxy implementation and salt 0.
    address public immutable chogNft;
    address public immutable registry;
    address public immutable accountImplementation;

    // ------------------------------------------------------------------ state

    address public admin;
    address public pendingAdmin;
    address public operator;
    bool public paused;

    mapping(address tba => mapping(address owner => VaultState)) private _vaults;
    uint256 private _lock = 1;

    // ----------------------------------------------------------------- events

    event Traded(address indexed tba, address indexed owner, bool sellChog, uint256 amountIn, uint256 amountOut);
    event Configured(address indexed tba, address indexed owner, Limits limits);
    event Disabled(address indexed tba, address indexed owner);
    event BuyOnlySet(address indexed tba, address indexed owner, bool on);
    event OperatorChanged(address indexed previousOperator, address indexed newOperator);
    event PausedSet(bool paused);
    event AdminTransferStarted(address indexed admin, address indexed pendingAdmin);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);

    // ----------------------------------------------------------------- errors

    error NotAdmin();
    error NotPendingAdmin();
    error NotOperator();
    error InvalidOperator();
    error NotAccountOwner();
    error NotChogAccount();
    error NestedAccount();
    error InvalidLimits();
    error InvalidVenue();
    error TradeRejected(string reason);
    error SettlementMismatch();
    error Reentrancy();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    /// @dev For the owner's settings (configure, setBuyOnly): `tba` is the canonical Tokenbound account of a Chog and
    ///      the caller is the current owner of that Chog.
    modifier onlyChogAccountOwner(address tba) {
        if (!_isChogAccount(tba)) revert NotChogAccount();
        if (msg.sender != _accountOwner(tba)) revert NotAccountOwner();
        // If the owner is itself an ERC-6551 account, selling the NFT that owns it would hand this vault over with
        // the settings (and Tokenbound's grant, keyed by that account) still live.
        if (_isErc6551Account(msg.sender)) revert NestedAccount();
        _;
    }

    constructor(
        address operator_,
        address chog_,
        address wmon_,
        address router_,
        address pool_,
        uint24 fee_,
        address chogNft_,
        address registry_,
        address accountImplementation_
    ) {
        // The TWAP has to come from the pool the router actually swaps through.
        if (
            chog_ == wmon_ || pool_ == address(0)
                || IUniswapV3FactoryLike(ISwapRouterLike(router_).factory()).getPool(chog_, wmon_, fee_) != pool_
        ) revert InvalidVenue();
        // A leaked operator key must not also hold the kill switch.
        if (operator_ == msg.sender) revert InvalidOperator();

        chog = chog_;
        wmon = wmon_;
        router = router_;
        pool = pool_;
        fee = fee_;
        chogNft = chogNft_;
        registry = registry_;
        accountImplementation = accountImplementation_;

        admin = msg.sender;
        operator = operator_;
        emit AdminTransferred(address(0), msg.sender);
        emit OperatorChanged(address(0), operator_);
    }

    // ---------------------------------------------------------------- trading

    /// @notice Swaps `amountIn` of CHOG for WMON (sellChog) or WMON for CHOG inside `tba`. Operator only.
    /// @param minAmountOut The operator's own minimum, e.g. a fresh QuoterV2 quote minus a tolerance. The swap uses
    ///        max(minAmountOut, TWAP floor).
    /// @param deadline Last block timestamp at which the trade may execute.
    /// @return amountOut tokenOut received by the TBA, measured from its balance
    function trade(address tba, bool sellChog, uint256 amountIn, uint256 minAmountOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        if (msg.sender != operator) revert NotOperator();
        if (block.timestamp > deadline) revert TradeRejected("deadline passed");
        (string memory reason, Plan memory p) = _plan(tba, sellChog, amountIn);
        if (bytes(reason).length != 0) revert TradeRejected(reason);

        // Effects before the external calls.
        Vault storage v = _vaults[tba][p.owner].vault;
        v.lastTradeAt = uint64(block.timestamp);
        v.budgetUpdatedAt = uint64(block.timestamp);
        v.budgetUsed = _u128(p.budgetUsed);

        uint256 minOut = minAmountOut > p.floor ? minAmountOut : p.floor;
        ITokenboundAccountLike(tba).executeBatch(_batch(tba, p, amountIn, minOut, deadline));
        amountOut = _settle(tba, p, amountIn, minOut);

        emit Traded(tba, p.owner, sellChog, amountIn, amountOut);
    }

    // ------------------------------------------------------------ owner setup

    /// @notice Opts `tba` in with `limits`, or updates them. Only the current owner of the TBA's NFT.
    /// @dev The owner must also call TBA.setPermissions([guard], [true]) for trades to go through.
    function configure(address tba, Limits calldata limits) external onlyChogAccountOwner(tba) {
        if (
            limits.maxTradeBps == 0 || limits.maxTradeBps > MAX_TRADE_BPS || limits.maxDailyBps == 0
                || limits.maxDailyBps > MAX_DAILY_BPS || limits.maxSlippageBps == 0
                || limits.maxSlippageBps > MAX_SLIPPAGE_BPS
        ) revert InvalidLimits();

        _vaults[tba][msg.sender].vault.limits = limits;
        emit Configured(tba, msg.sender, limits);
    }

    /// @notice Stops the AI trading `tba`. Only the current owner of the TBA's NFT.
    /// @dev Revoking the guard with TBA.setPermissions([guard], [false]) stops it as well.
    function disable(address tba) external {
        if (msg.sender != _accountOwner(tba)) revert NotAccountOwner();
        _vaults[tba][msg.sender].vault.limits.enabled = false;
        emit Disabled(tba, msg.sender);
    }

    /// @notice Turns buy-only mode on or off for `tba`. While it is on, the AI can still buy CHOG with the vault's
    ///         WMON but can never sell CHOG: trade() reverts and canTrade() fails with "buy-only vault". Only the
    ///         current owner of the TBA's NFT.
    /// @dev Kept per (TBA, owner) like the limits, so a sale of the NFT leaves the buyer without it. configure() and
    ///      disable() do not change it.
    function setBuyOnly(address tba, bool on) external onlyChogAccountOwner(tba) {
        _vaults[tba][msg.sender].buyOnly = on;
        emit BuyOnlySet(tba, msg.sender, on);
    }

    // ------------------------------------------------------------------ admin

    function setOperator(address newOperator) external onlyAdmin {
        if (newOperator == admin) revert InvalidOperator();
        emit OperatorChanged(operator, newOperator);
        operator = newOperator;
    }

    /// @notice Global kill switch for trade().
    function setPaused(bool paused_) external onlyAdmin {
        paused = paused_;
        emit PausedSet(paused_);
    }

    /// @notice Starts a two-step admin transfer; `newAdmin` has to call acceptAdmin(). address(0) cancels.
    function transferAdmin(address newAdmin) external onlyAdmin {
        pendingAdmin = newAdmin;
        emit AdminTransferStarted(admin, newAdmin);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert NotPendingAdmin();
        if (msg.sender == operator) revert InvalidOperator();
        emit AdminTransferred(admin, msg.sender);
        admin = msg.sender;
        pendingAdmin = address(0);
    }

    // ------------------------------------------------------------------ views

    /// @notice Limits of `tba` for its current owner (all zero if the owner never configured).
    function limitsOf(address tba) external view returns (Limits memory) {
        return _vaults[tba][_accountOwner(tba)].vault.limits;
    }

    /// @notice Whether `tba` is in buy-only mode for its current owner (false if that owner never turned it on).
    function isBuyOnly(address tba) external view returns (bool) {
        return _vaults[tba][_accountOwner(tba)].buyOnly;
    }

    /// @notice Raw vault state for a given (TBA, owner) pair, including the daily budget.
    function vaultOf(address tba, address owner_) external view returns (Vault memory) {
        return _vaults[tba][owner_].vault;
    }

    /// @notice True if `tba` is a deployed and initialized canonical Tokenbound account of a Chog, i.e. one that
    ///         configure() accepts.
    function isChogAccount(address tba) external view returns (bool) {
        return _isChogAccount(tba);
    }

    /// @notice Largest amountIn the size limits allow right now: the per-trade cap and what is left of the daily
    ///         budget. 0 while paused, not enabled or without a TWAP, and for sales from a buy-only vault. Ignores
    ///         timing and spot checks; see canTrade().
    function maxAmountIn(address tba, bool sellChog) external view returns (uint256) {
        if (paused) return 0;
        VaultState storage s = _vaults[tba][_accountOwner(tba)];
        Vault storage v = s.vault;
        Limits memory l = v.limits;
        if (!l.enabled || (sellChog && s.buyOnly)) return 0;
        (bool ok, int24 twapTick,,) = _ticks();
        if (!ok) return 0;

        uint256 chogBalance = IERC20Like(chog).balanceOf(tba);
        uint256 wmonBalance = IERC20Like(wmon).balanceOf(tba);
        uint256 capacity = _capacity(l, twapTick, chogBalance, wmonBalance);
        uint256 budgetLeft = capacity - _budgetUsed(v, capacity);
        uint256 budgetIn = sellChog ? _quote(twapTick, budgetLeft, wmon, chog) : budgetLeft;
        uint256 tradeCap = (sellChog ? chogBalance : wmonBalance) * l.maxTradeBps / BPS;
        return tradeCap < budgetIn ? tradeCap : budgetIn;
    }

    /// @notice Minimum output trade() would enforce for `amountIn`: the quote at the reference TWAP, minus the pool
    ///         fee, minus the current owner's maxSlippageBps.
    function quoteFloor(address tba, bool sellChog, uint256 amountIn) external view returns (uint256 floor) {
        (bool ok, int24 twapTick, int24 recentTick,) = _ticks();
        if (!ok) revert TradeRejected("TWAP unavailable");
        uint16 slippageBps = _vaults[tba][_accountOwner(tba)].vault.limits.maxSlippageBps;
        floor = _floor(sellChog, _refTick(sellChog, twapTick, recentTick), amountIn, slippageBps);
    }

    /// @notice Whether trade(tba, sellChog, amountIn, ...) would pass the guard's checks and the TBA's
    ///         permission and lock checks right now. `reason` is empty when ok. Price impact is not simulated:
    ///         the router still reverts with "Too little received" if the output misses the floor.
    function canTrade(address tba, bool sellChog, uint256 amountIn)
        external
        view
        returns (bool ok, string memory reason)
    {
        (reason,) = _plan(tba, sellChog, amountIn);
        if (bytes(reason).length == 0) {
            // Enabled limits imply a canonical Tokenbound account (checked in configure), so these calls are safe.
            // isValidSigner applies Tokenbound's own rule: the owner, the root owner, or granted by the root owner.
            if (ITokenboundAccountLike(tba).isValidSigner(address(this), "") != VALID_SIGNER) {
                reason = "guard not authorized on TBA";
            } else if (ITokenboundAccountLike(tba).isLocked()) {
                reason = "TBA locked";
            }
        }
        ok = bytes(reason).length == 0;
    }

    // --------------------------------------------------------------- internal

    function _plan(address tba, bool sellChog, uint256 amountIn)
        private
        view
        returns (string memory reason, Plan memory p)
    {
        if (paused) return ("paused", p);

        p.owner = _accountOwner(tba);
        VaultState storage s = _vaults[tba][p.owner];
        Vault storage v = s.vault;
        Limits memory l = v.limits;
        // Also what happens after a sale, for a TBA that was never configured, or for anything that is not a
        // Chog TBA (configure() only accepts those).
        if (!l.enabled) return ("trading not enabled", p);
        // The owner's buy-only switch: a sale of CHOG is refused whatever its size. Only sales read it.
        if (sellChog && s.buyOnly) return ("buy-only vault", p);
        if (amountIn == 0) return ("zero amount", p);

        (p.tokenIn, p.tokenOut) = sellChog ? (chog, wmon) : (wmon, chog);
        p.balanceIn = IERC20Like(p.tokenIn).balanceOf(tba);
        if (p.balanceIn == 0) return ("no balance", p);
        if (amountIn > p.balanceIn * l.maxTradeBps / BPS) return ("exceeds per-trade cap", p);
        if (block.timestamp < uint256(v.lastTradeAt) + l.minInterval) return ("min interval not elapsed", p);

        p.balanceOut = IERC20Like(p.tokenOut).balanceOf(tba);
        reason = _planAtPrices(v, l, sellChog, amountIn, p);
    }

    /// @dev The checks that need the pool's prices: the TWAP itself, the daily budget (valued at the TWAP), spot vs
    ///      the reference price, and the floor. Fills p.budgetUsed and p.floor.
    function _planAtPrices(Vault storage v, Limits memory l, bool sellChog, uint256 amountIn, Plan memory p)
        private
        view
        returns (string memory)
    {
        (bool ok, int24 twapTick, int24 recentTick, int24 spotTick) = _ticks();
        if (!ok) return "TWAP unavailable";

        // One budget for both directions, valued in WMON at the TWAP, so a round trip uses it twice.
        {
            (uint256 chogBalance, uint256 wmonBalance) =
                sellChog ? (p.balanceIn, p.balanceOut) : (p.balanceOut, p.balanceIn);
            uint256 capacity = _capacity(l, twapTick, chogBalance, wmonBalance);
            uint256 value = sellChog ? _quote(twapTick, amountIn, chog, wmon) : amountIn;
            p.budgetUsed = _budgetUsed(v, capacity) + value;
            if (p.budgetUsed > capacity) return "exceeds daily cap";
        }

        // Only a spot price worse for the vault than the reference is a warning sign (a front-run in progress).
        int24 refTick = _refTick(sellChog, twapTick, recentTick);
        int256 worseBy = sellChog ? int256(refTick) - spotTick : int256(spotTick) - refTick;
        if (worseBy > int256(uint256(l.maxSlippageBps))) return "spot price deviates from TWAP";

        p.floor = _floor(sellChog, refTick, amountIn, l.maxSlippageBps);
        if (p.floor == 0) return "amount too small";
        return "";
    }

    /// @dev maxDailyBps of the vault's value: its CHOG and WMON, in WMON at `twapTick`.
    function _capacity(Limits memory l, int24 twapTick, uint256 chogBalance, uint256 wmonBalance)
        private
        view
        returns (uint256)
    {
        return (_quote(twapTick, chogBalance, chog, wmon) + wmonBalance) * l.maxDailyBps / BPS;
    }

    /// @dev Daily budget in use now (a token bucket): what the last trade left in use, capped at today's capacity,
    ///      minus what has freed up since at `capacity` per DAILY_WINDOW. A burst can never exceed the capacity.
    function _budgetUsed(Vault storage v, uint256 capacity) private view returns (uint256 used) {
        used = v.budgetUsed < capacity ? v.budgetUsed : capacity;
        uint256 freed = capacity * (block.timestamp - v.budgetUpdatedAt) / DAILY_WINDOW;
        used = used > freed ? used - freed : 0;
    }

    /// @dev The better of the two TWAPs for the vault: more WMON per CHOG (higher tick) when selling CHOG, less when
    ///      buying. A move in the vault's favour over the last minute raises the floor; a manipulated last minute can
    ///      never lower it below the 30-minute TWAP's.
    function _refTick(bool sellChog, int24 twapTick, int24 recentTick) private pure returns (int24) {
        if (sellChog) return recentTick > twapTick ? recentTick : twapTick;
        return recentTick < twapTick ? recentTick : twapTick;
    }

    /// @dev Quote for `amountIn` at `refTick`, minus the pool fee, minus `slippageBps`.
    function _floor(bool sellChog, int24 refTick, uint256 amountIn, uint16 slippageBps) private view returns (uint256) {
        (address tokenIn, address tokenOut) = sellChog ? (chog, wmon) : (wmon, chog);
        uint256 out = _quote(refTick, amountIn, tokenIn, tokenOut);
        return FullMath.mulDiv(out, (1e6 - uint256(fee)) * (BPS - slippageBps), 1e6 * BPS);
    }

    function _quote(int24 tick, uint256 amount, address base, address quote) private pure returns (uint256) {
        return OracleLibrary.getQuoteAtTick(tick, _u128(amount), base, quote);
    }

    /// @dev Mean ticks over TWAP_WINDOW and RECENT_WINDOW from one pool.observe(), plus the spot tick. ok = false if
    ///      the pool cannot serve the 30-minute window (its oldest observation is too recent).
    function _ticks() private view returns (bool ok, int24 twapTick, int24 recentTick, int24 spotTick) {
        uint32[] memory secondsAgos = new uint32[](3);
        secondsAgos[0] = TWAP_WINDOW;
        secondsAgos[1] = RECENT_WINDOW; // secondsAgos[2] = 0: now
        try IUniswapV3PoolLike(pool).observe(secondsAgos) returns (int56[] memory cumulatives, uint160[] memory) {
            twapTick = OracleLibrary.meanTick(cumulatives[0], cumulatives[2], TWAP_WINDOW);
            recentTick = OracleLibrary.meanTick(cumulatives[1], cumulatives[2], RECENT_WINDOW);
        } catch {
            return (false, 0, 0, 0);
        }
        (, spotTick) = IUniswapV3PoolLike(pool).slot0();
        ok = true;
    }

    /// @dev The only calls the guard ever makes the TBA execute.
    function _batch(address tba, Plan memory p, uint256 amountIn, uint256 minOut, uint256 deadline)
        private
        view
        returns (ITokenboundAccountLike.Operation[] memory ops)
    {
        ISwapRouterLike.ExactInputSingleParams memory params = ISwapRouterLike.ExactInputSingleParams({
            tokenIn: p.tokenIn,
            tokenOut: p.tokenOut,
            fee: fee,
            recipient: tba, // the output always lands back in the same TBA
            deadline: deadline,
            amountIn: amountIn,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: 0
        });
        ops = new ITokenboundAccountLike.Operation[](3);
        ops[0] = _op(p.tokenIn, abi.encodeCall(IERC20Like.approve, (router, amountIn)));
        ops[1] = _op(router, abi.encodeCall(ISwapRouterLike.exactInputSingle, (params)));
        ops[2] = _op(p.tokenIn, abi.encodeCall(IERC20Like.approve, (router, 0)));
    }

    /// @dev Judges the swap by the TBA's balances, not by what the router reports.
    function _settle(address tba, Plan memory p, uint256 amountIn, uint256 minOut)
        private
        view
        returns (uint256 amountOut)
    {
        uint256 outAfter = IERC20Like(p.tokenOut).balanceOf(tba);
        if (
            IERC20Like(p.tokenIn).balanceOf(tba) + amountIn != p.balanceIn // spent exactly amountIn
                || outAfter < p.balanceOut + minOut // received at least minOut
                || IERC20Like(p.tokenIn).allowance(tba, router) != 0 // no approval left behind
        ) revert SettlementMismatch();
        amountOut = outAfter - p.balanceOut;
    }

    function _op(address to, bytes memory data) private pure returns (ITokenboundAccountLike.Operation memory) {
        return ITokenboundAccountLike.Operation({to: to, value: 0, data: data, operation: 0});
    }

    /// @dev Owner of the TBA's NFT, or address(0) if `tba` does not answer owner() like a TBA.
    function _accountOwner(address tba) private view returns (address owner_) {
        (bool ok, bytes memory ret) = tba.staticcall(abi.encodeCall(ITokenboundAccountLike.owner, ()));
        if (ok && ret.length >= 32) owner_ = abi.decode(ret, (address));
    }

    /// @dev What `account` answers to token(), the ERC-6551 account interface; ok = false if it does not.
    function _token(address account)
        private
        view
        returns (bool ok, uint256 chainId, address tokenContract, uint256 tokenId)
    {
        bytes memory ret;
        (ok, ret) = account.staticcall(abi.encodeCall(ITokenboundAccountLike.token, ()));
        if (!ok || ret.length < 96) return (false, 0, address(0), 0);
        (chainId, tokenContract, tokenId) = abi.decode(ret, (uint256, address, uint256));
    }

    function _isErc6551Account(address account) private view returns (bool) {
        (bool ok,, address tokenContract,) = _token(account);
        return ok && tokenContract != address(0);
    }

    /// @dev True if `tba` is the canonical Tokenbound account of a chogNft token on this chain.
    function _isChogAccount(address tba) private view returns (bool) {
        (bool ok, uint256 chainId, address tokenContract, uint256 tokenId) = _token(tba);
        return ok && chainId == block.chainid && tokenContract == chogNft
            && IERC6551RegistryLike(registry)
                    .account(accountImplementation, bytes32(0), chainId, tokenContract, tokenId) == tba;
    }

    /// @dev CHOG and WMON supplies are far below 2^128, so this only trips on balances no real vault can hold.
    function _u128(uint256 x) private pure returns (uint128) {
        if (x > type(uint128).max) revert TradeRejected("amount too large");
        return uint128(x);
    }
}
