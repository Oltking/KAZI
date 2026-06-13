"use client";

import { useState } from "react";
import type { Address } from "viem";
import { formatUnits } from "viem";
import Sheet from "./Sheet";
import { CheckIcon } from "./Icons";
import { ASSET_DECIMALS, deposit, getTestFunds, triggerTick } from "../lib/kazi";
import { humanError } from "../lib/errors";

type Phase = "input" | "confirm" | "pending" | "done";

export default function DepositSheet({
  open,
  account,
  walletBal,
  onClose,
  onSettled,
}: {
  open: boolean;
  account: Address;
  walletBal: bigint;
  onClose: () => void;
  onSettled: () => void | Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [error, setError] = useState<string | null>(null);
  const [funding, setFunding] = useState(false);

  const balNum = Number(formatUnits(walletBal, ASSET_DECIMALS));
  const amtNum = Number(amount);
  const lowFunds = walletBal < 1_000000000000000000n;
  const invalid = !amount || Number.isNaN(amtNum) || amtNum <= 0;
  const insufficient = !invalid && amtNum > balNum;

  function reset() {
    setAmount("");
    setPhase("input");
    setError(null);
  }

  async function onGetFunds() {
    setError(null);
    setFunding(true);
    try {
      const hash = await getTestFunds(account, "100");
      const { publicClient } = await import("../lib/chain");
      await publicClient.waitForTransactionReceipt({ hash });
      await onSettled();
    } catch (e) {
      setError(humanError(e));
    } finally {
      setFunding(false);
    }
  }

  async function onConfirm() {
    if (invalid || insufficient) return;
    setError(null);
    setPhase("confirm");
    try {
      const hash = await deposit(account, amount);
      setPhase("pending");
      const { publicClient } = await import("../lib/chain");
      await publicClient.waitForTransactionReceipt({ hash });
      await triggerTick(); // allocate the fresh deposit so it starts earning
      await onSettled();
      setPhase("done");
    } catch (e) {
      setError(humanError(e));
      setPhase("input");
    }
  }

  const busy = phase === "confirm" || phase === "pending";

  return (
    <Sheet
      open={open}
      title="Deposit cUSD"
      onClose={() => {
        if (busy) return;
        reset();
        onClose();
      }}
    >
      {phase === "done" ? (
        <div className="txDone">
          <span className="txDoneIcon">
            <CheckIcon width={28} height={28} />
          </span>
          <h3>Deposit confirmed</h3>
          <p className="muted">Your {amount} cUSD is being put to work. Your balance will start ticking up.</p>
          <button
            className="btn primary block"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Done
          </button>
        </div>
      ) : (
        <>
          <label className="amountField">
            <span className="muted">Amount</span>
            <div className="amountInputWrap">
              <input
                className="amountInput"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                disabled={busy}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                autoFocus
              />
              <span className="amountUnit">cUSD</span>
            </div>
            <div className="amountMeta">
              <span className="muted">In wallet: {balNum.toFixed(2)} cUSD</span>
              {!lowFunds && (
                <button
                  className="linkBtn"
                  type="button"
                  disabled={busy}
                  onClick={() => setAmount(balNum.toString())}
                >
                  Max
                </button>
              )}
            </div>
          </label>

          {lowFunds && (
            <button className="btn ghost block" onClick={() => void onGetFunds()} disabled={funding || busy}>
              {funding ? "Getting test cUSD…" : "Get 100 test cUSD"}
            </button>
          )}

          {insufficient && <p className="inlineError">Not enough cUSD in your wallet.</p>}
          {error && <p className="inlineError">{error}</p>}

          <button
            className="btn primary block"
            onClick={() => void onConfirm()}
            disabled={invalid || insufficient || busy}
          >
            {phase === "confirm" ? "Confirm in wallet…" : phase === "pending" ? "Processing…" : "Deposit"}
          </button>
          <p className="muted txHint">
            {phase === "confirm"
              ? "Approve the transaction in your wallet."
              : phase === "pending"
                ? "Waiting for the network to confirm."
                : "Principal protected. You can withdraw anytime."}
          </p>
        </>
      )}
    </Sheet>
  );
}
