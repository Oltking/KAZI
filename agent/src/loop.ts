/**
 * Kazi Agent — autonomous fund-manager control loop.
 *
 * Design rule (Build Spec §6.2): the agent is the POLICY layer (decides
 * allocation, underwriting, what to say to the user). The CONTRACTS are the
 * ENFORCEMENT layer — they physically cannot let principal reach the credit
 * book even if this code (or the model behind it) misbehaves.
 *
 * The agent holds its OWN wallet (never a user's) and operates the on-chain
 * contracts via permissioned roles. It custodies nothing off-chain; state and
 * money live on-chain. Ticks are idempotent and only emit a transaction when
 * there is a genuine economic event behind it — no padding (Build Spec §1.5 #3).
 */
import {
  addresses,
  addressesConfigured,
  vaultAbi,
  allocatorAbi,
  bufferAbi,
  creditBookAbi,
  reputationAbi,
} from "@kazi/shared";
import { read, write, account } from "./chain.ts";
import { config, MIN_HARVEST } from "./config.ts";
import { record } from "./activity.ts";
import { loadState, saveState, type AgentState } from "./state.ts";
import { isSelfVerified } from "./integrations/self.ts";
import { fetchRiskSignalViaX402 } from "./integrations/x402.ts";

export async function tick(): Promise<void> {
  if (!addressesConfigured()) {
    record("info", "addresses not configured yet — deploy contracts and update shared/addresses.json");
    return;
  }
  if (!account) {
    record("info", "AGENT_PRIVATE_KEY not set — read-only mode, skipping tick");
    return;
  }
  const state = await loadState();
  try {
    await allocateAndRebalance(); // 1. put idle principal to work (safe venues only)
    await harvestAndDistribute(); // 2. realize yield -> stream to savers
    if (config.creditEnabled) {
      await underwriteAndLend(state); // 3. lend from the YIELD buffer to scored members
      await serviceLoans(state); // 4. repayments / defaults -> reputation
    }
    state.lastTickAt = Date.now();
    await saveState(state);
  } catch (err) {
    console.error("[tick] error (will retry next tick):", err);
    // never throw out of the scheduler; keep the agent alive and idempotent.
  }
}

// 1. Allocate / rebalance — SENIOR (safe) strategies only. -------------------
async function allocateAndRebalance(): Promise<void> {
  const deployable = await read<bigint>(addresses.vault, vaultAbi as never, "deployableAssets");
  if (deployable <= 0n) return;
  // keep RESERVE_BPS idle for instant withdrawals (enforced by the vault's
  // deployableAssets()); deploy the rest into the senior strategy. Enforcement
  // guarantees we cannot deploy anywhere non-senior regardless of policy.
  const hash = await write(addresses.allocator, allocatorAbi as never, "allocate", [deployable]);
  record("allocate", `deployed ${deployable} to senior strategy`, hash);
}

// 2. Harvest realized yield and stream it back to savers. --------------------
async function harvestAndDistribute(): Promise<void> {
  // only harvest if there is yield actually worth realizing (economic event).
  const pending = await read<bigint>(addresses.allocator, allocatorAbi as never, "pendingYield");
  if (pending < MIN_HARVEST) return;
  const hash = await write(addresses.allocator, allocatorAbi as never, "harvest");
  record("harvest", `realized ${pending} yield -> distributor`, hash);
  // YieldDistributor splits per on-chain config (MVP: 100% stream, 0% buffer)
  // and auto-compounds into vault share price -> balances visibly grow.
}

// 3. Underwrite + lend — from the YIELD BUFFER only, never principal. --------
async function underwriteAndLend(state: AgentState): Promise<void> {
  const capacity = await read<bigint>(addresses.buffer, bufferAbi as never, "availableForCredit");
  if (capacity === 0n) return;

  for (const borrower of state.creditQueue) {
    if (!(await isSelfVerified(borrower))) continue; // identity gate
    const score = await read<bigint>(addresses.reputation, reputationAbi as never, "score", [borrower]);
    if (Number(score) < config.minCreditScore) continue; // reputation gate

    // POLICY enrichment: pay an institution/data agent for a risk signal (x402).
    const risk = await fetchRiskSignalViaX402(borrower).catch(() => null);

    const amount = sizeLoan(Number(score), capacity, risk?.riskScore);
    if (amount === 0n) continue;

    // CreditBook can only draw from the buffer — enforced on-chain.
    const hash = await write(addresses.creditBook, creditBookAbi as never, "issue", [borrower, amount]);
    record("lend", `${amount} to ${borrower} (score ${score})`, hash);
    state.activeLoans.push(borrower);
  }
  state.creditQueue = state.creditQueue.filter((b) => !state.activeLoans.includes(b));
}

// 4. Service loans: defaults -> write reputation. Repayments are borrower txs. -
async function serviceLoans(state: AgentState): Promise<void> {
  const still: `0x${string}`[] = [];
  for (const borrower of state.activeLoans) {
    const overdue = await read<boolean>(addresses.creditBook, creditBookAbi as never, "isOverdue", [borrower]);
    const status = await read<number>(addresses.creditBook, creditBookAbi as never, "loanStatus", [borrower]);
    if (overdue) {
      const hash = await write(addresses.creditBook, creditBookAbi as never, "markDefault", [borrower]);
      record("default", `${borrower} -> loss absorbed by buffer; reputation down`, hash);
      continue; // drop from active
    }
    if (status === 1 /* Active */) still.push(borrower);
    // Repaid (2) / Defaulted (3) drop off the active list.
  }
  state.activeLoans = still;
}

/**
 * Conservative MVP loan sizing: a small fraction of the buffer, scaled by score
 * and dampened by the x402 risk signal, hard-capped at 10% of the buffer. Never
 * touches principal (it is not even reachable from here — see enforcement layer).
 */
export function sizeLoan(score: number, capacity: bigint, riskScore?: number): bigint {
  const scoreFactor = BigInt(Math.min(score, 1000));
  let scaled = (capacity * scoreFactor) / 10_000n;
  if (riskScore !== undefined) {
    const safety = BigInt(Math.max(0, 100 - Math.min(riskScore, 100)));
    scaled = (scaled * safety) / 100n;
  }
  const cap = capacity / 10n; // never more than 10% of the buffer in one loan
  return scaled < cap ? scaled : cap;
}
