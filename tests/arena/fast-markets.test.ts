import { describe, expect, it, vi } from 'vitest';
import { fetchLive15m, nextCloseAfter, parseFastEvents } from '@/arena/fast-markets';
import { EventsPage, TatumPrediction, TatumError } from '@/arena/tatum';
import { loadFixture } from '../helpers/fixtures';

const live = EventsPage.parse(loadFixture('tatum/events-15m-endingSoon.json'));
const resolved = EventsPage.parse(loadFixture('tatum/events-15m-resolved.json'));

describe('parseFastEvents (recorded Tatum data)', () => {
  const markets = parseFastEvents(live.data);

  it('reads asset, window and close from the slug + event, not the rounded nested closeTime', () => {
    const btc = markets.find((m) => m.asset === 'btc' && m.closeTime === '2026-10-29T11:00:00.000Z')!;
    expect(btc).toMatchObject({ windowMinutes: 15, windowStart: '2026-10-29T10:45:00.000Z', platform: 'polymarket' });
    expect(btc.conditionId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(btc.upPrice).toBeGreaterThan(0);
    expect(btc.rulesHash).toMatch(/^[0-9a-f]{64}$/);
    expect(btc.resolution).toBeNull();
  });

  it('skips non-crypto (gold/silver) and keeps one row per condition id', () => {
    expect(markets.every((m) => ['btc', 'eth', 'sol', 'xrp', 'doge', 'bnb', 'hype', 'zec'].includes(m.asset))).toBe(true);
    expect(new Set(markets.map((m) => m.conditionId)).size).toBe(markets.length);
  });

  it('includes stale "active" rows, which callers filter by close time', () => {
    expect(markets.some((m) => m.closeTime < '2026-09-01')).toBe(true);
  });

  it('reads resolutions from the resolved feed', () => {
    const r = parseFastEvents(resolved.data);
    expect(r.length).toBeGreaterThan(10);
    expect(r.every((m) => m.resolution === 'UP' || m.resolution === 'DOWN')).toBe(true);
    expect(r[0].resolvedSource).toMatch(/chain\.link/);
  });
});

describe('TatumPrediction client', () => {
  it('sends the key, records credits, retries 429 then succeeds', async () => {
    const calls: number[] = [];
    let n = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)['x-api-key']).toBe('k');
      n++;
      return n === 1 ? new Response('slow down', { status: 429 }) : new Response(JSON.stringify(loadFixture('tatum/events-15m-endingSoon.json')), { status: 200 });
    });
    const t = new TatumPrediction({ apiKey: 'k', fetch: fetchMock as unknown as typeof fetch, sleep: async () => {}, onCall: (r) => void calls.push(r.credits) });
    const m = await fetchLive15m(t);
    expect(m.length).toBeGreaterThan(20);
    expect(calls).toEqual([100, 100]);
    expect(String(fetchMock.mock.calls[1][0])).toContain('tag=15M');
  });

  it('does not retry a 400 and refuses when the budget hook throws', async () => {
    const t = new TatumPrediction({ apiKey: 'k', fetch: (async () => new Response('bad', { status: 400 })) as unknown as typeof fetch, sleep: async () => {} });
    await expect(t.events({})).rejects.toBeInstanceOf(TatumError);
    const t2 = new TatumPrediction({ apiKey: 'k', beforeCall: () => { throw new Error('budget'); } });
    await expect(t2.events({})).rejects.toThrow('budget');
  });
});

describe('nextCloseAfter', () => {
  it('snaps to the cadence grid', () => {
    const t = Date.parse('2026-10-29T10:52:36Z');
    expect(new Date(nextCloseAfter(t, 15)).toISOString()).toBe('2026-10-29T11:00:00.000Z');
    expect(new Date(nextCloseAfter(t, 30)).toISOString()).toBe('2026-10-29T11:00:00.000Z');
    expect(new Date(nextCloseAfter(Date.parse('2026-10-29T11:00:00Z'), 15)).toISOString()).toBe('2026-10-29T11:15:00.000Z');
  });
});
