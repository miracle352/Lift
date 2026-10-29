import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

/**
 * Binary Merkle tree over 32-byte leaves (forecast hashes), used to seal a whole arena round
 * with ONE Walrus Memory write (docs/PROOF.md, "Batch seals").
 *
 * Construction (RFC 6962 style domain separation, no leaf duplication):
 *   leafNode(h)     = sha256(0x00 || h)
 *   innerNode(l, r) = sha256(0x01 || l || r)
 *   An odd node at the end of a level is promoted to the next level unchanged
 *   (duplicating it would allow two different leaf lists with the same root).
 *
 * Leaves are sorted ascending (hex) and de-duplicated before building, so the root depends only on
 * the SET of sealed hashes, not on insertion order.
 */

const HEX64 = /^[0-9a-f]{64}$/;

export function leafNode(leafHex: string): string {
  if (!HEX64.test(leafHex)) throw new Error(`leaf must be 64 lowercase hex chars: ${leafHex}`);
  return bytesToHex(sha256(concat(new Uint8Array([0]), hexToBytes(leafHex))));
}

export function innerNode(leftHex: string, rightHex: string): string {
  return bytesToHex(sha256(concat(new Uint8Array([1]), hexToBytes(leftHex), hexToBytes(rightHex))));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function normalizeLeaves(leaves: string[]): string[] {
  const set = new Set(leaves.map((l) => l.toLowerCase()));
  for (const l of set) if (!HEX64.test(l)) throw new Error(`bad leaf: ${l}`);
  return [...set].sort();
}

/** Returns every level, bottom (leaf nodes) first, top (root) last. */
function levels(sortedLeaves: string[]): string[][] {
  if (sortedLeaves.length === 0) throw new Error('cannot build a Merkle tree with no leaves');
  const out: string[][] = [sortedLeaves.map(leafNode)];
  while (out[out.length - 1].length > 1) {
    const cur = out[out.length - 1];
    const next: string[] = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? innerNode(cur[i], cur[i + 1]) : cur[i]);
    out.push(next);
  }
  return out;
}

export function merkleRoot(leaves: string[]): string {
  const lv = levels(normalizeLeaves(leaves));
  return lv[lv.length - 1][0];
}

/** One step of an inclusion proof: the sibling hash and which side it sits on. */
export interface ProofStep {
  side: 'L' | 'R';
  hash: string;
}

export interface InclusionProof {
  leaf: string;
  root: string;
  /** Index of the leaf in the sorted, de-duplicated leaf list. */
  index: number;
  leafCount: number;
  steps: ProofStep[];
}

/** Proofs for every leaf, keyed by leaf hex. */
export function buildProofs(leaves: string[]): { root: string; leaves: string[]; proofs: Map<string, InclusionProof> } {
  const sorted = normalizeLeaves(leaves);
  const lv = levels(sorted);
  const root = lv[lv.length - 1][0];
  const proofs = new Map<string, InclusionProof>();
  sorted.forEach((leaf, index) => {
    const steps: ProofStep[] = [];
    let i = index;
    for (let d = 0; d < lv.length - 1; d++) {
      const level = lv[d];
      const sib = i % 2 === 0 ? i + 1 : i - 1;
      if (sib < level.length) steps.push({ side: i % 2 === 0 ? 'R' : 'L', hash: level[sib] });
      // promoted odd node: no step at this level
      i = Math.floor(i / 2);
    }
    proofs.set(leaf, { leaf, root, index, leafCount: sorted.length, steps });
  });
  return { root, leaves: sorted, proofs };
}

/** Recomputes the root from a leaf and its proof steps. */
export function rootFromProof(leaf: string, steps: ProofStep[]): string {
  let h = leafNode(leaf.toLowerCase());
  for (const s of steps) {
    if (!HEX64.test(s.hash)) throw new Error('bad proof hash');
    h = s.side === 'L' ? innerNode(s.hash, h) : innerNode(h, s.hash);
  }
  return h;
}

export function verifyProof(leaf: string, steps: ProofStep[], expectedRoot: string): boolean {
  try {
    return rootFromProof(leaf, steps) === expectedRoot.toLowerCase();
  } catch {
    return false;
  }
}
