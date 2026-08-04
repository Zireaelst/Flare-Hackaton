// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice The slice of ERC-4626 Tempo's vault adapter depends on.
interface IERC4626Minimal {
    function asset() external view returns (address);
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
}
