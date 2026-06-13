"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { formatUnits } from "viem";
import {
  hasInjectedProvider,
  isMiniPay,
  getAccount,
} from "../lib/chain";
import {
  ASSET_DECIMALS,
  deposit,
  fetchActivity,
  fetchPosition,
  fetchVaultView,
  walletBalance,
  withdrawAll,
  isConfigured,
  type ActivityEvent,
  type Position,
  type VaultView,
} from "../lib/kazi";

type Sample = { m: number; t: number }; // economic value M (in tokens), wall-clock ms

export default function Home() {
  const [account, setAccount] = useState<Address | null>(null);
  const [vault, setVault] = useState<VaultView | null>(null);
  const [position, setPosition] = useState<Position>({ shares: 0n, assets: 0n });
  const [wallet, setWallet] = useState<bigint>(0n);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [display, setDisplay] = useState<number>(0); // live projected redeemable value
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<null | "deposit" | "withdraw">(null);
  const [amount, setAmount] = useState("");

  // ticker projection state
  const ratePerSec = useRef(0); // realized token growth/sec of economic value M
  const lastSample = useRef<Sample | null>(null);
  const baseAssets = useRef(0); // position.assets at last sample (tokens)
  const baseM = useRef(0);

  const refresh = useCallback(async () => {
    const v = await fetchVaultView();
    setVault(v);
    const m = Number(formatUnits(v.totalAssets + v.pendingYield, ASSET_DECIMALS));
    const now = Date.now();
    if (lastSample.current && now > lastSample.current.t) {
      const dt = (now - lastSample.current.t) / 1000;
      const r = (m - lastSample.current.m) / dt;
      // only trust non-negative realized growth for the forward projection.
      ratePerSec.current = r > 0 ? r : 0;
    }
    lastSample.current = { m, t: now };
    baseM.current = m || 1;

    if (account) {
      const [pos, wbal] = await Promise.all([fetchPosition(account), walletBalance(account)]);
      setPosition(pos);
      setWallet(wbal);
      baseAssets.current = Number(formatUnits(pos.assets, ASSET_DECIMALS));
      setDisplay(baseAssets.current);
    }
    setActivity(await fetchActivity());
  }, [account]);

  // implicit connection (no connect button inside MiniPay)
  useEffect(() => {
    (async () => {
      if (!hasInjectedProvider()) return;
      try {
        setAccount(await getAccount());
      } catch {
        /* never block the UI on connection */
      }
    })();
  }, []);

  // poll on-chain / agent state
  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  // smooth per-second ticker: project redeemable value forward at the realized rate
  useEffect(() => {
    const id = setInterval(() => {
      const s = lastSample.current;
      if (!s || baseM.current <= 0 || baseAssets.current <= 0) return;
      const elapsed = (Date.now() - s.t) / 1000;
      const projectedM = s.m + ratePerSec.current * elapsed;
      const ratio = projectedM / baseM.current;
      setDisplay(baseAssets.current * ratio);
    }, 100);
    return () => clearInterval(id);
  }, []);

  async function onDeposit() {
    if (!account) return;
    setError(null);
    setBusy("Depositing…");
    try {
      await deposit(account, amount);
      setMode(null);
      setAmount("");
      await refresh();
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(null);
    }
  }

  async function onWithdraw() {
    if (!account) return;
    setError(null);
    setBusy("Withdrawing…");
    try {
      await withdrawAll(account, position.shares);
      setMode(null);
      await refresh();
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(null);
    }
  }

  const [whole, frac] = display.toFixed(6).split(".");
  const earned = Math.max(0, display - baseAssets.current);

  return (
    <main className="app">
      <div className="brand">
        <span className="dot" /> Kazi
      </div>
      <p className="tagline">Your money at work — principal protected, yield streaming in.</p>

      {!isConfigured && (
        <div className="card">
          <div className="label">Setting up</div>
          <p className="muted">
            Contracts aren&apos;t deployed yet. Run the deploy script and the agent, then this
            screen goes live with your real on-chain balance.
          </p>
        </div>
      )}

      {/* Headline balance + live ticker */}
      <div className="card">
        <div className="label">Your balance</div>
        <div className="balance">
          {Number(whole).toLocaleString()}
          <span className="cents">.{frac}</span>
          <span style={{ fontSize: 16, color: "var(--muted)", fontWeight: 500 }}> cUSD</span>
        </div>
        <div className="ticker-row">
          <span className="pulse" />
          {earned > 0 ? `+${earned.toFixed(6)} earned this session` : "watching for yield…"}
        </div>
      </div>

      {/* Principal guarantee — trust is the product */}
      <div className="guarantee">
        <span className="shield">🛡️</span>
        <span>
          <strong>Your principal is protected.</strong> Only earnings are ever put to work, and
          the contracts make it impossible to risk your deposit.
        </span>
      </div>

      {/* Position details */}
      <div className="card">
        <div className="row">
          <span className="muted">Vault shares</span>
          <span className="v">{position.shares === 0n ? "0" : formatUnits(position.shares, ASSET_DECIMALS)}</span>
        </div>
        <div className="row">
          <span className="muted">In your wallet</span>
          <span className="v">{Number(formatUnits(wallet, ASSET_DECIMALS)).toFixed(2)} cUSD</span>
        </div>
        <div className="row">
          <span className="muted">Total in Kazi</span>
          <span className="v">
            {vault ? Number(formatUnits(vault.totalAssets, ASSET_DECIMALS)).toFixed(2) : "—"} cUSD
          </span>
        </div>

        {mode === null && (
          <div className="btns">
            <button className="primary" onClick={() => setMode("deposit")} disabled={!account}>
              Deposit
            </button>
            <button onClick={() => setMode("withdraw")} disabled={!account || position.shares === 0n}>
              Withdraw
            </button>
          </div>
        )}

        {mode === "deposit" && (
          <div>
            <input
              className="input"
              inputMode="decimal"
              placeholder="Amount in cUSD"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <div className="btns">
              <button className="primary" onClick={onDeposit} disabled={!!busy || !amount}>
                {busy ?? "Confirm deposit"}
              </button>
              <button onClick={() => setMode(null)} disabled={!!busy}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {mode === "withdraw" && (
          <div>
            <p className="muted">
              Withdraw your full balance ({display.toFixed(4)} cUSD) — principal plus everything
              you&apos;ve earned.
            </p>
            <div className="btns">
              <button className="primary" onClick={onWithdraw} disabled={!!busy}>
                {busy ?? "Confirm withdraw"}
              </button>
              <button onClick={() => setMode(null)} disabled={!!busy}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && <div className="notice">{error}</div>}
        {!account && isConfigured && (
          <div className="notice">
            {hasInjectedProvider()
              ? "Connecting to your wallet…"
              : "Open this Mini App inside MiniPay to deposit."}
          </div>
        )}
      </div>

      {/* Live activity from the agent */}
      <div className="card">
        <div className="label">Agent activity</div>
        {activity.length === 0 && <p className="muted">No activity yet.</p>}
        {activity.map((e, i) => (
          <div className="feed-item" key={i}>
            <span className="kind">{e.kind}</span>
            <span className="detail">{e.detail}</span>
          </div>
        ))}
      </div>

      <p className="muted" style={{ textAlign: "center" }}>
        {isMiniPay() ? "Running in MiniPay" : "Built for MiniPay on Celo"}
      </p>
    </main>
  );
}

function humanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("not verified")) return "You need to complete Self verification first.";
  if (msg.toLowerCase().includes("rejected")) return "Transaction cancelled.";
  return msg.length > 120 ? msg.slice(0, 120) + "…" : msg;
}
