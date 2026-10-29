'use client';

import { ForecastFlow, type AdviceContent } from '@/components/receipts/forecast-flow';
import type { RecalledMemory, SealStatus } from '@/components/receipts/shared';

/** /design only: the real ForecastFlow driven by fake actions (no network, no seals). */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fakeHash = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
const born = new Map<string, number>();

const ADVICE: Record<string, AdviceContent> = {
  'market:polymarket': { advisorId: 'market:polymarket', title: 'The market says 62%', body: 'Polymarket mid price, via Tatum’s Prediction API.', source: { label: 'polymarket · live' } },
  'user:crew_sam': { advisorId: 'user:crew_sam', title: '@crew_sam: 58%', body: 'Their keeper is back but the back line is a mess. Home side edges it.', receiptHref: '/design#receipt', source: { label: 'crew take · sealed' } },
  'whale:0x9f3': { advisorId: 'whale:0x9f3', title: 'Top holder is on “Yes” with 41,200 shares', body: 'Largest open position on this market, by total PnL.', source: { label: 'tatum · positions' } },
};

const MEMORIES: Record<string, RecalledMemory[]> = {
  'user:crew_sam': [
    { kind: 'lesson', text: 'When you read @crew_sam on derbies your forecasts got slightly better (n=12), but the interval still crosses zero.', blobId: 'Qm8cY1z0aB7dLx', when: '2 days ago' },
    { kind: 'episode', text: 'Blind 48% → 60% after @crew_sam. It happened. The advice helped (+0.106).', blobId: 'kP02nB7uR4xvE1', when: 'last Sunday' },
  ],
  'market:polymarket': [{ kind: 'lesson', text: 'Reading the market price has improved your forecasts (n=38, +0.041).', blobId: 'Zt7mQ2c9L0aWr3', when: 'yesterday' }],
};

export function FlowDemo() {
  return (
    <ForecastFlow
      market={{ question: 'Will the home side win the derby on Saturday?', league: 'Premier League', closesLabel: 'Locks in 3 h 12 min (10 min before kickoff)', outcome: 'Yes' }}
      advisors={[
        { id: 'market:polymarket', name: 'The market', kind: 'market', verdict: 'helps_you', n: 38 },
        { id: 'user:crew_sam', name: '@crew_sam', kind: 'crew', verdict: 'no_clear_effect', n: 12 },
        { id: 'whale:0x9f3', name: 'Whale 0x9f3…a1', kind: 'whale', verdict: 'not_enough_evidence', n: 5 },
      ]}
      memories={MEMORIES}
      actions={{
        lockBlind: async () => { await wait(700); const h = fakeHash(); born.set(h, Date.now()); return { hash: h }; },
        lockInformed: async () => { await wait(700); const h = fakeHash(); born.set(h, Date.now()); return { hash: h }; },
        reveal: async ({ advisorId, pasted }) => {
          await wait(500);
          if (pasted) return { advisorId, title: `${pasted.handle}: pasted take`, body: pasted.text, source: pasted.url ? { label: 'source', href: pasted.url } : { label: 'pasted by you' } };
          return ADVICE[advisorId] ?? { advisorId, title: 'Advice', body: '…' };
        },
        sealStatus: async (hash) => {
          const age = Date.now() - (born.get(hash) ?? Date.now());
          const s: SealStatus = age < 3000 ? 'accepted' : age < 7000 ? 'stored' : age < 11000 ? 'onchain' : 'verified';
          return s;
        },
      }}
    />
  );
}
