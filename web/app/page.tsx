"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import { useWallet } from "../lib/wallet";
import { isMiniPay } from "../lib/chain";
import SelfVerify from "../components/SelfVerify";
import WalletButton from "../components/WalletButton";
import DepositSheet from "../components/DepositSheet";
import WithdrawSheet from "../components/WithdrawSheet";
import ActivityFeed from "../components/ActivityFeed";
import { ShieldIcon, CheckIcon, LockIcon, SparkIcon, ArrowDownIcon, ArrowUpIcon, FlowIcon } from "../components/Icons";
import {
  ASSET_DECIMALS,
  fetchActivity,
  fetchPosition,
  fetchVaultView,
  isSelfVerified,
  triggerTick,
  walletBalance,
  isConfigured,
  fmt,
  type ActivityEvent,
  type Position,
  type VaultView,
} from "../lib/kazi";

type Sample = { m: number; t: number }; // economic value M (in tokens), wall-clock ms
const SECONDS_PER_YEAR = 31_536_000;

export default function Home() {
  const { ready, account, status, wrongNetwork, hasProvider, isMiniPay: mini, switchNetwork } = useWallet();

  const [vault, setVault] = useState<VaultView | null>(null);
  const [position, setPosition] = useState<Position>({ shares: 0n, assets: 0n });
  const [wallet, setWallet] = useState<bigint>(0n);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [verified, setVerified] = useState<boolean | null>(null); // real on-chain Self status
  const [display, setDisplay] = useState<number>(0); // live projected redeemable value
  const [apy, setApy] = useState<number | null>(null); // realized, derived from on-chain samples
  const [loadingState, setLoadingState] = useState(true);
  const [sheet, setSheet] = useState<null | "deposit" | "withdraw">(null);

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
      // honest realized APY: annualize the per-second growth fraction of M.
      if (baseM.current > 0 && ratePerSec.current > 0) {
        setApy((ratePerSec.current / baseM.current) * SECONDS_PER_YEAR);
      }
    }
    lastSample.current = { m, t: now };
    baseM.current = m || 1;

    if (account) {
      const [pos, wbal, isVer] = await Promise.all([
        fetchPosition(account),
        walletBalance(account),
        isSelfVerified(account),
      ]);
      setPosition(pos);
      setWallet(wbal);
      setVerified(isVer);
      baseAssets.current = Number(formatUnits(pos.assets, ASSET_DECIMALS));
      setDisplay(baseAssets.current);
    } else {
      setPosition({ shares: 0n, assets: 0n });
      setWallet(0n);
      setVerified(null);
      baseAssets.current = 0;
      setDisplay(0);
    }
    setActivity(await fetchActivity());
    setActivityLoading(false);
    setLoadingState(false);
  }, [account]);

  // poll on-chain state (keep the 10s refresh)
  useEffect(() => {
    setLoadingState(true);
    void refresh();
    const id = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  // keep the protocol live while the app is open: nudge the agent tick to
  // allocate idle principal + harvest yield (server-side, real txs). The route
  // no-ops unless there's real work, so this won't churn.
  useEffect(() => {
    void triggerTick();
    const id = setInterval(() => void triggerTick(), 45_000);
    return () => clearInterval(id);
  }, []);

  // smooth per-second ticker: project redeemable value forward at the realized rate
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const period = reduce ? 1000 : 100;
    const id = setInterval(() => {
      const s = lastSample.current;
      if (!s || baseM.current <= 0 || baseAssets.current <= 0) return;
      const elapsed = (Date.now() - s.t) / 1000;
      const projectedM = s.m + ratePerSec.current * elapsed;
      const ratio = projectedM / baseM.current;
      setDisplay(baseAssets.current * ratio);
    }, period);
    return () => clearInterval(id);
  }, []);

  const [whole, frac] = display.toFixed(6).split(".");
  const earned = Math.max(0, display - baseAssets.current);
  const connected = status === "connected" && !!account;
  const hasPosition = position.shares > 0n;
  const totalInKazi = vault ? Number(formatUnits(vault.totalAssets, ASSET_DECIMALS)) : null;

  return (
    <>
      <header className="appHeader">
        <div className="appHeaderInner">
          <div className="brand">
            <span className="brandMark" aria-hidden>
              <FlowIcon width={18} height={18} />
            </span>
            <span className="brandName">Kazi</span>
          </div>
          <WalletButton />
        </div>
      </header>

      <main className="app">
        {!isConfigured ? (
          <section className="card">
            <div className="cardLabel">Setting up</div>
            <p className="muted">
              Kazi isn&apos;t connected to its contracts yet. Once deployment is complete, this screen
              goes live with your real on-chain balance.
            </p>
          </section>
        ) : (
          <>
            {wrongNetwork && (
              <div className="banner warn">
                <span>Wrong network — switch to Celo Sepolia to continue.</span>
                <button className="btn small" onClick={() => void switchNetwork()}>
                  Switch
                </button>
              </div>
            )}

            {/* Hero balance + live ticker */}
            <section className="hero">
              <div className="heroTop">
                <span className="cardLabel">Your balance</span>
                <span className="apyPill" title="Realized rate from on-chain yield">
                  <SparkIcon width={13} height={13} />
                  {apy !== null && apy > 0 ? `${(apy * 100).toFixed(2)}% APY` : "Earning"}
                </span>
              </div>

              {loadingState && !vault ? (
                <div className="skeleton skelBalance" />
              ) : (
                <div className="balance">
                  {Number(whole).toLocaleString()}
                  <span className="cents">.{frac}</span>
                  <span className="balanceUnit"> cUSD</span>
                </div>
              )}

              <div className="tickerRow">
                <span className="pulse" aria-hidden />
                {connected
                  ? earned > 0
                    ? `+${earned.toFixed(6)} earned this session`
                    : hasPosition
                      ? "Watching for yield…"
                      : "Deposit to start earning"
                  : "Connect your wallet to see your balance"}
              </div>

              <div className="trustBadge">
                <ShieldIcon width={15} height={15} />
                Principal protected
              </div>
            </section>

            {/* Wrong-network / not-connected gating handled in actions */}

            {/* Verification gate (real on-chain status) */}
            {connected && verified === false && (
              <section className="card verifyCard">
                <div className="cardLabel">One-time verification</div>
                <p className="muted verifyIntro">
                  Kazi uses Self to confirm you&apos;re a unique person — privately, with a zero-knowledge
                  proof. Scan once to unlock deposits.
                </p>
                <SelfVerify user={account} onVerified={() => void refresh()} />
              </section>
            )}

            {/* Primary actions */}
            <section className="actions">
              <button
                className="btn primary action"
                onClick={() => setSheet("deposit")}
                disabled={!connected || wrongNetwork || verified === false}
              >
                <ArrowDownIcon width={18} height={18} />
                Deposit
              </button>
              <button
                className="btn action"
                onClick={() => setSheet("withdraw")}
                disabled={!connected || wrongNetwork || !hasPosition}
              >
                <ArrowUpIcon width={18} height={18} />
                Withdraw
              </button>
            </section>

            {connected && verified === true && (
              <div className="verifiedBadge">
                <CheckIcon width={14} height={14} />
                Self-verified
              </div>
            )}

            {!connected && !mini && (
              <p className="muted hint center">
                {hasProvider ? "Connect your wallet to deposit." : "Open Kazi in MiniPay to get started."}
              </p>
            )}

            {/* Position details */}
            <section className="card">
              <div className="cardLabel">Position</div>
              <div className="statRow">
                <span className="muted">In your wallet</span>
                <span className="statVal">{Number(formatUnits(wallet, ASSET_DECIMALS)).toFixed(2)} cUSD</span>
              </div>
              <div className="statRow">
                <span className="muted">Your shares</span>
                <span className="statVal">{position.shares === 0n ? "0" : fmt(position.shares, 4)}</span>
              </div>
              <div className="statRow">
                <span className="muted">Total in Kazi</span>
                <span className="statVal">{totalInKazi !== null ? totalInKazi.toFixed(2) : "—"} cUSD</span>
              </div>
            </section>

            {/* Activity */}
            <section className="card">
              <div className="cardLabel">Activity</div>
              <ActivityFeed events={activity} loading={activityLoading} />
            </section>

            {/* How it works / trust */}
            <section className="card howCard">
              <div className="cardLabel">How it works</div>
              <ul className="howList">
                <li>
                  <span className="howIcon"><LockIcon width={16} height={16} /></span>
                  <span><strong>Your principal stays protected.</strong> Only earnings are ever put to work — the contracts make it impossible to risk your deposit.</span>
                </li>
                <li>
                  <span className="howIcon"><SparkIcon width={16} height={16} /></span>
                  <span><strong>Yield streams in.</strong> An agent allocates funds and harvests yield, which flows back to your balance second by second.</span>
                </li>
                <li>
                  <span className="howIcon"><ArrowUpIcon width={16} height={16} /></span>
                  <span><strong>Withdraw anytime.</strong> Redeem your shares for principal plus everything you&apos;ve earned, instantly.</span>
                </li>
              </ul>
            </section>

            <footer className="appFooter">
              <span>{isMiniPay() ? "Running in MiniPay" : "Built for MiniPay on Celo"}</span>
              <a href="https://celo.org" target="_blank" rel="noreferrer">
                Powered by Celo
              </a>
            </footer>
          </>
        )}
      </main>

      {connected && (
        <>
          <DepositSheet
            open={sheet === "deposit"}
            account={account}
            walletBal={wallet}
            onClose={() => setSheet(null)}
            onSettled={refresh}
          />
          <WithdrawSheet
            open={sheet === "withdraw"}
            account={account}
            shares={position.shares}
            redeemable={display}
            earned={earned}
            onClose={() => setSheet(null)}
            onSettled={refresh}
          />
        </>
      )}
    </>
  );
}
