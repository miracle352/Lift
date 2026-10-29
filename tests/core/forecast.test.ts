import { describe, expect, it } from 'vitest';
import { adviceContentHash, buildForecast, canonicalJson, forecastHash, sha256Hex } from '@/core';
import { SAMPLE_MARKET, sampleBlind } from '../helpers/sample-forecast';

// Vectors were computed independently with Python (json.dumps(sort_keys=True, separators=(',', ':')) + hashlib.sha256),
// which matches RFC 8785 for this data (strings and integers only). If one of these changes, every existing receipt breaks.
const BLIND_HASH = '69110a5b19b0eaf3268be64593159e1a62445f6d853b4fdb4246856f3ce4a46f';
const INFORMED_HASH = '129581ba1aec53f51673f6627aa0fb322b01d79d2038081ee0bb5d93befae0d4';
const ADVICE = { kind: 'pundit', handle: '@SomePundit', text: 'Spurs are missing their keeper. Arsenal by two.', url: 'https://example.com/post/1' };

describe('hashing primitives', () => {
  it('sha256 matches the standard test vector', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('canonical JSON sorts keys recursively and drops whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[3,{"x":2,"y":1}]},"b":1}');
  });
});

describe('forecast seals', () => {
  it('pins the rules hash of the sample market', () => {
    expect(SAMPLE_MARKET.rulesHash).toBe('244e2b8c9551c881b8088ccf631e3180946a14d7d348e2bce9968390ca60ff23');
  });

  it('hashes a blind forecast to the pinned vector', () => {
    expect(forecastHash(sampleBlind())).toBe(BLIND_HASH);
  });

  it('hashes an informed forecast (chained to the blind seal) to the pinned vector', () => {
    const informed = buildForecast({
      kind: 'informed',
      user: 'user-test-0001',
      market: SAMPLE_MARKET,
      outcome: 'Yes',
      probabilityBps: 8000,
      prev: BLIND_HASH,
      advice: { advisorId: 'pundit:@SomePundit', advisorKind: 'pundit', contentHash: adviceContentHash(ADVICE), fairTest: true },
      createdAt: '2026-10-21T15:31:00.000Z',
      salt: '22'.repeat(32),
    });
    expect(adviceContentHash(ADVICE)).toBe('63637329c7079724a7efa3a47b07e6fcf7b961723973fff96908effdd5b68b95');
    expect(forecastHash(informed)).toBe(INFORMED_HASH);
  });

  it('is insensitive to key order but sensitive to every value', () => {
    const blind = sampleBlind();
    const reverse = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).reverse()) as T;
    const reordered = reverse({ ...blind, market: reverse(blind.market) });
    expect(Object.keys(reordered)[0]).toBe('salt');
    expect(forecastHash(reordered)).toBe(BLIND_HASH);
    expect(forecastHash({ ...blind, probabilityBps: 5501 })).not.toBe(BLIND_HASH);
    expect(forecastHash({ ...blind, salt: '12'.repeat(32) })).not.toBe(BLIND_HASH);
    expect(forecastHash({ ...blind, market: { ...blind.market, closeTime: '2026-10-21T19:00:01.000Z' } })).not.toBe(BLIND_HASH);
  });

  it('generates a fresh 32-byte salt by default', () => {
    const a = buildForecast({ kind: 'blind', user: 'u', market: SAMPLE_MARKET, outcome: 'Yes', probabilityBps: 5000 });
    const b = buildForecast({ kind: 'blind', user: 'u', market: SAMPLE_MARKET, outcome: 'Yes', probabilityBps: 5000 });
    expect(a.salt).toMatch(/^[0-9a-f]{64}$/);
    expect(a.salt).not.toBe(b.salt);
  });

  it('rejects malformed forecasts', () => {
    expect(() => sampleBlind({ probabilityBps: 0 })).toThrow();
    expect(() => sampleBlind({ probabilityBps: 10000 })).toThrow();
    expect(() => sampleBlind({ probabilityBps: 55.5 })).toThrow();
    expect(() => sampleBlind({ prev: BLIND_HASH })).toThrow(); // blind seals cannot chain
    expect(() => buildForecast({ kind: 'informed', user: 'u', market: SAMPLE_MARKET, outcome: 'Yes', probabilityBps: 6000 })).toThrow(); // needs prev + advice
    expect(() => forecastHash({ ...sampleBlind(), extra: 1 } as never)).toThrow(); // strict: unknown keys are not hashed silently
  });
});
