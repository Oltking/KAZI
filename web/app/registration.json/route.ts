import { NextResponse } from "next/server";
import { addresses } from "@kazi/shared";

export const runtime = "nodejs";

/**
 * ERC-8004 agent registration file (the agentURI target), following the
 * registration-v1 schema so 8004scan validates it and scores it fully.
 * https://eips.ethereum.org/EIPS/eip-8004#registration-v1
 */
export async function GET() {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kazi-agent.vercel.app";
  const chainId = addresses.chain === "celo" ? 42220 : 11142220;
  const registry =
    process.env.ERC8004_IDENTITY_REGISTRY ?? "0x8004A818BFB912233c491871b3d84c89A494BD9e";
  const agentId = Number(process.env.ERC8004_AGENT_ID ?? 351);

  return NextResponse.json({
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Kazi",
    description:
      "Capital-protected, streaming-yield savings and credit agent on Celo. An autonomous fund manager: it allocates member principal only to senior venues, harvests and streams the yield back to savers in real time, and underwrites yield-funded credit to Self-verified, reputation-scored members. Member principal is never put at risk, enforced by the contracts.",
    image: `${base}/kazi.webp`,
    active: true,
    services: [{ name: "web", endpoint: base, version: "1.0.0" }],
    registrations: [
      {
        agentId,
        agentRegistry: `eip155:${chainId}:${registry}`,
      },
    ],
    x402Support: true,
    supportedTrust: ["reputation", "crypto-economic"],
    // extra context (non-schema, ignored by validators)
    skills: ["savings-vault", "yield-streaming", "credit-underwriting", "self-verification"],
    contracts: {
      vault: addresses.vault,
      allocator: addresses.allocator,
      distributor: addresses.distributor,
      buffer: addresses.buffer,
      creditBook: addresses.creditBook,
      selfGate: addresses.selfGate,
      reputation: addresses.reputation,
    },
  });
}
