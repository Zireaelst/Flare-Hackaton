// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice The Uniswap V3 router surface SparkDEX exposes on Flare.
/// @dev Deliberately the real interface rather than a convenience wrapper, so
///      the same adapter binds to SparkDEX on mainnet without a code change.
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

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);

    function factory() external view returns (address);
}
