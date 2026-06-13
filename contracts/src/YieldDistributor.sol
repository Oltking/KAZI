// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IJuniorBuffer {
    function fundFromYield(uint256 amount) external;
}

/// @title YieldDistributor
/// @notice Receives realized yield and splits it per governance config:
///           - streamShareBps -> depositors (transferred into the vault, which
///             raises totalAssets() and therefore every share's value:
///             auto-compounding, so balances visibly grow), and
///           - bufferShareBps -> the JuniorBuffer (the ONLY path that funds
///             credit). streamShareBps + bufferShareBps == 10000.
///         MVP default: 10000 / 0 — a pure capital-protected savings product.
/// @dev    `distribute` pulls the yield from the caller (Allocator on harvest,
///         CreditBook on repayment-interest), so it is naturally funded and
///         needs no caller allowlist. `lifetimeYieldRealized` is the gross of
///         all yield ever processed.
contract YieldDistributor is Ownable {
    IERC20 public immutable usd;
    address public immutable vault;
    address public immutable buffer;

    uint256 public streamShareBps;
    uint256 public bufferShareBps;
    uint256 public lifetimeYieldRealized;

    event YieldDistributed(uint256 total, uint256 toStream, uint256 toBuffer);
    event SplitSet(uint256 streamShareBps, uint256 bufferShareBps);

    constructor(address _usd, address _vault, address _buffer) Ownable(msg.sender) {
        usd = IERC20(_usd);
        vault = _vault;
        buffer = _buffer;
        streamShareBps = 10_000; // MVP: 100% to savers
        bufferShareBps = 0; // MVP: 0% to junior buffer
    }

    function setSplit(uint256 _streamShareBps, uint256 _bufferShareBps) external onlyOwner {
        require(_streamShareBps + _bufferShareBps == 10_000, "split must total 10000");
        streamShareBps = _streamShareBps;
        bufferShareBps = _bufferShareBps;
        emit SplitSet(_streamShareBps, _bufferShareBps);
    }

    /// @notice Realize and split `amount` of yield. Caller must have approved it.
    function distribute(uint256 amount) external {
        if (amount == 0) return;
        usd.transferFrom(msg.sender, address(this), amount);
        lifetimeYieldRealized += amount;

        uint256 toBuffer = (amount * bufferShareBps) / 10_000;
        uint256 toStream = amount - toBuffer;

        // stream slice -> vault: raises totalAssets(), compounding share value.
        if (toStream > 0) {
            usd.transfer(vault, toStream);
        }
        // buffer slice -> junior buffer (the only funding path for credit).
        if (toBuffer > 0) {
            usd.approve(buffer, toBuffer);
            IJuniorBuffer(buffer).fundFromYield(toBuffer);
        }

        emit YieldDistributed(amount, toStream, toBuffer);
    }
}
