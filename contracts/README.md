# Kazi contracts

Foundry workspace for the capital-protected vault and the (flag-gated) credit
loop. Solidity `^0.8.24`, OpenZeppelin 5.

```
src/
  PrincipalVault.sol     ERC-4626 senior vault — holds all principal, Self-gated
  Allocator.sol          moves principal vault <-> senior strategies; harvests
  YieldDistributor.sol   splits realized yield: stream to savers / fund buffer
  JuniorBuffer.sol       first-loss, yield-only credit capital (never principal)
  CreditBook.sol         loans from the buffer to verified + scored borrowers
  SelfGate.sol           Self verification gate for deposits/withdraws/borrows
  ReputationOracle.sol   ERC-8004 reputation adapter (member credit scores)
  interfaces/IYieldStrategy.sol
  strategies/MockStrategy.sol   deterministic, settable-APR demo strategy
  test/MockUSD.sol              mintable cUSD stand-in for dev/demo
test/
  CapitalProtection.t.sol  invariant suite — the safety contract of the system
  Unit.t.sol               gating + access-control + redeemability unit tests
  CreditLoop.t.sol         end-to-end scenario: borrow, repay, default; principal safe
script/
  Deploy.s.sol             deploy + wire roles + write shared/addresses.json
```

## Build & test

```bash
forge install foundry-rs/forge-std --no-git
forge install OpenZeppelin/openzeppelin-contracts --no-git
forge build
forge test            # 15 tests: 5 invariants, 9 unit, 1 end-to-end scenario
```

## The money-flow guarantee

Principal can only ever sit in the `PrincipalVault` or in whitelisted **senior**
strategies reached through the `Allocator`. The `Allocator` holds no reference
to the `JuniorBuffer`/`CreditBook`, so there is no call path from principal to
credit. The buffer's lending capital is incremented *only* by
`fundFromYield` (realized yield), and the `CreditBook` can draw *only* from the
buffer. These properties are enforced by the invariant suite:

| Invariant | Property |
| --- | --- |
| `creditFundedOnlyByYield` | outstanding credit ≤ yield ever routed to the buffer |
| `principalAlwaysBacked` | vault assets ≥ net principal deposited |
| `vaultExcludesJuniorAssets` | the vault has zero junior/credit exposure |
| `lossWaterfallBufferFirst` | cumulative losses ≤ buffer funding (never reach principal) |
| `conservation` | no value is created from nowhere or leaks away |

### Note on the conservation invariant

The original `CapitalProtection.t.sol` scaffold stated conservation against a
single net-principal ghost whose `withdraw` bookkeeping subtracted only the
*principal* portion of a redemption while the right-hand side counted *gross*
lifetime yield. That silently dropped any withdrawn yield, so the equality only
held for fuzz seeds that never withdrew earned yield (it failed on others, e.g.
`--fuzz-seed 99`). The handler now tracks gross deposits and gross withdrawals
(`ghost_deposited` / `ghost_withdrawn`) and the invariant asserts the exact
conservation law — deterministically green across seeds. The five safety
properties are unchanged in meaning; only the conservation bookkeeping was made
correct. See the comments in `test/CapitalProtection.t.sol`.

## Production TODOs (verify before enabling — do not invent addresses)

- Swap `MockStrategy` for a real Celo-deployed, audited stablecoin venue
  (Aave / Morpho / Mento on Celo) once its deployment address is verified.
- Back `SelfGate` with the live Self verification flow (the permissionless
  `setVerified` is dev/test seeding only).
- Back `ReputationOracle` with the live ERC-8004 Reputation Registry on Celo.
