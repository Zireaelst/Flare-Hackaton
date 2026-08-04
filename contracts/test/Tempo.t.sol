// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {Tempo} from "../src/Tempo.sol";
import {IActionAdapter} from "../src/interfaces/IActionAdapter.sol";
import {IFtsoV2} from "../src/interfaces/IFtsoV2.sol";
import {MockAdapter, MockFtsoV2, MockFxrp} from "./mocks/Mocks.sol";

/// @notice Covers the six invariants Tempo's safety argument rests on.
/// @dev Every test drives `execute` from an address that is *not* the order
///      owner, because that is the real threat model: execution is
///      permissionless, so correctness cannot depend on who calls.
contract TempoTest is Test {
    bytes21 constant XRP_USD = bytes21(hex"015852502f55534400000000000000000000000000");
    uint64 constant MAX_PRICE_AGE = 300;
    uint256 constant ONE_FXRP = 1e6; // FXRP is 6-decimal, like XRP drops
    bytes constant XRPL_ADDRESS = bytes("rPP5BkPmiiXGUQ7bDJYY68k9pNdTadKkDb");

    MockFxrp fxrp;
    MockFtsoV2 ftso;
    Tempo tempo;
    MockAdapter vaultAdapter;
    MockAdapter redeemAdapter;

    address user = makeAddr("personalAccount");
    address keeper = makeAddr("keeper");
    address stranger = makeAddr("stranger");
    address vault = makeAddr("vault");

    function setUp() public {
        vm.warp(1_800_000_000);

        fxrp = new MockFxrp();
        ftso = new MockFtsoV2(1.08e18, uint64(block.timestamp));

        // Tempo's adapters are immutable, and the adapters only accept calls
        // from Tempo — so the address has to be known before either exists.
        // Predicting it keeps both sides immutable with no initializer.
        address predictedTempo = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 2);
        vaultAdapter = new MockAdapter(IERC20(address(fxrp)), predictedTempo);
        redeemAdapter = new MockAdapter(IERC20(address(fxrp)), predictedTempo);
        tempo = new Tempo(
            IERC20(address(fxrp)),
            IFtsoV2(address(ftso)),
            XRP_USD,
            MAX_PRICE_AGE,
            IActionAdapter(address(vaultAdapter)),
            IActionAdapter(address(redeemAdapter))
        );
        assertEq(address(tempo), predictedTempo, "address prediction drifted");

        fxrp.mint(user, 1000 * ONE_FXRP);
        vm.prank(user);
        fxrp.approve(address(tempo), type(uint256).max);
    }

    // --- Helpers ------------------------------------------------------------

    function _scheduleParams(uint256 amount, uint32 slices, uint64 interval)
        internal
        view
        returns (Tempo.OrderParams memory)
    {
        return Tempo.OrderParams({
            kind: Tempo.OrderKind.SCHEDULE,
            action: Tempo.ActionKind.VAULT_DEPOSIT,
            vault: vault,
            xrplAddress: "",
            amountPerSlice: amount,
            slices: slices,
            intervalSeconds: interval,
            priceTarget: 0,
            expiry: uint64(block.timestamp + 365 days)
        });
    }

    function _priceParams(Tempo.OrderKind kind, uint256 target) internal view returns (Tempo.OrderParams memory) {
        return Tempo.OrderParams({
            kind: kind,
            action: Tempo.ActionKind.REDEEM_TO_XRPL,
            vault: address(0),
            xrplAddress: XRPL_ADDRESS,
            amountPerSlice: 10 * ONE_FXRP,
            slices: 1,
            intervalSeconds: 0,
            priceTarget: target,
            expiry: uint64(block.timestamp + 30 days)
        });
    }

    function _create(Tempo.OrderParams memory params) internal returns (uint256 orderId) {
        vm.prank(user);
        orderId = tempo.createOrder(params);
    }

    // --- Invariant 1: a lying keeper cannot force execution -----------------

    function test_takeProfitRevertsBelowTarget() public {
        uint256 id = _create(_priceParams(Tempo.OrderKind.TAKE_PROFIT, 2.50e18));

        ftso.set(2.49e18, uint64(block.timestamp));
        vm.prank(keeper);
        vm.expectRevert(Tempo.PriceNotReached.selector);
        tempo.execute(id);

        // The keeper supplies no price — only the feed can unblock this.
        ftso.set(2.50e18, uint64(block.timestamp));
        vm.prank(keeper);
        tempo.execute(id);
        assertEq(redeemAdapter.performCount(), 1);
    }

    function test_stopLossRevertsAboveTarget() public {
        uint256 id = _create(_priceParams(Tempo.OrderKind.STOP_LOSS, 0.80e18));

        ftso.set(0.81e18, uint64(block.timestamp));
        vm.prank(keeper);
        vm.expectRevert(Tempo.PriceNotReached.selector);
        tempo.execute(id);

        ftso.set(0.80e18, uint64(block.timestamp));
        vm.prank(keeper);
        tempo.execute(id);
        assertEq(redeemAdapter.performCount(), 1);
    }

    function test_scheduleRevertsBeforeInterval() public {
        uint256 id = _create(_scheduleParams(10 * ONE_FXRP, 3, 7 days));

        vm.prank(keeper);
        tempo.execute(id); // first slice is immediately eligible

        vm.prank(keeper);
        vm.expectRevert(Tempo.TooEarly.selector);
        tempo.execute(id);

        vm.warp(block.timestamp + 7 days);
        vm.prank(keeper);
        tempo.execute(id);
        assertEq(vaultAdapter.performCount(), 2);
    }

    // --- Invariant 2: never pull more than amountPerSlice * slices ----------

    function test_totalPulledIsCapped() public {
        uint32 slices = 4;
        uint256 amount = 10 * ONE_FXRP;
        uint256 id = _create(_scheduleParams(amount, slices, 1 days));

        for (uint256 i = 0; i < slices; i++) {
            vm.prank(keeper);
            tempo.execute(id);
            vm.warp(block.timestamp + 1 days);
        }

        assertEq(vaultAdapter.totalPulled(), amount * slices);

        // The allowance is still unlimited, but the order is spent.
        vm.prank(keeper);
        vm.expectRevert(Tempo.OrderCompleted.selector);
        tempo.execute(id);
        assertEq(vaultAdapter.totalPulled(), amount * slices, "pulled past the cap");
    }

    /// @dev The dangerous shape: many slices, no schedule to space them out.
    ///      Creation must reject it rather than let one block drain the order.
    function test_multiSliceWithoutIntervalIsRejected() public {
        Tempo.OrderParams memory params = _priceParams(Tempo.OrderKind.TAKE_PROFIT, 1.00e18);
        params.slices = 5;
        params.intervalSeconds = 0;

        vm.prank(user);
        vm.expectRevert(Tempo.InvalidInterval.selector);
        tempo.createOrder(params);
    }

    // --- Invariant 3: one execution per slice window ------------------------

    function test_cannotExecuteTwiceInSameWindow() public {
        Tempo.OrderParams memory params = _priceParams(Tempo.OrderKind.TAKE_PROFIT, 1.00e18);
        params.slices = 3;
        params.intervalSeconds = 1 hours;
        uint256 id = _create(params);

        ftso.set(2.00e18, uint64(block.timestamp));

        vm.prank(keeper);
        tempo.execute(id);

        // Trigger still satisfied, same block — must not fire again.
        vm.prank(stranger);
        vm.expectRevert(Tempo.TooEarly.selector);
        tempo.execute(id);
        assertEq(redeemAdapter.performCount(), 1);
    }

    // --- Invariant 4: after expiry, execute always reverts -------------------

    function test_expiredOrderNeverExecutes() public {
        Tempo.OrderParams memory params = _scheduleParams(10 * ONE_FXRP, 10, 1 days);
        params.expiry = uint64(block.timestamp + 3 days);
        uint256 id = _create(params);

        vm.warp(block.timestamp + 4 days);
        vm.prank(keeper);
        vm.expectRevert(Tempo.OrderExpired.selector);
        tempo.execute(id);

        // Far future — still no.
        vm.warp(block.timestamp + 3650 days);
        vm.prank(keeper);
        vm.expectRevert(Tempo.OrderExpired.selector);
        tempo.execute(id);

        assertEq(vaultAdapter.performCount(), 0);
        assertEq(fxrp.balanceOf(user), 1000 * ONE_FXRP, "expired order must not move funds");
    }

    // --- Invariant 5: only the owner may cancel ------------------------------

    function test_onlyOwnerCancels() public {
        uint256 id = _create(_scheduleParams(10 * ONE_FXRP, 5, 1 days));

        vm.prank(stranger);
        vm.expectRevert(Tempo.NotOwner.selector);
        tempo.cancel(id);

        vm.prank(keeper);
        vm.expectRevert(Tempo.NotOwner.selector);
        tempo.cancel(id);

        vm.prank(user);
        tempo.cancel(id);

        vm.prank(keeper);
        vm.expectRevert(Tempo.OrderCancelled.selector);
        tempo.execute(id);
    }

    function test_cancelMovesNoFunds() public {
        uint256 id = _create(_scheduleParams(10 * ONE_FXRP, 5, 1 days));
        uint256 balanceBefore = fxrp.balanceOf(user);

        vm.prank(user);
        tempo.cancel(id);

        assertEq(fxrp.balanceOf(user), balanceBefore);
        assertEq(fxrp.balanceOf(address(tempo)), 0);
    }

    // --- Invariant 6: a stale feed reverts rather than executing --------------

    function test_stalePriceReverts() public {
        uint256 id = _create(_priceParams(Tempo.OrderKind.TAKE_PROFIT, 1.00e18));

        // Price satisfies the trigger, but the reading is older than the bound.
        ftso.set(2.00e18, uint64(block.timestamp - MAX_PRICE_AGE - 1));
        vm.prank(keeper);
        vm.expectRevert(Tempo.StalePrice.selector);
        tempo.execute(id);

        (bool executable, Tempo.NotExecutableReason reason) = tempo.previewExecutable(id);
        assertFalse(executable);
        assertEq(uint256(reason), uint256(Tempo.NotExecutableReason.STALE_PRICE));

        // A fresh reading of the same price does execute.
        ftso.set(2.00e18, uint64(block.timestamp));
        vm.prank(keeper);
        tempo.execute(id);
        assertEq(redeemAdapter.performCount(), 1);
    }

    /// @dev A schedule order carries no price condition, so a dead feed must
    ///      not be able to stall it.
    function test_scheduleUnaffectedByStaleFeed() public {
        uint256 id = _create(_scheduleParams(10 * ONE_FXRP, 2, 1 days));
        ftso.set(0, uint64(block.timestamp - 10 days));

        vm.prank(keeper);
        tempo.execute(id);
        assertEq(vaultAdapter.performCount(), 1);
    }

    // --- Keeper surface ------------------------------------------------------

    function test_dueOrdersFindsOnlyExecutableOrders() public {
        uint256 ready = _create(_scheduleParams(10 * ONE_FXRP, 2, 1 days));

        Tempo.OrderParams memory future = _scheduleParams(10 * ONE_FXRP, 2, 1 days);
        uint256 notReady = _create(future);
        vm.prank(keeper);
        tempo.execute(notReady); // consumes its first window

        uint256 unreachable = _create(_priceParams(Tempo.OrderKind.TAKE_PROFIT, 99e18));

        uint256[] memory ids = tempo.dueOrders(0, 10);
        assertEq(ids.length, 1);
        assertEq(ids[0], ready);

        (, Tempo.NotExecutableReason reason) = tempo.previewExecutable(unreachable);
        assertEq(uint256(reason), uint256(Tempo.NotExecutableReason.PRICE_NOT_REACHED));
    }

    function test_previewReportsMissingAllowance() public {
        uint256 id = _create(_scheduleParams(10 * ONE_FXRP, 2, 1 days));

        vm.prank(user);
        fxrp.approve(address(tempo), 0);

        (bool executable, Tempo.NotExecutableReason reason) = tempo.previewExecutable(id);
        assertFalse(executable);
        assertEq(uint256(reason), uint256(Tempo.NotExecutableReason.INSUFFICIENT_ALLOWANCE));
    }

    function test_orderDispatchesToBeneficiaryNotKeeper() public {
        uint256 id = _create(_priceParams(Tempo.OrderKind.TAKE_PROFIT, 1.00e18));
        ftso.set(2.00e18, uint64(block.timestamp));

        vm.prank(keeper);
        tempo.execute(id);

        assertEq(redeemAdapter.lastBeneficiary(), user, "proceeds must follow the owner, not the caller");
        assertEq(redeemAdapter.lastXrplAddress(), XRPL_ADDRESS);
    }

    function test_tempoRetainsNoFxrp() public {
        uint256 id = _create(_scheduleParams(10 * ONE_FXRP, 2, 1 days));
        vm.prank(keeper);
        tempo.execute(id);

        assertEq(fxrp.balanceOf(address(tempo)), 0, "Tempo must never hold a balance between executions");
        assertEq(fxrp.allowance(address(tempo), address(vaultAdapter)), 0, "adapter allowance must be revoked");
    }

    // --- Creation validation -------------------------------------------------

    function test_createOrderRejectsBadParams() public {
        vm.startPrank(user);

        Tempo.OrderParams memory p = _scheduleParams(0, 1, 1 days);
        vm.expectRevert(Tempo.InvalidAmount.selector);
        tempo.createOrder(p);

        p = _scheduleParams(10 * ONE_FXRP, 0, 1 days);
        vm.expectRevert(Tempo.InvalidSlices.selector);
        tempo.createOrder(p);

        p = _scheduleParams(10 * ONE_FXRP, 1, 0);
        vm.expectRevert(Tempo.InvalidInterval.selector);
        tempo.createOrder(p);

        p = _scheduleParams(10 * ONE_FXRP, 1, 1 days);
        p.expiry = uint64(block.timestamp);
        vm.expectRevert(Tempo.InvalidExpiry.selector);
        tempo.createOrder(p);

        p = _priceParams(Tempo.OrderKind.TAKE_PROFIT, 0);
        vm.expectRevert(Tempo.InvalidPriceTarget.selector);
        tempo.createOrder(p);

        p = _scheduleParams(10 * ONE_FXRP, 1, 1 days);
        p.vault = address(0);
        vm.expectRevert(Tempo.InvalidVault.selector);
        tempo.createOrder(p);

        vm.stopPrank();
    }

    /// @dev Adapter-specific limits (FAssets lot minimums, vault asset
    ///      mismatch) must surface at creation, not weeks later mid-schedule.
    function test_adapterValidationRunsAtCreation() public {
        vaultAdapter.setValidateReverts(true);

        vm.prank(user);
        vm.expectRevert(MockAdapter.ValidationRejected.selector);
        tempo.createOrder(_scheduleParams(10 * ONE_FXRP, 1, 1 days));
    }
}
