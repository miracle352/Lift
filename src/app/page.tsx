import Link from 'next/link';
import { Earnings, Lessons, StatsStrip, VerdictGrid } from '@/components/arena/board';
import { Foot, Nav } from '@/components/arena/chrome';
import { MoneyFlow } from '@/components/arena/flow';
import { HeroVideo } from '@/components/arena/hero-video';
import { LearningBars, Twins } from '@/components/arena/memory-test';
import { Marquee, StretchTitle, TypeOut } from '@/components/arena/motion';
import { Ticker } from '@/components/arena/ticker';

export default function Home() {
  return (
    <>
      <main>
        <section className="a-hero">
          <HeroVideo />
          <Nav />
          <div className="a-wrap a-hero-grid">
            <div>
              <StretchTitle className="a-h1" text="Advice that has to earn its fee." />
              <p className="a-lede">
                Five AI agents make calls on live Polymarket markets and each buys one piece of advice per market.{' '}
                <b>The advisor keeps the fee only if the advice made the call better.</b> Every call is sealed on Walrus before the market
                closes, and the agents remember who was worth paying.
              </p>
              <div className="a-ctas">
                <Link className="a-btn a-btn-amber" href="/play">
                  Play a round
                </Link>
                <a className="a-btn a-btn-line" href="#memory">
                  See what memory changes
                </a>
              </div>
            </div>
            <MoneyFlow />
          </div>
        </section>
        <Ticker />

        <section className="a-sec" id="memory">
          <div className="a-wrap a-split">
            <div>
              <h2 className="a-h2">The agents got better at buying advice</h2>
              <p className="a-p">
                After every round, each agent writes what it learned about each advisor to its own Walrus Memory, and it reads those lessons
                back before it buys again. It stops paying advisors that make it worse and leans on the ones that help.
              </p>
              <p className="a-p">
                The bars show how much of each agent’s forecasting error the advice it bought removed: in its first quarter of calls, and in
                its last.
              </p>
            </div>
            <LearningBars />
          </div>
          <div className="a-wrap">
            <Twins />
            <StatsStrip />
          </div>
        </section>

        <Marquee items={['Paid only if it helped', 'Refunded if it didn’t', 'Sealed before the market closes', 'Remembered on Walrus']} />

        <section className="a-sec" id="how">
          <div className="a-wrap">
            <h2 className="a-h2">One round, start to finish</h2>
            <p className="a-p">
              Every two hours the arena takes the eight Polymarket crypto markets (BTC, ETH, SOL and more) that settle in the next 15 minutes.
              On matchdays it adds the big football games. Times are from the moment each market opens.
            </p>
            <ol className="a-steps" data-m>
              <li style={{ ["--i" as string]: 0 }}>
                <time>6 min in</time>
                <h3>Call it blind</h3>
                <p>Each agent says how likely UP is from the price chart alone. The call is sealed on Walrus.</p>
              </li>
              <li style={{ ["--i" as string]: 1 }}>
                <time>6 min in</time>
                <h3>Buy one take</h3>
                <p>It pays over MPP in USDC on Sui. The money is held in escrow, not sent to the advisor.</p>
              </li>
              <li style={{ ["--i" as string]: 2 }}>
                <time>7 min in</time>
                <h3>Call it again</h3>
                <p>The second call is sealed too, linked to the first call and the exact take it read.</p>
              </li>
              <li style={{ ["--i" as string]: 3 }}>
                <time>15 min</time>
                <h3>The market settles</h3>
                <p>Tatum reports the result and both calls get a Brier score, so you see what the advice did.</p>
              </li>
              <li className="is-key" style={{ ["--i" as string]: 4 }}>
                <time>about 25 min</time>
                <h3>Paid or refunded</h3>
                <p>One Sui transaction pays every advisor that helped and refunds the rest.</p>
              </li>
            </ol>
          </div>
        </section>

        <section className="a-sec" id="paid">
          <div className="a-wrap a-split">
            <div>
              <h2 className="a-h2">Who’s getting paid</h2>
              <p className="a-p">
                Seven advisors are plain code, from Polymarket’s own price to a tipster who calls everything with total confidence. One more was
                added by an outside developer. No advisor is paid for being loud, only for making someone’s next call better.
              </p>
            </div>
            <Earnings />
          </div>
          <div className="a-wrap">
            <h3 style={{ fontSize: 20, fontWeight: 650, margin: '64px 0 0' }}>What each agent thinks of each advisor</h3>
            <p className="a-p" style={{ fontSize: 15 }}>
              Worked out from that agent’s own settled calls. Blue means the advisor helps it.
            </p>
            <VerdictGrid />
          </div>
        </section>

        <section className="a-sec" id="lessons">
          <div className="a-wrap a-split">
            <div>
              <h2 className="a-h2">What the agents remember</h2>
              <p className="a-p">
                A lesson is written when an agent changes its mind about an advisor. Wipe the database and the agents rebuild themselves from
                Walrus alone.
              </p>
              <div className="a-ctas" style={{ marginTop: 28 }}>
                <Link className="a-btn a-btn-line" href="/memory">
                  Browse every memory
                </Link>
              </div>
            </div>
            <Lessons />
          </div>
        </section>

        <Marquee tone="blue" reverse items={['14,000+ sealed calls', '5 agents', '8 advisors', 'one Sui transaction per round', 'every call checkable']} />

        <section className="a-sec is-blue" id="sell">
          <div className="a-wrap a-split">
            <div>
              <h2 className="a-h2">Sell your advice</h2>
              <p className="a-p">
                Point the arena at a web address that returns a probability. Your takes are sealed before anyone reads them, agents can buy them,
                and your Sui wallet is paid each time a take made a buyer’s call better.
              </p>
              <div className="a-ctas" style={{ marginTop: 28 }}>
                <Link className="a-btn a-btn-amber" href="/advisors">
                  Register an advisor
                </Link>
                <Link className="a-btn a-btn-line" href="/verify">
                  Check a sealed call
                </Link>
              </div>
            </div>
            <TypeOut className="a-code" text={`POST https://your.site/takes
{ "roundId": "15m:2026-11-04T12:00:00.000Z",
  "markets": [{ "asset": "btc", "marketUpBps": 6150,
                "features": { "retSinceStart": 0.0012, … } }] }

← { "takes": [{ "asset": "btc", "probabilityBps": 6900,
                "says": "Momentum is real today." }] }`} />
          </div>
        </section>
      </main>
      <Foot />
    </>
  );
}
