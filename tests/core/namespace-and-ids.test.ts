import { describe, expect, it } from 'vitest';
import { blobIdFromU256, formatSealNamespace, marketTag, memoryNamespace, parseSealNamespace, sealNamespaceFor, u256FromBlobId, userTag } from '@/core';
import { SAMPLE_MARKET, sampleBlind } from '../helpers/sample-forecast';
import { loadFixture } from '../helpers/fixtures';

describe('seal namespaces', () => {
  it('builds the pinned namespace for the sample forecast', () => {
    expect(userTag('user-test-0001')).toBe('ff8f5be99f5f');
    expect(marketTag('polymarket', SAMPLE_MARKET.id)).toBe('01f700c5f165');
    expect(sealNamespaceFor(sampleBlind())).toBe('rcpt1:ff8f5be99f5f:01f700c5f165:b:69110a5b19b0eaf3268be64593159e1a62445f6d853b4fdb4246856f3ce4a46f');
  });

  it('round-trips format/parse and stays far below the 255-byte limit', () => {
    const ns = sealNamespaceFor(sampleBlind());
    expect(parseSealNamespace(ns)).toEqual({ userTag: 'ff8f5be99f5f', marketTag: '01f700c5f165', kind: 'blind', hash: '69110a5b19b0eaf3268be64593159e1a62445f6d853b4fdb4246856f3ce4a46f' });
    expect(new TextEncoder().encode(ns).length).toBeLessThan(120);
    expect(formatSealNamespace(parseSealNamespace(ns)!)).toBe(ns);
  });

  it('rejects anything that is not a v1 seal namespace', () => {
    for (const bad of ['pb-wallie', 'rcpt1:ff8f5be99f5f:01f700c5f165:x:' + 'a'.repeat(64), 'rcpt1:FF8F5BE99F5F:01f700c5f165:b:' + 'a'.repeat(64), 'rcpt2:ff8f5be99f5f:01f700c5f165:b:' + 'a'.repeat(64), ' rcpt1:ff8f5be99f5f:01f700c5f165:b:' + 'a'.repeat(64)]) {
      expect(parseSealNamespace(bad)).toBeNull();
    }
  });

  it('keeps learning-memory namespaces separate from seals', () => {
    expect(memoryNamespace.episodes('user-test-0001')).toBe('ep1:ff8f5be99f5f');
    expect(memoryNamespace.lessons('user-test-0001')).toBe('lesson1:ff8f5be99f5f');
    expect(parseSealNamespace(memoryNamespace.episodes('user-test-0001'))).toBeNull();
  });
});

describe('Walrus blob id encodings', () => {
  it('converts the real mainnet blob id both ways', () => {
    const blob = loadFixture<{ object: { json: { blob_id: string } } }>('sui/grpc-getObject-blob.json');
    expect(blob.object.json.blob_id).toBe('60268457844591636911363779994009655821310353820560219356749986020030491605224');
    expect(blobIdFromU256(blob.object.json.blob_id)).toBe('6Djz60uwJi74xYF0VTMFf395Zorb7ragGdnJSwG9PoU');
    expect(u256FromBlobId('6Djz60uwJi74xYF0VTMFf395Zorb7ragGdnJSwG9PoU')).toBe(blob.object.json.blob_id);
  });

  it('rejects ids of the wrong length', () => {
    expect(() => u256FromBlobId('AAAA')).toThrow();
  });
});
