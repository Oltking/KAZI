# Architecture

Two layers, strictly separated by design: an off-chain **policy** layer (the
agent) and an on-chain **enforcement** layer (the contracts). The agent decides;
the contracts constrain. Capital protection is a property of the contracts, so
it holds regardless of what the agent — or the model behind it — does.

```
 MiniPay user (cUSD)                         KAZI AGENT (off-chain policy)
        │  deposit / withdraw (transactions)  • allocate/rebalance (senior only)
        ▼                                      • harvest + distribute yield
 ┌─────────────┐        reads /status,         • underwrite + issue loans (buffer)
 │  Kazi Mini  │◄──────  /vault, /activity      • service loans, write reputation
 │  App (web)  │                                • x402 calls to data agents
 └─────────────┘                                • ERC-8004 identity + Self attest
        │
        ▼ (on-chain, Celo)
 ┌───────────────────────────────────────────────────────────────┐
 │  PrincipalVault (ERC-4626, SENIOR, PROTECTED) ── Self-gated     │
 │        │ safe yield only (one-way, via Allocator)               │
 │        ▼                                                        │
 │  Allocator ──► IYieldStrategy (MockStrategy / real Celo venue)  │
 │        │ realized yield                                         │
 │        ▼                                                        │
 │  YieldDistributor ── stream ──► savers (share value grows)      │
 │        │ capped yield slice only (one-way)                      │
 │        ▼                                                        │
 │  JuniorBuffer ──► CreditBook ── loans to scored, verified       │
 │  (first-loss; principal unreachable)         members            │
 └───────────────────────────────────────────────────────────────┘
        ▲ reads/writes                 ▲ pays (x402)
   ERC-8004 registries           Institution / data agents
   Self (ZK identity gate)
```

## Money-flow rules (enforced)

- Principal lives only in `PrincipalVault` + whitelisted senior strategies.
- The `Allocator` has no reference to `JuniorBuffer`/`CreditBook` — no path from
  principal to credit.
- The `JuniorBuffer`'s lending capital is incremented only by `fundFromYield`
  (realized yield); the `CreditBook` draws only from the buffer.
- A default reduces the buffer before it can ever affect depositor share value.

See `contracts/README.md` for the invariant table and `docs/RISK.md` for the
plain-language guarantee.

## Components

| Path | Role |
| --- | --- |
| `contracts/` | Foundry: the enforcement layer (vault, allocator, distributor, buffer, credit, gate, oracle, strategies) |
| `agent/` | TypeScript: the policy layer — control loop, status/activity server, x402 institution agent, integrations |
| `web/` | Next.js MiniPay Mini App — implicit wallet, transaction-only flows, honest live ticker |
| `shared/` | Generated ABIs, deployed addresses, shared types |

## Integration status (Build Spec Ground rule 2)

| Integration | State |
| --- | --- |
| Celo / MiniPay | Alfajores via viem, legacy txs; MiniPay implicit-connection + no-signing honored in web |
| MockStrategy | Working, deterministic — the guaranteed demo path |
| Real senior venue (Aave/Morpho/Mento) | TODO: verify a Celo deployment address, then swap behind `IYieldStrategy` |
| ERC-8004 | Agent registration wired (registry address via env — verify); reputation reads simple, off-chain aggregation pushes scores |
| Self | Agent-relayed attestation model (fits MiniPay no-signing); on-chain `SelfVerificationRoot` upgrade pending hub-address verification |
| x402 (thirdweb) | Client + institution settlement wired, guarded by keys; free dev fallback so the flow always runs |
