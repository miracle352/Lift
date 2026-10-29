import { describe, expect, it } from 'vitest';
import { buildProofs, innerNode, leafNode, merkleRoot, rootFromProof, verifyProof } from '@/core';

const h = (n: number) => n.toString(16).padStart(64, '0');

describe('merkle', () => {
  it('a single leaf: root = leafNode(leaf), empty proof', () => {
    const { root, proofs } = buildProofs([h(1)]);
    expect(root).toBe(leafNode(h(1)));
    expect(proofs.get(h(1))?.steps).toEqual([]);
  });

  it('two leaves: root = inner(leaf(a), leaf(b)) with sorted leaves', () => {
    expect(merkleRoot([h(2), h(1)])).toBe(innerNode(leafNode(h(1)), leafNode(h(2))));
  });

  it('pins a vector so the construction never drifts', () => {
    expect(merkleRoot([h(1), h(2), h(3)])).toBe(innerNode(innerNode(leafNode(h(1)), leafNode(h(2))), leafNode(h(3))));
    expect(merkleRoot([h(1), h(2), h(3)])).toMatchInlineSnapshot(`"93e34ecb30d456c2bb3903c45dd51d053db3e66522a0a2eaf5fafa58312ed037"`);
  });

  it('order and duplicates do not change the root', () => {
    expect(merkleRoot([h(3), h(1), h(2), h(1)])).toBe(merkleRoot([h(1), h(2), h(3)]));
  });

  it('every proof verifies for sizes 1..33, and fails for a wrong leaf or root', () => {
    for (let n = 1; n <= 33; n++) {
      const leaves = Array.from({ length: n }, (_, i) => h(i + 100));
      const { root, proofs } = buildProofs(leaves);
      for (const leaf of leaves) {
        const p = proofs.get(leaf)!;
        expect(rootFromProof(leaf, p.steps)).toBe(root);
        expect(verifyProof(h(9999), p.steps, root)).toBe(false);
      }
      expect(verifyProof(leaves[0], proofs.get(leaves[0])!.steps, h(1))).toBe(false);
    }
  });

  it('a leaf node can never pass as an inner node (domain separation)', () => {
    const { root } = buildProofs([h(1), h(2)]);
    // pretend the root itself is a leaf with no proof: must not verify against the same root
    expect(verifyProof(root, [], root)).toBe(false);
  });

  it('rejects bad input', () => {
    expect(() => merkleRoot([])).toThrow();
    expect(() => merkleRoot(['zz'])).toThrow();
  });
});
