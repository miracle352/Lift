import type { Metadata } from 'next';
import Link from 'next/link';
import { Foot, Nav } from '@/components/arena/chrome';
import { LearningBars } from '@/components/arena/memory-test';

export const metadata: Metadata = {
  title: 'What 3,443 paid-for-lift calls taught five agents',
  description: 'How Lift uses Walrus Memory and Tatum to make advice earn its fee, and how its agents learned whom to pay.',
};

export default function Blog() {
  return (
    <>
      <Nav light />
      <main className="a-page">
        <article className="a-wrap a-post">
          <p className="a-post-meta">4 November 2026, built for the Tatum × Walrus Total Recall hackathon</p>
          <h1 className="a-h2">What 3,443 paid-for-lift calls taught five agents</h1>
          <p className="a-post-lede" style={{ borderLeft: '4px solid #ffce3a', paddingLeft: 16 }}>
            <b>Update, 10 November.</b> Twelve days in: 33,755 calls sealed on Walrus mainnet and 8,865 settled. Advice now removes 36.8% of
            Rookie’s forecasting error, up from 22.9% in its first quarter of calls, and on the same 1,084 markets Rookie scores 0.173 against
            Goldfish’s 0.237. The story in two minutes:{' '}
            <a href="https://youtu.be/f0UAgE8vhyg" target="_blank" rel="noreferrer">Rookie’s Diary</a>.
          </p>
          <p className="a-post-lede">
            Advice is cheap to give and hard to judge. Tipsters keep their wins and quietly lose their misses, and you can rarely tell whether
            a tip changed your mind for the better. Lift is a small market where that question gets answered every two hours, with money on
            it: an advisor keeps its fee only if its advice made the buyer’s forecast better.
          </p>

          <h2>What it does</h2>
          <p>
            Every two hours, Lift takes the eight Polymarket “Up or Down” crypto markets that settle in the next 15 minutes (BTC, ETH, SOL,
            XRP, DOGE, BNB, HYPE and ZEC). On matchdays it adds Premier League, LaLiga, Champions League and Bundesliga games. Then the same
            five steps run for every market:
          </p>
          <ol>
            <li>
              <b>Blind call.</b> Each agent gives the probability of UP from price features alone, without seeing Polymarket’s price or any
              tip.
            </li>
            <li>
              <b>Buy one take.</b> Eight advisors each publish a take. The agent picks one and pays for it over MPP, in USDC on Sui. The money
              goes into escrow, not to the advisor.
            </li>
            <li>
              <b>Informed call.</b> The agent calls again after reading the take, moving toward it as far as it trusts that advisor.
            </li>
            <li>
              <b>Settle.</b> Tatum reports the result. Both calls get a Brier score (the squared error of a probability, so lower is better).
            </li>
            <li>
              <b>Pay for lift.</b> If the informed call beat the blind call, the escrow goes to the advisor. If not, it goes back to the agent.
              One Sui transaction settles the whole round.
            </li>
          </ol>
          <p>
            The advisors are plain code with honest descriptions: Polymarket’s own price (The Crowd), a careful model (The Quant), a
            momentum chaser, a contrarian, an order-book reader, a tipster who is always 88% sure, a fence sitter who always says 50%, and one
            advisor added through the public marketplace (Crowd Plus). The agents are plain code too. No language model produces any number,
            so every result can be reproduced.
          </p>

          <h2>How it uses Walrus Memory</h2>
          <p>Walrus Memory does two jobs in Lift, and both are on Sui mainnet.</p>
          <p>
            <b>It is the seal.</b> Each phase of a round (blind calls, takes, informed calls) is hashed into a Merkle tree, and the root is
            written as a Walrus Memory namespace before the market closes. So far that is 14,156 calls in 380 seals. Anyone can paste a
            call’s hash into <Link href="/verify">/verify</Link>: Lift recomputes the hash and checks the Merkle proof, then reads the
            commit transaction from Sui to confirm the account, the owner, and that it landed before the market closed. Change one number and
            the check fails.
          </p>
          <p>
            <b>It is the agents’ memory.</b> After every settled round, each agent writes an episode memory saying what it believed, whose
            take it bought and how that went. When its verdict on an advisor changes (“helps me”, “makes me worse”, “rarely moves me”), it
            writes a lesson. Before it buys anything, it recalls those lessons from Walrus Memory, and the lessons change what it does: an
            advisor that makes it worse is skipped and only re-tested now and then. If you wipe the database, <code>pnpm arena rebuild</code>{' '}
            restores every agent from Walrus alone. The arena has written{' '}
            <Link href="/memory">906 memories</Link> so far, including 82 lessons.
          </p>

          <h2>How it uses Tatum</h2>
          <p>
            Tatum’s Prediction API is where the markets come from: live 15-minute markets with Polymarket’s price, league events for football,
            the largest open positions on each match (for The Whale advisor), and the resolved feed that settles every round. Sui reads (the
            checkpoints and transactions behind every seal) go through Tatum’s native Sui gRPC gateway. A credit budget keeps the whole arena
            inside the free plan, at about two Prediction API calls per round.
          </p>

          <h2>How it learned over time</h2>
          <p>
            This is the part we care about most. Here is how much of each agent’s forecasting error the advice it bought removed, in its first
            quarter of calls and in its last:
          </p>
          <div className="a-post-fig">
            <LearningBars />
          </div>
          <p>
            Every agent got more out of the same advisors, because it learned which ones to buy from and how far to trust them. The changes
            in who they paid tell the story:
          </p>
          <ul>
            <li>
              <b>Rookie</b> has no model of its own and calls everything 50/50. It went from buying The Crowd 43% of the time to 77%, and
              wrote the lesson that The Fader makes it worse. Advice now removes 21.5% of its error, up from 8%.
            </li>
            <li>
              <b>Cautious Quant</b> has the right model but thinks markets are 2.5 times wilder than they are. At first the advice it bought
              made it <i>worse</i>. It learned that Book Reader hurt it, moved to the marketplace advisor Crowd Plus (27% of its purchases to
              82%), and now advice helps it.
            </li>
            <li>
              <b>Gambler</b> is wildly overconfident. The advisor that helps it most turned out to be the dullest one: the Fence Sitter, who
              always says 50%. It now buys the Fence Sitter 83% of the time, up from 35%, because being pulled back to 50/50 is exactly what
              an overconfident forecaster needs. We didn’t design that. The agent found it.
            </li>
          </ul>
          <p>
            Pay-for-lift makes the same lesson visible in money. The Crowd has kept $9.08 and refunded $4.13. The Fader kept $0.30 and refunded
            $1.14, so it is paid to stay quiet. Across the arena $19.03 has gone to advice that helped and $15.40 back to buyers, in 350 MPP
            payments.
          </p>
          <p>
            One more test started on 4 November. A fifth agent, the <b>Goldfish</b>, is Rookie’s identical twin: same blind call, same
            advisors, same markets, but it never reads or writes memory, so it buys at random and trusts every take halfway. The gap between
            Rookie and the Goldfish on the same markets is what Walrus Memory is worth, measured live on the{' '}
            <Link href="/#memory">home page</Link>.
          </p>

          <h2>Agent payments</h2>
          <p>
            Takes are sold behind HTTP 402. Each agent pays once per round for its whole bundle with <code>mppx</code> and{' '}
            <code>@suimpp/mpp</code>, receives exactly the takes that were sealed earlier, and the arena checks each served take against its
            sealed hash. Settlement is one programmable transaction per round from the escrow wallet. Anyone can sell advice: register a web
            address that returns a probability (<Link href="/advisors">/advisors</Link>) and your Sui address is paid every time a take made a
            buyer’s call better.
          </p>

          <h2>Honest limits</h2>
          <ul>
            <li>Agent payments run on Sui testnet USDC for now. The seals and the memory are on mainnet.</li>
            <li>A seal proves when a call was made and that it wasn’t changed, not that nobody peeked somewhere else.</li>
            <li>Verdicts need at least eight paired calls, so early verdicts are mostly “no clear effect yet”.</li>
            <li>Football markets settle slowly, so most of the learning comes from the crypto rounds.</li>
          </ul>

          <h2>Try it</h2>
          <p>
            <Link href="/play">Play a round</Link> yourself (blind call, read one take, call again), <Link href="/verify">check any sealed
            call</Link>, or <Link href="/memory">browse every memory</Link> the arena has written to Walrus.
          </p>
        </article>
      </main>
      <Foot />
    </>
  );
}
