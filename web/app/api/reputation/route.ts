import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo, celoSepolia } from "viem/chains";
import { addresses, vaultAbi, creditBookAbi, reputationAbi } from "@kazi/shared";
import { computeReputation } from "../../../lib/reputation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * The agent's reputation pass for one member. Reads ONLY real on-chain signals
 * (their redeemable savings, tenure since first deposit, repayment/default
 * history from events), computes the policy score, and writes it via the
 * ReputationOracle (the agent key is the oracle owner). Writes only when the
 * score has meaningfully changed, so it doesn't churn gas. No seeding, no
 * hardcoded scores — purely derived from what the member has actually done.
 */
export async function POST(req: Request) {
  const user = new URL(req.url).searchParams.get("user") as `0x${string}` | null;
  if (!user || !/^0x[0-9a-fA-F]{40}$/.test(user)) {
    return NextResponse.json({ ok: false, error: "invalid user" }, { status: 400 });
  }
  const key = process.env.KAZI_AGENT_KEY as `0x${string}` | undefined;
  if (!key) return NextResponse.json({ ok: false, error: "KAZI_AGENT_KEY not set" }, { status: 503 });
  if (addresses.vault === ZERO) {
    return NextResponse.json({ ok: false, error: "not configured" }, { status: 503 });
  }

  const rpc = process.env.CELO_RPC_URL ?? "https://forno.celo-sepolia.celo-testnet.org";
  const chain = (process.env.CELO_CHAIN ?? "sepolia") === "celo" ? celo : celoSepolia;
  const pub = createPublicClient({ chain, transport: http(rpc) });

  try {
    const shares = (await pub.readContract({ address: addresses.vault, abi: vaultAbi, functionName: "balanceOf", args: [user] })) as bigint;
    const assets =
      shares === 0n
        ? 0n
        : ((await pub.readContract({ address: addresses.vault, abi: vaultAbi, functionName: "previewRedeem", args: [shares] })) as bigint);
    const assetsCUSD = Number(formatUnits(assets, 18));

    // tenure: timestamp of the member's first deposit (real event)
    let tenureDays = 0;
    const deposits = await pub
      .getContractEvents({ address: addresses.vault, abi: vaultAbi, eventName: "Deposit", args: { owner: user }, fromBlock: 0n })
      .catch(() => [] as { blockNumber: bigint | null }[]);
    if (deposits.length) {
      const firstBlock = deposits.reduce((a, b) => ((a.blockNumber ?? 0n) < (b.blockNumber ?? 0n) ? a : b)).blockNumber;
      if (firstBlock) {
        const blk = await pub.getBlock({ blockNumber: firstBlock });
        tenureDays = Math.max(0, (Date.now() / 1000 - Number(blk.timestamp)) / 86_400);
      }
    }

    const repays = (await pub.getContractEvents({ address: addresses.creditBook, abi: creditBookAbi, eventName: "LoanRepaid", args: { borrower: user }, fromBlock: 0n }).catch(() => [])).length;
    const defaults = (await pub.getContractEvents({ address: addresses.creditBook, abi: creditBookAbi, eventName: "LoanDefaulted", args: { borrower: user }, fromBlock: 0n }).catch(() => [])).length;

    const target = computeReputation({ assetsCUSD, tenureDays, repays, defaults });
    const current = Number((await pub.readContract({ address: addresses.reputation, abi: reputationAbi, functionName: "score", args: [user] })) as bigint);

    let tx: string | null = null;
    if (Math.abs(target - current) >= 5) {
      const account = privateKeyToAccount(key);
      const wallet = createWalletClient({ account, chain, transport: http(rpc) });
      const { request } = await pub.simulateContract({ account, address: addresses.reputation, abi: reputationAbi, functionName: "setScore", args: [user, BigInt(target)] });
      tx = await wallet.writeContract({ ...(request as object), type: "legacy" } as never);
    }

    return NextResponse.json({ ok: true, score: target, previous: current, assetsCUSD, tenureDays: Math.floor(tenureDays), repays, defaults, tx });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
