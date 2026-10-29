/**
 * Live check: Tatum Prediction API key works and returns football markets.
 *   pnpm smoke:tatum                  # searches "Premier League"
 *   pnpm smoke:tatum -- "Champions League"
 * Costs ~150 credits (search 50 + markets 100). Free plan: 100k credits, 3 req/s.
 */
import { TATUM } from '../src/core/constants';
import { requireEnv } from '../src/lib/env';

const query = process.argv.slice(2).find((a) => !a.startsWith('-')) ?? 'Premier League';

async function get(path: string) {
  const res = await fetch(`${TATUM.apiBaseUrl}${path}`, { headers: { 'x-api-key': requireEnv('TATUM_API_KEY'), accept: 'application/json' } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${res.status} ${path}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

async function main() {
  const search = await get(`/v4/data/prediction/search?q=${encodeURIComponent(query)}&limitPerType=5&eventsStatus=active`);
  console.log('search keys:', Object.keys(search ?? {}));
  console.log(JSON.stringify(search, null, 2).slice(0, 2500));

  const markets = await get(`/v4/data/prediction/markets?platform=polymarket&status=active&search=${encodeURIComponent(query)}&sort=endingSoon&limit=5`);
  for (const m of markets.data ?? []) {
    console.log(`- ${m.question}\n    id ${m.id}  closes ${m.closeTime}  outcomes ${(m.outcomes ?? []).map((o: { name: string; price: number }) => `${o.name}=${o.price}`).join(' ')}`);
  }
  console.log('pagination', markets.pagination);
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
});
