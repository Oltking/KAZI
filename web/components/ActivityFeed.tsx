"use client";

import type { ActivityEvent } from "../lib/kazi";
import { ArrowDownIcon, ArrowUpIcon, CoinIcon, FlowIcon, SparkIcon } from "./Icons";

const META: Record<string, { label: string; Icon: typeof CoinIcon }> = {
  harvest: { label: "Yield harvested", Icon: SparkIcon },
  allocate: { label: "Principal deployed", Icon: ArrowUpIcon },
  deposit: { label: "Deposit", Icon: ArrowDownIcon },
  distribute: { label: "Yield streamed", Icon: FlowIcon },
};

export default function ActivityFeed({
  events,
  loading,
}: {
  events: ActivityEvent[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="feed">
        {[0, 1, 2].map((i) => (
          <div className="feedItem" key={i}>
            <span className="feedIcon skeleton" style={{ borderRadius: "50%" }} />
            <span className="feedBody">
              <span className="skeleton skelLine" style={{ width: "55%" }} />
              <span className="skeleton skelLine" style={{ width: "35%", marginTop: 6 }} />
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="emptyState">
        <FlowIcon width={28} height={28} />
        <p className="muted">No activity yet. Once you deposit, the agent puts your funds to work and it shows up here.</p>
      </div>
    );
  }

  return (
    <div className="feed">
      {events.map((e, i) => {
        const meta = META[e.kind] ?? { label: e.kind, Icon: CoinIcon };
        const Icon = meta.Icon;
        return (
          <div className="feedItem" key={`${e.txHash ?? "x"}-${i}`}>
            <span className={`feedIcon kind-${e.kind}`}>
              <Icon width={16} height={16} />
            </span>
            <span className="feedBody">
              <span className="feedLabel">{meta.label}</span>
              <span className="feedDetail">{e.detail}</span>
            </span>
            {e.txHash && (
              <a
                className="feedLink"
                href={`https://celo-sepolia.blockscout.com/tx/${e.txHash}`}
                target="_blank"
                rel="noreferrer"
                aria-label="View transaction"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 5h5v5M19 5l-9 9M19 14v4a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
