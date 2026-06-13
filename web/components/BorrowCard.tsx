"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { formatUnits } from "viem";
import { CoinIcon } from "./Icons";
import { ASSET_DECIMALS, fetchCredit, requestLoan, repayLoan, fmt, type CreditState } from "../lib/kazi";
import { humanError } from "../lib/errors";

type Phase = "idle" | "confirm" | "pending";

/** Reputation (0..1000) shown as a 0–100% credit score. */
function toPct(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score / 10)));
}

/**
 * Borrow against the yield buffer (the flag-gated credit loop). Loans are funded
 * ONLY by realized yield, never depositor principal, and require Self
 * verification plus a minimum on-chain reputation. The UI reflects real on-chain
 * state; ineligible states are shown honestly, never bypassed.
 */
export default function BorrowCard({
  account,
  verified,
  onSettled,
}: {
  account: Address;
  verified: boolean | null;
  onSettled: () => void | Promise<void>;
}) {
  const [c, setC] = useState<CreditState | null>(null);
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setC(await fetchCredit(account));
  }, [account]);

  useEffect(() => {
    void load();
    const id = setInterval(load, 12_000);
    return () => clearInterval(id);
  }, [load]);

  if (!c) return null;

  const active = c.status === 1;
  const capacity = Number(formatUnits(c.capacity, ASSET_DECIMALS));
  const amtNum = Number(amount);
  const invalid = !amount || Number.isNaN(amtNum) || amtNum <= 0;
  const overCapacity = !invalid && amtNum > capacity;
  const eligible = verified === true && c.score >= c.minScore && c.capacity > 0n && !active;
  const busy = phase !== "idle";

  const pct = toPct(c.score);
  const needPct = toPct(c.minScore);
  const tier =
    c.status === 3 ? "Paused" : pct >= needPct ? "Approved" : pct >= 40 ? "Building" : "New saver";
  const color = c.status === 3 ? "var(--danger)" : pct >= needPct ? "var(--accent)" : pct >= 40 ? "var(--danger)" : "var(--muted)";
  // gauge geometry
  const R = 52;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - pct / 100);

  async function onBorrow() {
    if (invalid || overCapacity) return;
    setError(null);
    setPhase("confirm");
    try {
      const hash = await requestLoan(account, amount);
      setPhase("pending");
      const { publicClient } = await import("../lib/chain");
      await publicClient.waitForTransactionReceipt({ hash });
      setAmount("");
      await load();
      await onSettled();
    } catch (e) {
      setError(humanError(e));
    } finally {
      setPhase("idle");
    }
  }

  async function onRepay() {
    setError(null);
    setPhase("confirm");
    try {
      const hash = await repayLoan(account, c!.owed);
      setPhase("pending");
      const { publicClient } = await import("../lib/chain");
      await publicClient.waitForTransactionReceipt({ hash });
      await load();
      await onSettled();
    } catch (e) {
      setError(humanError(e));
    } finally {
      setPhase("idle");
    }
  }

  return (
    <section className="card borrowCard">
      <div className="cardLabel" style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <CoinIcon width={14} height={14} /> Borrow
      </div>

      {/* Credit-score gauge */}
      <div className="creditTop">
        <div className="creditGaugeWrap">
          <svg viewBox="0 0 120 120" width="104" height="104" className="creditGauge">
            <circle className="track" cx="60" cy="60" r={R} />
            <circle
              className="val"
              cx="60"
              cy="60"
              r={R}
              style={{ stroke: color, strokeDasharray: C, strokeDashoffset: offset }}
            />
          </svg>
          <div className="creditCenter">
            <div className="creditPct" style={{ color }}>{pct}%</div>
            <div className="creditPctLabel">Credit score</div>
          </div>
        </div>
        <div className="creditInfo">
          <div className="creditTier" style={{ color }}>{tier}</div>
          <div className="creditHint">
            {c.status === 3
              ? "A past loan defaulted. Borrowing is paused until you rebuild your score."
              : pct >= needPct
                ? "You qualify for credit, funded entirely by yield."
                : `Reach ${needPct}% to unlock borrowing. On-time saving and repayment raise your score.`}
          </div>
          <div className="creditScale" aria-hidden>
            <div className="creditScaleFill" style={{ width: `${pct}%`, background: color }} />
            <span className="creditScaleMark" style={{ left: `${needPct}%` }} title={`Borrow unlocks at ${needPct}%`} />
          </div>
          <div className="creditScaleLabels">
            <span>0</span><span>unlock {needPct}%</span><span>100</span>
          </div>
        </div>
      </div>

      <div className="row">
        <span className="muted">Credit pool available</span>
        <span className="v">{fmt(c.capacity)} cUSD</span>
      </div>

      {active ? (
        <>
          <div className="row">
            <span className="muted">You owe</span>
            <span className="v">{fmt(c.owed, 4)} cUSD</span>
          </div>
          <div className="row">
            <span className="muted">Due</span>
            <span className="v">{new Date(c.dueDate * 1000).toLocaleDateString()}</span>
          </div>
          {error && <p className="inlineError">{error}</p>}
          <button className="btn primary block" onClick={() => void onRepay()} disabled={busy} style={{ marginTop: 10 }}>
            {phase === "confirm" ? "Confirm in wallet…" : phase === "pending" ? "Repaying…" : `Repay ${fmt(c.owed, 2)} cUSD`}
          </button>
          <p className="muted txHint">On-time repayment raises your score; interest streams to savers.</p>
        </>
      ) : eligible ? (
        <>
          <label className="amountField" style={{ marginTop: 8 }}>
            <span className="muted">Borrow amount</span>
            <div className="amountInputWrap">
              <input
                className="amountInput"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                disabled={busy}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              />
              <span className="amountUnit">cUSD</span>
            </div>
            <div className="amountMeta">
              <span className="muted">Up to {capacity.toFixed(2)} cUSD</span>
              <button className="linkBtn" type="button" disabled={busy} onClick={() => setAmount(capacity.toString())}>Max</button>
            </div>
          </label>
          {overCapacity && <p className="inlineError">More than the pool can fund right now.</p>}
          {error && <p className="inlineError">{error}</p>}
          <button className="btn primary block" onClick={() => void onBorrow()} disabled={invalid || overCapacity || busy}>
            {phase === "confirm" ? "Confirm in wallet…" : phase === "pending" ? "Processing…" : "Request loan"}
          </button>
          <p className="muted txHint">Funded only by yield. No saver&apos;s principal is ever at risk.</p>
        </>
      ) : (
        <p className="muted" style={{ marginTop: 4 }}>
          {verified !== true
            ? "Verify with Self above to access credit."
            : c.capacity === 0n
              ? "The credit pool is still funding from yield. Check back soon."
              : "Keep saving to raise your credit score and unlock borrowing."}
        </p>
      )}
    </section>
  );
}
