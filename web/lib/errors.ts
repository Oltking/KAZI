/** Map raw wallet / contract errors to short, human, trustworthy messages. */
export function humanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  if (lower.includes("not verified")) return "Complete the one-time verification first.";
  if (/reject|denied|4001/.test(lower)) return "Transaction cancelled.";
  if (lower.includes("insufficient")) return "Not enough funds for this transaction (including gas).";
  if (lower.includes("chain") && lower.includes("match")) return "Wrong network — switch to Celo Sepolia.";
  if (lower.includes("timed out") || lower.includes("timeout")) return "The network is slow right now. Please try again.";
  return msg.length > 120 ? msg.slice(0, 120) + "…" : msg;
}
