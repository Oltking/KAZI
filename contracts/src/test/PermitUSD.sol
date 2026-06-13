// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title PermitUSD
/// @notice A test stablecoin that supports EIP-2612 `permit`, so it can be used
///         as the x402 payment token on testnets where no facilitator-supported
///         stablecoin exists (e.g. Celo Sepolia). On mainnet, real USDC plays
///         this role. 18 decimals, freely mintable for the demo.
/// @dev    The x402 facilitator settles a real on-chain transfer via the signed
///         permit — no minted/faked yield, an actual token movement.
contract PermitUSD is ERC20, ERC20Permit {
    constructor() ERC20("Kazi Demo USD", "kUSD") ERC20Permit("Kazi Demo USD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
