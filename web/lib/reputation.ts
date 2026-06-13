/**
 * Reputation scoring policy (the agent's underwriting model).
 *
 * Score is EARNED from genuine on-chain signals only — never seeded:
 *   - how much the member has saved (their redeemable vault value),
 *   - how long they've been saving (tenure since first deposit),
 *   - their repayment record (on-time repayments raise it, defaults cut it).
 *
 * Weights are policy parameters (env-overridable), not hardcoded data. The
 * resulting 0..1000 score maps to the 0–100% credit score the UI shows; the
 * CreditBook gates borrowing on it (minScore). This mirrors the on-chain
 * REPAY_BONUS (+25) / DEFAULT_PENALTY (-150) so the off-chain recompute stays
 * consistent with what the contract records.
 */
export type RepSignals = {
  assetsCUSD: number; // current redeemable value the member holds
  tenureDays: number; // days since first deposit
  repays: number; // count of on-time repayments
  defaults: number; // count of defaults
};

export function computeReputation(s: RepSignals): number {
  const perCusd = Number(process.env.REP_POINTS_PER_CUSD ?? "1.5");
  const perDay = Number(process.env.REP_POINTS_PER_DAY ?? "8");
  const repayBonus = Number(process.env.REP_REPAY_BONUS ?? "25");
  const defaultPenalty = Number(process.env.REP_DEFAULT_PENALTY ?? "150");
  const raw =
    s.assetsCUSD * perCusd +
    s.tenureDays * perDay +
    s.repays * repayBonus -
    s.defaults * defaultPenalty;
  return Math.max(0, Math.min(1000, Math.round(raw)));
}
