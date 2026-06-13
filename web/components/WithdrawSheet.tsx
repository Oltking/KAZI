"use client";

import { useState } from "react";
import type { Address } from "viem";
import Sheet from "./Sheet";
import { CheckIcon } from "./Icons";
import { withdrawAll } from "../lib/kazi";
import { humanError } from "../lib/errors";

type Phase = "review" | "confirm" | "pending" | "done";

export default function WithdrawSheet({
  open,
  account,
  shares,
  redeemable,
  earned,
  onClose,
  onSettled,
}: {
  open: boolean;
  account: Address;
  shares: bigint;
  redeemable: number;
  earned: number;
  onClose: () => void;
  onSettled: () => void | Promise<void>;
}) {
  const [phase, setPhase] = useState<Phase>("review");
  const [error, setError] = useState<string | null>(null);

  const busy = phase === "confirm" || phase === "pending";

  async function onConfirm() {
    setError(null);
    setPhase("confirm");
    try {
      const hash = await withdrawAll(account, shares);
      setPhase("pending");
      const { publicClient } = await import("../lib/chain");
      await publicClient.waitForTransactionReceipt({ hash });
      await onSettled();
      setPhase("done");
    } catch (e) {
      setError(humanError(e));
      setPhase("review");
    }
  }

  return (
    <Sheet
      open={open}
      title="Withdraw"
      onClose={() => {
        if (busy) return;
        setPhase("review");
        setError(null);
        onClose();
      }}
    >
      {phase === "done" ? (
        <div className="txDone">
          <span className="txDoneIcon">
            <CheckIcon width={28} height={28} />
          </span>
          <h3>Withdrawal complete</h3>
          <p className="muted">Your principal plus everything you earned is back in your wallet.</p>
          <button
            className="btn primary block"
            onClick={() => {
              setPhase("review");
              onClose();
            }}
          >
            Done
          </button>
        </div>
      ) : (
        <>
          <div className="withdrawSummary">
            <div className="withdrawTotal">
              {redeemable.toFixed(4)} <span className="muted">cUSD</span>
            </div>
            <p className="muted">Your full balance: principal plus earnings.</p>
            {earned > 0 && (
              <div className="withdrawEarned">
                <span className="muted">Earned</span>
                <span className="accentText">+{earned.toFixed(6)} cUSD</span>
              </div>
            )}
          </div>

          {error && <p className="inlineError">{error}</p>}

          <button className="btn primary block" onClick={() => void onConfirm()} disabled={busy}>
            {phase === "confirm" ? "Confirm in wallet…" : phase === "pending" ? "Processing…" : "Withdraw everything"}
          </button>
          <p className="muted txHint">
            {phase === "confirm"
              ? "Approve the transaction in your wallet."
              : phase === "pending"
                ? "Waiting for the network to confirm."
                : "This redeems all your vault shares."}
          </p>
        </>
      )}
    </Sheet>
  );
}
