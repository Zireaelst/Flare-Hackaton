// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {IActionAdapter} from "../interfaces/IActionAdapter.sol";
import {IERC4626Minimal} from "../interfaces/IERC4626Minimal.sol";

/// @notice Redeems ERC-4626 vault shares back into FXRP in the user's account.
/// @dev The counterpart to `VaultDepositAdapter`, and the piece that turns a
///      price trigger into something a user actually wants. Flare's Smart
///      Accounts v1.3 lets an XRPL holder enter a vault with one signature;
///      leaving still means noticing the moment yourself and hand-sending
///      another payment. This is the exit.
///
///      The FXRP lands in the user's own account rather than being forwarded
///      to XRPL. Redemption depends on the FAssets redemption queue and an
///      agent honouring it, and an exit that is meant to fire during a market
///      drop should not also depend on the one system most likely to be
///      congested at that moment.
contract VaultWithdrawAdapter is IActionAdapter {
    using SafeERC20 for IERC20;

    error OnlyTempo();
    error UnknownVault();
    error VaultAssetMismatch();

    IERC20 public immutable fxrp;
    address public immutable tempo;

    /// @dev Fixed at construction for the same reason as the deposit adapter:
    ///      a mutable allowlist would let the deployer redirect a live order.
    mapping(address vault => bool allowed) public allowedVault;

    constructor(IERC20 _fxrp, address _tempo, address[] memory _vaults) {
        fxrp = _fxrp;
        tempo = _tempo;
        for (uint256 i = 0; i < _vaults.length; i++) {
            allowedVault[_vaults[i]] = true;
        }
    }

    /// @inheritdoc IActionAdapter
    /// @dev The shares themselves. ERC-4626 vault tokens are ERC-20, so Tempo
    ///      pulls them through the same allowance mechanism as everything else.
    function inputToken(address vault) external pure returns (address) {
        return vault;
    }

    /// @inheritdoc IActionAdapter
    function validate(address vault, bytes calldata, uint256) external view {
        if (!allowedVault[vault]) revert UnknownVault();
        if (IERC4626Minimal(vault).asset() != address(fxrp)) revert VaultAssetMismatch();
    }

    /// @inheritdoc IActionAdapter
    function perform(address beneficiary, address vault, bytes calldata, uint256 shares) external {
        if (msg.sender != tempo) revert OnlyTempo();
        if (!allowedVault[vault]) revert UnknownVault();

        IERC20(vault).safeTransferFrom(tempo, address(this), shares);
        // Assets go straight to the beneficiary; this adapter never holds them.
        IERC4626Minimal(vault).redeem(shares, beneficiary, address(this));
    }
}
