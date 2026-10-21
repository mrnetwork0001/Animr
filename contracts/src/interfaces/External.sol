// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Minimal interfaces for the contracts AnimrTradeGuard talks to. Only the functions it calls are declared.

interface IERC20Like {
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @dev Capricorn CL SwapRouter (0xdac97b6a3951641B177283028A8f428332333071) has the original Uniswap v3
///      SwapRouter ABI: ExactInputSingleParams includes `deadline` (selector 0x414bf389). The SwapRouter02
///      variant without a deadline (0x04e45aaf) is not implemented by it.
interface ISwapRouterLike {
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

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
    function factory() external view returns (address);
}

interface IUniswapV3FactoryLike {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}

interface IUniswapV3PoolLike {
    /// @dev Only the first two slot0 fields are declared. ABI decoding ignores the trailing fields, so this
    ///      also works with forks that changed their types (e.g. feeProtocol).
    function slot0() external view returns (uint160 sqrtPriceX96, int24 tick);

    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s);
}

/// @dev ERC-6551 Registry v0.3.1 (0x000000006551c19487814612e58FE06813775758).
interface IERC6551RegistryLike {
    function account(address implementation, bytes32 salt, uint256 chainId, address tokenContract, uint256 tokenId)
        external
        view
        returns (address);
}

/// @dev Tokenbound AccountV3 (v0.3.1) as seen through its AccountProxy.
interface ITokenboundAccountLike {
    struct Operation {
        address to;
        uint256 value;
        bytes data;
        uint8 operation; // 0 = CALL
    }

    function executeBatch(Operation[] calldata operations) external payable returns (bytes[] memory);
    function token() external view returns (uint256 chainId, address tokenContract, uint256 tokenId);
    function owner() external view returns (address);
    /// @dev 0x523e3260 if `signer` is the owner, the root owner, or was granted by the root owner with
    ///      setPermissions(address[], bool[]): the same rule Tokenbound applies to executors.
    function isValidSigner(address signer, bytes calldata context) external view returns (bytes4 magicValue);
    function isLocked() external view returns (bool);
}
