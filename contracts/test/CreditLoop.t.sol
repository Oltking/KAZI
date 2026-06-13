// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// =============================================================================
// Kazi — end-to-end credit-loop scenario (Build Spec §12).
// Scripted run with the credit module ENABLED (yield split routes a slice to
// the junior buffer): savers deposit, the agent harvests, one member borrows
// and repays (interest streams back to savers), another member defaults. The
// money-shot assertion: a default is absorbed by the buffer and NEVER reduces
// depositor principal.
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

contract CreditLoopTest is Test {
    MockUSD usd;
    SelfGate gate;
    MockStrategy senior;
    PrincipalVault vault;
    Allocator allocator;
    YieldDistributor distributor;
    JuniorBuffer buffer;
    CreditBook credit;
    ReputationOracle reputation;

    address[3] savers = [address(0x5A1), address(0x5A2), address(0x5A3)];
    address goodBorrower = address(0x600D);
    address badBorrower = address(0xBAD);

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
        senior.setApr(800); // 8% APR mock

        // Credit module ON: 50% of yield streams to savers, 50% funds the buffer.
        distributor.setSplit(5_000, 5_000);

        for (uint256 i = 0; i < savers.length; i++) {
            gate.setVerified(savers[i], true);
            usd.mint(savers[i], 10_000e18);
            vm.prank(savers[i]);
            usd.approve(address(vault), type(uint256).max);
        }
        gate.setVerified(goodBorrower, true);
        gate.setVerified(badBorrower, true);
        reputation.setScore(goodBorrower, 800);
        reputation.setScore(badBorrower, 800);
    }

    function test_creditLoop_principalNeverTouchedByDefault() public {
        // 1. Three savers deposit 10k each.
        uint256[3] memory shares;
        for (uint256 i = 0; i < savers.length; i++) {
            vm.prank(savers[i]);
            shares[i] = vault.deposit(10_000e18, savers[i]);
        }
        uint256 totalPrincipal = 30_000e18;
        assertEq(vault.totalAssets(), totalPrincipal, "all principal accounted");

        // 2. Agent deploys principal and harvests yield over a year.
        allocator.allocate(vault.deployableAssets());
        vm.warp(block.timestamp + 365 days);
        allocator.harvest();

        uint256 bufferAfterHarvest = buffer.availableForCredit();
        assertGt(bufferAfterHarvest, 0, "buffer funded from yield only");
        // The buffer was funded strictly from realized yield, never principal.
        assertEq(buffer.lifetimeFundedFromYield(), bufferAfterHarvest);

        // Snapshot share price; principal backing must never drop below deposits.
        assertGe(vault.totalAssets(), totalPrincipal, "principal still fully backed");

        // 3. A good member borrows half the buffer and repays with interest.
        uint256 loanAmt = bufferAfterHarvest / 2;
        credit.issue(goodBorrower, loanAmt);
        assertEq(credit.totalOutstanding(), loanAmt);

        uint256 owed = credit.amountOwed(goodBorrower);
        assertGt(owed, loanAmt, "owed includes interest");
        usd.mint(goodBorrower, owed - usd.balanceOf(goodBorrower)); // top up to repay
        vm.startPrank(goodBorrower);
        usd.approve(address(credit), owed);
        credit.repay();
        vm.stopPrank();

        assertEq(credit.totalOutstanding(), 0, "loan cleared");
        assertGt(reputation.score(goodBorrower), 800, "repayment raised reputation");

        // 4. A bad member borrows and defaults.
        uint256 badLoan = buffer.availableForCredit() / 2;
        uint256 bufferBeforeDefault = buffer.availableForCredit();
        credit.issue(badBorrower, badLoan);

        // principal-backing check the instant before the loss is realized.
        uint256 backedBeforeLoss = vault.totalAssets();
        assertGe(backedBeforeLoss, totalPrincipal, "principal backed pre-default");

        vm.warp(block.timestamp + 400 days); // blow past the due date
        credit.markDefault(badBorrower);

        // 5. THE MONEY-SHOT: the default is absorbed by the buffer; depositor
        //    principal is unchanged and still fully redeemable.
        assertEq(credit.lifetimeLosses(), badLoan, "loss equals the defaulted loan");
        assertLe(credit.lifetimeLosses(), buffer.lifetimeFundedFromYield(), "loss bounded by buffer");
        assertGe(vault.totalAssets(), totalPrincipal, "PRINCIPAL UNTOUCHED by default");
        assertLe(badLoan, bufferBeforeDefault, "loss fit inside the buffer");

        // Every saver can still redeem at least their full principal.
        for (uint256 i = 0; i < savers.length; i++) {
            vm.prank(savers[i]);
            uint256 out = vault.redeem(shares[i], savers[i], savers[i]);
            assertGe(out, 10_000e18, "saver redeemed full principal (+ streamed yield)");
        }
    }
}
