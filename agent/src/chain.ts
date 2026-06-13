import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hash,
  type Abi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo, celoSepolia, celoAlfajores, type Chain } from "viem/chains";
import { config } from "./config.ts";

function resolveChain(name: string): Chain {
  switch (name) {
    case "celo":
    case "mainnet":
      return celo;
    case "alfajores":
      return celoAlfajores;
    case "sepolia":
    case "celo-sepolia":
    case "local": // local anvil runs with chain-id 11142220 to match celoSepolia
    default:
      return celoSepolia;
  }
}

const chain = resolveChain(config.chain);

export const publicClient = createPublicClient({
  chain,
  transport: http(config.rpcUrl),
});

export const account = config.agentPrivateKey
  ? privateKeyToAccount(config.agentPrivateKey)
  : undefined;

export const walletClient = account
  ? createWalletClient({ account, chain, transport: http(config.rpcUrl) })
  : undefined;

/**
 * Submit a contract write from the agent's server wallet.
 *
 * The MiniPay "no-signing / legacy-tx" constraints apply to the WEB app, not to
 * this server wallet — but we use legacy tx mode on Celo regardless for safety
 * (Build Spec §6.2). Gas is paid in native CELO by default; fee abstraction
 * (feeCurrency = cUSD via CIP-64) is an optional upgrade — verify the current
 * viem support before enabling. TODO: enable feeCurrency once verified.
 */
export async function write(
  address: Address,
  abi: Abi,
  functionName: string,
  args: readonly unknown[] = [],
): Promise<Hash> {
  if (!walletClient || !account) {
    throw new Error("AGENT_PRIVATE_KEY not set — cannot send transactions");
  }
  const { request } = await publicClient.simulateContract({
    account,
    address,
    abi,
    functionName,
    args: args as never,
  });
  return walletClient.writeContract({ ...(request as object), type: "legacy" } as never);
}

export async function read<T = unknown>(
  address: Address,
  abi: Abi,
  functionName: string,
  args: readonly unknown[] = [],
): Promise<T> {
  return publicClient.readContract({
    address,
    abi,
    functionName,
    args: args as never,
  }) as Promise<T>;
}
