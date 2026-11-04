import Link from 'next/link';

/** Mark: a line that rises after a dip — the shape of a forecast getting better after advice. */
function Mark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 15 L8 18 L22 5" />
      <circle cx="22" cy="5" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function Nav({ light = false }: { light?: boolean }) {
  return (
    <header className={`a-nav ${light ? 'is-light' : ''}`}>
      <div className="a-wrap">
        <Link className="a-mark" href="/" aria-label="Lift, home">
          <Mark />
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
