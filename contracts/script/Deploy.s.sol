// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {Tempo} from "../src/Tempo.sol";
import {IActionAdapter} from "../src/interfaces/IActionAdapter.sol";
import {IAssetManager} from "../src/interfaces/IAssetManager.sol";
import {IERC4626Minimal} from "../src/interfaces/IERC4626Minimal.sol";
import {IFtsoV2} from "../src/interfaces/IFtsoV2.sol";
import {RedeemAdapter} from "../src/adapters/RedeemAdapter.sol";
import {VaultDepositAdapter} from "../src/adapters/VaultDepositAdapter.sol";
import {VaultWithdrawAdapter} from "../src/adapters/VaultWithdrawAdapter.sol";

/// @notice Deploys Tempo and its two adapters to Coston2.
/// @dev Addresses are read from the environment rather than hardcoded so the
///      same script works against a fork and against whatever the registry
///      resolves to on the day.
///
///      Tempo and its adapters reference each other as immutables, so the
///      deploy is a three-step dance around a predicted address: derive
///      Tempo's future address from the deployer's nonce, hand it to both
///      adapters, then deploy Tempo pointing back at them. The script asserts
///      the prediction held before it does anything else.
contract Deploy is Script {
    function run() external {
        address fxrp = vm.envAddress("FXRP_ADDRESS");
        address ftsoV2 = vm.envAddress("FTSOV2_ADDRESS");
        address assetManager = vm.envAddress("ASSET_MANAGER_ADDRESS");
        bytes21 feedId = bytes21(vm.envBytes("XRP_USD_FEED_ID"));
        uint64 maxPriceAge = uint64(vm.envUint("MAX_PRICE_AGE_SECONDS"));
        address[] memory vaults = vm.envAddress("TEMPO_VAULTS", ",");

        // Fail here rather than at the first user's first order.
        for (uint256 i = 0; i < vaults.length; i++) {
            require(IERC4626Minimal(vaults[i]).asset() == fxrp, "vault asset is not FXRP");
        }

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        address predictedTempo = vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 3);

        VaultDepositAdapter vaultDepositAdapter = new VaultDepositAdapter(IERC20(fxrp), predictedTempo, vaults);
        RedeemAdapter redeemAdapter = new RedeemAdapter(IERC20(fxrp), IAssetManager(assetManager), predictedTempo);
        VaultWithdrawAdapter vaultWithdrawAdapter = new VaultWithdrawAdapter(IERC20(fxrp), predictedTempo, vaults);
        Tempo tempo = new Tempo(
            IERC20(fxrp),
            IFtsoV2(ftsoV2),
            feedId,
            maxPriceAge,
            IActionAdapter(address(vaultDepositAdapter)),
            IActionAdapter(address(redeemAdapter)),
            IActionAdapter(address(vaultWithdrawAdapter))
        );

        vm.stopBroadcast();

        require(address(tempo) == predictedTempo, "address prediction drifted; adapters are pointed at nothing");

        console.log("Tempo               ", address(tempo));
        console.log("VaultDepositAdapter ", address(vaultDepositAdapter));
        console.log("RedeemAdapter       ", address(redeemAdapter));
        console.log("VaultWithdrawAdapter", address(vaultWithdrawAdapter));
    }
}
