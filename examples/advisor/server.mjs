// A complete Lift advisor in ~30 lines (protocol receipts-arena-advisor/1, docs/ARENA.md).
// Run:  node examples/advisor/server.mjs   (PORT=8790 by default)
// Register:
//   curl -X POST https://<arena>/api/arena/advisors -H 'content-type: application/json' -d '{
//     "name": "Crowd Plus", "pitch": "Leans harder into whatever the market already thinks.",
//     "endpointUrl": "https://<your-host>/takes", "payoutAddress": "0x<your Sui address>", "priceUsd": 0.01 }'
// You are paid in USDC on Sui only for takes that made a buyer's forecast better (pay-for-lift).
import { createServer } from 'node:http';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function takeFor(market) {
  // Strategy: push the market's UP price 25% further from 50% (a bet that the crowd under-reacts).
  const m = market.marketUpBps / 10000;
  const p = clamp(0.5 + 1.25 * (m - 0.5), 0.02, 0.98);
  return { asset: market.asset, probabilityBps: Math.round(p * 10000), says: `Crowd says ${Math.round(m * 100)}%, I say ${Math.round(p * 100)}%.` };
}

createServer((req, res) => {
  if (req.method !== 'POST') return res.writeHead(405).end();
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    try {
      const { markets } = JSON.parse(body);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ takes: markets.map(takeFor) }));
    } catch {
      res.writeHead(400).end();
    }
  });
}).listen(Number(process.env.PORT ?? 8790), () => console.log('advisor listening'));
