import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@/db/client';
import { migratedTestDb } from '../helpers/db';

describe('database schema', () => {
  it('migrates an in-memory database and enforces one episode per user per market', async () => {
    const { db, client } = await migratedTestDb();
    await db.insert(schema.users).values({ id: 'u1', handle: 'miracle', displayName: 'Miracle', passwordHash: 'x' });
    await db.insert(schema.markets).values({
      id: 'polymarket:0xabc',
      platform: 'polymarket',
      platformMarketId: '0xabc',
      question: 'Will Arsenal win?',
      rulesHash: 'a'.repeat(64),
      closeTime: new Date('2026-10-24T14:00:00Z'),
    });
    await db.insert(schema.seals).values({ id: 's1', hash: 'h1', namespace: 'n1', kind: 'blind', userId: 'u1', marketId: 'polymarket:0xabc', forecastJson: '{}' });
    const episode = { userId: 'u1', marketId: 'polymarket:0xabc', status: 'blind_locked' as const, blindSealId: 's1', blindBps: 5500 };
    await db.insert(schema.episodes).values({ id: 'e1', ...episode });
    await expect(db.insert(schema.episodes).values({ id: 'e2', ...episode })).rejects.toThrow();
    const [seal] = await db.select().from(schema.seals).where(eq(schema.seals.id, 's1'));
    expect(seal.status).toBe('queued');
    expect(seal.createdAt).toBeInstanceOf(Date);
    client.close();
  });
});
