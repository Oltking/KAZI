import { addresses } from "@kazi/shared";
import { selfGateAbi } from "@kazi/shared/abi";
import { read } from "../chain.ts";

/**
 * Self identity integration.
 *
 * Members verify once via the Self SDK (proof of unique humanity + region/OFAC,
 * ZK and privacy-preserving). The result is recorded on-chain in SelfGate, which
 * is the source of truth the contracts gate on. The agent reads that state here.
 *
 * TODO: verify the current Self SDK / integration flow and wire the off-chain
 * verification + attestation relay (the agent's verified relayer calls
 * SelfGate.attest). Also implement the region-exception fallback (Build Spec
 * §7.4). Until then this only reads the on-chain gate.
 */
export async function isSelfVerified(addr: `0x${string}`): Promise<boolean> {
  if (addresses.selfGate === "0x0000000000000000000000000000000000000000") return false;
  try {
    return await read<boolean>(addresses.selfGate, selfGateAbi as never, "isVerified", [addr]);
  } catch {
    return false;
  }
}
