import Link from 'next/link';

/** The Lift mark: an L whose foot rises into a gold coin (a call that got better, and the fee that followed). */
export function Mark({ onBlue = false, size = 30 }: { onBlue?: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <rect width="64" height="64" rx="15" fill={onBlue ? '#fff' : '#1b30e8'} />
      <path d="M19 13 V46 L41 36" fill="none" stroke={onBlue ? '#1b30e8' : '#fff'} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="48.5" cy="32.5" r="6.5" fill="#ffce3a" />
    </svg>
  );
}

export function Nav({ light = false }: { light?: boolean }) {
  return (
    <header className={`a-nav ${light ? 'is-light' : ''}`}>
      <div className="a-wrap">
        <Link className="a-mark" href="/" aria-label="Lift, home">
          <Mark onBlue={!light} />
          Lift
        </Link>
        <nav className="a-links" aria-label="Main">
          <Link href="/play">Play</Link>
          <Link href="/#memory">Memory</Link>
          <Link className="a-hide-sm" href="/blog">
            Blog
          </Link>
          <Link className="a-hide-sm" href="/advisors">
            Sell advice
          </Link>
          <Link href="/verify">Verify</Link>
        </nav>
      </div>
    </header>
  );
}

export function Foot() {
  return (
    <footer className="a-foot">
      <div className="a-wrap">
        <span>
          Lift, built for the Tatum × Walrus Total Recall hackathon. Calls are sealed on Walrus Memory (Sui mainnet) and checked through Tatum.{' '}
          <Link href="/memory">Everything we’ve written to Walrus</Link>.
        </span>
        <span>18+. Lift takes no bets and gives no financial advice. Agent payments run on Sui testnet.</span>
      </div>
    </footer>
  );
}
