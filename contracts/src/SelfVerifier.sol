// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SelfVerificationRoot} from "@selfxyz/contracts/contracts/abstract/SelfVerificationRoot.sol";
import {ISelfVerificationRoot} from "@selfxyz/contracts/contracts/interfaces/ISelfVerificationRoot.sol";
import {SelfStructs} from "@selfxyz/contracts/contracts/libraries/SelfStructs.sol";
import {SelfUtils} from "@selfxyz/contracts/contracts/libraries/SelfUtils.sol";
import {IIdentityVerificationHubV2} from
    "@selfxyz/contracts/contracts/interfaces/IIdentityVerificationHubV2.sol";

interface ISelfGate {
    function attest(address account) external;
}

/// @title SelfVerifier
/// @notice The real Self on-chain verification entrypoint for Kazi. A member
///         proves unique humanity + region (excluding sanctioned/US) with the
///         Self mobile app; the Identity Verification Hub V2 validates the ZK
///         proof and calls back here. On success we record the member as
///         verified in the `SelfGate` the vault gates on — so the gate reflects
///         a genuine Self verification, not a manual flag.
/// @dev    Pattern mirrors selfxyz/workshop's ProofOfHuman. The verified member
///         is `output.userIdentifier` (the wallet address the frontend passes as
///         the Self `userId`). This contract must be authorized on the gate via
///         SelfGate.setAttestor(verifier, true).
contract SelfVerifier is SelfVerificationRoot {
    ISelfGate public immutable gate;

    SelfStructs.VerificationConfigV2 public verificationConfig;
    bytes32 public verificationConfigId;

    event KaziVerified(address indexed user);

    constructor(
        address hubV2,
        string memory scopeSeed,
        SelfUtils.UnformattedVerificationConfigV2 memory cfg,
        address selfGate
    ) SelfVerificationRoot(hubV2, scopeSeed) {
        gate = ISelfGate(selfGate);
        verificationConfig = SelfUtils.formatVerificationConfigV2(cfg);
        verificationConfigId =
            IIdentityVerificationHubV2(hubV2).setVerificationConfigV2(verificationConfig);
    }

    /// @inheritdoc SelfVerificationRoot
    function customVerificationHook(
        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output,
        bytes memory /* userData */
    ) internal override {
        address user = address(uint160(output.userIdentifier));
        gate.attest(user);
        emit KaziVerified(user);
    }

    /// @inheritdoc SelfVerificationRoot
    function getConfigId(bytes32, bytes32, bytes memory) public view override returns (bytes32) {
        return verificationConfigId;
    }
}
