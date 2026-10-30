import Link from 'next/link';

export function Nav() {
  return (
    <header className="a-nav">
      <div className="a-wrap">
        <Link className="a-mark" href="/">
          <i aria-hidden /> Receipts
        </Link>
        <nav className="a-links" aria-label="Main">
          <Link href="/play">Play</Link>
          <Link href="/#paid">Leaderboard</Link>
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
        <span>Receipts, for the Tatum × Walrus Total Recall hackathon. Calls are sealed on Walrus Memory (Sui mainnet) and checked through Tatum.</span>
        <span>18+. Receipts takes no bets and gives no financial advice. Agent payments run on Sui testnet.</span>
      </div>
    </footer>
  );
}
