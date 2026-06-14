"use client";

import { useMemo, useState } from "react";
import { SelfQRcodeWrapper, SelfAppBuilder, countries } from "@selfxyz/qrcode";

// Off-chain verification: the Self app posts the proof to our backend, which
// verifies it and records the attestation on-chain. This works with the normal
// production Self app and keeps everything on Celo Sepolia (no funds). The
// endpoint URL here MUST match SELF_ENDPOINT on the server (the scope is derived
// from it).
const SELF_ENDPOINT =
  process.env.NEXT_PUBLIC_SELF_ENDPOINT ?? "https://kazi-agent.vercel.app/api/self-verify";

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
  const [error, setError] = useState<string | null>(null);

  const app = useMemo(() => {
    return new SelfAppBuilder({
      version: 2,
      appName: "Kazi",
      scope: process.env.NEXT_PUBLIC_SELF_SCOPE_SEED ?? "kazi",
      endpoint: SELF_ENDPOINT, // our backend verifier (off-chain flow)
      endpointType: "https",
      userId: user, // verified identity is bound to the saver's wallet address
      userIdType: "hex",
      disclosures: {
        minimumAge: 18,
        excludedCountries: [countries.UNITED_STATES],
      },
    }).build();
  }, [user]);

  if (!app) {
    return <p className="muted">Verification unavailable.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <SelfQRcodeWrapper
        selfApp={app}
        onSuccess={onVerified}
        onError={(e: unknown) => {
          // surface the real reason instead of spinning silently
          console.error("[self] verification error:", e);
          const msg =
            (e as { reason?: string; error_code?: string; message?: string } | undefined)?.reason ??
            (e as { message?: string } | undefined)?.message ??
            "Verification failed. Make sure your Self app matches this network.";
          setError(String(msg));
        }}
      />
      <p className="muted" style={{ textAlign: "center" }}>
        Scan with the <a href="https://self.xyz" target="_blank" rel="noreferrer">Self</a> app
        to verify (privacy-preserving, 18+). Your status updates automatically once the proof is
        accepted.
      </p>
      {error && <p className="inlineError" style={{ textAlign: "center" }}>{error}</p>}
    </div>
  );
}
