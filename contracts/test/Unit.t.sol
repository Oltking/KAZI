// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// =============================================================================
// Kazi — unit tests for the access-control and gating guarantees that sit
// alongside the capital-protection invariants (CapitalProtection.t.sol).
// Covers the assertions listed at the foot of the invariant file:
//   - deposit/withdraw/borrow revert for a non–Self-verified address
//   - borrow reverts when reputation score < minScore
//   - only the Allocator can move principal; only the CreditBook can pull buffer
//   - with reserve + liquidity present, a depositor can always redeem in full
// =============================================================================

import {Test} from "forge-std/Test.sol";

import {MockUSD} from "../src/test/MockUSD.sol";
import {SelfGate} from "../src/SelfGate.sol";
import {MockStrategy} from "../src/strategies/MockStrategy.sol";
import {PrincipalVault} from "../src/PrincipalVault.sol";
import {Allocator} from "../src/Allocator.sol";
import {YieldDistributor} from "../src/YieldDistributor.sol";
import {JuniorBuffer} from "../src/JuniorBuffer.sol";
import {CreditBook} from "../src/CreditBook.sol";
import {ReputationOracle} from "../src/ReputationOracle.sol";

contract KaziUnitTest is Test {
    MockUSD usd;
    SelfGate gate;
    MockStrategy senior;
    PrincipalVault vault;
    Allocator allocator;
    YieldDistributor distributor;
    JuniorBuffer buffer;
    CreditBook credit;
    ReputationOracle reputation;

    address alice = address(0xA11CE);
    address mallory = address(0x4A110); // never verified
    address borrower = address(0xB0B);

    function setUp() public {
        usd = new MockUSD();
        gate = new SelfGate();
        reputation = new ReputationOracle();
        buffer = new JuniorBuffer(address(usd));
        vault = new PrincipalVault(address(usd), address(gate));
        senior = new MockStrategy(address(usd));
        distributor = new YieldDistributor(address(usd), address(vault), address(buffer));
        allocator = new Allocator(address(vault), address(senior), address(distributor));
        credit =
            new CreditBook(address(buffer), address(gate), address(reputation), address(distributor));

        vault.setAllocator(address(allocator));
        allocator.setDistributor(address(distributor));
        buffer.setCreditBook(address(credit));
        senior.setApr(500);

        gate.setVerified(alice, true);
        gate.setVerified(borrower, true);

        usd.mint(alice, 1_000e18);
        vm.prank(alice);
        usd.approve(address(vault), type(uint256).max);
    }

    // --- Self gating ---------------------------------------------------------

    function test_deposit_revertsForUnverified() public {
        usd.mint(mallory, 100e18);
        vm.startPrank(mallory);
        usd.approve(address(vault), type(uint256).max);
        vm.expectRevert(bytes("Self: not verified"));
        vault.deposit(100e18, mallory);
        vm.stopPrank();
    }

    function test_withdraw_revertsForUnverified() public {
        // alice deposits, then is de-verified (e.g. region/OFAC change) -> blocked.
        vm.prank(alice);
        vault.deposit(100e18, alice);
        gate.setVerified(alice, false);
        vm.prank(alice);
        vm.expectRevert(bytes("Self: not verified"));
        vault.redeem(1e18, alice, alice);
    }

    function test_borrow_revertsForUnverified() public {
        _fundBuffer(100e18);
        reputation.setScore(mallory, 1000);
        vm.expectRevert(bytes("Self: borrower not verified"));
        credit.issue(mallory, 1e18);
    }

    // --- Reputation gating ---------------------------------------------------

    function test_borrow_revertsBelowMinScore() public {
        _fundBuffer(100e18);
        reputation.setScore(borrower, credit.minScore() - 1);
        vm.expectRevert(bytes("reputation below minimum"));
        credit.issue(borrower, 1e18);
    }

    function test_borrow_succeedsAtMinScore() public {
        _fundBuffer(100e18);
        reputation.setScore(borrower, credit.minScore());
        credit.issue(borrower, 10e18);
        assertEq(usd.balanceOf(borrower), 10e18, "borrower funded from buffer");
        assertEq(credit.totalOutstanding(), 10e18);
    }

    // --- Access control: who can move money ----------------------------------

    function test_onlyAllocator_canPullPrincipal() public {
        vm.prank(alice);
        vault.deposit(100e18, alice);
        vm.prank(mallory);
        vm.expectRevert(bytes("only allocator"));
        vault.transferToAllocator(50e18);
    }

    function test_onlyCreditBook_canDrawBuffer() public {
        _fundBuffer(100e18);
        vm.prank(mallory);
        vm.expectRevert(bytes("only credit book"));
        buffer.drawForLoan(mallory, 50e18);
    }

    // --- Redeemability: full principal back even when deployed ---------------

    function test_redeemInFull_afterAllocation() public {
        vm.prank(alice);
        uint256 shares = vault.deposit(1_000e18, alice);

        // agent deploys deployable principal into the senior strategy.
        uint256 deployable = vault.deployableAssets();
        assertGt(deployable, 0, "should have deployable principal");
        allocator.allocate(deployable);

        // most principal is now in the strategy, not idle in the vault...
        assertLt(usd.balanceOf(address(vault)), 1_000e18);

        // ...yet alice can still redeem her full principal: the vault pulls the
        // shortfall back from the senior strategy on withdrawal.
        vm.prank(alice);
        uint256 assetsOut = vault.redeem(shares, alice, alice);
        assertEq(assetsOut, 1_000e18, "redeemed full principal");
        assertEq(usd.balanceOf(alice), 1_000e18, "alice whole again");
    }

    function test_redeemInFull_withYield() public {
        vm.prank(alice);
        uint256 shares = vault.deposit(1_000e18, alice);
        allocator.allocate(vault.deployableAssets());

        // let yield accrue and be harvested into the vault (auto-compounds).
        vm.warp(block.timestamp + 365 days);
        allocator.harvest();

        vm.prank(alice);
        uint256 assetsOut = vault.redeem(shares, alice, alice);
        // ~5% APR on the deployed (90%) portion => more than principal back.
        assertGt(assetsOut, 1_000e18, "earned yield on top of principal");
    }

    // --- helper --------------------------------------------------------------

    function _fundBuffer(uint256 amount) internal {
        // route real yield to the buffer by flipping the split to 100% buffer
        // and harvesting; simplest path to give the credit book capacity.
        distributor.setSplit(0, 10_000);
        vm.prank(alice);
        vault.deposit(1_000e18, alice);
        allocator.allocate(vault.deployableAssets());
        // accrue enough that one harvest funds at least `amount`.
        vm.warp(block.timestamp + 3650 days);
        allocator.harvest();
        require(buffer.availableForCredit() >= amount, "buffer underfunded for test");
    }
}
