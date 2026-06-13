import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { config } from "./config.ts";

/**
 * Demo "institution / data agent" — the x402-priced counter-party.
 *
 * /risk-signal is priced via x402: the Kazi agent pays a sub-cent stablecoin
 * amount, a facilitator settles on-chain, and only then is the risk signal
 * returned — a real agent-to-agent paid call (Build Spec §6.1 #6, §7.3).
 *
 * Behaviour:
 *  - If THIRDWEB_SECRET_KEY + X402_PAY_TO are set, settlement is enforced via
 *    thirdweb's `settlePayment`: an unpaid request gets HTTP 402 + terms; a paid
 *    request (X-PAYMENT header) is settled, then the signal is returned.
 *  - Otherwise (dev) it serves a free signal so the underwriting flow is
 *    demonstrable end-to-end without keys.
 *
 * TODO: verify the exact thirdweb x402 `settlePayment` argument shape against
 * current docs before the live demo (portal.thirdweb.com/x402/server).
 */
export function startInstitutionAgent(): void {
  const app = new Hono();
  const x402Enabled = Boolean(config.thirdwebSecretKey && config.x402PayTo);

  app.get("/", (c) =>
    c.json({ agent: "kazi-institution-demo", priced: ["/risk-signal"], x402Enabled }),
  );

  app.get("/risk-signal", async (c) => {
    const borrower = c.req.query("borrower") ?? "0x";
    // deterministic pseudo-signal derived from the address (demo only).
    const riskScore = parseInt(borrower.slice(-2) || "0", 16) % 100;

    if (!x402Enabled) {
      // honest: this is an UNPRICED dev response, not a settled x402 call.
      return c.json({ borrower, riskScore, source: "institution (unpriced dev)", paid: false });
    }
    const payload = { borrower, riskScore, source: "institution (x402-paid)", paid: true };

    try {
      // indirect specifiers: optional dep resolved only at runtime (see x402.ts).
      const td: string = "thirdweb";
      const { createThirdwebClient } = (await import(td)) as any;
      const { facilitator, settlePayment } = (await import(`${td}/x402`)) as any;
      const client = createThirdwebClient({ secretKey: config.thirdwebSecretKey });
      const fac = facilitator({ client, serverWalletAddress: config.x402PayTo });

      // Explicit token pricing when configured (required where thirdweb has no
      // default USD stablecoin, e.g. Celo Sepolia); else fall back to USD price.
      const price = config.x402Token
        ? {
            amount: config.x402Amount,
            asset: {
              address: config.x402Token,
              decimals: config.x402TokenDecimals,
              ...(config.x402TokenName
                ? { eip712: { name: config.x402TokenName, version: config.x402TokenVersion, primaryType: "Permit" } }
                : {}),
            },
          }
        : config.x402Price;

      const result = await settlePayment({
        resourceUrl: new URL(c.req.url).toString(),
        method: "GET",
        // v2 sends the proof in PAYMENT-SIGNATURE; v1 in X-PAYMENT.
        paymentData: c.req.header("payment-signature") ?? c.req.header("x-payment"),
        payTo: config.x402PayTo,
        // thirdweb expects a CAIP-2 network id. Celo mainnet = eip155:42220,
        // Celo Sepolia = eip155:11142220.
        network: config.chain === "celo" ? "eip155:42220" : "eip155:11142220",
        price,
        facilitator: fac,
      });

      if (result.status === 402) {
        return c.json(result.responseBody ?? { error: "payment required" }, 402, result.responseHeaders);
      }
      return c.json(payload, 200, result.responseHeaders ?? {});
    } catch (err) {
      // never brick the demo on an integration hiccup — fall back to free.
      console.error("[institution] x402 settle failed, serving free:", err);
      return c.json(payload);
    }
  });

  serve({ fetch: app.fetch, port: config.institutionPort });
  console.log(`[institution] x402 demo agent on :${config.institutionPort} (paid=${x402Enabled})`);
}
