/**
 * Live check: Walrus Memory credentials work on mainnet.
 *   pnpm smoke:memwal             # health + identity + namespaces (no writes)
 *   pnpm smoke:memwal -- --write  # also stores 1 memory and recalls it (counts toward the 10-memory requirement)
 * Prints MEMWAL_AGENT_ID (the delegate public key) for the hackathon submission form.
 */
import { delegateKeyToPublicKey } from '@mysten-incubation/memwal';
import { bytesToHex } from '@noble/hashes/utils.js';
import { getMemWal } from '../src/lib/memwal';
import { requireEnv } from '../src/lib/env';

const write = process.argv.includes('--write');

async function main() {
  const mem = getMemWal();
  console.log('health:', await mem.health());
  const pub = await delegateKeyToPublicKey(requireEnv('MEMWAL_PRIVATE_KEY'));
  console.log('MEMWAL_AGENT_ID (delegate public key, hex):', bytesToHex(pub));
  console.log('MEMWAL_ACCOUNT_ID:', requireEnv('MEMWAL_ACCOUNT_ID'));
  const ns = await mem.listNamespaces({ limit: 50 });
  console.log('namespaces:', ns.namespaces.map((n) => `${n.name} (${n.memory_count})`).join(', ') || '(none yet)');

  if (write) {
    const text = `Receipts smoke test at ${new Date().toISOString()}: the user prefers football markets and fair-test mode.`;
    const stored = await mem.rememberAndWait(text, 'smoke1', { timeoutMs: 60_000 });
    console.log('stored:', stored);
    const recalled = await mem.recall({ query: 'what markets does the user prefer?', namespace: 'smoke1', topK: 3, maxDistance: 0.8 });
    console.log('recalled:', recalled.results.map((r) => `${r.distance.toFixed(3)}  ${r.text}`));
  }
}

main().catch((e) => {
  console.error('FAILED:', e?.message ?? e);
  process.exitCode = 1;
});
