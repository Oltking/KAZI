/** In-memory activity feed powering /activity and the web live feed. */
export type ActivityEvent = {
  ts: number;
  kind: "allocate" | "harvest" | "distribute" | "lend" | "repay" | "default" | "identity" | "x402" | "info";
  detail: string;
  txHash?: `0x${string}`;
};

const MAX = 200;
const feed: ActivityEvent[] = [];

export function record(kind: ActivityEvent["kind"], detail: string, txHash?: `0x${string}`): void {
  const ev: ActivityEvent = { ts: Date.now(), kind, detail, txHash };
  feed.unshift(ev);
  if (feed.length > MAX) feed.pop();
  const tx = txHash ? ` ${txHash}` : "";
  console.log(`[${kind}] ${detail}${tx}`);
}

export function recent(limit = 50): ActivityEvent[] {
  return feed.slice(0, limit);
}
