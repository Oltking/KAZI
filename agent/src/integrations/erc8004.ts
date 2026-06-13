import { decodeEventLog, parseAbi } from "viem";
import { config } from "../config.ts";
import { publicClient, walletClient, account } from "../chain.ts";
import { record } from "../activity.ts";
import { loadState, saveState } from "../state.ts";

/** Minimal, client-agnostic boot context. */
type Erc8004Context = {
  account?: { address: `0x${string}` };
  publicClient: unknown;
  walletClient?: unknown;
};

/**
 * ERC-8004 Identity Registry (subset). The registry is an ERC-721 where each
 * agent is a token whose metadata URI ("agentURI") points at a registration
 * file on HTTPS/IPFS. Registering surfaces the agent on 8004scan (Track 3).
 *
 * Signatures sourced from erc-8004/erc-8004-contracts. TODO: verify the live
 * Celo registry address (set ERC8004_IDENTITY_REGISTRY) before relying on this.
 */
const identityRegistryAbi = parseAbi([
  "function register(string agentURI) returns (uint256 agentId)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

/**
 * Ensure the agent has an on-chain ERC-8004 identity. Idempotent: once an
 * agentId is persisted we never re-register. No-op (records intent) until the
 * registry address + agent key are configured, so the boot sequence stays
 * intact in dev.
 */
export async function ensureErc8004Identity(_ctx: Erc8004Context): Promise<void> {
  const state = await loadState();
  if (state.erc8004AgentId) {
    record("identity", `ERC-8004 agentId ${state.erc8004AgentId} already registered`);
    return;
  }
  if (!config.erc8004IdentityRegistry || !walletClient || !account) {
    record(
      "identity",
      "ERC-8004 registration pending: set ERC8004_IDENTITY_REGISTRY + AGENT_PRIVATE_KEY (verify address first)",
    );
    return;
  }

  const agentURI = `${config.agentPublicUrl}/registration.json`;
  try {
    const { request, result } = await publicClient.simulateContract({
      account,
      address: config.erc8004IdentityRegistry,
      abi: identityRegistryAbi,
      functionName: "register",
      args: [agentURI],
    });
    const hash = await walletClient.writeContract({ ...(request as object), type: "legacy" } as never);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // prefer the simulated return value; fall back to the Transfer event tokenId.
    let agentId = result?.toString() ?? null;
    if (!agentId) {
      for (const log of receipt.logs) {
        try {
          const ev = decodeEventLog({ abi: identityRegistryAbi, ...log });
          if (ev.eventName === "Transfer") {
            agentId = (ev.args as { tokenId: bigint }).tokenId.toString();
            break;
          }
        } catch {
          /* not our event */
        }
      }
    }

    state.erc8004AgentId = agentId;
    await saveState(state);
    record("identity", `registered ERC-8004 agentId ${agentId} (${agentURI})`, hash);
  } catch (err) {
    record("identity", `ERC-8004 registration failed (will retry on next boot): ${String(err)}`);
  }
}

/**
 * The ERC-8004 registration file (the agentURI target). Loosely follows the
 * A2A / ERC-8004 agent-card shape; refine field names once the registry's
 * expected schema is verified.
 */
export function registrationFile() {
  return {
    name: "Kazi",
    description:
      "Capital-protected, streaming-yield savings agent on Celo. Autonomous fund manager: allocates principal to senior venues, harvests and streams yield to savers, and underwrites yield-funded credit to verified, reputation-scored members.",
    address: account?.address ?? null,
    chain: config.chain,
    capabilities: ["savings-vault", "yield-streaming", "credit-underwriting", "x402"],
    endpoints: {
      status: `${config.agentPublicUrl}/status`,
      activity: `${config.agentPublicUrl}/activity`,
    },
    standards: ["ERC-4626", "ERC-8004", "x402"],
  };
}
