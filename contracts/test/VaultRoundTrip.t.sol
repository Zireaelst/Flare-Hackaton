// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {Tempo} from "../src/Tempo.sol";
import {IActionAdapter} from "../src/interfaces/IActionAdapter.sol";
import {IFtsoV2} from "../src/interfaces/IFtsoV2.sol";
import {VaultDepositAdapter} from "../src/adapters/VaultDepositAdapter.sol";
import {VaultWithdrawAdapter} from "../src/adapters/VaultWithdrawAdapter.sol";
import {MockAdapter, MockFtsoV2, MockFxrp, MockVault} from "./mocks/Mocks.sol";

/// @notice The round trip: schedule money into a vault, get it out on a price.
/// @dev Uses the real deposit and withdraw adapters against a real ERC-4626,
///      because the thing worth proving here is that Tempo pulls *shares* on an
///      exit and *assets* on a deposit. A mock adapter would happily accept
///      either and prove nothing.
contract VaultRoundTripTest is Test {
    bytes21 constant XRP_USD = bytes21(hex"015852502f55534400000000000000000000000000");
    uint64 constant MAX_PRICE_AGE = 300;
    uint256 constant ONE_FXRP = 1e6;
    /// @dev Mirrors `Tempo.WHOLE_BALANCE`. Held locally because reading it off
    ///      the contract inside an argument list is an external call, and
    ///      `vm.expectRevert` would arm against that call rather than the one
    ///      under test.
    uint256 constant WHOLE_BALANCE = type(uint256).max;

    MockFxrp fxrp;
    MockVault vault;
    MockFtsoV2 ftso;
    Tempo tempo;
    VaultDepositAdapter depositAdapter;
    VaultWithdrawAdapter withdrawAdapter;
    MockAdapter redeemAdapter;
    MockAdapter swapAdapter;

    address user = makeAddr("personalAccount");
    address keeper = makeAddr("keeper");

    function setUp() public {
        vm.warp(1_800_000_000);

        fxrp = new MockFxrp();
        vault = new MockVault(IERC20(address(fxrp)));
        ftso = new MockFtsoV2(1.08e18, uint64(block.timestamp));

        address[] memory vaults = new address[](1);
        vaults[0] = address(vault);

        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 4);
        depositAdapter = new VaultDepositAdapter(IERC20(address(fxrp)), predicted, vaults);
        redeemAdapter = new MockAdapter(IERC20(address(fxrp)), predicted);
        withdrawAdapter = new VaultWithdrawAdapter(IERC20(address(fxrp)), predicted, vaults);
        swapAdapter = new MockAdapter(IERC20(address(fxrp)), predicted);
        tempo = new Tempo(
            IERC20(address(fxrp)),
            IFtsoV2(address(ftso)),
            XRP_USD,
            MAX_PRICE_AGE,
            IActionAdapter(address(depositAdapter)),
            IActionAdapter(address(redeemAdapter)),
            IActionAdapter(address(withdrawAdapter)),
            IActionAdapter(address(swapAdapter))
        );
        assertEq(address(tempo), predicted);

        fxrp.mint(user, 100 * ONE_FXRP);

        // What one XRPL payment would authorize: Tempo may spend FXRP to enter
        // and shares to leave.
        vm.startPrank(user);
        fxrp.approve(address(tempo), type(uint256).max);
        vault.approve(address(tempo), type(uint256).max);
        vm.stopPrank();
    }

    function _deposit(uint256 amount, uint32 slices, uint64 interval) internal returns (uint256) {
        vm.prank(user);
        return tempo.createOrder(
            Tempo.OrderParams({
                kind: Tempo.OrderKind.SCHEDULE,
                action: Tempo.ActionKind.VAULT_DEPOSIT,
                vault: address(vault),
                xrplAddress: "",
                amountPerSlice: amount,
                slices: slices,
                intervalSeconds: interval,
                priceTarget: 0,
                expiry: uint64(block.timestamp + 365 days)
            })
        );
    }

    function _exitBelow(uint256 target, uint256 amount) internal returns (uint256) {
        vm.prank(user);
        return tempo.createOrder(
            Tempo.OrderParams({
                kind: Tempo.OrderKind.STOP_LOSS,
                action: Tempo.ActionKind.VAULT_WITHDRAW,
                vault: address(vault),
                xrplAddress: "",
                amountPerSlice: amount,
                slices: 1,
                intervalSeconds: 0,
                priceTarget: target,
                expiry: uint64(block.timestamp + 365 days)
            })
        );
    }

    /// @dev An exit spends shares. If Tempo still assumed FXRP it would pull
    ///      the wrong token and the user's vault position would sit untouched.
    function test_exitPullsSharesNotAssets() public {
        uint256 id = _deposit(10 * ONE_FXRP, 1, 1 days);
        vm.prank(keeper);
        tempo.execute(id);

        assertEq(vault.balanceOf(user), 10 * ONE_FXRP, "shares should be with the user");
        uint256 fxrpAfterDeposit = fxrp.balanceOf(user);

        uint256 exitId = _exitBelow(0.90e18, 10 * ONE_FXRP);
        ftso.set(0.89e18, uint64(block.timestamp));

        vm.prank(keeper);
        tempo.execute(exitId);

        assertEq(vault.balanceOf(user), 0, "shares should be burned");
        assertEq(fxrp.balanceOf(user), fxrpAfterDeposit + 10 * ONE_FXRP, "assets should come back to the user");
        assertEq(fxrp.balanceOf(address(withdrawAdapter)), 0, "adapter must retain nothing");
        assertEq(vault.balanceOf(address(tempo)), 0, "Tempo must retain no shares");
    }

    /// @dev The demo that justifies the sentinel: one payment sets up the plan
    ///      *and* its exit, before a single share exists to count.
    function test_planAndExitFromOnePayment() public {
        uint256 planId = _deposit(5 * ONE_FXRP, 3, 1 days);
        uint256 exitId = _exitBelow(0.90e18, WHOLE_BALANCE);

        // Price is still above the floor, so that is what the user is told.
        (bool ready, Tempo.NotExecutableReason reason) = tempo.previewExecutable(exitId);
        assertFalse(ready);
        assertEq(uint256(reason), uint256(Tempo.NotExecutableReason.PRICE_NOT_REACHED));

        // Break the floor with nothing deposited: now the honest answer is
        // that there is nothing to take.
        ftso.set(0.89e18, uint64(block.timestamp));
        (ready, reason) = tempo.previewExecutable(exitId);
        assertFalse(ready);
        assertEq(uint256(reason), uint256(Tempo.NotExecutableReason.INSUFFICIENT_BALANCE));
        ftso.set(1.08e18, uint64(block.timestamp));

        for (uint256 i = 0; i < 3; i++) {
            vm.prank(keeper);
            tempo.execute(planId);
            vm.warp(block.timestamp + 1 days);
        }
        assertEq(vault.balanceOf(user), 15 * ONE_FXRP);

        // Price breaks the floor; the exit takes everything accumulated,
        // including slices that did not exist when the order was written.
        ftso.set(0.89e18, uint64(block.timestamp));
        vm.prank(keeper);
        tempo.execute(exitId);

        assertEq(vault.balanceOf(user), 0, "the whole position should be gone");
        assertEq(fxrp.balanceOf(user), 100 * ONE_FXRP, "the user should be whole again");
    }

    /// @dev Shares accrue yield, so an exit written weeks earlier with a fixed
    ///      number would leave the profit stranded in the vault.
    function test_wholeBalanceCapturesYield() public {
        uint256 id = _deposit(10 * ONE_FXRP, 1, 1 days);
        vm.prank(keeper);
        tempo.execute(id);

        // Someone else's yield lands on the user's share balance.
        fxrp.mint(address(this), 4 * ONE_FXRP);
        fxrp.approve(address(vault), 4 * ONE_FXRP);
        vault.deposit(4 * ONE_FXRP, user);
        assertEq(vault.balanceOf(user), 14 * ONE_FXRP);

        uint256 exitId = _exitBelow(0.90e18, WHOLE_BALANCE);
        ftso.set(0.89e18, uint64(block.timestamp));
        vm.prank(keeper);
        tempo.execute(exitId);

        assertEq(vault.balanceOf(user), 0, "a fixed amount would have left dust behind");
    }

    function test_wholeBalanceRejectsMultipleSlices() public {
        vm.prank(user);
        vm.expectRevert(Tempo.WholeBalanceNeedsOneSlice.selector);
        tempo.createOrder(
            Tempo.OrderParams({
                kind: Tempo.OrderKind.STOP_LOSS,
                action: Tempo.ActionKind.VAULT_WITHDRAW,
                vault: address(vault),
                xrplAddress: "",
                amountPerSlice: WHOLE_BALANCE,
                slices: 3,
                intervalSeconds: 1 days,
                priceTarget: 0.90e18,
                expiry: uint64(block.timestamp + 365 days)
            })
        );
    }

    /// @dev An exit that fires with an empty vault must revert rather than burn
    ///      its only slice on a no-op.
    function test_emptyExitRevertsRatherThanConsumingTheSlice() public {
        uint256 exitId = _exitBelow(0.90e18, WHOLE_BALANCE);
        ftso.set(0.89e18, uint64(block.timestamp));

        vm.prank(keeper);
        vm.expectRevert(Tempo.NothingToMove.selector);
        tempo.execute(exitId);

        // Still armed: once there is a position, it works.
        uint256 planId = _deposit(10 * ONE_FXRP, 1, 1 days);
        vm.prank(keeper);
        tempo.execute(planId);

        vm.prank(keeper);
        tempo.execute(exitId);
        assertEq(vault.balanceOf(user), 0);
    }

    /// @dev The withdraw adapter must refuse vaults outside its allowlist, the
    ///      same as the deposit side.
    function test_withdrawRejectsUnknownVault() public {
        MockVault rogue = new MockVault(IERC20(address(fxrp)));

        vm.prank(user);
        vm.expectRevert(VaultWithdrawAdapter.UnknownVault.selector);
        tempo.createOrder(
            Tempo.OrderParams({
                kind: Tempo.OrderKind.STOP_LOSS,
                action: Tempo.ActionKind.VAULT_WITHDRAW,
                vault: address(rogue),
                xrplAddress: "",
                amountPerSlice: ONE_FXRP,
                slices: 1,
                intervalSeconds: 0,
                priceTarget: 0.90e18,
                expiry: uint64(block.timestamp + 365 days)
            })
        );
    }
}
