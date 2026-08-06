// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {IActionAdapter} from "../interfaces/IActionAdapter.sol";
import {IERC4626Minimal} from "../interfaces/IERC4626Minimal.sol";

/// @notice Deposits an order's FXRP slice into an ERC-4626 yield vault,
///         issuing the shares directly to the user's PersonalAccount.
/// @dev The adapter is a pure pass-through: it holds no shares and no dust.
///      Shares go to `beneficiary`, never to this contract, so a bug here can
///      never strand a user's position somewhere they cannot reach it.
contract VaultDepositAdapter is IActionAdapter {
    using SafeERC20 for IERC20;

    error OnlyTempo();
    error UnknownVault();
    error VaultAssetMismatch();

    IERC20 public immutable fxrp;
    address public immutable tempo;

    /// @notice Vaults an order is allowed to target.
    /// @dev Mirrors `MasterAccountController.getVaults()` at deploy time.
    ///      Fixed at construction rather than owner-mutable: a mutable
    ///      allowlist would let the deployer redirect a live standing order's
    ///      funds to a vault the user never agreed to.
    mapping(address vault => bool allowed) public allowedVault;

    constructor(IERC20 _fxrp, address _tempo, address[] memory _vaults) {
        fxrp = _fxrp;
        tempo = _tempo;
        for (uint256 i = 0; i < _vaults.length; i++) {
            allowedVault[_vaults[i]] = true;
        }
    }

    /// @inheritdoc IActionAdapter
    /// @dev Depositing spends FXRP, whatever the vault is.
    function inputToken(address) external view returns (address) {
        return address(fxrp);
    }

    /// @inheritdoc IActionAdapter
    function validate(address vault, bytes calldata, uint256) external view {
        if (!allowedVault[vault]) revert UnknownVault();
        if (IERC4626Minimal(vault).asset() != address(fxrp)) revert VaultAssetMismatch();
    }

    /// @inheritdoc IActionAdapter
    function perform(address beneficiary, address vault, bytes calldata, uint256 amount) external {
        if (msg.sender != tempo) revert OnlyTempo();
        if (!allowedVault[vault]) revert UnknownVault();

        fxrp.safeTransferFrom(tempo, address(this), amount);
        fxrp.forceApprove(vault, amount);
        IERC4626Minimal(vault).deposit(amount, beneficiary);
        fxrp.forceApprove(vault, 0);
    }
}
