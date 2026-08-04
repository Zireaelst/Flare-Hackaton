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

    error ValidationRejected();

    constructor(IERC20 _token, address _tempo) {
        token = _token;
        tempo = _tempo;
    }

    function setValidateReverts(bool value) external {
        validateReverts = value;
    }

    function validate(address, bytes calldata, uint256) external view {
        if (validateReverts) revert ValidationRejected();
    }

    function perform(address beneficiary, address, bytes calldata xrplAddress, uint256 amount) external {
        token.safeTransferFrom(tempo, address(this), amount);
        performCount++;
        totalPulled += amount;
        lastBeneficiary = beneficiary;
        lastXrplAddress = xrplAddress;
    }
}
