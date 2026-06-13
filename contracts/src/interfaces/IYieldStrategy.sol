// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IYieldStrategy
/// @notice Senior (capital-protected) yield venue adapter. The Allocator only
///         ever moves principal into contracts implementing this interface, and
///         only ones on its governance whitelist. There is, by construction, no
///         path from a strategy to the junior/credit layer.
/// @dev    Production implementations wrap a Celo-deployed, audited stablecoin
///         venue (e.g. Aave / Morpho / Mento — verify each deployment before
///         enabling). MockStrategy is the deterministic fallback for dev/demo.
interface IYieldStrategy {
    /// @notice The underlying stablecoin this strategy accepts (e.g. cUSD).
    function asset() external view returns (address);

    /// @notice Deposit `amount` of asset. Caller must have approved this contract.
    function deposit(uint256 amount) external;

    /// @notice Withdraw `amount` of principal back to the caller.
    function withdraw(uint256 amount) external;

    /// @notice Current value of deployed principal (excludes unrealized yield).
    function totalValue() external view returns (uint256);

    /// @notice Yield accrued but not yet harvested.
    function pendingYield() external view returns (uint256);

    /// @notice Realize accrued yield and transfer it to the caller (the Allocator).
    /// @return yield The amount of asset realized and transferred out.
    function harvest() external returns (uint256 yield);
}
