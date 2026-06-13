"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet, truncateAddress } from "../lib/wallet";
import { CHAIN } from "../lib/chain";

/**
 * Wallet control for the header.
 * - MiniPay: connection is implicit, so we render only a compact account chip
 *   (no Connect button).
 * - Desktop: a "Connect Wallet" button that resolves to an account chip with a
 *   dropdown (network indicator + Disconnect).
 */
export default function WalletButton() {
  const { ready, hasProvider, isMiniPay, status, account, wrongNetwork, connect, disconnect, switchNetwork } =
    useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!ready) {
    return <div className="walletChip skeletonChip" aria-hidden />;
  }

  // No injected wallet at all.
  if (!hasProvider) {
    return (
      <a className="walletConnectBtn" href="https://www.opera.com/products/minipay" target="_blank" rel="noreferrer">
        Get a wallet
      </a>
    );
  }

  // Not connected (desktop only — MiniPay auto-connects).
  if (status !== "connected" || !account) {
    if (isMiniPay) return null;
    return (
      <button className="walletConnectBtn" onClick={() => void connect()} disabled={status === "connecting"}>
        {status === "connecting" ? "Connecting…" : "Connect Wallet"}
      </button>
    );
  }

  if (wrongNetwork) {
    return (
      <button className="walletConnectBtn warn" onClick={() => void switchNetwork()}>
        Switch network
      </button>
    );
  }

  return (
    <div className="walletWrap" ref={ref}>
      <button className="walletChip" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="netDot" aria-hidden />
        <span className="walletAddr">{truncateAddress(account)}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="walletMenu" role="menu">
          <div className="walletMenuRow">
            <span className="muted">Network</span>
            <span className="walletNet">
              <span className="netDot" aria-hidden /> {CHAIN.name}
            </span>
          </div>
          <div className="walletMenuRow">
            <span className="muted">Account</span>
            <span className="mono">{truncateAddress(account)}</span>
          </div>
          {isMiniPay ? (
            <p className="muted walletMenuNote">Managed by MiniPay</p>
          ) : (
            <button
              className="walletMenuBtn"
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
            >
              Disconnect
            </button>
          )}
        </div>
      )}
    </div>
  );
}
