import { config } from "../config.ts";
import { record } from "../activity.ts";

export type RiskSignal = {
  borrower: `0x${string}`;
  riskScore: number; // 0 (safe) .. 100 (risky)
  source: string;
};

/**
 * x402 agent-to-agent settlement (thirdweb).
 *
 * When the agent needs external data to underwrite — e.g. a credit/risk signal
 * from an "institution agent" — it pays for it over x402: the server returns
 * HTTP 402 + terms, the client signs a transfer authorization and retries, a
 * facilitator settles on-chain. We use thirdweb's `wrapFetchWithPayment` on the
 * agent's fetch client. The demo counter-party endpoint lives in
 * src/institution.ts so a real paid call is demonstrable end-to-end.
 *
 * TODO: verify the current thirdweb x402 client API (`wrapFetchWithPayment`)
 * and a testnet facilitator URL (Build Spec §7.3 / Ground rule 2). Until wired,
 * this calls the institution endpoint WITHOUT payment (it serves a free signal
 * in dev) so underwriting has data; the paid path is gated on a verified
 * facilitator.
 */
export async function fetchRiskSignalViaX402(
  borrower: `0x${string}`,
  institutionUrl = `http://localhost:${config.institutionPort}/risk-signal`,
): Promise<RiskSignal | null> {
  try {
    // const fetchWithPay = wrapFetchWithPayment(fetch, wallet); // TODO: verify thirdweb API
    const res = await fetch(`${institutionUrl}?borrower=${borrower}`);
    if (!res.ok) return null;
    const signal = (await res.json()) as RiskSignal;
    record("x402", `risk signal for ${borrower}: ${signal.riskScore} (${signal.source})`);
    return signal;
  } catch {
    return null;
  }
}
