// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// =============================================================================
// Kazi — Capital-Protection Invariant Tests (TDD scaffold)
// =============================================================================
// These tests DEFINE the safety contract of the system. Build the production
// contracts until every invariant below holds. If a change makes any of these
// fail, the change is wrong (see Build Spec, Ground rule 1 and §5.2).
//
// Run: forge test --match-contract CapitalProtectionInvariants
//
// The system under test (build these in contracts/src):
//   - MockUSD            : ERC-20 stand-in for cUSD (6 or 18 dp — pick and be consistent)
//   - SelfGate           : isVerified(address) gate; setVerified(address,bool) for tests
//   - MockStrategy       : senior IYieldStrategy with deterministic, settable APR
//   - PrincipalVault      : ERC-4626 over MockUSD; senior only; Self-gated
//   - Allocator          : moves principal vault<->senior strategies; harvests
//   - YieldDistributor    : splits realized yield (stream vs buffer); auto-compounds
//   - JuniorBuffer        : holds only the buffer slice of yield; funds credit; first-loss
//   - CreditBook          : loans from JuniorBuffer only, to verified + scored borrowers
//   - ReputationOracle    : score(address); record repay/default (ERC-8004 adapter)
// =============================================================================

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";

// NOTE: import paths are placeholders — wire to the real contracts as they are built.
import {MockUSD} from "../src/test/MockUSD.sol";
import {SelfGate} from "../src/SelfGate.sol";
import {MockStrategy} from "../src/strategies/MockStrategy.sol";
import {PrincipalVault} from "../src/PrincipalVault.sol";
import {Allocator} from "../src/Allocator.sol";
import {YieldDistributor} from "../src/YieldDistributor.sol";
import {JuniorBuffer} from "../src/JuniorBuffer.sol";
import {CreditBook} from "../src/CreditBook.sol";
import {ReputationOracle} from "../src/ReputationOracle.sol";

