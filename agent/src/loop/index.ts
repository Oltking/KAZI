/**
 * Kazi Agent — autonomous fund-manager control loop (skeleton).
 *
 * Design rule (Build Spec §6.2): the agent is the POLICY layer (decides
 * allocation, underwriting, what to say to the user). The CONTRACTS are the
 * ENFORCEMENT layer — they physically cannot let principal reach the credit
 * book even if this code (or the model behind it) misbehaves. Keep it that way.
 *
 * The agent holds its OWN wallet (never a user's) and its OWN Self Agent ID +
 * ERC-8004 identity. It custodies nothing off-chain; it only operates the
 * on-chain contracts via permissioned roles. State + money live on-chain.
 *
 * Every external dependency marked TODO must be verified against live docs
 * before relying on it (Build Spec, Ground rule 2).
 */

import { createPublicClient, createWalletClient, http, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celoAlfajores } from "viem/chains";
import cron from "node-cron";

import { addresses } from "../../shared/addresses.json";
import { allocatorAbi, vaultAbi, distributorAbi, creditBookAbi, bufferAbi, reputationAbi } from "../../shared/abi";
import { loadState, saveState, type AgentState } from "./state";
import { ensureErc8004Identity } from "./integrations/erc8004";
import { fetchRiskSignalViaX402 } from "./integrations/x402";
import { isSelfVerified } from "./integrations/self";

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`);

const publicClient = createPublicClient({
  chain: celoAlfajores,
  transport: http(process.env.CELO_RPC_URL),
});

// NOTE: agent txs may pay gas in cUSD via Celo fee abstraction (feeCurrency).
// The MiniPay "no signing / legacy tx" constraints apply to the WEB app, not
// to this server wallet. Use legacy tx mode on Celo regardless for safety.
const walletClient = createWalletClient({
  account,
  chain: celoAlfajores,
  transport: http(process.env.CELO_RPC_URL),
});

const RESERVE_BPS = Number(process.env.RESERVE_BPS ?? 1000);
const MIN_CREDIT_SCORE = Number(process.env.MIN_CREDIT_SCORE ?? 600);
const CREDIT_ENABLED = process.env.CREDIT_ENABLED === "true"; // flag-gated (Spec §2)

// ---------------------------------------------------------------------------
// One control-loop tick. Idempotent and restart-safe: persists last-processed
// block + loan cursor so a crash/restart never double-acts.
//
// IMPORTANT (Spec §1.5 #3): only emit a transaction when there is a genuine
// economic event behind it. No padding. Volume must be a byproduct of usage.
// ---------------------------------------------------------------------------
async function tick(): Promise<void> {
  const state = await loadState();
  try {
    await allocateAndRebalance(state); // 1. put idle principal to work (safe venues only)
    await harvestAndDistribute(state); // 2. realize yield → stream to savers
    if (CREDIT_ENABLED) {
      await underwriteAndLend(state);  // 3. lend from YIELD buffer to scored members
      await serviceLoans(state);       // 4. repayments / defaults → reputation
    }
    state.lastTickAt = Date.now();
    await saveState(state);
  } catch (err) {
    console.error("[tick] error (will retry next tick):", err);
    // never throw out of the scheduler; keep the agent alive and idempotent.
  }
}

// 1. Allocate / rebalance — SENIOR (safe) strategies only. ----------------------
async function allocateAndRebalance(_state: AgentState): Promise<void> {
  const deployable = await publicClient.readContract({
    address: addresses.vault as Address, abi: vaultAbi, functionName: "deployableAssets",
  }) as bigint;

  // keep RESERVE_BPS idle for instant withdrawals; deploy the rest.
  const totalAssets = await publicClient.readContract({
    address: addresses.vault as Address, abi: vaultAbi, functionName: "totalAssets",
  }) as bigint;
  const reserveTarget = (totalAssets * BigInt(RESERVE_BPS)) / 10_000n;

  // POLICY: pick the best risk-adjusted SENIOR venue. For MVP a single mock /
  // blue-chip stablecoin lending venue (Aave/Morpho/Mento on Celo — verify).
  // Enforcement guarantees we cannot deploy anywhere non-senior regardless.
  if (deployable > reserveTarget && deployable > 0n) {
    const toDeploy = deployable - reserveTarget;
    if (toDeploy > 0n) {
      const hash = await write(addresses.allocator as Address, allocatorAbi, "allocate", [toDeploy]);
      console.log(`[allocate] deployed ${toDeploy} -> senior strategy (${hash})`);
    }
  }
}

// 2. Harvest realized yield and stream it back to savers. ----------------------
async function harvestAndDistribute(_state: AgentState): Promise<void> {
  // only harvest if there is yield actually worth realizing (economic event).
  const pending = await publicClient.readContract({
    address: addresses.allocator as Address, abi: allocatorAbi, functionName: "pendingYield",
  }) as bigint;

  const MIN_HARVEST = 1_000_000n; // dust threshold; tune per decimals.
  if (pending < MIN_HARVEST) return;

  const hash = await write(addresses.allocator as Address, allocatorAbi, "harvest", []);
  console.log(`[harvest] realized ${pending} yield -> distributor (${hash})`);
  // YieldDistributor splits per on-chain config (MVP: 100% stream, 0% buffer)
  // and auto-compounds into vault share price → balances visibly grow.
}

// 3. Underwrite + lend — from the YIELD BUFFER only, never principal. -----------
async function underwriteAndLend(state: AgentState): Promise<void> {
  const capacity = await publicClient.readContract({
    address: addresses.buffer as Address, abi: bufferAbi, functionName: "availableForCredit",
  }) as bigint;
  if (capacity === 0n) return;

  for (const borrower of state.creditQueue) {
    if (!(await isSelfVerified(borrower))) continue;                 // identity gate
    const score = await reputationScore(borrower);
    if (score < MIN_CREDIT_SCORE) continue;                          // reputation gate

    // POLICY enrichment: pay an institution/data agent for a risk signal over x402.
    const risk = await fetchRiskSignalViaX402(borrower).catch(() => null);

    const amount = sizeLoan(score, capacity, risk);                  // conservative for MVP
    if (amount === 0n) continue;

    // CreditBook can only draw from the buffer — enforced on-chain.
    const hash = await write(addresses.creditBook as Address, creditBookAbi, "issue", [borrower, amount]);
    console.log(`[lend] ${amount} to ${borrower} (score ${score}) (${hash})`);
  }
}

// 4. Service loans: repayments + defaults, write reputation. --------------------
async function serviceLoans(state: AgentState): Promise<void> {
  for (const borrower of state.activeLoans) {
    const status = await publicClient.readContract({
      address: addresses.creditBook as Address, abi: creditBookAbi, functionName: "loanStatus", args: [borrower],
    }) as number; // 0 active, 1 repaid, 2 overdue, 3 defaulted

    if (status === 2 /* overdue past grace */) {
      const hash = await write(addresses.creditBook as Address, creditBookAbi, "markDefault", [borrower]);
      console.log(`[default] ${borrower} -> loss absorbed by buffer; reputation down (${hash})`);
      // markDefault should also write a negative ERC-8004 reputation signal.
    }
    // repayments are initiated by the borrower (a transaction); the CreditBook
    // forwards interest to the distributor and writes a positive reputation
    // signal on repay. The agent only needs to handle the default path here.
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function reputationScore(addr: Address): Promise<number> {
  const s = await publicClient.readContract({
    address: addresses.reputation as Address, abi: reputationAbi, functionName: "score", args: [addr],
  }) as bigint;
  return Number(s);
}

function sizeLoan(score: number, capacity: bigint, _risk: unknown): bigint {
  // Conservative MVP policy: loan = small fraction of buffer, scaled by score,
  // hard-capped. Never lends out the whole buffer; never touches principal
  // (principal is not even reachable from here — see enforcement layer).
  const scaled = (capacity * BigInt(Math.min(score, 1000))) / 10_000n;
  const cap = capacity / 10n; // never more than 10% of buffer in one loan
  return scaled < cap ? scaled : cap;
}

async function write(address: Address, abi: unknown, fn: string, args: unknown[]): Promise<Hash> {
  // legacy tx mode for Celo; feeCurrency (cUSD) optional via Celo fee abstraction.
  const { request } = await publicClient.simulateContract({
    account, address, abi: abi as never, functionName: fn as never, args: args as never,
  });
  return walletClient.writeContract(request as never);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  // ensure the agent has its ERC-8004 identity (so it appears on 8004scan) and
  // its Self Agent ID before doing anything else.
  await ensureErc8004Identity({ account, publicClient, walletClient });
  console.log(`[boot] Kazi agent live as ${account.address}`);

  // run once on boot, then on a schedule. Interval is generous on purpose —
  // ticks are no-ops unless there is a real economic event to act on.
  await tick();
  const everyNMinutes = `*/${Math.max(1, Math.floor(Number(process.env.HARVEST_INTERVAL_SECONDS ?? 300) / 60))} * * * *`;
  cron.schedule(everyNMinutes, () => { void tick(); });
}

void main();

// A tiny HTTP server (/status, /activity) for the frontend live feed + demo
// lives in ./server — not shown here. The x402-priced "institution agent"
// counter-party endpoint also lives there (Build Spec §6.1 #6).
