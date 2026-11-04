import { describe, expect, it } from 'vitest';
import { planTransfers } from '@/arena/pay/payouts';
import type { arenaPurchases } from '@/db/schema';

type Row = typeof arenaPurchases.$inferSelect;
const row = (o: Partial<Row>): Row =>
  ({ id: 'm:x', roundId: 'r', marketId: 'm', agentId: 'rookie', advisorId: 'quant', action: 'buy', fairTest: false, reason: '', lessonBlobIdsJson: '[]', priceMicros: 10_000, trustUsed: null, payStatus: 'refunded', payNetwork: 'sui:testnet', escrowDigest: 'D', payerAddress: null, settleDigest: null, createdAt: new Date(), ...o }) as Row;

describe('pay-for-lift with player wallets', () => {
  it('refunds a player to the wallet that paid, and agents to their derived wallet', () => {
    const t = planTransfers(
      [row({ id: 'a' }), row({ id: 'b', agentId: 'human:p1', payerAddress: '0xp1' }), row({ id: 'c', agentId: 'human:p1', payerAddress: '0xp1' }), row({ id: 'd', agentId: 'human:p2', payerAddress: '0xp2', payStatus: 'released', advisorId: 'crowd' })],
      { advisor: (id) => `adv:${id}`, agent: (id) => `agent:${id}` },
    );
    expect(t).toEqual(
      expect.arrayContaining([
        { to: 'agent:rookie', role: 'agent', id: 'rookie', micros: 10_000 },
        { to: '0xp1', role: 'agent', id: 'human:p1', micros: 20_000 },
        { to: 'adv:crowd', role: 'advisor', id: 'crowd', micros: 10_000 },
      ]),
    );
    expect(t).toHaveLength(3);
  });
});
