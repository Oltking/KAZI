"use client";

import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import { ASSET_DECIMALS, fetchPoolStats } from "../lib/kazi";
import { ShieldIcon } from "./Icons";

/**
 * Live "Total saved in Kazi" card for the landing hero. Shows the REAL on-chain
 * pool size (vault totalAssets) with a per-second ticker projected from the
 * accruing yield, plus total yield streamed to savers. No fabricated numbers.
 */
export default function PoolPreview() {
  const [tvl, setTvl] = useState<number | null>(null);
  const [lifetime, setLifetime] = useState<number>(0);
  const [display, setDisplay] = useState<number>(0);

  const ratePerSec = useRef(0);
  const sample = useRef<{ m: number; t: number } | null>(null);
  const baseTvl = useRef(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const s = await fetchPoolStats();
      if (!alive || !s) return;
      const tvlNum = Number(formatUnits(s.tvl, ASSET_DECIMALS));
      const m = Number(formatUnits(s.tvl + s.pendingYield, ASSET_DECIMALS));
      const now = Date.now();
      if (sample.current && now > sample.current.t) {
        const r = (m - sample.current.m) / ((now - sample.current.t) / 1000);
        ratePerSec.current = r > 0 ? r : 0;
      }
      sample.current = { m, t: now };
      baseTvl.current = tvlNum;
      setTvl(tvlNum);
      setDisplay(tvlNum);
      setLifetime(Number(formatUnits(s.lifetimeYield, ASSET_DECIMALS)));
    };
    void load();
    const id = setInterval(load, 12_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const id = setInterval(
      () => {
        const s = sample.current;
        if (!s || baseTvl.current <= 0) return;
        const elapsed = (Date.now() - s.t) / 1000;
        const projected = baseTvl.current + ratePerSec.current * elapsed;
        setDisplay(projected);
      },
      reduce ? 1000 : 120,
    );
    return () => clearInterval(id);
  }, []);

  const [whole, frac] = (tvl === null ? 0 : display).toFixed(6).split(".");

  return (
    <div className="lpHeroArt" aria-label="Live Kazi pool">
      <div className="lpArtLabel">Total saved in Kazi</div>
      {tvl === null ? (
        <div className="lpArtBal" style={{ opacity: 0.5 }}>…</div>
      ) : (
        <div className="lpArtBal">
          {Number(whole).toLocaleString()}
          <span className="g">.{frac}</span>
        </div>
      )}
      <div className="lpArtTick">
        <span className="lpArtDot" /> {tvl === null ? "loading…" : "growing in real time"}
      </div>
      <div className="lpArtRow">
        <span>Yield streamed to savers</span>
        <span>{lifetime.toFixed(4)} cUSD</span>
      </div>
      <span className="lpArtChip">
        <ShieldIcon width={13} height={13} /> Principal protected
      </span>
    </div>
  );
}
