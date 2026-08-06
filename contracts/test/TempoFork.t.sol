// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {Tempo} from "../src/Tempo.sol";
import {IActionAdapter} from "../src/interfaces/IActionAdapter.sol";
import {IAssetManager} from "../src/interfaces/IAssetManager.sol";
import {IERC4626Minimal} from "../src/interfaces/IERC4626Minimal.sol";
import {IFtsoV2} from "../src/interfaces/IFtsoV2.sol";
import {RedeemAdapter} from "../src/adapters/RedeemAdapter.sol";
import {VaultDepositAdapter} from "../src/adapters/VaultDepositAdapter.sol";
import {VaultWithdrawAdapter} from "../src/adapters/VaultWithdrawAdapter.sol";
import {MockAdapter} from "./mocks/Mocks.sol";

/// @notice Exercises Tempo against the real Coston2 FTSO, FXRP and vaults.
/// @dev The unit suite proves the logic; this proves the integration — that the
///      feed id is right, the reading is fresh enough for a 300s bound, the
///      vault really is ERC-4626 over FXRP, and a full DCA slice lands.
///
///      Skipped unless COSTON2_RPC_URL is set, so `forge test` stays offline
///      and fast by default.
contract TempoForkTest is Test {
    bytes21 constant XRP_USD = bytes21(hex"015852502f55534400000000000000000000000000");
    uint64 constant MAX_PRICE_AGE = 300;
    uint256 constant ONE_FXRP = 1e6;

    address constant FXRP = 0x0b6A3645c240605887a5532109323A3E12273dc7;
    address constant FTSOV2 = 0xC4e9c78EA53db782E28f28Fdf80BaF59336B304d;
    address constant ASSET_MANAGER = 0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA;
    /// @dev TESTstXRP — one of the four vaults registered on MasterAccountController.
    address constant VAULT = 0xD91324A6e8884147F6425E9ddd60e11Aea060B5b;

    /// @dev A real PersonalAccount holding real FXRP, minted by the Day 0 gate.
    ///      `deal` cannot be used here: FXRP is a proxy that keeps supply
    ///      accounting of its own, so a forged balance underflows inside
    ///      `transferFrom`. Impersonating a genuine holder is the only way to
    ///      move real FXRP on a fork.
    address constant PERSONAL_ACCOUNT = 0xbbE8ACB8B3e9754Cd1f3961792183330cc1A458F;

    Tempo tempo;
    VaultDepositAdapter vaultDepositAdapter;
    RedeemAdapter redeemAdapter;
    VaultWithdrawAdapter vaultWithdrawAdapter;
    MockAdapter swapAdapter;

    address user = PERSONAL_ACCOUNT;
    address keeper = makeAddr("keeper");

    bool forked;

    function setUp() public {
        string memory rpc = vm.envOr("COSTON2_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        forked = true;

        address[] memory vaults = new address[](1);
        vaults[0] = VAULT;

        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 4);
        vaultDepositAdapter = new VaultDepositAdapter(IERC20(FXRP), predicted, vaults);
        redeemAdapter = new RedeemAdapter(IERC20(FXRP), IAssetManager(ASSET_MANAGER), predicted);
        vaultWithdrawAdapter = new VaultWithdrawAdapter(IERC20(FXRP), predicted, vaults);
        // SparkDEX has no Coston2 deployment, so the swap slot is filled but unused here.
        swapAdapter = new MockAdapter(IERC20(FXRP), predicted);
        tempo = new Tempo(
            IERC20(FXRP),
            IFtsoV2(FTSOV2),
            XRP_USD,
            MAX_PRICE_AGE,
            IActionAdapter(address(vaultDepositAdapter)),
            IActionAdapter(address(redeemAdapter)),
            IActionAdapter(address(vaultWithdrawAdapter)),
            IActionAdapter(address(swapAdapter))
        );
        assertEq(address(tempo), predicted);
    }

    /// @dev Reports as skipped, not passed. A green tick on a test that never
    ///      touched the chain is worse than no test at all.
    modifier onlyForked() {
        if (!forked) vm.skip(true);
        _;
    }

    /// @dev The whole take-profit product depends on this feed being fresher
    ///      than the contract's staleness bound. If block-latency updates ever
    ///      lag past 300s, price orders silently stop firing.
    function test_liveFeedIsFreshAndSane() public onlyForked {
        (uint256 price, uint64 timestamp) = IFtsoV2(FTSOV2).getFeedByIdInWei(XRP_USD);

        assertGt(price, 0.01e18, "XRP/USD implausibly low - wrong feed id?");
        assertLt(price, 100e18, "XRP/USD implausibly high - wrong scaling?");
        assertLe(block.timestamp - timestamp, MAX_PRICE_AGE, "feed is staler than Tempo's bound");
    }

    function test_liveVaultIsErc4626OverFxrp() public onlyForked {
        assertEq(IERC4626Minimal(VAULT).asset(), FXRP);
    }

    /// @dev Reads the FAssets minimum from the live AssetManager rather than
    ///      asserting a constant, since it is a settable setting.
    function test_redeemAdapterRejectsBelowLiveMinimum() public onlyForked {
        uint256 minimum = IAssetManager(ASSET_MANAGER).minimumRedeemAmountUBA();
        assertGt(minimum, 0);

        vm.expectRevert(
            abi.encodeWithSelector(RedeemAdapter.BelowMinimumRedeemAmount.selector, minimum - 1, minimum)
        );
        redeemAdapter.validate(address(0), bytes("rPP5BkPmiiXGUQ7bDJYY68k9pNdTadKkDb"), minimum - 1);
    }

    /// @dev The end-to-end shape of the demo: a DCA slice deposits real FXRP
    ///      into a real vault and the shares land on the user, not on Tempo.
    function test_scheduleSliceDepositsIntoLiveVault() public onlyForked {
        uint256 slice = 5 * ONE_FXRP;
        _requireFxrp(2 * slice);
        _approveTempo();

        vm.prank(user);
        uint256 id = tempo.createOrder(
            Tempo.OrderParams({
                kind: Tempo.OrderKind.SCHEDULE,
                action: Tempo.ActionKind.VAULT_DEPOSIT,
                vault: VAULT,
                xrplAddress: "",
                amountPerSlice: slice,
                slices: 2,
                intervalSeconds: 7 days,
                priceTarget: 0,
                expiry: uint64(block.timestamp + 90 days)
            })
        );

        (bool executable,) = tempo.previewExecutable(id);
        assertTrue(executable, "first slice should be immediately due");

        uint256 sharesBefore = IERC20(VAULT).balanceOf(user);
        uint256 fxrpBefore = IERC20(FXRP).balanceOf(user);

        vm.prank(keeper);
        tempo.execute(id);

        assertGt(IERC20(VAULT).balanceOf(user), sharesBefore, "vault shares must go to the user");
        assertEq(IERC20(FXRP).balanceOf(user), fxrpBefore - slice, "exactly one slice should leave the account");
        assertEq(IERC20(FXRP).balanceOf(address(tempo)), 0, "Tempo must retain nothing");
        assertEq(IERC20(FXRP).balanceOf(address(vaultDepositAdapter)), 0, "adapter must retain nothing");
    }

    /// @dev A take-profit target below the live price must be executable, and
    ///      one above it must not. This is the real-feed version of the
    ///      trigger tests in the unit suite.
    function test_liveTakeProfitTriggerBothWays() public onlyForked {
        (uint256 price,) = IFtsoV2(FTSOV2).getFeedByIdInWei(XRP_USD);

        _requireFxrp(5 * ONE_FXRP);
        _approveTempo();

        uint256 reachable = _takeProfit(price / 2);
        uint256 unreachable = _takeProfit(price * 2);

        (bool ok,) = tempo.previewExecutable(reachable);
        assertTrue(ok, "target below live price should fire");

        (bool notOk, Tempo.NotExecutableReason reason) = tempo.previewExecutable(unreachable);
        assertFalse(notOk);
        assertEq(uint256(reason), uint256(Tempo.NotExecutableReason.PRICE_NOT_REACHED));

        vm.prank(keeper);
        vm.expectRevert(Tempo.PriceNotReached.selector);
        tempo.execute(unreachable);
    }

    /// @dev Skips rather than fails if the account has been drained by a demo
    ///      run. A red suite should mean Tempo is broken, not that someone
    ///      spent the testnet FXRP.
    function _requireFxrp(uint256 needed) internal {
        uint256 balance = IERC20(FXRP).balanceOf(PERSONAL_ACCOUNT);
        if (balance < needed) {
            emit log_named_uint("SKIP - PersonalAccount FXRP balance", balance);
            emit log_named_uint("SKIP - needed", needed);
            vm.skip(true);
        }
    }

    function _approveTempo() internal {
        vm.prank(user);
        IERC20(FXRP).approve(address(tempo), type(uint256).max);
    }

    function _takeProfit(uint256 target) internal returns (uint256 id) {
        vm.prank(user);
        id = tempo.createOrder(
            Tempo.OrderParams({
                kind: Tempo.OrderKind.TAKE_PROFIT,
                action: Tempo.ActionKind.VAULT_DEPOSIT,
                vault: VAULT,
                xrplAddress: "",
                amountPerSlice: 10 * ONE_FXRP,
                slices: 1,
                intervalSeconds: 0,
                priceTarget: target,
                expiry: uint64(block.timestamp + 30 days)
            })
        );
    }
}
