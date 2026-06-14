import { NextResponse } from "next/server";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo, celoSepolia } from "viem/chains";
import { addresses, selfGateAbi } from "@kazi/shared";
import { SelfBackendVerifier, AllIds, DefaultConfigStore } from "@selfxyz/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ZERO = "0x0000000000000000000000000000000000000000";

// MUST match the frontend's endpoint + scope seed (the scope is derived from
// both). Default to the deployed domain so the mobile Self app can reach it.
const ENDPOINT = process.env.SELF_ENDPOINT ?? "https://kazi-agent.vercel.app/api/self-verify";
const SCOPE_SEED = process.env.SELF_SCOPE_SEED ?? "kazi";
// false => production Self app + real document (reads the Celo mainnet hub,
// read-only). true => staging/mock Self app (reads the Celo Sepolia hub).
const MOCK = process.env.SELF_MOCK_PASSPORT === "true";

const verifier = new SelfBackendVerifier(
  SCOPE_SEED,
  ENDPOINT,
  MOCK,
  AllIds,
  new DefaultConfigStore({ minimumAge: 18, excludedCountries: ["USA"], ofac: false }),
  "hex",
);

/**
 * Self off-chain verification endpoint. The Self mobile app posts the ZK proof
 * here; we verify it with @selfxyz/core (read-only against the Self hub), and on
 * success the agent records the member in SelfGate on Celo Sepolia (the agent
 * key is an authorized attestor). No funds, no on-chain verifier contract, works
 * with the normal Self app.
 */
export async function POST(req: Request) {
  try {
    const { attestationId, proof, publicSignals, userContextData } = (await req.json()) as {
      attestationId: 1 | 2 | 3 | 4;
      proof: unknown;
      publicSignals: string[];
      userContextData: string;
    };
    if (!proof || !publicSignals || attestationId === undefined || !userContextData) {
      return NextResponse.json({ status: "error", result: false, reason: "missing fields" }, { status: 200 });
    }

    const res = await verifier.verify(attestationId, proof as never, publicSignals, userContextData);

    if (!res.isValidDetails.isValid) {
      return NextResponse.json({ status: "error", result: false, reason: "proof invalid" }, { status: 200 });
    }

    // record on-chain (Celo Sepolia) via the agent attestor
    const user = res.userData.userIdentifier as `0x${string}`;
    await attestOnChain(user);

    return NextResponse.json({ status: "success", result: true });
  } catch (e) {
    return NextResponse.json({ status: "error", result: false, reason: String(e) }, { status: 200 });
  }
}

async function attestOnChain(user: `0x${string}`) {
  const key = process.env.KAZI_AGENT_KEY as `0x${string}` | undefined;
  if (!key || addresses.selfGate === ZERO) return;
  const rpc = process.env.CELO_RPC_URL ?? "https://forno.celo-sepolia.celo-testnet.org";
  const chain = (process.env.CELO_CHAIN ?? "sepolia") === "celo" ? celo : celoSepolia;
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain, transport: http(rpc) });
  await wallet.writeContract({
    account,
    address: addresses.selfGate,
    abi: selfGateAbi,
    functionName: "attest",
    args: [user],
    type: "legacy",
  } as never);
}
