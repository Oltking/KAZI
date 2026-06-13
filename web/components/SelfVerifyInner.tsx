"use client";

import { useMemo } from "react";
import { SelfQRcodeWrapper, SelfAppBuilder, countries } from "@selfxyz/qrcode";
import { addresses } from "@kazi/shared";

/**
 * Real Self verification QR. The member scans with the Self mobile app and
 * proves unique humanity + age + region with a ZK proof. The Identity
 * Verification Hub V2 validates it on Celo and calls our on-chain SelfVerifier,
 * which records the member in SelfGate — the same gate the vault checks. The
 * disclosure policy (18+, exclude US) MUST match the on-chain SelfVerifier
 * config (see DeploySelfVerifier.s.sol).
 */
export default function SelfVerifyInner({
  user,
  onVerified,
}: {
  user: `0x${string}`;
  onVerified: () => void;
}) {
  const app = useMemo(() => {
    if (!addresses.selfVerifier) return null;
    return new SelfAppBuilder({
      version: 2,
      appName: "Kazi",
      scope: process.env.NEXT_PUBLIC_SELF_SCOPE_SEED ?? "kazi",
      endpoint: addresses.selfVerifier, // on-chain SelfVerifier contract
      endpointType: "staging_celo", // testnet on-chain verification (Celo Sepolia)
      userId: user, // verified identity is bound to the saver's wallet address
      userIdType: "hex",
      disclosures: {
        minimumAge: 18,
        excludedCountries: [countries.UNITED_STATES],
      },
    }).build();
  }, [user]);

  if (!app) {
    return <p className="muted">Verifier not deployed yet.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <SelfQRcodeWrapper selfApp={app} onSuccess={onVerified} onError={() => undefined} />
      <p className="muted" style={{ textAlign: "center" }}>
        Scan with the <a href="https://self.xyz" target="_blank" rel="noreferrer">Self</a> app
        to verify (privacy-preserving, 18+). Your on-chain status updates automatically once the
        proof is accepted.
      </p>
    </div>
  );
}
