// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {IFtsoV2} from "../../src/interfaces/IFtsoV2.sol";
import {IActionAdapter} from "../../src/interfaces/IActionAdapter.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev FXRP is 6-decimal: 1 FXRP = 1e6 UBA (drops), matching XRP.
contract MockFxrp is ERC20 {
    constructor() ERC20("Mock FXRP", "FXRP") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Lets tests drive both the price and its freshness independently.
contract MockFtsoV2 is IFtsoV2 {
    uint256 public value;
    uint64 public timestamp;

    constructor(uint256 _value, uint64 _timestamp) {
        value = _value;
        timestamp = _timestamp;
    }

    function set(uint256 _value, uint64 _timestamp) external {
        value = _value;
        timestamp = _timestamp;
    }

    function getFeedByIdInWei(bytes21) external view returns (uint256, uint64) {
        return (value, timestamp);
    }
}

/// @dev Records what Tempo asked it to do, so tests can assert on dispatch
///      without standing up a real vault or AssetManager.
contract MockAdapter is IActionAdapter {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    address public immutable tempo;

    uint256 public performCount;
    uint256 public totalPulled;
    address public lastBeneficiary;
    bytes public lastXrplAddress;

    bool public validateReverts;
    /// @dev Basis points of the offered amount this adapter actually consumes.
    ///      Anything below 10000 leaves a remainder behind in Tempo.
    uint16 public pullBips = 10_000;

    error ValidationRejected();

    constructor(IERC20 _token, address _tempo) {
        token = _token;
        tempo = _tempo;
    }

    function setValidateReverts(bool value) external {
        validateReverts = value;
    }

    function setPullBips(uint16 value) external {
        pullBips = value;
    }

    function inputToken(address) external view returns (address) {
        return address(token);
    }

    function validate(address, bytes calldata, uint256) external view {
        if (validateReverts) revert ValidationRejected();
    }

    function perform(address beneficiary, address, bytes calldata xrplAddress, uint256 amount) external {
        uint256 pulled = (amount * pullBips) / 10_000;
        token.safeTransferFrom(tempo, address(this), pulled);
        performCount++;
        totalPulled += pulled;
        lastBeneficiary = beneficiary;
        lastXrplAddress = xrplAddress;
    }
}

/// @dev A minimal ERC-4626 over FXRP: one share per asset, no yield, no fees.
///      Enough to prove Tempo pulls shares rather than assets on an exit, and
///      that the redeemed assets land on the user rather than on an adapter.
contract MockVault is ERC20 {
    using SafeERC20 for IERC20;

    IERC20 public immutable underlying;

    constructor(IERC20 _underlying) ERC20("Mock Vault", "mvFXRP") {
        underlying = _underlying;
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function asset() external view returns (address) {
        return address(underlying);
    }

    function deposit(uint256 assets, address receiver) external returns (uint256) {
        underlying.safeTransferFrom(msg.sender, address(this), assets);
        _mint(receiver, assets);
        return assets;
    }

    function redeem(uint256 shares, address receiver, address owner) external returns (uint256) {
        _burn(owner, shares);
        underlying.safeTransfer(receiver, shares);
        return shares;
    }
}
