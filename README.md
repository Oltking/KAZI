# Kazi

**Capital-protected, streaming-yield savings, as an autonomous on-chain agent on Celo.**

You deposit dollar stablecoins. Your **principal is never put at risk.** An autonomous fund-manager agent puts your money to work in conservative venues, and the yield **streams back to you in real time**, so you watch your balance tick upward. The yield is real lending interest, not token emissions, and only accumulated *yield* is ever exposed to credit risk, absorbed by a first-loss buffer before any saver is touched.

Built for the 15M+ MiniPay users in emerging markets. Identity verified with **Self**, portable reputation via **ERC-8004**, agent-to-agent settlement over **x402**, on **Celo**.

🔗 **Live app:** https://kazi-agent.vercel.app  ·  **Agent on 8004scan:** ERC-8004 `agentId 351`  ·  **Network:** Celo Sepolia (`11142220`)

---

## The guarantee (enforced in code, not promised)

> A depositor can always redeem their full principal, subject only to the solvency of the whitelisted senior venues and available liquidity. Member principal is **never** lent into the at-risk credit book.

The agent is the **policy** layer (it decides allocation and underwriting); the contracts are the **enforcement** layer. Even if the agent, or the model behind it, misbehaves, it physically cannot move principal into credit. Trust is architecture here, not a marketing word. It is proven by the invariant suite in [`contracts/test/CapitalProtection.t.sol`](contracts/test/CapitalProtection.t.sol), which gates every build.

## Highlights

- 🛡️ **Capital-protected by construction.** Separate vaults, one-directional money flow, and a fuzzed invariant suite that makes a principal leak impossible.
- 📈 **Honest streaming yield.** The live balance ticker is projected from *realized on-chain value*, never a fabricated APY.
- 🪪 **Real identity.** Privacy-preserving Self verification (proof of unique humanity, 18+, region), gating deposits and credit.
- 🧮 **Earned reputation, real credit.** A member's credit score is computed from genuine on-chain saving and repayment history; loans are funded only by realized yield, so no saver's principal is ever at risk.
- 🤖 **A real agent.** Registered on ERC-8004 (`agentId 351`), it allocates, harvests, distributes, underwrites, and settles agent-to-agent data calls over x402.
- 📱 **MiniPay-native.** Stablecoin-only, mobile-first, every action is a plain transaction (no message signing).

## How it works

```
Saver (cUSD) ──deposit──▶ PrincipalVault (ERC-4626, senior, PROTECTED)
                              │ safe yield only (one-way)
                              ▼
                          Allocator ──▶ senior IYieldStrategy
                              │ realized yield
                              ▼
                          YieldDistributor ──stream──▶ savers (balance ticks up)
                              │ capped yield slice only (one-way)
                              ▼
                          JuniorBuffer ──▶ CreditBook (loans to verified, scored members)
                              first-loss; principal unreachable

Kazi Agent (off-chain policy): allocate · harvest · distribute · underwrite ·
  service loans · earn reputation · x402 data calls · ERC-8004 + Self
```

**The flywheel:** more saving → richer reputation → safer, cheaper credit → higher real yield → more reason to save.

## Why it fits Celo

Mobile-first finance for the underbanked Global South is Celo's founding mission, and this sits dead-center: stablecoin-native, MiniPay-distributed, no token, yield from a real credit market. That is the anti-speculation posture the ecosystem screens for. The senior yield strategy is a swappable `IYieldStrategy` adapter, ready to point at a Celo-deployed venue.

## Tech

| Layer | Stack |
| --- | --- |
| Contracts | Foundry, Solidity 0.8.x, OpenZeppelin, ERC-4626 |
| Agent / API | TypeScript, viem, Next.js route handlers |
| Web | Next.js, viem, `@selfxyz/qrcode`, no heavy UI deps |
| Identity | Self (`@selfxyz/core` off-chain verification) |
| Reputation / identity registry | ERC-8004 |
| Payments | x402 (thirdweb) |

## Live on Celo Sepolia

Deployed and transacting on Celo Sepolia (chain `11142220`). The agent registered **ERC-8004 `agentId 351`**, and a real deposit → allocate → harvest cycle grows the saver's balance on-chain. Contract addresses and a one-command reproduce are in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Run it

```bash
cp .env.example .env            # fill keys for live deploy; never commit .env
pnpm install
cd contracts && forge install && forge test     # 15 tests, invariants included
```

See the whole product run end-to-end, on a real chain, with **zero secrets**:

```bash
pnpm e2e   # spins up Anvil as Celo Sepolia, deploys, and drives the REAL agent:
           # deposit → allocate → harvest → fund buffer → lend → default → withdraw,
           # asserting depositor principal is never touched.
```

Deploy to Celo Sepolia and run the live app:

```bash
cd contracts && forge script script/Deploy.s.sol --rpc-url $CELO_RPC_URL --broadcast
cd ../agent  && pnpm start     # agent registers its ERC-8004 id and starts ticking
cd ../web    && pnpm dev       # landing at /, the Mini App at /app
```

## Tests

`forge test` is green: **5 capital-protection invariants** (principal isolation, backing, junior exclusion, loss waterfall, value conservation), **9 unit tests** (gating, access control, redeemability), and **1 end-to-end credit-loop scenario** proving a default is absorbed by the buffer while depositor principal is untouched.

## Repo layout

```
contracts/   Foundry: vault, allocator, distributor, buffer, credit, gate, oracle, strategies
agent/       TypeScript: control loop (policy) + integrations (erc8004 / x402 / self)
web/         Next.js: landing at /, the Mini App at /app, + agent API routes
shared/      ABIs, deployed addresses, types
docs/        Architecture, risk disclosures, demo + deploy guides
```

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): layers, money-flow rules, integration status
- [`docs/RISK.md`](docs/RISK.md): the principal guarantee and plain-language risk disclosures
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md): live addresses and reproduce steps
- [`docs/DEPLOY-WEB.md`](docs/DEPLOY-WEB.md): deploy the web app to Vercel
- [`docs/DEMO.md`](docs/DEMO.md): a short demo script
- [`contracts/README.md`](contracts/README.md): the invariant suite and what it proves

## Non-goals

No token or emissions-funded "yield". No leverage or exotic strategies for principal. No off-chain custody. No fabricated UI numbers (the ticker reflects realized on-chain yield only). No user-side signing.

## License

MIT
