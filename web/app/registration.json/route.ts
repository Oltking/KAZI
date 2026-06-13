import { NextResponse } from "next/server";
import { addresses } from "@kazi/shared";

export const runtime = "nodejs";

/**
 * ERC-8004 agent registration file, served from the deployed domain so the
 * agent's on-chain `agentURI` resolves on 8004scan. Point the agent's
 * registration at `https://<your-vercel-domain>/registration.json` (set
 * AGENT_PUBLIC_URL, then update agentId 351's URI on-chain — see
 * scripts/update-agent-uri.sh).
 */
export async function GET() {
  const agent = process.env.NEXT_PUBLIC_AGENT_ADDRESS ?? "0x321E43713F9242B4642E61B3D17edE5b540c2747";
  return NextResponse.json({
    name: "Kazi",
    description:
      "Capital-protected, streaming-yield savings agent on Celo. An autonomous fund manager: allocates principal to senior venues, harvests and streams yield to savers, and underwrites yield-funded credit to verified, reputation-scored members. Principal is never put at risk.",
    address: agent,
    chain: addresses.chain,
    capabilities: ["savings-vault", "yield-streaming", "credit-underwriting", "x402"],
    standards: ["ERC-4626", "ERC-8004", "x402"],
    contracts: {
      vault: addresses.vault,
      allocator: addresses.allocator,
      distributor: addresses.distributor,
      selfGate: addresses.selfGate,
      selfVerifier: addresses.selfVerifier ?? null,
    },
  });
}
