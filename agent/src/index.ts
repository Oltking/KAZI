import cron from "node-cron";
import { config } from "./config.ts";
import { publicClient, walletClient, account } from "./chain.ts";
import { ensureErc8004Identity } from "./integrations/erc8004.ts";
import { tick } from "./loop.ts";
import { startServer } from "./server.ts";
import { startInstitutionAgent } from "./institution.ts";
import { record } from "./activity.ts";

async function main(): Promise<void> {
  startServer();
  startInstitutionAgent();

  // ensure the agent has its ERC-8004 identity (so it appears on 8004scan)
  // before doing anything else.
  await ensureErc8004Identity({ account, publicClient, walletClient });
  record("info", `Kazi agent live as ${account?.address ?? "(read-only, no key)"}`);

  // run once on boot, then on a schedule. The interval is generous on purpose —
  // ticks are no-ops unless there is a real economic event to act on.
  await tick();

  const minutes = Math.max(1, Math.floor(config.harvestIntervalSeconds / 60));
  cron.schedule(`*/${minutes} * * * *`, () => {
    void tick();
  });
  record("info", `scheduler armed: tick every ${minutes} min`);
}

void main();
