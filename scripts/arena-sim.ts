/** Offline sanity run of the arena brain: `pnpm arena:sim [rounds]`. No network. */
import { runSimulation } from '../src/arena/sim';
import { FORECASTERS } from '../src/arena/brain/models';

const rounds = Number(process.argv[2] ?? 200);
const r = runSimulation(rounds);
for (const f of FORECASTERS) {
  console.log(`\n== ${f.name} (${r.episodes.get(f.id)!.length} episodes, spent $${((r.spentMicros.get(f.id) ?? 0) / 1e6).toFixed(2)})`);
  for (const [id, s] of r.stats.get(f.id)!) {
    const m = s.summary.meanDelta === null ? '   n/a' : (s.summary.meanDelta * 1000).toFixed(2).padStart(6);
    console.log(`  ${id.padEnd(7)} n=${String(s.n).padStart(4)} fair=${String(s.nFair).padStart(4)} trust=${s.trust.toFixed(2)} mean=${m} mB  ${s.verdict}`);
  }
}
console.log('\nadvisor earnings (pay-for-lift):', Object.fromEntries([...r.paidMicros].map(([k, v]) => [k, `$${(v / 1e6).toFixed(2)}`])), 'declines', r.declines);
