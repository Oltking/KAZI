import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo, celoSepolia } from "viem/chains";
import { addresses, vaultAbi, allocatorAbi } from "@kazi/shared";

// Node runtime (needs a private key + viem), never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ZERO = "0x0000000000000000000000000000000000000000";
const MIN_HARVEST = 1_000_000_000_000_000n; // 0.001 cUSD — don't harvest dust

/**
 * Server-side agent "tick": deploys idle principal into the senior strategy and
 * harvests realized yield. Both are permissionless, safe operations (they only
 * move money along the protected rails — they can't divert funds), so this only
 * spends the agent wallet's gas, and only when there is real work to do. The web
 * app calls this after a deposit and on an interval so the deployed product
 * actually earns and the ticker climbs — no separately hosted agent required.
 *
 * Configure on Vercel: KAZI_AGENT_KEY (server env, the agent's funded testnet
 * key — NOT NEXT_PUBLIC). Optionally CELO_RPC_URL.
 */
export async function POST() {
  return handle();
}
export async function GET() {
  return handle(); // also callable by a Vercel cron (sends GET)
}

async function handle() {
  const key = process.env.KAZI_AGENT_KEY as `0x${string}` | undefined;
  if (!key) {
    return NextResponse.json({ ok: false, error: "KAZI_AGENT_KEY not set" }, { status: 503 });
  }
  if (addresses.vault === ZERO) {
    return NextResponse.json({ ok: false, error: "addresses not configured" }, { status: 503 });
  }

  const rpc = process.env.CELO_RPC_URL ?? "https://forno.celo-sepolia.celo-testnet.org";
  const chain = (process.env.CELO_CHAIN ?? "sepolia") === "celo" ? celo : celoSepolia;
  const account = privateKeyToAccount(key);
  const pub = createPublicClient({ chain, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain, transport: http(rpc) });
  const did: string[] = [];

  try {
    const deployable = (await pub.readContract({
      address: addresses.vault,
      abi: vaultAbi,
      functionName: "deployableAssets",
    })) as bigint;
    if (deployable > 0n) {
      const { request } = await pub.simulateContract({
        account,
        address: addresses.allocator,
        abi: allocatorAbi,
        functionName: "allocate",
        args: [deployable],
      });
      const h = await wallet.writeContract({ ...(request as object), type: "legacy" } as never);
      did.push(`allocate:${h}`);
    }

    const pending = (await pub.readContract({
      address: addresses.allocator,
      abi: allocatorAbi,
      functionName: "pendingYield",
    })) as bigint;
    if (pending >= MIN_HARVEST) {
      const { request } = await pub.simulateContract({
        account,
        address: addresses.allocator,
        abi: allocatorAbi,
        functionName: "harvest",
      });
      const h = await wallet.writeContract({ ...(request as object), type: "legacy" } as never);
      did.push(`harvest:${h}`);
    }

    return NextResponse.json({ ok: true, did, pending: pending.toString() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), did }, { status: 500 });
  }
}
