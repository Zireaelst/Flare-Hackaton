// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "openzeppelin-contracts/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {IActionAdapter} from "../interfaces/IActionAdapter.sol";
import {ISwapRouter} from "../interfaces/ISwapRouter.sol";
import {IFtsoV2} from "../interfaces/IFtsoV2.sol";

/// @notice Sells FXRP for a stablecoin through SparkDEX.
/// @dev This is what makes a price trigger mean what its name says. Without it
///      a "stop loss" could only move FXRP back to XRP on the XRP Ledger —
///      the same asset, the same exposure, the same loss. Converting to a
///      stablecoin is the difference between relocating a position and
///      actually closing one.
///
///      Bounds come from FTSO, not from the caller. The keeper supplies no
///      price anywhere in Tempo, and it must not gain that power here by the
///      back door: a minimum output chosen by whoever triggers the swap would
///      let them hand the trade to a sandwich. The oracle that decided the
///      order should fire also decides what a fair fill looks like.
contract SwapAdapter is IActionAdapter {
    using SafeERC20 for IERC20;

    error OnlyTempo();
    error StalePrice();
    error AmountTooSmall();
    error SwapVenueUnavailable();

    IERC20 public immutable fxrp;
    IERC20 public immutable stable;
    ISwapRouter public immutable router;
    IFtsoV2 public immutable ftsoV2;
    address public immutable tempo;

    bytes21 public immutable priceFeedId;
    uint24 public immutable poolFee;
    uint64 public immutable maxPriceAge;

    /// @notice How far below the oracle-implied output a fill may land.
    /// @dev Covers the pool fee plus honest price impact. Too tight and every
    ///      swap reverts; too loose and the protection is decorative.
    uint16 public immutable maxSlippageBips;

    uint8 private immutable _fxrpDecimals;
    uint8 private immutable _stableDecimals;

    constructor(
        IERC20 _fxrp,
        IERC20 _stable,
        ISwapRouter _router,
        IFtsoV2 _ftsoV2,
        address _tempo,
        bytes21 _priceFeedId,
        uint24 _poolFee,
        uint64 _maxPriceAge,
        uint16 _maxSlippageBips
    ) {
        fxrp = _fxrp;
        stable = _stable;
        router = _router;
        ftsoV2 = _ftsoV2;
        tempo = _tempo;
        priceFeedId = _priceFeedId;
        poolFee = _poolFee;
        maxPriceAge = _maxPriceAge;
        maxSlippageBips = _maxSlippageBips;
        _fxrpDecimals = IERC20Metadata(address(_fxrp)).decimals();
        _stableDecimals = IERC20Metadata(address(_stable)).decimals();
    }

    /// @inheritdoc IActionAdapter
    function inputToken(address) external view returns (address) {
        return address(fxrp);
    }

    /// @inheritdoc IActionAdapter
    function validate(address, bytes calldata, uint256 amountPerSlice) external view {
        // SparkDEX is deployed on Flare mainnet only. Saying so when the order
        // is written beats accepting it and failing weeks later at the moment
        // the user was relying on it most.
        if (address(router).code.length == 0) revert SwapVenueUnavailable();

        // A slice small enough to round to nothing would swap for zero and
        // silently burn the user's turn.
        if (minimumOut(amountPerSlice) == 0) revert AmountTooSmall();
    }

    /// @notice The least this adapter will accept for `amountIn`, from FTSO.
    /// @dev Public so a UI can show the floor before the user commits, and so
    ///      the bound is auditable rather than buried in the swap call.
    function minimumOut(uint256 amountIn) public view returns (uint256) {
        (uint256 price, uint64 timestamp) = ftsoV2.getFeedByIdInWei(priceFeedId);
        if (block.timestamp > uint256(timestamp) + maxPriceAge) revert StalePrice();

        // price is USD per FXRP scaled to 1e18.
        uint256 expected = (amountIn * price) / 1e18;
        if (_stableDecimals > _fxrpDecimals) {
            expected *= 10 ** (_stableDecimals - _fxrpDecimals);
        } else if (_fxrpDecimals > _stableDecimals) {
            expected /= 10 ** (_fxrpDecimals - _stableDecimals);
        }

        return (expected * (10_000 - maxSlippageBips)) / 10_000;
    }

    /// @inheritdoc IActionAdapter
    function perform(address beneficiary, address, bytes calldata, uint256 amount) external {
        if (msg.sender != tempo) revert OnlyTempo();

        uint256 floor = minimumOut(amount);
        if (floor == 0) revert AmountTooSmall();

        fxrp.safeTransferFrom(tempo, address(this), amount);
        fxrp.forceApprove(address(router), amount);

        router.exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: address(fxrp),
                tokenOut: address(stable),
                fee: poolFee,
                // Proceeds go straight to the user; this adapter never custodies them.
                recipient: beneficiary,
                // Same transaction, so a deadline beyond now adds nothing.
                deadline: block.timestamp,
                amountIn: amount,
                amountOutMinimum: floor,
                sqrtPriceLimitX96: 0
            })
        );

        fxrp.forceApprove(address(router), 0);
    }
}