/// @dev Drives realistic, bounded sequences of user/agent actions for the fuzzer.
contract KaziHandler is Test {
    MockUSD public usd;
    SelfGate public gate;
    PrincipalVault public vault;
    Allocator public allocator;
    YieldDistributor public distributor;
    JuniorBuffer public buffer;
    CreditBook public credit;
    ReputationOracle public reputation;

    address[] public savers;
    address[] public borrowers;

    // Ghost variable: net principal still in the vault (deposits minus the
    // PRINCIPAL portion of withdrawals). Used by invariant 2 to assert principal
    // is always backed. Intentionally under-counts (treats withdrawals as
    // principal-first), which keeps it a conservative lower bound for a >= check.
    uint256 public ghost_netPrincipalIn;

    // Ghost variables for the value-conservation invariant. Unlike
    // ghost_netPrincipalIn these track GROSS asset flows in/out of the system
    // (deposits and full redemption amounts, yield included) so conservation can
    // be stated exactly. Tracking only the principal portion of withdrawals — as
    // a single net-principal ghost does — silently drops withdrawn yield and
    // makes conservation seed-dependent; these two counters avoid that.
    uint256 public ghost_deposited; // cumulative asset deposited
    uint256 public ghost_withdrawn; // cumulative asset redeemed out (principal + yield)

    constructor(
        MockUSD _usd,
        SelfGate _gate,
        PrincipalVault _vault,
        Allocator _allocator,
        YieldDistributor _distributor,
        JuniorBuffer _buffer,
        CreditBook _credit,
        ReputationOracle _reputation
    ) {
        usd = _usd;
        gate = _gate;
        vault = _vault;
        allocator = _allocator;
        distributor = _distributor;
        buffer = _buffer;
        credit = _credit;
        reputation = _reputation;

        for (uint256 i = 0; i < 5; i++) {
            address s = address(uint160(0x5A0E00 + i));
            savers.push(s);
            gate.setVerified(s, true);
            usd.mint(s, 1_000_000e18);
            vm.prank(s);
            usd.approve(address(vault), type(uint256).max);
        }
        for (uint256 i = 0; i < 5; i++) {
            address b = address(uint160(0xB0110E + i));
            borrowers.push(b);
            gate.setVerified(b, true);
        }
    }

    function _saver(uint256 seed) internal view returns (address) {
        return savers[seed % savers.length];
    }

    function _borrower(uint256 seed) internal view returns (address) {
        return borrowers[seed % borrowers.length];
    }

    function deposit(uint256 seed, uint256 amount) external {
        address s = _saver(seed);
        amount = bound(amount, 1e18, usd.balanceOf(s));
        if (amount == 0) return;
        vm.prank(s);
        vault.deposit(amount, s);
        ghost_netPrincipalIn += amount;
        ghost_deposited += amount;
    }

    function withdraw(uint256 seed, uint256 shares) external {
        address s = _saver(seed);
        uint256 maxShares = vault.balanceOf(s);
        if (maxShares == 0) return;
        shares = bound(shares, 1, maxShares);
        vm.prank(s);
        uint256 assets = vault.redeem(shares, s, s); // actual asset paid out
        // Conservation tracks the full amount out (principal + yield)...
        ghost_withdrawn += assets;
        // ...while the principal-backing ghost only sheds the principal portion
        // (yield withdrawn beyond net principal is "extra" and not subtracted).
        ghost_netPrincipalIn -= assets > ghost_netPrincipalIn ? ghost_netPrincipalIn : assets;
    }

    function allocate(uint256 amount) external {
        // agent action: move deployable principal into the senior strategy.
        amount = bound(amount, 0, vault.deployableAssets());
        if (amount == 0) return;
        allocator.allocate(amount);
    }

    function accrueAndHarvest(uint256 timeJump) external {
        // simulate real time passing → real yield in the mock senior strategy.
        timeJump = bound(timeJump, 1 hours, 30 days);
        vm.warp(block.timestamp + timeJump);
        allocator.harvest(); // realizes yield → distributor → (stream + buffer)
    }

    function borrow(uint256 seed, uint256 amount) external {
        address b = _borrower(seed);
        // loans can only come from the buffer's available capital.
        uint256 capacity = buffer.availableForCredit();
        if (capacity == 0) return;
        amount = bound(amount, 1, capacity);
        // may revert if score too low — that is acceptable (gating works).
        try credit.issue(b, amount) {} catch {}
    }

    function repay(uint256 seed) external {
        address b = _borrower(seed);
        uint256 owed = credit.amountOwed(b);
        if (owed == 0) return;
        usd.mint(b, owed);
        vm.startPrank(b);
        usd.approve(address(credit), owed);
        credit.repay();
        vm.stopPrank();
    }

    function defaultLoan(uint256 seed) external {
        address b = _borrower(seed);
        if (credit.amountOwed(b) == 0) return;
        // jump past due date and let the agent mark default.
        vm.warp(block.timestamp + 400 days);
        try credit.markDefault(b) {} catch {}
    }

    function saversLength() external view returns (uint256) {
        return savers.length;
    }
}

