/**
 * Live check: Tatum Sui gRPC works and our parser reads real Walrus Memory writes.
 *   pnpm smoke:sui                      # reads a known mainnet write
 *   pnpm smoke:sui -- <txDigest>        # reads any tx
 * Works without TATUM_API_KEY (rate-limited to ~5 calls/min); set it in .env.local for real use.
 */
import { extractMemoryWrites, unwrapTransaction } from '../src/core';
import { closeSuiClient, getSuiClient, withSuiRetry } from '../src/lib/sui';

const digest = process.argv.slice(2).find((a) => !a.startsWith('-')) ?? '4xK2gvv6Gv3BYcbpDFP15pqMxLNxt3zuKsuamiUq9JBJ';

async function main() {
  const client = getSuiClient();
  console.log(`Tatum Sui gRPC, key ${process.env.TATUM_API_KEY ? 'set' : 'NOT set (anonymous, ~5 calls/min)'}`);
  const t0 = Date.now();
  const res = await withSuiRetry(() => client.core.getTransaction({ digest, include: { transaction: true, effects: true } }));
  const tx = unwrapTransaction(res);
  console.log(`getTransaction ${digest} in ${Date.now() - t0} ms`);
  console.log(`  time ${tx.timestampMs ? new Date(Number(tx.timestampMs)).toISOString() : '?'}  checkpoint ${tx.checkpoint}  success ${tx.status?.success}`);
  const writes = extractMemoryWrites(res);
  if (!writes.length) console.log('  (no Walrus Memory writes in this tx)');
  for (const w of writes) console.log('  write', JSON.stringify(w, null, 2));
}

main()
  .catch((e) => {
    console.error('FAILED:', e?.code ?? '', e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(closeSuiClient);
