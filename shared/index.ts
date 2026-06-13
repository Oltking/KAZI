/**
 * @kazi/shared — single source of truth for deployed addresses, contract ABIs,
 * and shared types, consumed by both the agent and the web app.
 */
import addressesJson from "./addresses.json" with { type: "json" };

export * from "./abi/index";

export type KaziAddresses = {
  chain: string;
  asset: `0x${string}`;
  selfGate: `0x${string}`;
  reputation: `0x${string}`;
  buffer: `0x${string}`;
  vault: `0x${string}`;
  distributor: `0x${string}`;
  senior: `0x${string}`;
  allocator: `0x${string}`;
  creditBook: `0x${string}`;
  selfVerifier?: `0x${string}`;
  selfHub?: `0x${string}`;
  agent?: `0x${string}`;
};

export const addresses = addressesJson as KaziAddresses;

/** True once Deploy.s.sol has written real (non-zero) addresses. */
export function addressesConfigured(a: KaziAddresses = addresses): boolean {
  const zero = "0x0000000000000000000000000000000000000000";
  return a.vault !== zero && a.asset !== zero;
}
