// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title SelfGate
/// @notice Identity gate backing the principal guarantee's access control:
///         deposits, withdrawals, and borrows are only available to addresses
///         that have passed Self verification (proof of unique humanity +
///         region/OFAC gating). The verification itself happens off-chain via
///         the Self SDK; this contract records the resulting attestation.
/// @dev    MVP/dev note: `setVerified` is permissionless in this implementation
///         so local/test seeding and the demo work without a live Self backend.
///         The production gate records attestations through `attest`, restricted
///         to authorized attestor(s) (the agent's verified relayer). Replace the
///         permissionless path once the live Self integration is wired
///         (Build Spec, Ground rule 2 / §7.4).
contract SelfGate is Ownable {
    mapping(address => bool) public isVerified;
    mapping(address => bool) public attestor;

    event Verified(address indexed account, bool status);
    event AttestorSet(address indexed account, bool allowed);

    constructor() Ownable(msg.sender) {
        attestor[msg.sender] = true;
    }

    /// @notice MVP/dev seeding: mark an address verified or not.
    /// @dev    Permissionless for testability; see contract notice.
    function setVerified(address account, bool status) external {
        isVerified[account] = status;
        emit Verified(account, status);
    }

    /// @notice Production path: only an authorized attestor records a passing
    ///         Self verification for `account`.
    function attest(address account) external {
        require(attestor[msg.sender], "not attestor");
        isVerified[account] = true;
        emit Verified(account, true);
    }

    function setAttestor(address account, bool allowed) external onlyOwner {
        attestor[account] = allowed;
        emit AttestorSet(account, allowed);
    }
}
