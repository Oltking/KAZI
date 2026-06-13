# Deploy the Kazi Mini App to Vercel

The web app is a Next.js app inside this pnpm monorepo. The easiest reliable way
to host it publicly is Vercel's GitHub import (Vercel clones the whole repo, so
the `@kazi/shared` workspace package resolves correctly).

## One-time import (Vercel dashboard)

1. Go to **https://vercel.com/new** and import **`Oltking/KAZI`**.
2. **Root Directory:** set to `web`.
3. **Framework Preset:** Next.js (auto-detected).
4. **Install / Build:** leave defaults — Vercel uses pnpm and the workspace
   lockfile automatically. (Build: `next build`, Install: `pnpm install`.)
5. **Environment variables** — none are strictly required (the code defaults to
   Celo Sepolia + scope `kazi`). Optional, to be explicit:
   - `NEXT_PUBLIC_CHAIN = sepolia`
   - `NEXT_PUBLIC_SELF_SCOPE_SEED = kazi`
   - `NEXT_PUBLIC_AGENT_URL = <public agent URL>` (only if you host the agent;
     without it the balance/ticker still work from direct on-chain reads, the
     activity feed is just empty)
6. **Deploy.** You get a public URL (e.g. `https://kazi-xxx.vercel.app`).

Every push to `main` redeploys automatically. The committed
`shared/addresses.json` already points at the live Celo Sepolia deployment, so
the deployed app is wired to real contracts out of the box.

## Using it (real user flow)

1. Open the URL in a browser with a wallet (MetaMask) — or in **MiniPay** on
   Android. The app switches the wallet to Celo Sepolia automatically.
2. Fund the wallet with a little CELO for gas (Celo Sepolia faucet:
   https://faucet.celo.org).
3. Tap **Get 100 test cUSD** (mints the demo cUSD).
4. **Verify with Self** — scan the QR with the Self app (18+, privacy-preserving).
   Once the on-chain proof lands, the gate clears automatically.
5. **Deposit**, watch the live ticker, **Withdraw** anytime — all real on-chain.

## CLI alternative

`vercel` CLI works too, but deploy from the **repo root** (not `web/`) so the
workspace is included, with the project's Root Directory set to `web` in its
settings. The dashboard import above configures this for you.
