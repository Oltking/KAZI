import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { addresses, addressesConfigured, vaultAbi, allocatorAbi } from "@kazi/shared";
import { read, account } from "./chain.ts";
import { recent } from "./activity.ts";
import { config } from "./config.ts";
import { loadState } from "./state.ts";
import { registrationFile } from "./integrations/erc8004.ts";

/**
 * Status + activity server the web app reads for the live feed and the demo.
 * Exposes the agent's identity, the on-chain vault snapshot (so the frontend can
 * render an HONEST per-second earnings projection from the realized APY), and
 * the recent activity feed.
 */
export function startServer(): void {
  const app = new Hono();
  app.use("*", cors());

  app.get("/status", async (c) => {
    const state = await loadState();
    return c.json({
      agent: account?.address ?? null,
      chain: config.chain,
      creditEnabled: config.creditEnabled,
      erc8004AgentId: state.erc8004AgentId,
      addressesConfigured: addressesConfigured(),
      lastTickAt: state.lastTickAt,
    });
  });

  // On-chain vault snapshot for the live ticker. All numbers are realized
  // on-chain values (no fabricated APY) — strings to preserve bigint precision.
  app.get("/vault", async (c) => {
    if (!addressesConfigured()) return c.json({ configured: false });
    try {
      const [totalAssets, totalSupply, deployed, pending] = await Promise.all([
        read<bigint>(addresses.vault, vaultAbi as never, "totalAssets"),
        read<bigint>(addresses.vault, vaultAbi as never, "totalSupply"),
        read<bigint>(addresses.allocator, allocatorAbi as never, "totalDeployedValue"),
        read<bigint>(addresses.allocator, allocatorAbi as never, "pendingYield"),
      ]);
      return c.json({
        configured: true,
        totalAssets: totalAssets.toString(),
        totalSupply: totalSupply.toString(),
        deployed: deployed.toString(),
        pendingYield: pending.toString(),
      });
    } catch (err) {
      return c.json({ configured: true, error: String(err) }, 502);
    }
  });

  app.get("/activity", (c) => c.json({ events: recent(50) }));

  // ERC-8004 registration file (the agentURI target → surfaces on 8004scan).
  app.get("/registration.json", (c) => c.json(registrationFile()));

  serve({ fetch: app.fetch, port: config.agentPort });
  console.log(`[server] status/activity on :${config.agentPort}`);
}
