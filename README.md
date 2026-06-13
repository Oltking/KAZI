# Kazi

**Capital-protected, streaming-yield savings — an autonomous on-chain agent on Celo.**

You deposit dollar stablecoins. Your **principal is never put at risk.** An autonomous fund-manager agent puts your money to work in conservative, audited venues, and the yield **streams back to you in real time** — you watch your balance tick upward. The yield is real (lending interest from a real economy, not token emissions), and only accumulated *yield* is ever exposed to credit risk, absorbed by a first-loss buffer before any saver is touched.

Built for the 15M+ MiniPay users in emerging markets. Identity verified with **Self**, reputation made portable via **ERC-8004**, agent-to-agent settlement over **x402**, distribution through **MiniPay** on **Celo**.

> **Principal guarantee (enforced in code, not just promised):** a depositor can always redeem their full principal, subject only to the solvency of whitelisted senior venues and available liquidity. Member principal is **never** lent into the at-risk credit book. The contracts make this physically impossible — see `contracts/test/CapitalProtection.t.sol`, the invariant suite that gates every build.

## Why it's trustable

The agent is the **policy** layer (it decides allocation and underwriting); the contracts are the **enforcement** layer. Even if the agent — or the model behind it — misbehaves, it cannot move principal into credit. Trust is architecture here, not a marketing word.

## Why it fits Celo

Mobile-first finance for the underbanked Global South is Celo's founding mission; this is dead-center. Stablecoin-native, MiniPay-distributed, no token, yield from a real credit market — the anti-speculation posture the ecosystem screens for. Senior yield is anchored in **Celo-deployed** venues (Aave / Morpho / Mento / Curve on Celo — verify deployments) and stablecoin FX routes through **Mento**, Celo's native stablecoin protocol. (See `KAZI_BUILD_SPEC.md §1.5` for the honest fit analysis.)

## Architecture (one glance)

```
Saver (cUSD) ──deposit──> PrincipalVault (ERC-4626, senior, PROTECTED)
                              │ safe yield only (one-way)
                              ▼
                          Allocator → senior IYieldStrategy (Celo DeFi)
                              │ realized yield
                              ▼
                          YieldDistributor ──stream──> savers (balance ticks up)
                              │ capped yield slice only (one-way)
                              ▼
                          JuniorBuffer → CreditBook (loans to scored members)
                              first-loss; principal unreachable

Kazi Agent (off-chain policy): allocate · harvest · distribute · underwrite ·
  service loans · x402 data calls · ERC-8004 identity + reputation · Self verify
```

## Repo layout

```
contracts/   Foundry. Vault, Allocator, strategies, distributor, buffer, credit, gate, oracle.
agent/       TypeScript. Control loop (policy), integrations (erc8004/x402/self), status server.
web/         Next.js MiniPay Mini App (wagmi/viem). No connect button, no signing, cUSD fees.
shared/      ABIs, addresses, types.
docs/        Build spec, risk disclosures, demo script.
```

## Quickstart (Alfajores testnet)

```bash
cp .env.example .env            # fill in keys; never commit .env
cd contracts && forge install && forge test   # invariants MUST pass
forge script script/Deploy.s.sol --rpc-url $CELO_RPC_URL --broadcast
# writes deployed addresses to shared/addresses.json
cd ../agent && pnpm i && pnpm dev               # agent boots, registers ERC-8004 id, starts ticking
cd ../web && pnpm i && pnpm dev                  # then tunnel via ngrok + open in MiniPay on a real Android device
```

Get test cUSD from the Celo faucet for the deployer, the agent wallet, and a demo user.

## Build order

Follow `KAZI_BUILD_SPEC.md §11`. Phases 1–2 (capital-protected vault + honest streaming + agent harvest loop) must be a complete, transacting, winning submission on their own. The credit loop, x402, and reputation (Phases 4–5) are flag-gated upside, demoed without ever touching principal.

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — layers, money-flow rules, integration status
- [`docs/RISK.md`](docs/RISK.md) — the principal guarantee + plain-language risk disclosures
- [`docs/DEMO.md`](docs/DEMO.md) — the ~3-minute demo script
- [`docs/SUBMISSION.md`](docs/SUBMISSION.md) — hackathon checklist
- [`contracts/README.md`](contracts/README.md) — the invariant suite and what it proves

## Status

- **Contracts** — complete; `forge test` green (5 capital-protection invariants, 9 unit tests, 1 end-to-end credit-loop scenario).
- **Agent** — control loop, `/status`·`/vault`·`/activity` server, ERC-8004 registration, x402 institution agent. Works against `MockStrategy` today.
- **Web** — MiniPay Mini App with the live earnings ticker; deposit/withdraw as plain transactions.
- **External integrations** (Self, ERC-8004 registry addresses, thirdweb x402) are wired but every live address/API is marked `// TODO: verify` and must be confirmed against current docs before mainnet — see `docs/ARCHITECTURE.md`.

## Non-goals

No token / emissions-funded yield. No leverage or exotic strategies for principal. No off-chain custody. No fake UI numbers (the ticker reflects realized on-chain yield only). No user-side signing (MiniPay constraint). No hardcoded unverified addresses.

## License

MIT (or your choice).
