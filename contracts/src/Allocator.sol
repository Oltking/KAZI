// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IYieldStrategy} from "./interfaces/IYieldStrategy.sol";

interface IVault {
    function asset() external view returns (address);
    function transferToAllocator(uint256 amount) external;
}

interface IDistributor {
    function distribute(uint256 amount) external;
}

/// @title Allocator
/// @notice Moves principal between the PrincipalVault and whitelisted SENIOR
///         strategies, and harvests realized yield into the YieldDistributor.
///
///         Hard rule (capital protection): the Allocator can ONLY move funds to
///         whitelisted senior strategies. It holds no reference to the
///         JuniorBuffer or CreditBook — there is no path from principal to
///         credit through this contract.
/// @dev    allocate/deallocate/harvest only move money along safe rails (idle
///         <-> senior strategy, and realized yield -> distributor), so they are
///         intentionally permissionless: anyone may keep the system live, and
///         no caller can divert funds. setDistributor is owner-only.
///
///         MVP wires a single senior strategy. A multi-strategy whitelist with
///         per-venue caps is the natural extension (Build Spec §5.1).
contract Allocator is Ownable {
    IVault public immutable vault;
    IYieldStrategy public immutable senior;
    IERC20 public immutable usd;
    address public distributor;

    event Allocated(uint256 amount);
    event Deallocated(uint256 amount);
    event Harvested(uint256 yield);
    event DistributorSet(address indexed distributor);

    constructor(address _vault, address _senior, address _distributor) Ownable(msg.sender) {
        vault = IVault(_vault);
        senior = IYieldStrategy(_senior);
        distributor = _distributor;
        usd = IERC20(IVault(_vault).asset());
    }

    function setDistributor(address _distributor) external onlyOwner {
        distributor = _distributor;
        emit DistributorSet(_distributor);
    }

    /// @notice Value of principal currently deployed in senior strategies.
    function totalDeployedValue() external view returns (uint256) {
        return senior.totalValue();
    }

    /// @notice Yield accrued in senior strategies but not yet harvested.
    function pendingYield() external view returns (uint256) {
        return senior.pendingYield();
    }

    /// @notice Pull `amount` of deployable principal from the vault into the
    ///         senior strategy.
    function allocate(uint256 amount) external {
        require(amount > 0, "zero");
        vault.transferToAllocator(amount); // asset now held by this contract
        usd.approve(address(senior), amount);
        senior.deposit(amount);
        emit Allocated(amount);
    }

    /// @notice Pull `amount` of principal back from the senior strategy into the
    ///         vault (used by the vault to source redemption liquidity).
    function deallocate(uint256 amount) external {
        require(amount > 0, "zero");
        senior.withdraw(amount); // asset now held by this contract
        usd.transfer(address(vault), amount);
        emit Deallocated(amount);
    }

    /// @notice Realize yield from the senior strategy and route it to the
    ///         distributor (which streams it to savers / funds the buffer).
    function harvest() external {
        uint256 yield = senior.harvest(); // asset now held by this contract
        if (yield == 0) return;
        usd.approve(distributor, yield);
        IDistributor(distributor).distribute(yield);
        emit Harvested(yield);
    }
}
