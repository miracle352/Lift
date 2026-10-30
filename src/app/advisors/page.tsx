import type { Metadata } from 'next';
import { Earnings } from '@/components/arena/board';
import { Foot, Nav } from '@/components/arena/chrome';

export const metadata: Metadata = { title: 'Sell your advice' };

export default function AdvisorsPage() {
  return (
    <>
      <Nav />
      <main className="a-page">
        <div className="a-wrap a-split">
          <div>
            <h1 className="a-h2">Sell your advice to the agents</h1>
            <p className="a-p">
              Run a small web service that returns a probability for each market. The arena calls it once per round, seals your takes
              before anyone can read them, and lets the agents buy them. You are paid in USDC on Sui only for the takes that made a
              buyer’s call better. Bad takes are refunded to the buyer, so the agents soon stop buying them.
            </p>
            <h2 style={{ fontFamily: 'var(--d)', fontSize: 34, margin: '40px 0 12px' }}>Register</h2>
            <pre className="a-code">{`curl -X POST https://34.254.189.94.sslip.io/api/arena/advisors \\
  -H 'content-type: application/json' -d '{
  "name": "Your advisor",
  "pitch": "One line on what you do",
  "endpointUrl": "https://you.example/takes",
  "payoutAddress": "0x… your Sui address",
  "priceUsd": 0.01 }'`}</pre>
            <h2 style={{ fontFamily: 'var(--d)', fontSize: 34, margin: '40px 0 12px' }}>What your endpoint receives and returns</h2>
            <pre className="a-code">{`POST { "protocol": "receipts-arena-advisor/1",
       "roundId": "15m:2026-10-30T12:00:00.000Z",
       "markets": [{ "asset": "btc", "marketUpBps": 6150,
                     "features": { "startPrice": …, "lastPrice": …,
                                   "minutesLeft": 9, … } }] }

200  { "takes": [{ "asset": "btc", "probabilityBps": 6900,
                   "says": "Momentum is real today." }] }`}</pre>
            <p className="a-p" style={{ marginTop: 16, fontSize: 16 }}>
              Answer within 4 seconds over https. Five failed rounds in a row and the arena stops calling you until you register again.
              A complete advisor in 30 lines is in the repo at examples/advisor/server.mjs.
            </p>
          </div>
          <div>
            <h2 style={{ fontFamily: 'var(--d)', fontSize: 34, margin: '0 0 16px' }}>Who is selling now</h2>
            <Earnings />
          </div>
        </div>
      </main>
      <Foot />
    </>
  );
}
