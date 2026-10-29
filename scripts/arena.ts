/**
 * Arena runtime.
 *   pnpm arena worker     # loop forever: tick every 20 s (deploy this on the always-on server)
 *   pnpm arena tick       # one tick
 *   pnpm arena lock-now   # lock the current 15-minute window right now (manual test; skips the cadence check)
 *   pnpm arena status     # rounds, batches, credits used today
 */
import { desc, gte, sql } from 'drizzle-orm';
import { arenaBatches, arenaRounds, tatumCalls } from '../src/db/schema';
import { utcMidnight } from '../src/arena/budget';
import { nextCloseAfter } from '../src/arena/fast-markets';
import { lockRound } from '../src/arena/lock';
import { liveArenaDeps } from '../src/arena/runtime';
import { tick } from '../src/arena/worker';
import { closeSuiClient } from '../src/lib/sui';
import { serveFetch } from '../src/arena/pay/client';
import { balances, fundAgents } from '../src/arena/pay/fund';
import { takesHandler } from '../src/arena/pay/takes-server';
import { payConfigFromEnv, walletDirectory } from '../src/arena/pay/wallets';

const cmd = process.argv[2] ?? 'status';
const deps = await liveArenaDeps({ migrate: true });

async function startTakesServer() {
  if (!deps.pay || process.env.ARENA_TAKES_URL) return;
  const handler = takesHandler(deps.db, deps.pay.cfg, { secretKey: process.env.MPP_SECRET_KEY ?? '' });
  const port = Number(process.env.ARENA_PAY_PORT ?? 8787);
  await serveFetch((r) => (new URL(r.url).pathname === '/api/arena/takes' ? handler(r) : Promise.resolve(new Response('not found', { status: 404 }))), port);
  deps.log('paid takes endpoint listening', { url: `http://127.0.0.1:${port}/api/arena/takes`, network: deps.pay.cfg.network });
}

if (cmd === 'worker') {
  await startTakesServer();
  deps.log('arena worker started', { cadenceMin: deps.config.cadenceMin, lockMinute: deps.config.lockMinute, assets: deps.config.assets });
  let stopping = false;
  process.on('SIGTERM', () => (stopping = true));
  process.on('SIGINT', () => (stopping = true));
  while (!stopping) {
    const out = await tick(deps);
    if (Object.values(out).some((v) => v && typeof v === 'object' && Object.values(v as object).some((x) => x))) deps.log('tick', out);
    await new Promise((r) => setTimeout(r, 20_000));
  }
} else if (cmd === 'tick') {
  console.log(await tick(deps));
} else if (cmd === 'wallets') {
  const cfg = payConfigFromEnv();
  if (!cfg) throw new Error('Set ARENA_WALLET_SEED (64 hex chars) in .env.local first');
  console.log(`network: sui:${cfg.network}  currency: ${cfg.currency.type}`);
  console.table(await balances(cfg));
  console.log('Fund this address from the faucets:', walletDirectory(cfg).clearinghouse);
} else if (cmd === 'fund') {
  const cfg = payConfigFromEnv();
  if (!cfg) throw new Error('Set ARENA_WALLET_SEED first');
  console.log('digest', await fundAgents(cfg, { suiEach: Number(process.argv[3] ?? 0.3), usdcEach: Number(process.argv[4] ?? 2) }));
} else if (cmd === 'lock-now') {
  await startTakesServer();
  const close = nextCloseAfter(Date.now(), 15);
  const minutesLeft = (close - Date.now()) / 60_000;
  if (minutesLeft < 4) throw new Error(`only ${minutesLeft.toFixed(1)} min left in this window; try again after ${new Date(close).toISOString()}`);
  console.log(await lockRound(deps, close));
} else {
  const rounds = await deps.db.select().from(arenaRounds).orderBy(desc(arenaRounds.closeTime)).limit(10);
  const batches = await deps.db.select().from(arenaBatches).orderBy(desc(arenaBatches.createdAt)).limit(12);
  const [credits] = await deps.db.select({ c: sql<number>`coalesce(sum(${tatumCalls.credits}),0)` }).from(tatumCalls).where(gte(tatumCalls.at, new Date(utcMidnight(Date.now()))));
  console.table(rounds.map((r) => ({ id: r.id, status: r.status, error: r.error })));
  console.table(batches.map((b) => ({ round: b.roundId.slice(4, 20), phase: b.phase, status: b.status, leaves: b.leafCount, digest: b.commitDigest, error: b.error })));
  console.log('Tatum credits today:', credits.c);
}
closeSuiClient();
if (cmd !== 'worker') process.exit(0);
