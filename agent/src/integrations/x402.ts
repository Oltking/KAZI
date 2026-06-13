import { config } from "../config.ts";
import { record } from "../activity.ts";

export type RiskSignal = {
  borrower: `0x${string}`;
  riskScore: number; // 0 (safe) .. 100 (risky)
  source: string;
  paid?: boolean;
};

/**
 * x402 agent-to-agent settlement (thirdweb).
 *
 * When underwriting, the agent fetches a risk signal from the institution
 * agent. If thirdweb is configured it pays over x402 via `wrapFetchWithPayment`
 * (the wrapped fetch handles the 402 -> sign authorization -> retry handshake);
 * otherwise it does a plain fetch against the dev (free) endpoint so
 * underwriting still has data.
 *
 * TODO: verify the current thirdweb x402 client API + a testnet facilitator
 * (portal.thirdweb.com/payments/x402/client) before the live demo.
 */
async function paidFetch(): Promise<typeof fetch> {
  if (!config.thirdwebClientId || !config.agentPrivateKey) return fetch;
  try {
    // indirect specifiers: these optional deps are resolved at runtime only, so
    // typecheck/build never hinges on thirdweb's subpath types being present.
    const td: string = "thirdweb";
    const { createThirdwebClient } = (await import(td)) as any;
    const { defineChain } = (await import(`${td}/chains`)) as any;
    const { wrapFetchWithPayment } = (await import(`${td}/x402`)) as any;
    const { privateKeyToAccount, createWalletAdapter } = (await import(`${td}/wallets`)) as any;
    const client = createThirdwebClient({ clientId: config.thirdwebClientId });
    const account = privateKeyToAccount({ client, privateKey: config.agentPrivateKey });
    const chain = defineChain(config.chain === "celo" ? 42220 : 11142220);
    // wrapFetchWithPayment wants a Wallet; adapt the server account into one.
    const wallet = createWalletAdapter({
      client,
      adaptedAccount: account,
      chain,
      onDisconnect: () => {},
      switchChain: () => {},
    });
    return wrapFetchWithPayment(fetch, client, wallet) as typeof fetch;
  } catch (err) {
    console.error("[x402] client unavailable, using plain fetch:", err);
    return fetch;
  }
}

export async function fetchRiskSignalViaX402(
  borrower: `0x${string}`,
  institutionUrl = `http://localhost:${config.institutionPort}/risk-signal`,
): Promise<RiskSignal | null> {
  try {
    const doFetch = await paidFetch();
    const res = await doFetch(`${institutionUrl}?borrower=${borrower}`);
    if (!res.ok) return null;
    const signal = (await res.json()) as RiskSignal;
    if (signal.paid) {
      record("x402", `PAID risk signal for ${borrower}: ${signal.riskScore} (${signal.source})`);
    } else {
      // honest: no payment settled — this is the unpriced dev path.
      record("info", `unpriced risk signal for ${borrower}: ${signal.riskScore} (${signal.source})`);
    }
    return signal;
  } catch (e) {
    console.error("[x402] paid call error:", e);
    return null;
  }
}
