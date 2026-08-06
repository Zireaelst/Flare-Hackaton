// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice What an order actually *does* once its trigger fires.
/// @dev Tempo owns triggering; adapters own doing. Tempo approves the adapter
///      for exactly `amount` immediately before `perform` and revokes right
///      after, so an adapter never holds a standing allowance.
interface IActionAdapter {
    /// @notice The token Tempo must pull from the user for this action.
    /// @dev Not always FXRP. Exiting a vault spends the user's *shares*, so the
    ///      adapter is the only thing that knows what an order actually
    ///      consumes. Asking it keeps Tempo from hardcoding an assumption that
    ///      is only true for half the actions.
    function inputToken(address vault) external view returns (address);

    /// @notice Reverts if these parameters could never be executed by this adapter.
    /// @dev Called once at order creation so users learn about e.g. lot
    ///      misalignment when they create the order, not weeks later when the
    ///      first slice silently reverts.
    function validate(address vault, bytes calldata xrplAddress, uint256 amountPerSlice) external view;

    /// @notice Pull `amount` of `inputToken` from the caller and perform the action for `beneficiary`.
    function perform(address beneficiary, address vault, bytes calldata xrplAddress, uint256 amount) external;
}
