/**
 * One-off x402 end-to-end check: start the institution endpoint and make a
 * real paid agent-to-agent call for a risk signal. Run with the env loaded:
 *   pnpm --filter @kazi/agent exec tsx src/x402-check.ts
 */
import { startInstitutionAgent } from "./institution.ts";
import { fetchRiskSignalViaX402 } from "./integrations/x402.ts";

async function main() {
  startInstitutionAgent();
  await new Promise((r) => setTimeout(r, 1500));

  // 1) raw call without payment — should be 402 if x402 gating is active
  const raw = await fetch("http://localhost:8788/risk-signal?borrower=0x000000000000000000000000000000000000dEaD");
  console.log(`[raw] status=${raw.status} (402 means x402 gating is active)`);
  console.log("[raw] 402 body:", JSON.stringify(await raw.json()));

  // 2) paid call via the agent's x402 client (handles 402 -> pay -> retry)
  const signal = await fetchRiskSignalViaX402("0x000000000000000000000000000000000000dEaD");
  console.log("[paid] result:", JSON.stringify(signal));
  process.exit(0);
}

main().catch((e) => {
  console.error("x402 check failed:", e);
  process.exit(1);
});
