// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Minimal subset of the FAssets `AssetManager` used by Tempo.
interface IAssetManager {
    /// @notice Redeem an arbitrary UBA amount of FAsset back to the underlying chain.
    /// @dev Preferred over `redeem(lots, ...)`: it accepts non-lot-aligned
    ///      amounts and settles the remainder itself, so a DCA slice does not
    ///      have to be a whole 10 XRP lot.
    /// @param _amountUBA Amount in underlying base units (drops for XRP).
    /// @param _redeemerUnderlyingAddressString Destination XRPL address.
    /// @param _executor Optional executor; zero address for none.
    function redeemAmount(
        uint256 _amountUBA,
        string memory _redeemerUnderlyingAddressString,
        address payable _executor
    ) external payable returns (uint256 _redeemedAmountUBA);

    /// @notice Smallest amount the redemption queue will accept.
    function minimumRedeemAmountUBA() external view returns (uint256);
}
