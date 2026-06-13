"use client";

import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Address,
  type EIP1193Provider,
} from "viem";
import { celo, celoSepolia, celoAlfajores } from "viem/chains";

const CHAIN_NAME = process.env.NEXT_PUBLIC_CHAIN ?? "sepolia";
export const CHAIN =
  CHAIN_NAME === "celo" || CHAIN_NAME === "mainnet"
    ? celo
    : CHAIN_NAME === "alfajores"
      ? celoAlfajores
      : celoSepolia;
export const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:8787";

export const publicClient = createPublicClient({ chain: CHAIN, transport: http() });

declare global {
  interface Window {
    ethereum?: EIP1193Provider & { isMiniPay?: boolean };
  }
}

/**
 * MiniPay detection. Inside MiniPay the wallet connection is IMPLICIT — there is
 * an injected provider and we must hide any "Connect Wallet" UI (Build Spec §7.1).
 * TODO: confirm the exact injected-provider flag in current MiniPay docs; we
 * check `isMiniPay` and fall back to any injected provider for desktop testing.
 */
export function isMiniPay(): boolean {
  return typeof window !== "undefined" && Boolean(window.ethereum?.isMiniPay);
}

export function hasInjectedProvider(): boolean {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

export function getWalletClient() {
  if (!window.ethereum) throw new Error("no injected provider");
  return createWalletClient({ chain: CHAIN, transport: custom(window.ethereum) });
}

/** Ensure the injected wallet is on the right Celo network; add it if unknown.
 *  MiniPay is always on Celo, so this is a no-op there; it matters for desktop
 *  wallets like MetaMask. */
export async function ensureChain(): Promise<void> {
  if (!window.ethereum) return;
  const hexId = `0x${CHAIN.id.toString(16)}`;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexId }],
    });
  } catch (err: unknown) {
    // 4902 = chain not added yet → add it, then it becomes selected.
    if ((err as { code?: number })?.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hexId,
            chainName: CHAIN.name,
            nativeCurrency: CHAIN.nativeCurrency,
            rpcUrls: CHAIN.rpcUrls.default.http,
            blockExplorerUrls: CHAIN.blockExplorers ? [CHAIN.blockExplorers.default.url] : [],
          },
        ],
      });
    }
  }
}

/** Implicit connection: read the already-authorized account (no connect button
 *  in MiniPay). Falls back to eth_requestAccounts only outside MiniPay. */
export async function getAccount(): Promise<Address | null> {
  if (!window.ethereum) return null;
  const accts = (await window.ethereum.request({ method: "eth_accounts" })) as Address[];
  if (accts.length > 0) return accts[0] ?? null;
  if (isMiniPay()) return null; // never prompt inside MiniPay
  const req = (await window.ethereum.request({ method: "eth_requestAccounts" })) as Address[];
  return req[0] ?? null;
}
