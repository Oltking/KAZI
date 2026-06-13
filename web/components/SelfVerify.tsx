"use client";

import dynamic from "next/dynamic";

// The Self QR SDK touches browser-only APIs, so load it client-side only.
const Inner = dynamic(() => import("./SelfVerifyInner"), {
  ssr: false,
  loading: () => <p className="muted">Loading verification…</p>,
});

export default function SelfVerify(props: { user: `0x${string}`; onVerified: () => void }) {
  return <Inner {...props} />;
}
