# Demo script (~2–3 minutes, Celo Sepolia, real txs visible)

Following Build Spec §14. Have ready: the web app open in MiniPay (or a desktop
injected wallet) via an ngrok tunnel, the agent running (`/activity` feed
visible), and 8004scan open on the agent's `agentId`.

1. **Hook (10s).** "Savings that work for you — principal protected, yield
   streaming in real time." Show the live ticker climbing on the Home screen.

2. **Deposit (20s).** Self-verify a member inside MiniPay, then deposit cUSD →
   shares minted. Point out: no Connect button, no signing — just a transaction.

3. **Money at work (20s).** Show the agent's `/activity` feed:
   `allocate → harvest → distribute`. The balance ticks up. Open 8004scan to show
   the agent registered (ERC-8004 `agentId`).

4. **The loop (40s).** A second verified member with reputation borrows a small
   amount from the **yield buffer**. The agent pays the institution agent over
   **x402** for a risk signal (show the paid call). Loan issued → member repays
   with interest → interest streams to the saver → reputation updates.

5. **The guarantee — the money-shot (20s).** Trigger a default in the scripted
   scenario. Show on-chain that the **buffer** absorbs the loss and **depositor
   principal is unchanged**. (This is exactly what
   `test/CreditLoop.t.sol::test_creditLoop_principalNeverTouchedByDefault`
   proves — you can run it live: `forge test --match-test
   test_creditLoop_principalNeverTouchedByDefault -vv`.)

6. **Close (10s).** The flywheel: more saving → richer reputation → safer,
   cheaper credit → higher real yield → more reason to save. "Built for 15M
   MiniPay users, real economy, capital protected."

## Running the pieces

```bash
# 1. contracts
cd contracts && forge test            # show the suite green
forge script script/Deploy.s.sol --rpc-url $CELO_RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY

# 2. agent (transacts on testnet, serves /activity + the x402 institution agent)
cd ../agent && pnpm start

# 3. web (then tunnel + open in MiniPay)
cd ../web && pnpm dev
ngrok http 3000
```

For a fast-moving demo, lower `HARVEST_INTERVAL_SECONDS` and raise
`MOCK_STRATEGY_APR_BPS` so the ticker visibly moves and harvests are frequent —
but keep each transaction tied to a real economic event (no padding).
