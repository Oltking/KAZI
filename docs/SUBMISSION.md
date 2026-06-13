# Hackathon submission checklist

Celo Onchain Agents Hackathon — "Build for Real World Payments & Everyday
Applications". Tracks: Best Agent on Celo · Most Activity (onchain txs) ·
Highest Rank on 8004scan.

## Pre-submission

- [ ] Deploy contracts to Celo Sepolia (`forge script script/Deploy.s.sol --broadcast`)
      and confirm `shared/addresses.json` is updated.
- [ ] Fund the deployer, the agent wallet, and a demo user with test cUSD from
      the Celo Sepolia faucet.
- [ ] Run the agent; confirm it allocates, harvests, distributes, and registers
      its ERC-8004 identity (appears on **8004scan**).
- [ ] Verify the agent has a Self Agent ID.
- [ ] Run the web app, tunnel via ngrok, and test inside MiniPay on a real
      Android device: no Connect button, txs pay in the right currency, no flow
      requires signing.
- [ ] `forge test` green (invariants + unit + the credit-loop money-shot).

## Register & announce

- [ ] Quote-tweet the announcement tagging `@CeloDevs` + `@Celo`, name the agent
      (Kazi), drop the **ERC-8004 registry link**, use `#CeloAgents`.
- [ ] Join the Telegram group for updates.
- [ ] Tweet the agent with its **8004scan `agentId`** and **Self Agent ID**,
      tagging `@Celo` + `@CeloDevs`.

## Submit

- [ ] `npx skills add https://celobuilders.xyz`
- [ ] Ask the coding agent to "submit my project to the Celo Onchain Agents
      Hackathon" → choose `celo-onchain-agents` → answer prompts → review →
      publish.

## Deliverables

- [ ] Public repo (this one) with README (principal guarantee + architecture).
- [ ] Short demo video following `docs/DEMO.md`.
- [ ] Live testnet deployment + agent running.

## Why it scores

Real users + real money + verified identity + portable reputation = squarely on
Celo's "real economy, not a casino" thesis. Capital protection makes it trustable
for the actual user base; the agent's continuous, economically-meaningful
operations produce the on-chain activity the tracks reward. The design also aims
to clear the **Agent Visa** thresholds and the MiniPay Mini App incentive
programme — it has a life past the deadline.
