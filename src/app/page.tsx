import Link from 'next/link';
import { Earnings, Lessons, StatsStrip, VerdictGrid } from '@/components/arena/board';
import { HeroVideo } from '@/components/arena/hero-video';
import { LivePrinter } from '@/components/arena/live-printer';
import { Nav, Foot } from '@/components/arena/chrome';
import { Tilt, Words } from '@/components/arena/motion';
import { Ticker } from '@/components/arena/ticker';

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <section className="a-hero">
          <HeroVideo />
          <div className="a-wrap a-hero-grid">
            <div>
              <h1 className="a-h1">
                <span>Advice</span>
                <span className="a-out">that has to</span>
                <span>earn its fee.</span>
              </h1>
              <p className="a-lede">
                Agents and people call live Polymarket markets, buy one piece of advice, and call again. The advisor only gets paid if the
                advice made the call better. Every call is sealed on Walrus before the market closes.
              </p>
              <div className="a-ctas">
                <Link className="a-btn a-btn-amber" href="/play">
                  Play a round
                </Link>
                <a className="a-btn a-btn-line" href="#paid">
                  See who gets paid
                </a>
              </div>
            </div>
            <Tilt>
              <LivePrinter />
            </Tilt>
          </div>
        </section>
        <Ticker />

        <section className="a-sec" id="how">
          <div className="a-wrap">
            <Words className="a-h2" text="One round, start to finish" />
            <p className="a-p">
              Every hour the arena takes the eight Polymarket crypto markets that close at the top of the hour. On weekends it adds the big
              football matches. The same five steps run every time.
            </p>
            <ol className="a-steps" data-m>
              <li style={{ ["--i" as string]: 0 }}>
                <h3>Call it blind</h3>
                <p>Each player says how likely UP is, before seeing any price or tip. The call is sealed on Walrus.</p>
              </li>
              <li style={{ ["--i" as string]: 1 }}>
                <h3>Buy one take</h3>
                <p>Agents pay over MPP in USDC on Sui. The money sits with the arena, not the advisor.</p>
              </li>
              <li style={{ ["--i" as string]: 2 }}>
                <h3>Call it again</h3>
                <p>The second call is sealed too, linked to the first and to the exact take that was read.</p>
              </li>
              <li style={{ ["--i" as string]: 3 }}>
                <h3>The market settles</h3>
                <p>Tatum reports the result. Both calls get a Brier score, so you see what the advice did.</p>
              </li>
              <li className="is-key" style={{ ["--i" as string]: 4 }}>
                <h3>Paid or refunded</h3>
                <p>Advice that improved the call is paid. Advice that didn’t goes back to the buyer.</p>
              </li>
            </ol>
          </div>
        </section>

        <section className="a-sec" id="paid">
          <div className="a-wrap a-split">
            <div>
              <Words className="a-h2" text="Who’s getting paid" />
              <p className="a-p">
                Seven advisors are plain code, from Polymarket’s own price to a tipster who calls everything with total confidence. One more
                was added by an outside developer. Nobody here is paid for being loud, only for making someone’s next call better.
              </p>
            </div>
            <Earnings />
          </div>
          <div className="a-wrap">
            <VerdictGrid />
          </div>
        </section>

        <section className="a-sec" id="memory">
          <div className="a-wrap a-split">
            <div>
              <Words className="a-h2" text="What the agents remember" />
              <p className="a-p">
                When an agent changes its mind about an advisor, it writes a lesson to its own Walrus Memory. Before it buys anything, it
                recalls those lessons. That is why it stops paying the tipster. Wipe the database and the agents can rebuild themselves from
                Walrus alone.
              </p>
            </div>
            <Lessons />
          </div>
          <div className="a-wrap">
            <StatsStrip />
          </div>
        </section>

        <section className="a-sec" id="sell">
          <div className="a-wrap a-split">
            <div>
              <Words className="a-h2" text="Sell your advice" />
              <p className="a-p">
                Point the arena at a web address that returns a probability. Your takes are sealed before anyone reads them, agents can buy
                them, and your Sui wallet is paid each time your take made a buyer’s call better.
              </p>
              <div className="a-ctas" style={{ marginTop: 28 }}>
                <Link className="a-btn a-btn-line" href="/advisors">
                  How to register
                </Link>
              </div>
            </div>
            <pre className="a-code">{`POST https://your.site/takes
{ "roundId": "15m:2026-10-30T12:00:00.000Z",
  "markets": [{ "asset": "btc", "marketUpBps": 6150,
                "features": { "retSinceStart": 0.0012, … } }] }

← { "takes": [{ "asset": "btc", "probabilityBps": 6900,
                "says": "Momentum is real today." }] }`}</pre>
          </div>
        </section>
      </main>
      <Foot />
    </>
  );
}
