import "dotenv/config";

/** Centralized, typed agent configuration loaded from the environment. */
export const config = {
  rpcUrl: process.env.CELO_RPC_URL ?? "https://alfajores-forno.celo-testnet.org",
  chain: process.env.CHAIN ?? "alfajores",
  agentPrivateKey: process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined,
  cusdAddress: process.env.CUSD_ADDRESS as `0x${string}` | undefined,

  // policy
  reserveBps: Number(process.env.RESERVE_BPS ?? 1000),
  minCreditScore: Number(process.env.MIN_CREDIT_SCORE ?? 600),
  creditEnabled: process.env.CREDIT_ENABLED === "true",
  harvestIntervalSeconds: Number(process.env.HARVEST_INTERVAL_SECONDS ?? 300),

  // servers
  agentPort: Number(process.env.AGENT_PORT ?? 8787),
  institutionPort: Number(process.env.INSTITUTION_PORT ?? 8788),

  // integrations (verify before relying on these — Build Spec, Ground rule 2)
  x402FacilitatorUrl: process.env.X402_FACILITATOR_URL,
  thirdwebClientId: process.env.THIRDWEB_CLIENT_ID,
  selfApiKey: process.env.SELF_API_KEY,
} as const;

/** Dust threshold below which a harvest is not economically worth a tx. */
export const MIN_HARVEST = 1_000_000_000_000_000n; // 0.001 token (18 dp)
