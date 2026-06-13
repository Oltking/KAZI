// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {MockUSD} from "../src/test/MockUSD.sol";
import {SelfGate} from "../src/SelfGate.sol";
import {MockStrategy} from "../src/strategies/MockStrategy.sol";
import {PrincipalVault} from "../src/PrincipalVault.sol";
import {Allocator} from "../src/Allocator.sol";
import {YieldDistributor} from "../src/YieldDistributor.sol";
import {JuniorBuffer} from "../src/JuniorBuffer.sol";
import {CreditBook} from "../src/CreditBook.sol";
import {ReputationOracle} from "../src/ReputationOracle.sol";

/// @notice Deploys the full Kazi stack to Celo Alfajores and wires the roles,
///         then writes the addresses to shared/addresses.json for the agent and
///         web app to consume.
///
/// Usage:
///   forge script script/Deploy.s.sol \
///     --rpc-url $CELO_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY
///
/// Asset selection:
///   - Default (demo): deploys a MockUSD as the deposit asset so the
///     MockStrategy can simulate streaming yield end-to-end with no external
///     dependency — the guaranteed-working demo (Build Spec §5.1, Ground rule 2).
///   - To use the real Alfajores cUSD instead, set CUSD_ADDRESS and
///     USE_REAL_CUSD=true. NOTE: MockStrategy mints yield, so it cannot be used
///     with a non-mintable real cUSD — wire a real senior strategy (Aave/Morpho/
///     Mento on Celo, once its deployment is verified) before enabling that path.
contract Deploy is Script {
    function run() external {
        bool useRealCusd = vm.envOr("USE_REAL_CUSD", false);
        uint256 streamBps = vm.envOr("STREAM_SHARE_BPS", uint256(10_000));
        uint256 bufferBps = vm.envOr("BUFFER_SHARE_BPS", uint256(0));
        uint256 reserveBps = vm.envOr("RESERVE_BPS", uint256(1_000));
        uint256 aprBps = vm.envOr("MOCK_STRATEGY_APR_BPS", uint256(500));

        vm.startBroadcast();

        address asset;
        if (useRealCusd) {
            asset = vm.envAddress("CUSD_ADDRESS");
            console2.log("Using real cUSD at", asset);
        } else {
            MockUSD mock = new MockUSD();
            asset = address(mock);
            console2.log("Deployed demo MockUSD at", asset);
        }

        SelfGate gate = new SelfGate();
        ReputationOracle reputation = new ReputationOracle();
        JuniorBuffer buffer = new JuniorBuffer(asset);
        PrincipalVault vault = new PrincipalVault(asset, address(gate));
        YieldDistributor distributor =
            new YieldDistributor(asset, address(vault), address(buffer));
        MockStrategy senior = new MockStrategy(asset);
        Allocator allocator =
            new Allocator(address(vault), address(senior), address(distributor));
        CreditBook credit =
            new CreditBook(address(buffer), address(gate), address(reputation), address(distributor));

        // wire roles
        vault.setAllocator(address(allocator));
        vault.setReserveBps(reserveBps);
        allocator.setDistributor(address(distributor));
        buffer.setCreditBook(address(credit));
        distributor.setSplit(streamBps, bufferBps);
        if (!useRealCusd) {
            senior.setApr(aprBps);
        }

        vm.stopBroadcast();

        _writeAddresses(
            asset,
            address(gate),
            address(reputation),
            address(buffer),
            address(vault),
            address(distributor),
            address(senior),
            address(allocator),
            address(credit)
        );
    }

    function _writeAddresses(
        address asset,
        address gate,
        address reputation,
        address buffer,
        address vault,
        address distributor,
        address senior,
        address allocator,
        address credit
    ) internal {
        string memory chain = vm.envOr("CHAIN", string("alfajores"));
        string memory json = "kazi-addresses";
        vm.serializeString(json, "chain", chain);
        vm.serializeAddress(json, "asset", asset);
        vm.serializeAddress(json, "selfGate", gate);
        vm.serializeAddress(json, "reputation", reputation);
        vm.serializeAddress(json, "buffer", buffer);
        vm.serializeAddress(json, "vault", vault);
        vm.serializeAddress(json, "distributor", distributor);
        vm.serializeAddress(json, "senior", senior);
        vm.serializeAddress(json, "allocator", allocator);
        vm.serializeAddress(json, "creditBook", credit);
        // record the operating agent (the deployer/operator) so the ERC-8004
        // card and UI never need a hardcoded address.
        string memory out = vm.serializeAddress(json, "agent", msg.sender);

        string memory path = "../shared/addresses.json";
        vm.writeJson(out, path);
        console2.log("Wrote addresses to shared/addresses.json");
    }
}
