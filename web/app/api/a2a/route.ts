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

// Real A2A (Agent-to-Agent) endpoint for the Kazi agent. Implements JSON-RPC
// message/send: another agent sends a natural-language message and gets back a
// reply grounded in live on-chain state. The AgentCard is at
// /.well-known/agent-card.json. Nothing here is fabricated.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DECIMALS = 18;
const rpc = process.env.CELO_RPC_URL ?? "https://forno.celo-sepolia.celo-testnet.org";
const chain = (process.env.CELO_CHAIN ?? "sepolia") === "celo" ? celo : celoSepolia;
const pub = createPublicClient({ chain, transport: http(rpc) });
const fmt = (v: bigint) => Number(formatUnits(v, DECIMALS)).toLocaleString("en-US", { maximumFractionDigits: 4 });

async function vaultLine() {
  const [tvl, deployed, pending, lifetime] = await Promise.all([
    pub.readContract({ address: addresses.vault, abi: vaultAbi, functionName: "totalAssets" }) as Promise<bigint>,
    pub.readContract({ address: addresses.allocator, abi: allocatorAbi, functionName: "totalDeployedValue" }) as Promise<bigint>,
    pub.readContract({ address: addresses.allocator, abi: allocatorAbi, functionName: "pendingYield" }) as Promise<bigint>,
    pub.readContract({ address: addresses.distributor, abi: distributorAbi, functionName: "lifetimeYieldRealized" }) as Promise<bigint>,
  ]);
  return `Kazi vault on ${chain.name}: ${fmt(tvl)} cUSD saved, ${fmt(deployed)} cUSD deployed to the senior strategy, ${fmt(pending)} cUSD yield accruing, ${fmt(lifetime)} cUSD streamed to savers lifetime.`;
}

async function creditLine(address: string) {
  if (!isAddress(address)) return "Provide a valid 0x wallet address to read its credit profile.";
  const user = address as Address;
  const [score, minScore, capacity] = await Promise.all([
    pub.readContract({ address: addresses.reputation, abi: reputationAbi, functionName: "score", args: [user] }) as Promise<bigint>,
    pub.readContract({ address: addresses.creditBook, abi: creditBookAbi, functionName: "minScore" }) as Promise<bigint>,
    pub.readContract({ address: addresses.buffer, abi: bufferAbi, functionName: "availableForCredit" }) as Promise<bigint>,
  ]);
  const ok = score >= minScore && capacity > 0n;
  return `Wallet ${user}: credit score ${score}/1000 (minimum ${minScore} to borrow), yield-funded capacity ${fmt(capacity)} cUSD. ${ok ? "Eligible to borrow." : "Not yet eligible."}`;
}

async function answer(text: string): Promise<string> {
  const t = text.toLowerCase();
  const addr = text.match(/0x[a-fA-F0-9]{40}/)?.[0];
  if (addr || t.includes("credit") || t.includes("score") || t.includes("borrow")) {
    return creditLine(addr ?? "");
  }
  if (t.includes("agent") || t.includes("who") || t.includes("protect") || t.includes("guarantee")) {
    return "Kazi is a capital-protected, streaming-yield savings and credit agent on Celo (ERC-8004 agent 351). Member principal is never lent into the credit book; only realized yield funds credit, enforced by the contracts.";
  }
  return vaultLine();
}

type Part = { kind?: string; text?: string };

export async function POST(req: Request) {
  let body: { id?: unknown; method?: string; params?: { message?: { parts?: Part[] } } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
  const { id = null, method, params } = body;
  if (method !== "message/send" && method !== "message/stream") {
    return NextResponse.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
  const text = (params?.message?.parts ?? []).map((p) => p.text ?? "").join(" ").trim() || "vault status";
  try {
    const reply = await answer(text);
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      result: {
        kind: "message",
        role: "agent",
        messageId: crypto.randomUUID(),
        parts: [{ kind: "text", text: reply }],
      },
    });
  } catch (e) {
    return NextResponse.json({ jsonrpc: "2.0", id, error: { code: -32000, message: String(e instanceof Error ? e.message : e) } });
  }
}
