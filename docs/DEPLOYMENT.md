# Live deployment — Celo Sepolia

Kazi is deployed and running on **Celo Sepolia** (chain id `11142220`). These are
real, on-chain addresses; the agent transacts against them.

Explorer: https://celo-sepolia.blockscout.com  (also https://sepolia.celoscan.io)

## Contracts

| Contract | Address |
| --- | --- |
| PrincipalVault (ERC-4626) | `0xD78e8Cf9ef529BAC7b80CacFe529f57A1E9eEc74` |
| Allocator | `0xabC650ad27aA19A163952F360738D159c5d8727b` |
| YieldDistributor | `0x0348476beF496C751dC6B9Fa73d7EAae1F1798C6` |
| JuniorBuffer | `0x922Bd609B1Accd445d410c181daD771d6fCca3a9` |
| CreditBook | `0x5dF5A9A7ff5C6DA76824D92011e1e1ae9fe70215` |
| SelfGate | `0x3a96dFE71268748443611C0070985eDDE035126e` |
| ReputationOracle | `0x34cFc827231a9Db7b053082858B19D3B7dAE35e4` |
| MockStrategy (senior, demo) | `0x8E109d9108315E424E408A6fe406AA5D1Cf1A06C` |
| MockUSD (demo cUSD) | `0xc24fBd2956820605075Bd85D0f69539f6247c878` |
| SelfVerifier (Self ZK → SelfGate) | `0xB0b1E4F348DA20857a4dD152595c6994587de9C8` |
| Self Identity Verification Hub V2 | `0x16ECBA51e18a4a7e61fdC417f0d47AFEeDfbed74` |

> **Self verification is real and on-chain.** A member scans their passport/ID in
> the Self app; the Hub V2 validates the ZK proof and calls `SelfVerifier`, which
> attests them into `SelfGate` (18+, excludes US, OFAC off — matching the web
> disclosure config). Building the contracts needs the Self Solidity deps:
> `cd contracts && npm install` (pulls `@selfxyz/contracts`), then `forge build`.
> Deploy the verifier with `forge script script/DeploySelfVerifier.s.sol`.

> The senior strategy and asset are the demo MockStrategy/MockUSD so the streaming
> yield works without an external dependency (Build Spec §5.1). Swapping in a
> verified Celo stablecoin venue + the real cUSD is a config change behind
> `IYieldStrategy`.

## Agent identity (ERC-8004)

- **agentId `351`** in the ERC-8004 Identity Registry on Celo Sepolia
  (`0x8004A818BFB912233c491871b3d84c89A494BD9e`) — surfaces on 8004scan.
- The agent's registration file is served at `${AGENT_PUBLIC_URL}/registration.json`.
  For 8004scan to resolve it, set `AGENT_PUBLIC_URL` to a public HTTPS URL
  (ngrok/host) before registering in the final demo.

## Reproduce

```bash
cp .env.example .env                 # set CELO_RPC_URL + a funded key
cd contracts
CHAIN=celo-sepolia USE_REAL_CUSD=false MOCK_STRATEGY_APR_BPS=800 \
  forge script script/Deploy.s.sol --rpc-url $CELO_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY --broadcast
# addresses written to shared/addresses.json
cd ../agent && pnpm start            # registers ERC-8004 id, allocates, harvests
```
