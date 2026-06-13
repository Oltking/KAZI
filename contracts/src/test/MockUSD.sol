// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSD
/// @notice ERC-20 stand-in for cUSD used in tests, local dev, and the demo.
///         18 decimals (matches cUSD on Celo). Freely mintable so the
///         MockStrategy can simulate an external yield source paying interest.
/// @dev    NOT for production. The real deployment wires the live cUSD address.
contract MockUSD is ERC20 {
    constructor() ERC20("Mock cUSD", "mcUSD") {}

    function decimals() public pure override returns (uint8) {
        return 18;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
