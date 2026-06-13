import type { ReactNode } from "react";
import Link from "next/link";
import "./landing.css";
import { ShieldIcon, SparkIcon, CheckIcon, FlowIcon, CoinIcon, LockIcon } from "../components/Icons";
import PoolPreview from "../components/PoolPreview";

export default function Landing() {
  return (
    <div className="lp">
      {/* Nav */}
      <nav className="lpNav">
        <div className="lpNavInner">
          <Link href="/" className="lpBrand">
            <span className="lpBrandMark">
              <FlowIcon width={18} height={18} />
            </span>
            Kazi
          </Link>
          <div className="lpNavLinks">
            <a className="lpNavLink" href="#how">How it works</a>
            <a className="lpNavLink" href="#trust">Why it&apos;s safe</a>
            <Link className="lpBtn accent sm" href="/app">Launch app</Link>
          </div>
        </div>
      </nav>

      <div className="lpWrap">
        {/* Hero */}
        <header className="lpHero">
          <div>
            <span className="lpEyebrow">
              <ShieldIcon width={14} height={14} /> Capital-protected savings on Celo
            </span>
            <h1 className="lpH1">
              Savings that <span className="accent">work for you</span>, without risking your money.
            </h1>
            <p className="lpLede">
              Deposit dollar stablecoins. Your principal is never put at risk. An autonomous agent
              puts it to work and streams the yield back to you, so you watch your balance tick up in
              real time.
            </p>
            <div className="lpCtas">
              <Link className="lpBtn accent" href="/app">Launch app →</Link>
              <a className="lpBtn ghost" href="#how">How it works</a>
            </div>
            <p className="lpHeroNote">No token. No lockups. Withdraw anytime. Built for MiniPay.</p>
          </div>

          {/* Hero visual: the LIVE Kazi pool (real on-chain data) */}
          <PoolPreview />
        </header>

        {/* Trust strip */}
        <div className="lpTrust" id="trust">
          <span><CheckIcon className="dot" width={16} height={16} /> Principal protected in code</span>
          <span><SparkIcon className="dot" width={16} height={16} /> Real yield, not token emissions</span>
          <span><LockIcon className="dot" width={16} height={16} /> Verified with Self</span>
          <span><FlowIcon className="dot" width={16} height={16} /> Built on Celo</span>
        </div>

        {/* Features */}
        <section className="lpSection">
          <div className="lpSectionHead">
            <div className="lpKicker">Why Kazi</div>
            <h2 className="lpH2">A savings account you can actually trust.</h2>
            <p className="lpSub">
              The agent decides; the contracts enforce. Even if the agent misbehaved, it physically
              cannot move your principal into anything risky.
            </p>
          </div>
          <div className="lpGrid">
            <Feature icon={<ShieldIcon />} title="Your principal is protected">
              Deposits sit only in conservative, redeemable venues. There is no code path that lets
              your principal be lent out or put at risk, and tests prove it.
            </Feature>
            <Feature icon={<SparkIcon />} title="Yield that streams in real time">
              Earnings come from real lending interest, not inflationary token rewards. Your balance
              visibly ticks upward, second by second.
            </Feature>
            <Feature icon={<CheckIcon />} title="Real identity, portable reputation">
              Members verify once with Self (privacy-preserving), and on-time behavior builds an
              on-chain reputation via ERC-8004.
            </Feature>
            <Feature icon={<CoinIcon />} title="Built for everyday money">
              Stablecoin-native and mobile-first for MiniPay. Every action is a simple transaction,
              no confusing signatures.
            </Feature>
          </div>
        </section>
      </div>

      {/* Guarantee band (white on black) */}
      <section className="lpBand">
        <div className="lpBandInner">
          <div className="lpKicker">The guarantee</div>
          <h2>Trust is architecture here, not a marketing word.</h2>
          <p>
            A depositor can always redeem their full principal, subject only to the solvency of the
            whitelisted safe venues and available liquidity. Member principal is never lent into the
            at-risk credit book. The contracts make it impossible. Only accumulated yield is ever
            exposed to credit risk, absorbed by a first-loss buffer before any saver is touched.
          </p>
          <Link className="lpBtn onDark" href="/app">Start saving →</Link>
        </div>
      </section>

      <div className="lpWrap">
        {/* How it works */}
        <section className="lpSection" id="how">
          <div className="lpSectionHead">
            <div className="lpKicker">How it works</div>
            <h2 className="lpH2">Four simple steps.</h2>
          </div>
          <div className="lpSteps">
            <Step n={1} title="Deposit">Add dollar stablecoins (cUSD). You receive vault shares.</Step>
            <Step n={2} title="Put to work">The agent allocates your principal to safe, audited venues.</Step>
            <Step n={3} title="Earn, live">Yield is harvested and streams back, so your balance grows.</Step>
            <Step n={4} title="Withdraw">Take out your principal plus earnings, any time.</Step>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="lpFooter">
        <div className="lpFooterInner">
          <span>© {new Date().getFullYear()} Kazi · Built on Celo</span>
          <div className="lpFooterLinks">
            <Link href="/app">Launch app</Link>
            <a href="https://github.com/Oltking/KAZI" target="_blank" rel="noreferrer">GitHub</a>
            <a href="https://self.xyz" target="_blank" rel="noreferrer">Self</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="lpFeature">
      <span className="lpFeatureIcon">{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="lpStep">
      <div className="lpStepNum">{n}</div>
      <h4>{title}</h4>
      <p>{children}</p>
    </div>
  );
}
