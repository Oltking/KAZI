# Risk disclosures

Radical risk transparency is part of the Kazi product. This document states, in
plain language, exactly what is and isn't protected.

## The principal guarantee

> A depositor can always redeem their full deposited principal (denominated in
> the deposit stablecoin), subject only to (a) the solvency of the whitelisted
> *senior* yield venues and (b) available withdrawal liquidity. Member principal
> is **never** lent into the at-risk credit book.

This is enforced in code, not just promised — see the invariant suite in
`contracts/test/CapitalProtection.t.sol`. The agent decides *policy*; the
contracts *enforce* the guarantee, so even a misbehaving agent (or model) cannot
move principal into credit.

## What is protected

- **Your principal.** It sits only in the `PrincipalVault` and whitelisted
  senior strategies. There is no contract call path from principal to the
  junior buffer or credit book.
- **A withdrawal reserve** (default 10%) is kept idle for instant redemptions;
  if a withdrawal needs more, the vault pulls principal back from the senior
  strategy before paying out.

## What carries risk (and how it's contained)

1. **Senior venue solvency.** Principal is only as safe as the audited
   stablecoin venues it's deployed to. The MVP default deploys to a deterministic
   `MockStrategy`; production must use a verified, audited, Celo-deployed venue.
   This is the single carve-out in the principal guarantee.
2. **Earned yield exposed to credit (only when the credit module is enabled).**
   With the credit loop on, a configurable slice of *realized yield* funds the
   `JuniorBuffer`. Loans are made only from that buffer. If a borrower defaults,
   the loss is absorbed by the buffer first — it can never reduce depositor
   principal. With the MVP default split (100% stream / 0% buffer), no yield is
   exposed at all.
3. **Smart-contract risk.** As with any on-chain system, bugs are possible. The
   capital-protection properties are covered by an invariant + unit + scenario
   test suite, but this is testnet software and unaudited.
4. **Stablecoin risk.** Value is denominated in a dollar stablecoin (cUSD);
   a depeg would affect dollar value independent of Kazi.

## Identity & region

Verification uses Self (proof of unique humanity + region/OFAC gating). If Self
isn't available in your region, the onboarding degrades gracefully per the
documented exception rather than hard-blocking.

## No fake numbers

The earnings ticker reflects *realized on-chain value* projected forward at the
most recent realized rate — never a fabricated APY.
