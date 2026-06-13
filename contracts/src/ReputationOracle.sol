// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ReputationOracle
/// @notice Thin adapter over the ERC-8004 Reputation Registry. `score()`
///         aggregates a borrower's on-chain track record; repayment/default
///         outcomes are written as structured feedback. Off-chain aggregation
///         is fine per the standard — on-chain reads stay simple.
/// @dev    MVP keeps scores in a local mapping so the credit loop is testable
///         without a live registry. Phase 3/4 wires this to the real ERC-8004
///         Reputation Registry on Celo (verify the deployment address first —
///         do not hardcode an unverified address). `recordRepayment` /
///         `recordDefault` are permissionless in MVP; production restricts them
///         to the CreditBook.
contract ReputationOracle is Ownable {
    mapping(address => uint256) private _score;

    uint256 public constant REPAY_BONUS = 25;
    uint256 public constant DEFAULT_PENALTY = 150;

    event ReputationUpdated(address indexed account, uint256 score);

    constructor() Ownable(msg.sender) {}

    function score(address account) external view returns (uint256) {
        return _score[account];
    }

    /// @notice Admin/seed setter (and the integration point for off-chain
    ///         ERC-8004 aggregation to push computed scores).
    function setScore(address account, uint256 newScore) external onlyOwner {
        _score[account] = newScore;
        emit ReputationUpdated(account, newScore);
    }

    function recordRepayment(address account) external {
        _score[account] += REPAY_BONUS;
        emit ReputationUpdated(account, _score[account]);
    }

    function recordDefault(address account) external {
        uint256 s = _score[account];
        _score[account] = s > DEFAULT_PENALTY ? s - DEFAULT_PENALTY : 0;
        emit ReputationUpdated(account, _score[account]);
    }
}
