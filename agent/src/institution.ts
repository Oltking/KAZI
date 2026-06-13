import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { config } from "./config.ts";

/**
 * Demo "institution / data agent" — the x402-priced counter-party.
 *
 * In the full demo this endpoint returns HTTP 402 + payment terms, the Kazi
 * agent pays a sub-cent stablecoin amount over x402, a facilitator settles
 * on-chain, and only then does the endpoint return a risk signal — a real
 * agent-to-agent paid call (Build Spec §6.1 #6, §7.3).
 *
 * TODO: verify the thirdweb x402 server middleware + facilitator, then guard
 * /risk-signal behind payment. Until then it serves a free deterministic signal
 * so the underwriting flow is demonstrable end-to-end in dev.
 */
export function startInstitutionAgent(): void {
  const app = new Hono();

  app.get("/", (c) => c.json({ agent: "kazi-institution-demo", priced: ["/risk-signal"] }));

  app.get("/risk-signal", (c) => {
    const borrower = c.req.query("borrower") ?? "0x";
    // deterministic pseudo-signal derived from the address (demo only).
    const n = parseInt(borrower.slice(-2) || "0", 16);
    const riskScore = n % 100;
    // TODO: when x402 is wired, return 402 with terms unless payment proof present.
    return c.json({ borrower, riskScore, source: "institution-demo" });
  });

  serve({ fetch: app.fetch, port: config.institutionPort });
  console.log(`[institution] x402 demo agent on :${config.institutionPort}`);
}
