import { buildForecast, rulesHash, type ForecastV1 } from '@/core';

/** Fixed test forecast. Its hash is pinned in tests/core/forecast.test.ts. */
export const SAMPLE_MARKET = {
  platform: 'polymarket' as const,
  id: '0x' + 'ab'.repeat(32),
  question: 'Will Arsenal win against Tottenham on 2026-10-24?',
  rulesHash: rulesHash('This market resolves to "Yes" if Arsenal wins the match in regular time. Otherwise "No".'),
  closeTime: '2026-10-21T19:00:00.000Z',
};

export function sampleBlind(overrides: Partial<Parameters<typeof buildForecast>[0]> = {}): ForecastV1 {
  return buildForecast({
    kind: 'blind',
    user: 'user-test-0001',
    market: SAMPLE_MARKET,
    outcome: 'Yes',
    probabilityBps: 5500,
    createdAt: '2026-10-21T15:30:00.000Z',
    salt: '11'.repeat(32),
    ...overrides,
  });
}
