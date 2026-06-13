import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Restart-safe agent state. Persisted to disk so a crash/restart never
 * double-acts (Build Spec §6.2). All money/positions live on-chain; this only
 * holds bookkeeping cursors and the work queues the off-chain policy maintains.
 */
export type AgentState = {
  lastTickAt: number;
  lastProcessedBlock: string; // bigint serialized as string
  erc8004AgentId: string | null;
  creditQueue: `0x${string}`[]; // borrowers awaiting underwriting
  activeLoans: `0x${string}`[]; // borrowers with an open loan to service
};

const STATE_PATH = process.env.AGENT_STATE_PATH ?? ".kazi/agent-state.json";

const DEFAULT_STATE: AgentState = {
  lastTickAt: 0,
  lastProcessedBlock: "0",
  erc8004AgentId: null,
  creditQueue: [],
  activeLoans: [],
};

export async function loadState(): Promise<AgentState> {
  try {
    const raw = await readFile(STATE_PATH, "utf8");
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function saveState(state: AgentState): Promise<void> {
  await mkdir(dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}
