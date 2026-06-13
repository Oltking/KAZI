"use client";

import { type Address, formatUnits, parseUnits } from "viem";
import {
  addresses,
  vaultAbi,
  allocatorAbi,
  distributorAbi,
  bufferAbi,
  creditBookAbi,
  reputationAbi,
  erc20Abi,
  selfGateAbi,
} from "@kazi/shared";
import { publicClient, getWalletClient } from "./chain";

export const ASSET_DECIMALS = 18; // cUSD / MockUSD

export type VaultView = {
  configured: boolean;
  totalAssets: bigint;
  totalSupply: bigint;
  deployed: bigint;
  pendingYield: bigint;
};

export type Position = {
  shares: bigint;
  assets: bigint; // current redeemable value of those shares
};

const ZERO = "0x0000000000000000000000000000000000000000";
export const isConfigured = addresses.vault !== ZERO && addresses.asset !== ZERO;

export function fmt(amount: bigint, dp = 2): string {
  const n = Number(formatUnits(amount, ASSET_DECIMALS));
  return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Realized APY implied by on-chain pending yield vs deployed principal, honest
 *  (no fabricated number). Returned as a fraction (0.05 = 5%). Best-effort: the
 *  agent's /vault endpoint also surfaces these for cross-checking. */
export function impliedApy(v: VaultView): number {
  if (v.deployed === 0n) return 0;
  // pendingYield is the un-harvested accrual; we annualize a conservative
  // estimate only for the inter-harvest projection. The headline figure should
  // come from realized harvests over time — see the agent activity feed.
  return 0; // computed in the ticker from successive /vault samples instead.
}

export async function fetchVaultView(): Promise<VaultView> {
  // Read directly on-chain so the deployed app needs no hosted agent server.
  if (!isConfigured) return emptyView(false);
  try {
    const [totalAssets, totalSupply, deployed, pendingYield] = await Promise.all([
      publicClient.readContract({ address: addresses.vault, abi: vaultAbi, functionName: "totalAssets" }) as Promise<bigint>,
      publicClient.readContract({ address: addresses.vault, abi: vaultAbi, functionName: "totalSupply" }) as Promise<bigint>,
      publicClient.readContract({ address: addresses.allocator, abi: allocatorAbi, functionName: "totalDeployedValue" }) as Promise<bigint>,
      publicClient.readContract({ address: addresses.allocator, abi: allocatorAbi, functionName: "pendingYield" }) as Promise<bigint>,
    ]);
    return { configured: true, totalAssets, totalSupply, deployed, pendingYield };
  } catch {
    return emptyView(true);
  }
}

function emptyView(configured: boolean): VaultView {
  return { configured, totalAssets: 0n, totalSupply: 0n, deployed: 0n, pendingYield: 0n };
}

export type PoolStats = {
  tvl: bigint; // total value saved in Kazi (vault totalAssets)
  pendingYield: bigint; // accruing, not yet harvested
  lifetimeYield: bigint; // total yield ever streamed to savers / buffer
};

/** Real, public pool stats read on-chain — used by the landing page. */
export async function fetchPoolStats(): Promise<PoolStats | null> {
  if (!isConfigured) return null;
  try {
    const [tvl, pendingYield, lifetimeYield] = await Promise.all([
      publicClient.readContract({ address: addresses.vault, abi: vaultAbi, functionName: "totalAssets" }) as Promise<bigint>,
      publicClient.readContract({ address: addresses.allocator, abi: allocatorAbi, functionName: "pendingYield" }) as Promise<bigint>,
      publicClient.readContract({ address: addresses.distributor, abi: distributorAbi, functionName: "lifetimeYieldRealized" }) as Promise<bigint>,
    ]);
    return { tvl, pendingYield, lifetimeYield };
  } catch {
    return null;
  }
}

export async function fetchPosition(user: Address): Promise<Position> {
  if (!isConfigured) return { shares: 0n, assets: 0n };
  const shares = (await publicClient.readContract({
    address: addresses.vault,
    abi: vaultAbi,
    functionName: "balanceOf",
    args: [user],
  })) as bigint;
  const assets =
    shares === 0n
      ? 0n
      : ((await publicClient.readContract({
          address: addresses.vault,
          abi: vaultAbi,
          functionName: "previewRedeem",
          args: [shares],
        })) as bigint);
  return { shares, assets };
}

/** Real on-chain Self verification status from the gate. Never faked — the
 *  deposit/withdraw flow is gated on exactly this value. */
export async function isSelfVerified(user: Address): Promise<boolean> {
  if (!isConfigured) return false;
  try {
    return (await publicClient.readContract({
      address: addresses.selfGate,
      abi: selfGateAbi,
      functionName: "isVerified",
      args: [user],
    })) as boolean;
  } catch {
    return false;
  }
}

export async function walletBalance(user: Address): Promise<bigint> {
  if (!isConfigured) return 0n;
  return publicClient.readContract({
    address: addresses.asset,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [user],
  }) as Promise<bigint>;
}

/** Get test cUSD: mints the demo MockUSD to the user (testnet only — the
 *  asset is the demo MockUSD whose mint is open). A real tx the user signs. */
const mintAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export async function getTestFunds(user: Address, human = "100"): Promise<`0x${string}`> {
  const wallet = getWalletClient();
  return wallet.writeContract({
    account: user,
    address: addresses.asset,
    abi: mintAbi,
    functionName: "mint",
    args: [user, parseUnits(human, ASSET_DECIMALS)],
    type: "legacy",
  });
}

/** Deposit cUSD: approve (if needed) then vault.deposit. Both are plain
 *  transactions — no message signing (MiniPay constraint). Legacy tx type. */
export async function deposit(user: Address, human: string): Promise<`0x${string}`> {
  const amount = parseUnits(human, ASSET_DECIMALS);
  const wallet = getWalletClient();

  const allowance = (await publicClient.readContract({
    address: addresses.asset,
    abi: erc20Abi,
    functionName: "allowance",
    args: [user, addresses.vault],
  })) as bigint;

  if (allowance < amount) {
    const approveTx = await wallet.writeContract({
      account: user,
      address: addresses.asset,
      abi: erc20Abi,
      functionName: "approve",
      args: [addresses.vault, amount],
      type: "legacy",
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
  }

  return wallet.writeContract({
    account: user,
    address: addresses.vault,
    abi: vaultAbi,
    functionName: "deposit",
    args: [amount, user],
    type: "legacy",
  });
}

/** Withdraw by redeeming shares for assets (principal + earned yield). */
export async function withdrawAll(user: Address, shares: bigint): Promise<`0x${string}`> {
  const wallet = getWalletClient();
  return wallet.writeContract({
    account: user,
    address: addresses.vault,
    abi: vaultAbi,
    functionName: "redeem",
    args: [shares, user, user],
    type: "legacy",
  });
}

// ---- Credit (flag-gated borrow loop) ---------------------------------------

export type CreditState = {
  score: number;
  minScore: number;
  capacity: bigint; // buffer available for credit (yield-funded)
  status: number; // 0 None, 1 Active, 2 Repaid, 3 Defaulted
  principal: bigint;
  interest: bigint;
  dueDate: number; // unix seconds
  owed: bigint; // principal + interest if active, else 0
};

/** Ask the agent to recompute this member's reputation from their real on-chain
 *  saving + repayment history (server-side, writes only if it changed). */
export async function refreshReputation(user: Address): Promise<void> {
  try {
    await fetch(`/api/reputation?user=${user}`, { method: "POST" });
  } catch {
    /* best effort; the gauge reads the on-chain score regardless */
  }
}

export async function fetchCredit(user: Address): Promise<CreditState | null> {
  if (!isConfigured) return null;
  try {
    const [score, minScore, capacity, loan, status, owed] = await Promise.all([
      publicClient.readContract({ address: addresses.reputation, abi: reputationAbi, functionName: "score", args: [user] }) as Promise<bigint>,
      publicClient.readContract({ address: addresses.creditBook, abi: creditBookAbi, functionName: "minScore" }) as Promise<bigint>,
      publicClient.readContract({ address: addresses.buffer, abi: bufferAbi, functionName: "availableForCredit" }) as Promise<bigint>,
      publicClient.readContract({ address: addresses.creditBook, abi: creditBookAbi, functionName: "loans", args: [user] }) as Promise<readonly [bigint, bigint, bigint, number]>,
      publicClient.readContract({ address: addresses.creditBook, abi: creditBookAbi, functionName: "loanStatus", args: [user] }) as Promise<number>,
      publicClient.readContract({ address: addresses.creditBook, abi: creditBookAbi, functionName: "amountOwed", args: [user] }) as Promise<bigint>,
    ]);
    return {
      score: Number(score),
      minScore: Number(minScore),
      capacity,
      status: Number(status),
      principal: loan[0],
      interest: loan[1],
      dueDate: Number(loan[2]),
      owed,
    };
  } catch {
    return null;
  }
}

/** Request a loan from the yield buffer (drawn only from realized yield, never
 *  principal). Reverts on-chain unless verified + score >= minScore + capacity. */
export async function requestLoan(user: Address, human: string): Promise<`0x${string}`> {
  const amount = parseUnits(human, ASSET_DECIMALS);
  const wallet = getWalletClient();
  return wallet.writeContract({
    account: user,
    address: addresses.creditBook,
    abi: creditBookAbi,
    functionName: "issue",
    args: [user, amount],
    type: "legacy",
  });
}

/** Repay the active loan (principal + interest). Interest streams to savers. */
export async function repayLoan(user: Address, owed: bigint): Promise<`0x${string}`> {
  const wallet = getWalletClient();
  const allowance = (await publicClient.readContract({
    address: addresses.asset,
    abi: erc20Abi,
    functionName: "allowance",
    args: [user, addresses.creditBook],
  })) as bigint;
  if (allowance < owed) {
    const approveTx = await wallet.writeContract({
      account: user,
      address: addresses.asset,
      abi: erc20Abi,
      functionName: "approve",
      args: [addresses.creditBook, owed],
      type: "legacy",
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
  }
  return wallet.writeContract({
    account: user,
    address: addresses.creditBook,
    abi: creditBookAbi,
    functionName: "repay",
    type: "legacy",
  });
}

export type ActivityEvent = {
  ts: number;
  kind: string;
  detail: string;
  txHash?: string;
};

/** Nudge the server-side agent tick (allocate idle principal + harvest yield).
 *  Best-effort; the route only transacts when there is real work to do. */
export async function triggerTick(): Promise<void> {
  try {
    await fetch("/api/tick", { method: "POST" });
  } catch {
    /* ignore — the next nudge will retry */
  }
}

/** Real on-chain activity, read from contract events — no hosted agent needed.
 *  Queries a recent block window (public nodes cap getLogs range). */
export async function fetchActivity(): Promise<ActivityEvent[]> {
  if (!isConfigured) return [];
  try {
    const latest = await publicClient.getBlockNumber();
    const fromBlock = latest > 9000n ? latest - 9000n : 0n;
    const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    const [harvests, allocs, deposits, distributed] = await Promise.all([
      safe(publicClient.getContractEvents({ address: addresses.allocator, abi: allocatorAbi, eventName: "Harvested", fromBlock })),
      safe(publicClient.getContractEvents({ address: addresses.allocator, abi: allocatorAbi, eventName: "Allocated", fromBlock })),
      safe(publicClient.getContractEvents({ address: addresses.vault, abi: vaultAbi, eventName: "Deposit", fromBlock })),
      safe(publicClient.getContractEvents({ address: addresses.distributor, abi: distributorAbi, eventName: "YieldDistributed", fromBlock })),
    ]);
    type RawLog = { blockNumber: bigint | null; transactionHash: string | null; args?: Record<string, unknown> };
    const out: ActivityEvent[] = [];
    const push = (logs: readonly unknown[], kind: string, detail: (a: Record<string, unknown>) => string) => {
      for (const raw of logs) {
        const l = raw as RawLog;
        out.push({
          ts: Number(l.blockNumber ?? 0n),
          kind,
          detail: detail(l.args ?? {}),
          txHash: l.transactionHash ?? undefined,
        });
      }
    };
    push(harvests, "harvest", (a) => `realized ${fmt((a.yield as bigint) ?? 0n)} cUSD`);
    push(allocs, "allocate", (a) => `deployed ${fmt((a.amount as bigint) ?? 0n)} cUSD`);
    push(deposits, "deposit", (a) => `${fmt((a.assets as bigint) ?? 0n)} cUSD in`);
    push(distributed, "distribute", (a) => `streamed ${fmt((a.toStream as bigint) ?? 0n)} cUSD`);
    return out.sort((x, y) => y.ts - x.ts).slice(0, 30);
  } catch {
    return [];
  }
}
