// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {SelfUtils} from "@selfxyz/contracts/contracts/libraries/SelfUtils.sol";
import {SelfVerifier} from "../src/SelfVerifier.sol";
import {SelfGate} from "../src/SelfGate.sol";

/// @notice Deploys the real Self on-chain verifier against the already-deployed
///         SelfGate and authorizes it as an attestor. Run after Deploy.s.sol.
///
/// Env:
///   SELF_HUB_V2     Identity Verification Hub V2 (Celo Sepolia: 0x16ECBA51...)
///   SELF_SCOPE_SEED scope string (must match the frontend's NEXT_PUBLIC_SELF_SCOPE_SEED)
///
/// Usage:
///   forge script script/DeploySelfVerifier.s.sol \
///     --rpc-url $CELO_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast
contract DeploySelfVerifier is Script {
    function run() external {
        address hub = vm.envAddress("SELF_HUB_V2");
        string memory scope = vm.envOr("SELF_SCOPE_SEED", string("kazi"));

        string memory json = vm.readFile("../shared/addresses.json");
        address gate = vm.parseJsonAddress(json, ".selfGate");

        // Same disclosure policy as the frontend: 18+, exclude US, OFAC off.
        SelfUtils.UnformattedVerificationConfigV2 memory cfg;
        cfg.olderThan = 18;
        cfg.forbiddenCountries = new string[](1);
        cfg.forbiddenCountries[0] = "USA";
        cfg.ofacEnabled = false;

        vm.startBroadcast();
        SelfVerifier verifier = new SelfVerifier(hub, scope, cfg, gate);
        SelfGate(gate).setAttestor(address(verifier), true);
        vm.stopBroadcast();

        console2.log("SelfVerifier:", address(verifier));
        console2.log("authorized as attestor on SelfGate:", gate);
        vm.writeJson(vm.toString(address(verifier)), "../shared/addresses.json", ".selfVerifier");
        vm.writeJson(vm.toString(hub), "../shared/addresses.json", ".selfHub");
    }
}
