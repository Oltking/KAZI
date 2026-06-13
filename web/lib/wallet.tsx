"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Address, EIP1193Provider } from "viem";
import { CHAIN, ensureChain, hasInjectedProvider, isMiniPay } from "./chain";

/**
 * Real EIP-1193 wallet layer for Kazi.
 *
 * - Detects the injected provider (MetaMask on desktop, MiniPay on mobile).
 * - MiniPay: connection is implicit — we auto-connect and never show a button.
 * - Desktop: explicit connect via eth_requestAccounts, then ensureChain().
 * - Tracks the active account + chainId and reacts to wallet events.
 * - "Disconnect" resets app state only (injected wallets can't be force-revoked).
 *
 * No private keys, nothing sensitive persisted.
 */

export type WalletStatus = "idle" | "connecting" | "connected";

export type WalletState = {
  /** true once we've checked for an injected provider on mount */
  ready: boolean;
  hasProvider: boolean;
  isMiniPay: boolean;
  status: WalletStatus;
  account: Address | null;
  chainId: number | null;
  wrongNetwork: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
};

const WalletContext = createContext<WalletState | null>(null);

function getProvider(): (EIP1193Provider & { isMiniPay?: boolean }) | undefined {
  if (typeof window === "undefined") return undefined;
  return window.ethereum;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [hasProvider, setHasProvider] = useState(false);
  const [miniPay, setMiniPay] = useState(false);
  const [status, setStatus] = useState<WalletStatus>("idle");
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // User explicitly disconnected — don't silently re-attach on wallet events.
  const disconnected = useRef(false);

  const readChainId = useCallback(async () => {
    const p = getProvider();
    if (!p) return;
    try {
      const hex = (await p.request({ method: "eth_chainId" })) as string;
      setChainId(Number.parseInt(hex, 16));
    } catch {
      /* ignore */
    }
  }, []);

  const connect = useCallback(async () => {
    const p = getProvider();
    if (!p) {
      setError("No wallet detected.");
      return;
    }
    disconnected.current = false;
    setError(null);
    setStatus("connecting");
    try {
      const accts = (await p.request({ method: "eth_requestAccounts" })) as Address[];
      const acct = accts[0] ?? null;
      setAccount(acct);
      if (acct) {
        await ensureChain();
        await readChainId();
        setStatus("connected");
      } else {
        setStatus("idle");
      }
    } catch (e) {
      setStatus("idle");
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /reject|denied|4001/i.test(msg)
          ? "Connection request rejected."
          : "Could not connect to your wallet.",
      );
    }
  }, [readChainId]);

  const switchNetwork = useCallback(async () => {
    setError(null);
    try {
      await ensureChain();
      await readChainId();
    } catch {
      setError("Could not switch network. Add Celo Sepolia in your wallet.");
    }
  }, [readChainId]);

  const disconnect = useCallback(() => {
    disconnected.current = true;
    setAccount(null);
    setStatus("idle");
    setError(null);
  }, []);

  // Initial detection + implicit (MiniPay) / silent (already-authorized) connect.
  useEffect(() => {
    let cancelled = false;
    const p = getProvider();
    const mini = isMiniPay();
    setHasProvider(hasInjectedProvider());
    setMiniPay(mini);

    (async () => {
      if (p) {
        try {
          const accts = (await p.request({ method: "eth_accounts" })) as Address[];
          if (!cancelled && accts.length > 0 && !disconnected.current) {
            setAccount(accts[0] ?? null);
            setStatus("connected");
            if (mini) await ensureChain(); // MiniPay is always on Celo; harmless elsewhere
            await readChainId();
          }
        } catch {
          /* never block the UI on connection */
        }
      }
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [readChainId]);

  // Subscribe to wallet events.
  useEffect(() => {
    const p = getProvider();
    if (!p?.on) return;
    const onAccounts = (accts: Address[]) => {
      const list = accts ?? [];
      if (list.length === 0) {
        setAccount(null);
        setStatus("idle");
      } else if (!disconnected.current) {
        setAccount(list[0] ?? null);
        setStatus("connected");
      }
    };
    const onChain = (hex: string) => {
      setChainId(Number.parseInt(hex, 16));
    };
    p.on("accountsChanged", onAccounts);
    p.on("chainChanged", onChain);
    return () => {
      p.removeListener?.("accountsChanged", onAccounts);
      p.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const wrongNetwork = status === "connected" && chainId !== null && chainId !== CHAIN.id;

  const value = useMemo<WalletState>(
    () => ({
      ready,
      hasProvider,
      isMiniPay: miniPay,
      status,
      account,
      chainId,
      wrongNetwork,
      error,
      connect,
      disconnect,
      switchNetwork,
    }),
    [
      ready,
      hasProvider,
      miniPay,
      status,
      account,
      chainId,
      wrongNetwork,
      error,
      connect,
      disconnect,
      switchNetwork,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within <WalletProvider>");
  return ctx;
}

export function truncateAddress(a?: string | null): string {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
