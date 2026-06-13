// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title JuniorBuffer
/// @notice The first-loss, at-risk capital layer. It accumulates ONLY the
///         buffer slice of realized yield (never principal) and is the sole
///         funder of the CreditBook. This is the only place credit losses are
///         absorbed; by construction it has no function that accepts principal.
/// @dev    Capital-protection invariant: `lifetimeFundedFromYield` can only be
///         increased by `fundFromYield`, which pulls real asset from the caller.
///         There is no path by which PrincipalVault assets enter here.
contract JuniorBuffer is Ownable {
    IERC20 public immutable usd;
    address public creditBook;

    /// @notice Cumulative asset ever routed in from realized yield. Outstanding
    ///         credit and lifetime losses are both bounded by this (the credit
    ///         book can never lend or lose more than yield has funded).
    uint256 public lifetimeFundedFromYield;

    event BufferFunded(uint256 amount, uint256 lifetimeFunded);
    event CreditBookSet(address indexed creditBook);
    event LoanDrawn(address indexed to, uint256 amount);

    modifier onlyCreditBook() {
        require(msg.sender == creditBook, "only credit book");
        _;
    }

    constructor(address _usd) Ownable(msg.sender) {
        usd = IERC20(_usd);
    }

    function setCreditBook(address _creditBook) external onlyOwner {
        creditBook = _creditBook;
        emit CreditBookSet(_creditBook);
    }

    /// @notice Route a slice of realized yield into the buffer. The caller (the
    ///         YieldDistributor) must have approved this amount. Increments the
    ///         lifetime-funded total only by asset actually received — so the
    ///         figure can never be inflated past real yield.
    function fundFromYield(uint256 amount) external {
        if (amount == 0) return;
        usd.transferFrom(msg.sender, address(this), amount);
        lifetimeFundedFromYield += amount;
        emit BufferFunded(amount, lifetimeFundedFromYield);
    }

    /// @notice Asset currently available to back new loans = current balance
    ///         (= funded + repaid principal - drawn - losses).
    function balance() public view returns (uint256) {
        return usd.balanceOf(address(this));
    }

    function availableForCredit() external view returns (uint256) {
        return balance();
    }

    /// @notice Disburse loan principal to a borrower. Only the CreditBook.
    function drawForLoan(address to, uint256 amount) external onlyCreditBook {
        usd.transfer(to, amount);
        emit LoanDrawn(to, amount);
    }
}
