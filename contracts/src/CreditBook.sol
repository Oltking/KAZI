// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IJuniorBuffer {
    function usd() external view returns (address);
    function availableForCredit() external view returns (uint256);
    function drawForLoan(address to, uint256 amount) external;
}

interface ISelfGate {
    function isVerified(address) external view returns (bool);
}

interface IReputationOracle {
    function score(address) external view returns (uint256);
    function recordRepayment(address) external;
    function recordDefault(address) external;
}

interface IYieldDistributor {
    function distribute(uint256 amount) external;
}

/// @title CreditBook
/// @notice Issues loans funded ONLY by the JuniorBuffer (realized yield), to
///         borrowers who pass Self verification AND meet a minimum reputation
///         score. Repaid interest is forwarded to the YieldDistributor so it
///         streams back to savers; defaults are absorbed by the buffer
///         (first-loss) and never reach depositor principal.
/// @dev    Capital-protection guarantees here:
///           - principal for loans is drawn solely via JuniorBuffer.drawForLoan;
///             this contract cannot touch the PrincipalVault.
///           - a loan can never exceed the buffer's available (yield-funded)
///             capital, so totalOutstanding <= buffer.lifetimeFundedFromYield.
///           - a default increments lifetimeLosses, which is likewise bounded by
///             buffer funding — losses cannot reach principal.
///
///         MVP: `issue` is permissionless to trigger but fully gated by
///         verification + score + capacity; production restricts triggering to
///         the agent (the underwriter).
contract CreditBook is Ownable {
    enum Status {
        None,
        Active,
        Repaid,
        Defaulted
    }

    struct Loan {
        uint256 principal;
        uint256 interest;
        uint64 dueDate;
        Status status;
    }

    IERC20 public immutable usd;
    address public immutable buffer;
    ISelfGate public immutable gate;
    IReputationOracle public immutable reputation;
    address public immutable distributor;

    uint256 public minScore = 600;
    uint256 public interestRateBps = 1_000; // 10% flat for the MVP term
    uint64 public loanTerm = 30 days;

    uint256 public totalOutstanding;
    uint256 public lifetimeLosses;
    mapping(address => Loan) public loans;

    event LoanIssued(address indexed borrower, uint256 principal, uint256 interest, uint64 dueDate);
    event LoanRepaid(address indexed borrower, uint256 principal, uint256 interest);
    event LoanDefaulted(address indexed borrower, uint256 loss);
    event TermsSet(uint256 minScore, uint256 interestRateBps, uint64 loanTerm);

    constructor(address _buffer, address _gate, address _reputation, address _distributor)
        Ownable(msg.sender)
    {
        buffer = _buffer;
        gate = ISelfGate(_gate);
        reputation = IReputationOracle(_reputation);
        distributor = _distributor;
        usd = IERC20(IJuniorBuffer(_buffer).usd());
    }

    function setTerms(uint256 _minScore, uint256 _interestRateBps, uint64 _loanTerm)
        external
        onlyOwner
    {
        minScore = _minScore;
        interestRateBps = _interestRateBps;
        loanTerm = _loanTerm;
        emit TermsSet(_minScore, _interestRateBps, _loanTerm);
    }

    // --- Views ---------------------------------------------------------------

    function amountOwed(address borrower) external view returns (uint256) {
        Loan storage l = loans[borrower];
        if (l.status != Status.Active) return 0;
        return l.principal + l.interest;
    }

    function loanStatus(address borrower) external view returns (Status) {
        return loans[borrower].status;
    }

    function isOverdue(address borrower) external view returns (bool) {
        Loan storage l = loans[borrower];
        return l.status == Status.Active && block.timestamp > l.dueDate;
    }

    // --- Lifecycle -----------------------------------------------------------

    /// @notice Issue a loan to `borrower` funded from the JuniorBuffer.
    function issue(address borrower, uint256 amount) external {
        require(gate.isVerified(borrower), "Self: borrower not verified");
        require(reputation.score(borrower) >= minScore, "reputation below minimum");
        require(loans[borrower].status != Status.Active, "active loan exists");
        require(amount > 0, "zero");
        require(amount <= IJuniorBuffer(buffer).availableForCredit(), "exceeds buffer capacity");

        IJuniorBuffer(buffer).drawForLoan(borrower, amount);

        uint256 interest = (amount * interestRateBps) / 10_000;
        loans[borrower] = Loan({
            principal: amount,
            interest: interest,
            dueDate: uint64(block.timestamp) + loanTerm,
            status: Status.Active
        });
        totalOutstanding += amount;

        emit LoanIssued(borrower, amount, interest, uint64(block.timestamp) + loanTerm);
    }

    /// @notice Repay the caller's active loan (principal + interest). Principal
    ///         returns to the buffer; interest is streamed to savers.
    function repay() external {
        Loan storage l = loans[msg.sender];
        require(l.status == Status.Active, "no active loan");

        uint256 principal = l.principal;
        uint256 interest = l.interest;
        uint256 owed = principal + interest;

        usd.transferFrom(msg.sender, address(this), owed);

        // return principal to the buffer (restores credit capacity, not new yield)
        usd.transfer(buffer, principal);
        totalOutstanding -= principal;

        // forward interest as realized yield -> streams back to savers
        if (interest > 0) {
            usd.approve(distributor, interest);
            IYieldDistributor(distributor).distribute(interest);
        }

        l.status = Status.Repaid;
        reputation.recordRepayment(msg.sender);
        emit LoanRepaid(msg.sender, principal, interest);
    }

    /// @notice Mark an overdue loan as defaulted. The loss is realized against
    ///         the buffer (the asset already left it at issuance and is not
    ///         returned); depositor principal is untouched.
    function markDefault(address borrower) external {
        Loan storage l = loans[borrower];
        require(l.status == Status.Active, "not active");
        require(l.principal > 0, "no loan");
        require(block.timestamp > l.dueDate, "not overdue");

        uint256 loss = l.principal;
        totalOutstanding -= loss;
        lifetimeLosses += loss;
        l.status = Status.Defaulted;

        reputation.recordDefault(borrower);
        emit LoanDefaulted(borrower, loss);
    }
}
