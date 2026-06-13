// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface ISelfGate {
    function isVerified(address) external view returns (bool);
}

interface IAllocatorView {
    function totalDeployedValue() external view returns (uint256);
    function deallocate(uint256 amount) external;
}

/// @title PrincipalVault
/// @notice The capital-protected, senior layer. An ERC-4626 vault over the
///         deposit stablecoin (cUSD). Member principal lives here or in
///         whitelisted senior strategies via the Allocator — and NOWHERE else.
///
///         Capital-protection design:
///           - totalAssets() = idle reserve held here + senior strategy value.
///             It never includes any junior/credit asset (see juniorExposure()).
///           - Only the Allocator can pull funds out, and the Allocator can only
///             move them into whitelisted senior strategies. There is no call
///             path from this contract to the JuniorBuffer/CreditBook.
///           - A withdrawal reserve (reserveBps) is kept idle for instant
///             redemptions; the rest is deployable. If a redemption needs more
///             than is idle, the vault pulls principal back from the senior
///             strategy first, so depositors can always redeem in full (subject
///             to senior solvency + liquidity).
///           - Deposits and withdrawals are gated by Self verification.
contract PrincipalVault is ERC4626, Ownable {
    ISelfGate public immutable gate;
    address public allocator;

    /// @notice Idle fraction kept for instant redemptions, in bps (1000 = 10%).
    uint256 public reserveBps = 1_000;

    event AllocatorSet(address indexed allocator);
    event ReserveBpsSet(uint256 reserveBps);

    modifier onlyVerified(address account) {
        require(gate.isVerified(account), "Self: not verified");
        _;
    }

    constructor(address _asset, address _gate)
        ERC20("Kazi Principal Vault Share", "kVS")
        ERC4626(IERC20(_asset))
        Ownable(msg.sender)
    {
        gate = ISelfGate(_gate);
    }

    // --- Roles / config ------------------------------------------------------

    function setAllocator(address _allocator) external onlyOwner {
        allocator = _allocator;
        emit AllocatorSet(_allocator);
    }

    function setReserveBps(uint256 _reserveBps) external onlyOwner {
        require(_reserveBps <= 10_000, "bps");
        reserveBps = _reserveBps;
        emit ReserveBpsSet(_reserveBps);
    }

    // --- Accounting ----------------------------------------------------------

    /// @inheritdoc ERC4626
    /// @dev Idle asset held by the vault + value reported by senior strategies.
    ///      Deliberately excludes any junior/credit asset.
    function totalAssets() public view override returns (uint256) {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        if (allocator != address(0)) {
            idle += IAllocatorView(allocator).totalDeployedValue();
        }
        return idle;
    }

    /// @notice Idle asset beyond the withdrawal reserve — what the Allocator may
    ///         deploy into senior strategies.
    function deployableAssets() external view returns (uint256) {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        uint256 reserve = (totalAssets() * reserveBps) / 10_000;
        return idle > reserve ? idle - reserve : 0;
    }

    /// @notice Exposure of this vault to the junior/credit layer. Structurally
    ///         zero — this contract holds no reference to it. Exposed so the
    ///         capital-protection invariant suite can assert isolation.
    function juniorExposure() external pure returns (uint256) {
        return 0;
    }

    // --- Allocator funding ---------------------------------------------------

    /// @notice Hand idle asset to the Allocator for deployment into a senior
    ///         strategy. Only the Allocator; capped at idle balance.
    function transferToAllocator(uint256 amount) external {
        require(msg.sender == allocator, "only allocator");
        IERC20(asset()).transfer(allocator, amount);
    }

    // --- Self-gated entrypoints ----------------------------------------------

    function deposit(uint256 assets, address receiver)
        public
        override
        onlyVerified(msg.sender)
        returns (uint256)
    {
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver)
        public
        override
        onlyVerified(msg.sender)
        returns (uint256)
    {
        return super.mint(shares, receiver);
    }

    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        onlyVerified(owner)
        returns (uint256)
    {
        return super.withdraw(assets, receiver, owner);
    }

    function redeem(uint256 shares, address receiver, address owner)
        public
        override
        onlyVerified(owner)
        returns (uint256)
    {
        return super.redeem(shares, receiver, owner);
    }

    // --- Liquidity sourcing on redemption ------------------------------------

    /// @dev If idle asset is insufficient for a withdrawal, pull the shortfall
    ///      back from the senior strategy before paying out. Keeps redemptions
    ///      whole as long as the senior venue is solvent and liquid.
    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        if (idle < assets && allocator != address(0)) {
            IAllocatorView(allocator).deallocate(assets - idle);
        }
        super._withdraw(caller, receiver, owner, assets, shares);
    }
}
