// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice The slice of ERC-4626 Tempo's vault adapters depend on.
interface IERC4626Minimal {
    function asset() external view returns (address);
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
}
