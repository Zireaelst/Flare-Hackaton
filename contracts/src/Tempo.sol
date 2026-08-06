// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IFtsoV2} from "./interfaces/IFtsoV2.sol";
import {IActionAdapter} from "./interfaces/IActionAdapter.sol";

/// @title Tempo — deferred and conditional execution for XRPL holders
/// @notice A Flare Smart Accounts user operation runs *once*, atomically with
///         the FXRP mint. Tempo turns that single shot into a standing order:
///         the user operation registers an order here, and execution happens
///         later, permissionlessly, when the order's trigger is satisfied.
///
/// @dev Custody model: Tempo never holds user funds between executions. An
///      order is backed by an ERC-20 allowance from the user's PersonalAccount.
///      Cancelling an order costs the user nothing and leaves their FXRP where
///      it already is. Tempo only ever moves `amountPerSlice` at the moment a
///      trigger is genuinely satisfied on-chain.
///
///      Trust model: `execute` is permissionless and the keeper supplies *no*
///      data — not the price, not the time. It only names an order id. Every
///      condition is re-derived from FTSO and `block.timestamp` inside this
///      contract, so a lying or absent keeper cannot cause a wrong execution,
///      only a late one. The adapters are immutable, so not even the deployer
///      can repoint where funds go.
contract Tempo is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Types --------------------------------------------------------------

    enum OrderKind {
        SCHEDULE, // fires every `intervalSeconds`
        TAKE_PROFIT, // fires when XRP/USD >= priceTarget
        STOP_LOSS // fires when XRP/USD <= priceTarget
    }

    /// @dev Appended to rather than reordered, so an existing deployment's
    ///      stored orders keep meaning what they meant.
    enum ActionKind {
        VAULT_DEPOSIT,
        REDEEM_TO_XRPL,
        VAULT_WITHDRAW,
        SWAP_TO_STABLE
    }

    /// @notice `amountPerSlice` sentinel meaning "whatever the balance is when this fires".
    /// @dev Exists for exits. An exit order is usually created in the same
    ///      XRPL payment as the plan it protects, before a single share has
    ///      been minted, so there is no number the user could put here. It also
    ///      sidesteps the fact that vault shares accrue yield: a figure fixed
    ///      weeks earlier would leave dust behind exactly when someone is
    ///      trying to get all the way out.
    uint256 public constant WHOLE_BALANCE = type(uint256).max;

    struct OrderParams {
        OrderKind kind;
        ActionKind action;
        address vault; // VAULT_DEPOSIT
        bytes xrplAddress; // REDEEM_TO_XRPL — the user's own XRPL address
        uint256 amountPerSlice;
        uint32 slices;
        uint64 intervalSeconds;
        uint256 priceTarget; // 18 decimals, USD
        uint64 expiry;
    }

    struct Order {
        address owner; // the PersonalAccount that created it
        OrderKind kind;
        ActionKind action;
        bool cancelled;
        address vault;
        uint256 amountPerSlice;
        uint32 slices;
        uint32 slicesExecuted;
        uint64 intervalSeconds;
        uint64 nextExecutionAt;
        uint64 expiry;
        uint256 priceTarget;
        bytes xrplAddress;
    }

    /// @notice Why an order is not executable right now.
    /// @dev Mirrors the revert reasons of `execute` so a keeper can tell
    ///      "not yet" apart from "never again" without simulating a revert.
    enum NotExecutableReason {
        NONE,
        NO_SUCH_ORDER,
        CANCELLED,
        COMPLETED,
        EXPIRED,
        TOO_EARLY,
        PRICE_NOT_REACHED,
        STALE_PRICE,
        INSUFFICIENT_ALLOWANCE,
        INSUFFICIENT_BALANCE
    }

    // --- Errors -------------------------------------------------------------

    error NoSuchOrder();
    error NotOwner();
    error OrderCancelled();
    error OrderCompleted();
    error OrderExpired();
    error TooEarly();
    error PriceNotReached();
    error StalePrice();
    error InvalidAmount();
    error InvalidSlices();
    error InvalidInterval();
    error InvalidExpiry();
    error InvalidPriceTarget();
    error InvalidVault();
    error InvalidXrplAddress();
    error NothingToMove();
    error WholeBalanceNeedsOneSlice();

    // --- Events -------------------------------------------------------------

    event OrderCreated(uint256 indexed orderId, address indexed owner, OrderKind kind, ActionKind action);
    event OrderExecuted(
        uint256 indexed orderId,
        address indexed owner,
        address indexed executor,
        uint32 slice,
        uint256 amount,
        uint256 price
    );
    event OrderCancelledEvent(uint256 indexed orderId, address indexed owner, uint32 slicesRemaining);

    // --- Immutables ---------------------------------------------------------

    IERC20 public immutable fxrp;
    IFtsoV2 public immutable ftsoV2;
    bytes21 public immutable priceFeedId;

    /// @notice Maximum age of an FTSO reading accepted by `execute`.
    /// @dev Block-latency feeds update roughly every 1.8s. A price trigger that
    ///      fired on a stale reading would move real money on data that no
    ///      longer describes the market, so a stale feed must revert rather
    ///      than execute — the order simply waits.
    uint64 public immutable maxPriceAge;

    IActionAdapter public immutable vaultDepositAdapter;
    IActionAdapter public immutable redeemAdapter;
    IActionAdapter public immutable vaultWithdrawAdapter;
    IActionAdapter public immutable swapAdapter;

    // --- Storage ------------------------------------------------------------

    Order[] private _orders;

    // --- Construction -------------------------------------------------------

    constructor(
        IERC20 _fxrp,
        IFtsoV2 _ftsoV2,
        bytes21 _priceFeedId,
        uint64 _maxPriceAge,
        IActionAdapter _vaultDepositAdapter,
        IActionAdapter _redeemAdapter,
        IActionAdapter _vaultWithdrawAdapter,
        IActionAdapter _swapAdapter
    ) {
        fxrp = _fxrp;
        ftsoV2 = _ftsoV2;
        priceFeedId = _priceFeedId;
        maxPriceAge = _maxPriceAge;
        vaultDepositAdapter = _vaultDepositAdapter;
        redeemAdapter = _redeemAdapter;
        vaultWithdrawAdapter = _vaultWithdrawAdapter;
        swapAdapter = _swapAdapter;
    }

    // --- Order lifecycle ----------------------------------------------------

    /// @notice Register a standing order. Called by a PersonalAccount from
    ///         inside `executeUserOp`, in the same transaction as the mint.
    /// @dev The caller is the owner. There is deliberately no `owner`
    ///      parameter: an order can only ever be created for the account that
    ///      creates it, so a relayer cannot register orders on someone's behalf.
    function createOrder(OrderParams calldata params) external returns (uint256 orderId) {
        if (params.amountPerSlice == 0) revert InvalidAmount();
        if (params.slices == 0) revert InvalidSlices();
        if (params.expiry <= block.timestamp) revert InvalidExpiry();

        // "Everything" cannot be sliced: the first execution would take the
        // whole balance and leave the remaining slices with nothing to move,
        // which is a confusing way to spell `slices = 1`.
        if (params.amountPerSlice == WHOLE_BALANCE && params.slices != 1) {
            revert WholeBalanceNeedsOneSlice();
        }

        // Every kind is gated by `nextExecutionAt`, so more than one slice
        // always needs a spacing — otherwise a keeper could drain all slices
        // of a price order inside a single block.
        if (params.slices > 1 && params.intervalSeconds == 0) revert InvalidInterval();
        if (params.kind == OrderKind.SCHEDULE) {
            if (params.intervalSeconds == 0) revert InvalidInterval();
        } else if (params.priceTarget == 0) {
            revert InvalidPriceTarget();
        }

        IActionAdapter adapter = _adapterFor(params.action);
        if (params.action == ActionKind.REDEEM_TO_XRPL) {
            if (params.xrplAddress.length == 0) revert InvalidXrplAddress();
        } else if (
            params.action != ActionKind.SWAP_TO_STABLE && params.vault == address(0)
        ) {
            // Both vault actions need somewhere to go. A swap does not.
            revert InvalidVault();
        }
        // Surfaces adapter-specific constraints (e.g. FAssets lot alignment)
        // now, while the user is still looking at the screen.
        adapter.validate(params.vault, params.xrplAddress, params.amountPerSlice);

        orderId = _orders.length;
        _orders.push(
            Order({
                owner: msg.sender,
                kind: params.kind,
                action: params.action,
                cancelled: false,
                vault: params.vault,
                amountPerSlice: params.amountPerSlice,
                slices: params.slices,
                slicesExecuted: 0,
                intervalSeconds: params.intervalSeconds,
                // The first slice is immediately eligible; the interval spaces
                // out the ones after it.
                nextExecutionAt: uint64(block.timestamp),
                expiry: params.expiry,
                priceTarget: params.priceTarget,
                xrplAddress: params.xrplAddress
            })
        );

        emit OrderCreated(orderId, msg.sender, params.kind, params.action);
    }

    /// @notice Execute one slice of an order. Permissionless.
    /// @dev The caller supplies nothing but `orderId`. All conditions are
    ///      re-derived here.
    function execute(uint256 orderId) external nonReentrant {
        if (orderId >= _orders.length) revert NoSuchOrder();
        Order storage order = _orders[orderId];

        if (order.cancelled) revert OrderCancelled();
        if (order.slicesExecuted >= order.slices) revert OrderCompleted();
        if (block.timestamp > order.expiry) revert OrderExpired();
        if (block.timestamp < order.nextExecutionAt) revert TooEarly();

        uint256 price = 0;
        if (order.kind != OrderKind.SCHEDULE) {
            price = _currentPrice();
            if (order.kind == OrderKind.TAKE_PROFIT) {
                if (price < order.priceTarget) revert PriceNotReached();
            } else if (price > order.priceTarget) {
                revert PriceNotReached();
            }
        }

        // Effects before interactions: the slice is consumed and the window
        // closed before any token or adapter call can re-enter.
        uint32 slice = order.slicesExecuted + 1;
        order.slicesExecuted = slice;
        order.nextExecutionAt = uint64(block.timestamp) + order.intervalSeconds;

        IActionAdapter adapter = _adapterFor(order.action);
        // Not always FXRP: a vault exit spends the user's shares.
        IERC20 token = IERC20(adapter.inputToken(order.vault));

        uint256 amount = _resolveAmount(order, token);
        if (amount == 0) revert NothingToMove();

        token.safeTransferFrom(order.owner, address(this), amount);
        token.forceApprove(address(adapter), amount);
        adapter.perform(order.owner, order.vault, order.xrplAddress, amount);
        // Adapters are trusted code, but a partial pull would otherwise leave a
        // standing allowance behind. Revoke unconditionally.
        token.forceApprove(address(adapter), 0);

        emit OrderExecuted(orderId, order.owner, msg.sender, slice, amount, price);
    }

    /// @notice Stop an order. Only the owning PersonalAccount may call this,
    ///         which in practice means a later XRPL payment from the same wallet.
    /// @dev Cancelling moves no funds. The user's FXRP has never left their
    ///      PersonalAccount, and the allowance they granted simply goes unused.
    function cancel(uint256 orderId) external {
        if (orderId >= _orders.length) revert NoSuchOrder();
        Order storage order = _orders[orderId];
        if (order.owner != msg.sender) revert NotOwner();
        if (order.cancelled) revert OrderCancelled();

        order.cancelled = true;
        emit OrderCancelledEvent(orderId, order.owner, order.slices - order.slicesExecuted);
    }

    // --- Views --------------------------------------------------------------

    function orderCount() external view returns (uint256) {
        return _orders.length;
    }

    function getOrder(uint256 orderId) external view returns (Order memory) {
        if (orderId >= _orders.length) revert NoSuchOrder();
        return _orders[orderId];
    }

    /// @notice Whether `execute(orderId)` would succeed right now, and if not, why.
    /// @dev Lets a keeper skip orders instead of burning gas on reverts, and
    ///      lets the UI say "waiting for $2.40" instead of "failed".
    function previewExecutable(uint256 orderId) public view returns (bool executable, NotExecutableReason reason) {
        if (orderId >= _orders.length) return (false, NotExecutableReason.NO_SUCH_ORDER);
        Order storage order = _orders[orderId];

        if (order.cancelled) return (false, NotExecutableReason.CANCELLED);
        if (order.slicesExecuted >= order.slices) return (false, NotExecutableReason.COMPLETED);
        if (block.timestamp > order.expiry) return (false, NotExecutableReason.EXPIRED);
        if (block.timestamp < order.nextExecutionAt) return (false, NotExecutableReason.TOO_EARLY);

        if (order.kind != OrderKind.SCHEDULE) {
            (uint256 price, uint64 timestamp) = ftsoV2.getFeedByIdInWei(priceFeedId);
            if (block.timestamp > uint256(timestamp) + maxPriceAge) {
                return (false, NotExecutableReason.STALE_PRICE);
            }
            bool reached =
                order.kind == OrderKind.TAKE_PROFIT ? price >= order.priceTarget : price <= order.priceTarget;
            if (!reached) return (false, NotExecutableReason.PRICE_NOT_REACHED);
        }

        IERC20 token = IERC20(_adapterFor(order.action).inputToken(order.vault));
        uint256 amount = _resolveAmount(order, token);

        // A whole-balance exit with nothing in the vault is not "ready" — it
        // would move zero and burn a slice.
        if (amount == 0) return (false, NotExecutableReason.INSUFFICIENT_BALANCE);
        if (token.allowance(order.owner, address(this)) < amount) {
            return (false, NotExecutableReason.INSUFFICIENT_ALLOWANCE);
        }
        if (token.balanceOf(order.owner) < amount) {
            return (false, NotExecutableReason.INSUFFICIENT_BALANCE);
        }

        return (true, NotExecutableReason.NONE);
    }

    /// @notice Paginated scan for orders that can be executed right now.
    /// @dev Deliberately a plain on-chain scan: the keeper needs no indexer, no
    ///      database, and no privileged view of the order book. Anyone can run it.
    function dueOrders(uint256 from, uint256 count) external view returns (uint256[] memory ids) {
        uint256 total = _orders.length;
        if (from >= total) return new uint256[](0);
        uint256 end = from + count;
        if (end > total) end = total;

        uint256[] memory buffer = new uint256[](end - from);
        uint256 found = 0;
        for (uint256 i = from; i < end; i++) {
            (bool executable,) = previewExecutable(i);
            if (executable) {
                buffer[found] = i;
                found++;
            }
        }

        ids = new uint256[](found);
        for (uint256 i = 0; i < found; i++) {
            ids[i] = buffer[i];
        }
    }

    // --- Internals ----------------------------------------------------------

    function _adapterFor(ActionKind action) internal view returns (IActionAdapter) {
        if (action == ActionKind.VAULT_DEPOSIT) return vaultDepositAdapter;
        if (action == ActionKind.VAULT_WITHDRAW) return vaultWithdrawAdapter;
        if (action == ActionKind.SWAP_TO_STABLE) return swapAdapter;
        return redeemAdapter;
    }

    /// @notice What an order will actually move on its next execution.
    /// @dev Resolves the `WHOLE_BALANCE` sentinel against the owner's current
    ///      balance, so callers and views agree on the number.
    function _resolveAmount(Order storage order, IERC20 token) internal view returns (uint256) {
        if (order.amountPerSlice != WHOLE_BALANCE) return order.amountPerSlice;
        return token.balanceOf(order.owner);
    }

    function _currentPrice() internal view returns (uint256) {
        (uint256 value, uint64 timestamp) = ftsoV2.getFeedByIdInWei(priceFeedId);
        if (block.timestamp > uint256(timestamp) + maxPriceAge) revert StalePrice();
        return value;
    }
}
