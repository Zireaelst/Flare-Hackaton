// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {IActionAdapter} from "../interfaces/IActionAdapter.sol";
import {IAssetManager} from "../interfaces/IAssetManager.sol";

/// @notice Redeems an order's FXRP slice back to XRP on the XRP Ledger.
/// @dev Uses `redeemAmount` rather than `redeem(lots, ...)` so a slice does not
///      have to be a whole lot (10 XRP on Coston2). The FAssets redemption
///      queue still enforces `minimumRedeemAmountUBA`, which `validate`
///      surfaces at order-creation time instead of at the first execution.
///
///      Known v1 limitation: because `redeemAmount` records `msg.sender` as the
///      redeemer, this adapter is the redeemer of record. If an agent defaults
///      on the underlying payment, the default claim accrues here rather than
///      to the user. Handling that path is roadmap, not v1 — it needs an FDC
///      non-payment proof and a per-request accounting table.
contract RedeemAdapter is IActionAdapter {
    using SafeERC20 for IERC20;

    error OnlyTempo();
    error EmptyXrplAddress();
    error BelowMinimumRedeemAmount(uint256 amount, uint256 minimum);

    IERC20 public immutable fxrp;
    IAssetManager public immutable assetManager;
    address public immutable tempo;

    constructor(IERC20 _fxrp, IAssetManager _assetManager, address _tempo) {
        fxrp = _fxrp;
        assetManager = _assetManager;
        tempo = _tempo;
    }

    /// @inheritdoc IActionAdapter
    function validate(address, bytes calldata xrplAddress, uint256 amountPerSlice) external view {
        if (xrplAddress.length == 0) revert EmptyXrplAddress();
        uint256 minimum = assetManager.minimumRedeemAmountUBA();
        if (amountPerSlice < minimum) revert BelowMinimumRedeemAmount(amountPerSlice, minimum);
    }

    /// @inheritdoc IActionAdapter
    function perform(address, address, bytes calldata xrplAddress, uint256 amount) external {
        if (msg.sender != tempo) revert OnlyTempo();

        fxrp.safeTransferFrom(tempo, address(this), amount);
        assetManager.redeemAmount(amount, string(xrplAddress), payable(address(0)));
    }
}