contract CapitalProtectionInvariants is StdInvariant, Test {
    MockUSD usd;
    SelfGate gate;
    MockStrategy senior;
    PrincipalVault vault;
    Allocator allocator;
    YieldDistributor distributor;
    JuniorBuffer buffer;
    CreditBook credit;
    ReputationOracle reputation;
    KaziHandler handler;

    function setUp() public {
        usd = new MockUSD();
        gate = new SelfGate();
        reputation = new ReputationOracle();
        buffer = new JuniorBuffer(address(usd));
        vault = new PrincipalVault(address(usd), address(gate));
        senior = new MockStrategy(address(usd)); // e.g. 5% APR mock
        allocator = new Allocator(address(vault), address(senior), address(distributor));
        distributor = new YieldDistributor(address(usd), address(vault), address(buffer));
        credit = new CreditBook(address(buffer), address(gate), address(reputation), address(distributor));

        // wire roles: only Allocator can pull principal; only CreditBook can pull buffer.
        vault.setAllocator(address(allocator));
        allocator.setDistributor(address(distributor));
        buffer.setCreditBook(address(credit));
        senior.setApr(500); // 5.00%

        // MVP default: 100% stream, 0% buffer (pure capital-protected).
        // Tests flip this where they need a funded credit book.
        distributor.setSplit(10_000, 0);

        handler = new KaziHandler(
            usd, gate, vault, allocator, distributor, buffer, credit, reputation
        );

        // expose only the handler's actions to the fuzzer.
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](7);
        selectors[0] = handler.deposit.selector;
        selectors[1] = handler.withdraw.selector;
        selectors[2] = handler.allocate.selector;
        selectors[3] = handler.accrueAndHarvest.selector;
        selectors[4] = handler.borrow.selector;
        selectors[5] = handler.repay.selector;
        selectors[6] = handler.defaultLoan.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    // -------------------------------------------------------------------------
    // INVARIANT 1 — Principal isolation.
    // The credit book's outstanding principal can NEVER exceed what the junior
    // buffer was funded with from YIELD. i.e. depositor principal can never be
    // the source of a loan.
    // -------------------------------------------------------------------------
    function invariant_creditFundedOnlyByYield() public view {
        assertLe(
            credit.totalOutstanding(),
            buffer.lifetimeFundedFromYield(),
            "credit exceeds yield-funded buffer: principal leaked into credit"
        );
    }

    // -------------------------------------------------------------------------
    // INVARIANT 2 — Principal backing / redeemability.
    // The vault's accounted assets must always cover net principal deposited.
    // (Senior strategy is assumed solvent in the mock; real strategies inherit
    // their venue's solvency assumption — that is the only carve-out.)
    // -------------------------------------------------------------------------
    function invariant_principalAlwaysBacked() public view {
        assertGe(
            vault.totalAssets(),
            handler.ghost_netPrincipalIn(),
            "vault assets fell below net principal: principal not fully backed"
        );
    }

    // -------------------------------------------------------------------------
    // INVARIANT 3 — Vault never holds junior/credit risk.
    // The principal vault's accounting must not include any buffer or credit
    // assets. The two layers are disjoint.
    // -------------------------------------------------------------------------
    function invariant_vaultExcludesJuniorAssets() public view {
        assertEq(
            vault.juniorExposure(),
            0,
            "principal vault has exposure to the junior/credit layer"
        );
    }

    // -------------------------------------------------------------------------
    // INVARIANT 4 — Loss waterfall: defaults hit the buffer, never the vault.
    // Cumulative credit losses must always be <= cumulative buffer funding.
    // A loss can never make the buffer negative (i.e. spill into principal).
    // -------------------------------------------------------------------------
    function invariant_lossWaterfallBufferFirst() public view {
        assertLe(
            credit.lifetimeLosses(),
            buffer.lifetimeFundedFromYield(),
            "losses exceeded buffer funding: a loss reached principal"
        );
    }

    // -------------------------------------------------------------------------
    // INVARIANT 5 — Conservation of value.
    // No value is minted from nowhere and none leaks away. Everything currently
    // in the system, plus everything that has left it, must equal everything
    // that has entered it:
    //
    //   (assets still in system) + (assets withdrawn) + (credit losses)
    //     == (deposits) + (realized yield)
    //
    // where assets-still-in-system = vault assets + buffer balance + credit
    // outstanding. Stated in gross asset flows it holds EXACTLY (no seed
    // dependence): withdrawals move value from "in system" to "withdrawn" with
    // no net change, deposits and realized yield add to both sides, and a
    // default moves loaned value from "outstanding" to "losses". The original
    // scaffold used a single net-principal ghost on the right, which dropped
    // withdrawn yield and only held for fuzz seeds that never withdrew yield —
    // corrected here to the exact law (see the ghost_* notes in KaziHandler).
    // -------------------------------------------------------------------------
    function invariant_conservation() public view {
        uint256 inSystemAndOut = vault.totalAssets() + buffer.balance()
            + credit.totalOutstanding() + handler.ghost_withdrawn() + credit.lifetimeLosses();
        uint256 inflows = handler.ghost_deposited() + distributor.lifetimeYieldRealized();
        // exact equality, with a 1 wei tolerance for any ERC-4626 rounding.
        assertApproxEqAbs(inSystemAndOut, inflows, 1, "value conservation broken");
    }
}

// =============================================================================
// Unit tests (not invariants) to add alongside — assert reverts:
//   - deposit/withdraw/borrow revert for a non–Self-verified address
//   - borrow reverts when ReputationOracle.score(borrower) < minScore
//   - only Allocator can move principal; only CreditBook can pull buffer
//   - with reserve + liquidity present, a depositor can always redeem in full
// =============================================================================
