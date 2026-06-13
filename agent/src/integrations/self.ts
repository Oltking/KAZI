import { parseAbi } from "viem";
import { addresses } from "@kazi/shared";
import { selfGateAbi } from "@kazi/shared/abi";
import { read, write, account } from "../chain.ts";
import { config } from "../config.ts";
import { record } from "../activity.ts";

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Self identity integration.
 *
 * Members verify once via the Self SDK (proof of unique humanity + region/OFAC,
 * ZK and privacy-preserving). Because MiniPay does not currently support message
 * signing, the signature-bearing Self flow runs on the AGENT's server, which
 * then records the result on-chain via SelfGate.attest (the agent is an
 * authorized attestor). The contracts gate on that recorded state.
 *
 * TODO: verify the current Self SDK / verification flow + the on-chain
 * SelfVerificationRoot upgrade (Identity Verification Hub V2 address was not
 * confirmable at build time — Build Spec §7.4 / Ground rule 2). Until the SDK
 * is wired, `verifyOffchain` is a placeholder that must be replaced before any
 * real identity gating in production.
 */
export async function isSelfVerified(addr: `0x${string}`): Promise<boolean> {
  if (addresses.selfGate === ZERO) return false;
  try {
    return await read<boolean>(addresses.selfGate, selfGateAbi as never, "isVerified", [addr]);
  } catch {
    return false;
  }
}

/**
 * Relay an off-chain Self verification onto the gate. Call this from the web
 * onboarding flow's server callback once the member completes Self.
 */
export async function recordSelfVerification(member: `0x${string}`): Promise<void> {
  if (addresses.selfGate === ZERO || !account) {
    record("info", "SelfGate not configured / no agent key — cannot attest");
    return;
  }
  const ok = await verifyOffchain(member);
  if (!ok) {
    record("info", `Self verification not satisfied for ${member}`);
    return;
  }
  const attestAbi = parseAbi(["function attest(address account)"]);
  const hash = await write(addresses.selfGate, attestAbi as never, "attest", [member]);
  record("identity", `Self-verified ${member} -> SelfGate`, hash);
}

/** TODO: replace with the real Self SDK verification (off-chain proof check). */
async function verifyOffchain(_member: `0x${string}`): Promise<boolean> {
  void config.selfApiKey;
  return false; // fail-closed until the Self SDK is wired
}
