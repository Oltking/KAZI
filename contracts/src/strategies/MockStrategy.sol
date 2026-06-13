// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IYieldStrategy} from "../interfaces/IYieldStrategy.sol";
import {MockUSD} from "../test/MockUSD.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title MockStrategy
/// @notice Deterministic, settable-APR senior strategy for local dev, the
///         invariant suite, and the demo. Accrues simulated yield linearly over
///         time so the live earnings ticker and the harvest flow are
///         demonstrable without any external protocol dependency. This is the
///         fallback that guarantees a working demo (Build Spec §5.1).
/// @dev    Yield is "created" by minting MockUSD on harvest — this simulates an
///         external venue paying interest. A production strategy wraps a real
///         venue and never mints. deposit/withdraw/harvest are intentionally
///         unrestricted here (mock only); production strategies restrict to the
///         Allocator.
contract MockStrategy is IYieldStrategy {
    MockUSD public immutable usd;

    uint256 public principal; // deployed principal currently held
    uint256 public apr; // annual rate in bps (e.g. 500 = 5.00%)
    uint256 public accrued; // yield accrued and synced, not yet harvested
    uint256 public lastAccrual;

    uint256 private constant YEAR = 365 days;
    uint256 private constant BPS = 10_000;

    event Deposited(uint256 amount);
    event Withdrawn(uint256 amount);
    event Harvested(uint256 yield);
    event AprSet(uint256 apr);

    constructor(address _usd) {
        usd = MockUSD(_usd);
        lastAccrual = block.timestamp;
    }

    function asset() external view returns (address) {
        return address(usd);
    }

    function setApr(uint256 _apr) external {
        _sync();
        apr = _apr;
        emit AprSet(_apr);
    }

    /// @dev Fold elapsed-time accrual into the `accrued` bucket.
    function _sync() internal {
        accrued += _accruedSinceSync();
        lastAccrual = block.timestamp;
    }

    function _accruedSinceSync() internal view returns (uint256) {
        if (block.timestamp <= lastAccrual || principal == 0 || apr == 0) return 0;
        uint256 elapsed = block.timestamp - lastAccrual;
        return (principal * apr * elapsed) / (YEAR * BPS);
    }

    function deposit(uint256 amount) external {
        _sync();
        IERC20(address(usd)).transferFrom(msg.sender, address(this), amount);
        principal += amount;
        emit Deposited(amount);
    }

    function withdraw(uint256 amount) external {
        _sync();
        require(amount <= principal, "exceeds principal");
        principal -= amount;
        IERC20(address(usd)).transfer(msg.sender, amount);
        emit Withdrawn(amount);
    }

    /// @notice Principal value only — unrealized yield is excluded so harvest
    ///         cannot double-count. The vault's totalAssets() uses this.
    function totalValue() external view returns (uint256) {
        return principal;
    }

    function pendingYield() external view returns (uint256) {
        return accrued + _accruedSinceSync();
    }

    function harvest() external returns (uint256 yield) {
        _sync();
        yield = accrued;
        if (yield == 0) return 0;
        accrued = 0;
        // simulate the external venue paying out interest in real tokens.
        usd.mint(address(this), yield);
        IERC20(address(usd)).transfer(msg.sender, yield);
        emit Harvested(yield);
    }
}
