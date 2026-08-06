// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {Tempo} from "../src/Tempo.sol";
import {IActionAdapter} from "../src/interfaces/IActionAdapter.sol";
import {IFtsoV2} from "../src/interfaces/IFtsoV2.sol";
import {ISwapRouter} from "../src/interfaces/ISwapRouter.sol";
import {SwapAdapter} from "../src/adapters/SwapAdapter.sol";
import {MockAdapter} from "./mocks/Mocks.sol";

/// @notice Proves the swap action against the real SparkDEX pool on Flare mainnet.
/// @dev SparkDEX has no testnet deployment — checked on Coston2 and Coston, both
///      empty — so a swap cannot be demonstrated live on the network the rest of
///      Tempo runs on. The options were to deploy a toy AMM and call it a venue,
///      or to bind the adapter to the real router interface and prove it against
///      production contracts on a fork. This is the second. Nothing here is
///      mocked: real FXRP, real USDT0, the real 0.05% pool, real liquidity.
///
///      Skipped unless FLARE_RPC_URL is set.
///
///      The staleness guard is deliberately not exercised here. A fork cannot
///      make the feed look stale — its timestamp does not move with `vm.warp`
///      and already sits inside the bound — so the guard is covered in the unit
///      suite instead, where a mock feed can be held still while time moves.
contract SwapMainnetForkTest is Test {
    bytes21 constant XRP_USD = bytes21(hex"015852502f55534400000000000000000000000000");
    uint64 constant MAX_PRICE_AGE = 300;
    uint24 constant POOL_FEE = 500;
    uint16 constant MAX_SLIPPAGE_BIPS = 200; // 2%
    uint256 constant ONE_FXRP = 1e6;

    address constant FXRP = 0xAd552A648C74D49E10027AB8a618A3ad4901c5bE;
    address constant USDT0 = 0xe7cd86e13AC4309349F30B3435a9d337750fC82D;
    address constant SWAP_ROUTER = 0x8a1E35F5c98C4E85B36B7B253222eE17773b2781;
    address constant FTSOV2 = 0x7BDE3Df0624114eDB3A67dFe6753e62f4e7c1d20;

    Tempo tempo;
    SwapAdapter swapAdapter;

    address user = makeAddr("personalAccount");
    address keeper = makeAddr("keeper");

    bool forked;

    function setUp() public {
        string memory rpc = vm.envOr("FLARE_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        forked = true;

        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 4);
        MockAdapter unused1 = new MockAdapter(IERC20(FXRP), predicted);
        MockAdapter unused2 = new MockAdapter(IERC20(FXRP), predicted);
        MockAdapter unused3 = new MockAdapter(IERC20(FXRP), predicted);
        swapAdapter = new SwapAdapter(
            IERC20(FXRP),
            IERC20(USDT0),
            ISwapRouter(SWAP_ROUTER),
            IFtsoV2(FTSOV2),
            predicted,
            XRP_USD,
            POOL_FEE,
            MAX_PRICE_AGE,
            MAX_SLIPPAGE_BIPS
        );
        tempo = new Tempo(
            IERC20(FXRP),
            IFtsoV2(FTSOV2),
            XRP_USD,
            MAX_PRICE_AGE,
            IActionAdapter(address(unused1)),
            IActionAdapter(address(unused2)),
            IActionAdapter(address(unused3)),
            IActionAdapter(address(swapAdapter))
        );
        assertEq(address(tempo), predicted);
    }

    modifier onlyForked() {
        if (!forked) vm.skip(true);
        _;
    }

    /// @dev `deal` does not work on FXRP — it is a proxy with its own supply
    ///      accounting, so a forged balance underflows inside `transferFrom`.
    ///      Take the FXRP from the pool itself, which is the largest holder and
    ///      unquestionably has a real balance.
    function _fundUser(uint256 amount) internal {
        address pool = 0x88D46717b16619B37fa2DfD2F038DEFB4459F1F7;
        if (IERC20(FXRP).balanceOf(pool) < amount) vm.skip(true);
        vm.prank(pool);
        IERC20(FXRP).transfer(user, amount);

        vm.prank(user);
        IERC20(FXRP).approve(address(tempo), type(uint256).max);
    }

    function _stopLossOrder(uint256 amount) internal returns (uint256) {
        (uint256 price,) = IFtsoV2(FTSOV2).getFeedByIdInWei(XRP_USD);
        vm.prank(user);
        return tempo.createOrder(
            Tempo.OrderParams({
                kind: Tempo.OrderKind.STOP_LOSS,
                action: Tempo.ActionKind.SWAP_TO_STABLE,
                vault: address(0),
                xrplAddress: "",
                amountPerSlice: amount,
                slices: 1,
                intervalSeconds: 0,
                // Above the live price, so the stop is already breached.
                priceTarget: price * 2,
                expiry: uint64(block.timestamp + 30 days)
            })
        );
    }

    function test_liveSwapVenueExists() public onlyForked {
        assertGt(SWAP_ROUTER.code.length, 0, "SparkDEX router should exist on mainnet");
        assertEq(ISwapRouter(SWAP_ROUTER).factory(), 0x8A2578d23d4C532cC9A98FaD91C0523f5efDE652);
    }

    /// @dev The floor must track the oracle, not the pool. If it did not, a
    ///      keeper could route the trade into a drained pool and pocket it.
    function test_minimumOutTracksTheOracle() public onlyForked {
        (uint256 price,) = IFtsoV2(FTSOV2).getFeedByIdInWei(XRP_USD);
        uint256 amount = 100 * ONE_FXRP;

        uint256 floor = swapAdapter.minimumOut(amount);
        uint256 fair = (amount * price) / 1e18;

        assertLt(floor, fair, "floor must sit below the fair value");
        assertGt(floor, (fair * 95) / 100, "floor must not be a rubber stamp");
    }

    /// @dev The headline: a stop-loss actually converts FXRP into a stablecoin,
    ///      through a real pool, with the proceeds landing on the user.
    function test_stopLossSellsIntoStable() public onlyForked {
        uint256 amount = 50 * ONE_FXRP;
        _fundUser(amount);

        uint256 id = _stopLossOrder(amount);

        (bool executable,) = tempo.previewExecutable(id);
        assertTrue(executable, "a breached stop should be ready");

        uint256 stableBefore = IERC20(USDT0).balanceOf(user);
        uint256 floor = swapAdapter.minimumOut(amount);

        vm.prank(keeper);
        tempo.execute(id);

        uint256 received = IERC20(USDT0).balanceOf(user) - stableBefore;
        assertGe(received, floor, "fill must respect the oracle floor");
        assertEq(IERC20(FXRP).balanceOf(user), 0, "the FXRP should be gone");
        assertEq(IERC20(FXRP).balanceOf(address(swapAdapter)), 0, "adapter must retain nothing");
        assertEq(IERC20(USDT0).balanceOf(address(swapAdapter)), 0, "adapter must retain nothing");
    }

}
