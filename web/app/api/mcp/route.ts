import { NextResponse } from "next/server";
import { createPublicClient, http, formatUnits, isAddress, type Address } from "viem";
import { celo, celoSepolia } from "viem/chains";
import {
  addresses,
  vaultAbi,
  allocatorAbi,
  distributorAbi,
  bufferAbi,
  creditBookAbi,
  reputationAbi,
} from "@kazi/shared";

// Real Model Context Protocol (MCP) server for the Kazi agent. It exposes
// genuine, read-only on-chain state of the live Celo Sepolia deployment as MCP
// tools, so any MCP client (and 8004scan's endpoint health check) can discover
// and call the agent. Every value is read straight from the contracts — nothing
// is fabricated. The discovery manifest is served at /.well-known/mcp.json.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DECIMALS = 18; // cUSD / MockUSD
const PROTOCOL_VERSION = "2025-06-18";

const rpc = process.env.CELO_RPC_URL ?? "https://forno.celo-sepolia.celo-testnet.org";
const chain = (process.env.CELO_CHAIN ?? "sepolia") === "celo" ? celo : celoSepolia;
const pub = createPublicClient({ chain, transport: http(rpc) });

const fmt = (v: bigint, dp = 4) =>
  Number(formatUnits(v, DECIMALS)).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: dp,
  });

const TOOLS = [
  {
    name: "get_vault_status",
    description:
      "Live status of the Kazi savings vault on Celo: total value saved (TVL), shares outstanding, principal deployed to the senior yield strategy, yield accruing but not yet harvested, and lifetime yield streamed to savers. All read on-chain.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_agent_status",
    description:
      "Identity and posture of the Kazi agent: ERC-8004 agent id, on-chain wallet, network, x402 support, and the capital-protection guarantee (member principal is never lent into the credit book).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_credit_score",
    description:
      "On-chain credit profile of a wallet: its earned reputation score, the minimum score required to borrow, the yield-funded credit capacity currently available, and whether the wallet is eligible.",
    inputSchema: {
      type: "object",
      properties: { address: { type: "string", description: "0x wallet address" } },
      required: ["address"],
      additionalProperties: false,
    },
  },
] as const;

async function getVaultStatus() {
  const [totalAssets, totalSupply, deployed, pending, lifetime] = await Promise.all([
    pub.readContract({ address: addresses.vault, abi: vaultAbi, functionName: "totalAssets" }) as Promise<bigint>,
    pub.readContract({ address: addresses.vault, abi: vaultAbi, functionName: "totalSupply" }) as Promise<bigint>,
    pub.readContract({ address: addresses.allocator, abi: allocatorAbi, functionName: "totalDeployedValue" }) as Promise<bigint>,
    pub.readContract({ address: addresses.allocator, abi: allocatorAbi, functionName: "pendingYield" }) as Promise<bigint>,
    pub.readContract({ address: addresses.distributor, abi: distributorAbi, functionName: "lifetimeYieldRealized" }) as Promise<bigint>,
  ]);
  return {
    network: chain.name,
    vault: addresses.vault,
    totalValueSavedCUSD: fmt(totalAssets),
    sharesOutstanding: fmt(totalSupply),
    principalDeployedCUSD: fmt(deployed),
    yieldAccruingCUSD: fmt(pending),
    lifetimeYieldStreamedCUSD: fmt(lifetime),
  };
}

async function getAgentStatus() {
  return {
    name: "Kazi",
    agentId: Number(process.env.ERC8004_AGENT_ID ?? 351),
    agentWallet: addresses.agent ?? "0x321E43713F9242B4642E61B3D17edE5b540c2747",
    network: chain.name,
    chainId: chain.id,
    x402Support: true,
    capitalProtection:
      "Member principal is never lent into the at-risk credit book; only realized yield funds credit. Enforced by the contracts.",
    contracts: {
      vault: addresses.vault,
      allocator: addresses.allocator,
      distributor: addresses.distributor,
      buffer: addresses.buffer,
      creditBook: addresses.creditBook,
      reputation: addresses.reputation,
      selfGate: addresses.selfGate,
    },
  };
}

async function getCreditScore(address: string) {
  if (!isAddress(address)) throw new Error("invalid address");
  const user = address as Address;
  const [score, minScore, capacity] = await Promise.all([
    pub.readContract({ address: addresses.reputation, abi: reputationAbi, functionName: "score", args: [user] }) as Promise<bigint>,
    pub.readContract({ address: addresses.creditBook, abi: creditBookAbi, functionName: "minScore" }) as Promise<bigint>,
    pub.readContract({ address: addresses.buffer, abi: bufferAbi, functionName: "availableForCredit" }) as Promise<bigint>,
  ]);
  return {
    address: user,
    creditScore: Number(score),
    minScoreToBorrow: Number(minScore),
    creditCapacityCUSD: fmt(capacity),
    eligible: score >= minScore && capacity > 0n,
  };
}

async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "get_vault_status":
      return getVaultStatus();
    case "get_agent_status":
      return getAgentStatus();
    case "get_credit_score":
      return getCreditScore(String(args.address ?? ""));
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

function rpcResult(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}
function rpcError(id: unknown, code: number, message: string, status = 200) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status });
}

// Discovery / liveness for plain GETs.
export async function GET() {
  return NextResponse.json({
    name: "Kazi MCP",
    protocolVersion: PROTOCOL_VERSION,
    transport: "streamable-http",
    endpoint: "/api/mcp",
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
  });
}

// MCP Streamable HTTP transport: JSON-RPC 2.0 over POST.
export async function POST(req: Request) {
  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }
  const { id = null, method, params = {} } = body;

  try {
    switch (method) {
      case "initialize":
        return rpcResult(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "kazi-mcp", version: "1.0.0" },
          instructions:
            "Kazi is a capital-protected, streaming-yield savings and credit agent on Celo. Use the tools to read live vault status, agent posture, and a wallet's on-chain credit score.",
        });
      case "notifications/initialized":
        return new NextResponse(null, { status: 204 });
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, { tools: TOOLS });
      case "tools/call": {
        const name = String(params.name ?? "");
        const args = (params.arguments as Record<string, unknown>) ?? {};
        const data = await callTool(name, args);
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
          isError: false,
        });
      }
      default:
        return rpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (e) {
    return rpcError(id, -32000, String(e instanceof Error ? e.message : e));
  }
}
