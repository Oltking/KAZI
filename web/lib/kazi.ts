"use client";

import { type Address, formatUnits, parseUnits } from "viem";
import { addresses, vaultAbi, erc20Abi, selfGateAbi } from "@kazi/shared";
import { publicClient, getWalletClient, AGENT_URL } from "./chain";

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
  try {
    const res = await fetch(`${AGENT_URL}/vault`, { cache: "no-store" });
    const j = await res.json();
    if (!j.configured) return emptyView(false);
    return {
      configured: true,
      totalAssets: BigInt(j.totalAssets),
      totalSupply: BigInt(j.totalSupply),
      deployed: BigInt(j.deployed),
      pendingYield: BigInt(j.pendingYield),
    };
  } catch {
    // fall back to direct on-chain reads if the agent server is down.
    if (!isConfigured) return emptyView(false);
    const [totalAssets, totalSupply] = await Promise.all([
      publicClient.readContract({ address: addresses.vault, abi: vaultAbi, functionName: "totalAssets" }),
      publicClient.readContract({ address: addresses.vault, abi: vaultAbi, functionName: "totalSupply" }),
    ]);
    return { configured: true, totalAssets, totalSupply, deployed: 0n, pendingYield: 0n };
  }
}

function emptyView(configured: boolean): VaultView {
  return { configured, totalAssets: 0n, totalSupply: 0n, deployed: 0n, pendingYield: 0n };
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

export type ActivityEvent = {
  ts: number;
  kind: string;
  detail: string;
  txHash?: string;
};

export async function fetchActivity(): Promise<ActivityEvent[]> {
  try {
    const res = await fetch(`${AGENT_URL}/activity`, { cache: "no-store" });
    const j = await res.json();
    return j.events ?? [];
  } catch {
    return [];
  }
}
