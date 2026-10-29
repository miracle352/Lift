import { and, eq, inArray } from 'drizzle-orm';
import { Transaction } from '@mysten/sui/transactions';
import { arenaPayouts, arenaPurchases, arenaRounds } from '@/db/schema';
import type { ArenaDeps } from '../deps';
import { event } from '../sealer';
import { advisorDirectory } from '../registry';
import { advisorWallet, agentWallet, clearinghouse, payClient } from './wallets';

/**
 * Pay-for-lift settlement on chain. After a round settles, the clearinghouse (which received every MPP
 * payment) sends ONE programmable transaction:
 *   - to each advisor: the sum of its released purchases (its take improved the buyer's Brier score)
 *   - to each agent:   the sum of its refunded purchases (the take did not help)
 */
export interface Transfer {
  to: string;
  role: 'advisor' | 'agent';
  id: string;
  micros: number;
}

export function planTransfers(rows: (typeof arenaPurchases.$inferSelect)[], addr: { advisor: (id: string) => string; agent: (id: string) => string }): Transfer[] {
  const sums = new Map<string, Transfer>();
  for (const p of rows) {
    if (p.action !== 'buy' || !p.priceMicros) continue;
    const key = p.payStatus === 'released' ? `advisor:${p.advisorId}` : p.payStatus === 'refunded' ? `agent:${p.agentId}` : null;
    if (!key) continue;
    const [role, id] = key.split(':') as ['advisor' | 'agent', string];
    const t = sums.get(key) ?? { to: role === 'advisor' ? addr.advisor(id) : addr.agent(id), role, id, micros: 0 };
    t.micros += p.priceMicros;
    sums.set(key, t);
  }
  return [...sums.values()].sort((a, b) => a.role.localeCompare(b.role) || a.id.localeCompare(b.id));
}

export async function sendDuePayouts(deps: ArenaDeps): Promise<number> {
  if (!deps.pay) return 0;
  const cfg = deps.pay.cfg;
  const network = cfg.network === 'mainnet' ? 'sui:mainnet' : 'sui:testnet';
  const settled = await deps.db.select({ id: arenaRounds.id }).from(arenaRounds).where(eq(arenaRounds.status, 'settled'));
  const done = new Set((await deps.db.select({ id: arenaPayouts.roundId }).from(arenaPayouts)).map((r) => r.id));
  let sent = 0;
  const dir = await advisorDirectory(deps.db);
  for (const { id: roundId } of settled.filter((r) => !done.has(r.id))) {
    const rows = await deps.db.select().from(arenaPurchases).where(and(eq(arenaPurchases.roundId, roundId), eq(arenaPurchases.payNetwork, network), inArray(arenaPurchases.payStatus, ['released', 'refunded'])));
    const transfers = planTransfers(rows, { advisor: (id) => dir.get(id)?.payoutAddress ?? advisorWallet(cfg, id).toSuiAddress(), agent: (id) => agentWallet(cfg, id).toSuiAddress() });
    const released = transfers.filter((t) => t.role === 'advisor').reduce((s, t) => s + t.micros, 0);
    const refunded = transfers.filter((t) => t.role === 'agent').reduce((s, t) => s + t.micros, 0);
    if (!transfers.length) {
      await deps.db.insert(arenaPayouts).values({ roundId, network, status: 'empty' }).onConflictDoNothing();
      continue;
    }
    try {
      const signer = clearinghouse(cfg);
      const tx = new Transaction();
      tx.setSender(signer.toSuiAddress());
      for (const t of transfers) {
        tx.moveCall({ target: '0x2::balance::send_funds', typeArguments: [cfg.currency.type], arguments: [tx.balance({ type: cfg.currency.type, balance: BigInt(t.micros) }), tx.pure.address(t.to)] });
      }
      const client = payClient(cfg.network);
      const res = await client.core.signAndExecuteTransaction({ transaction: await tx.build({ client }), signer, include: { effects: true } });
      const digest = (res as { Transaction?: { digest: string }; FailedTransaction?: { digest: string } }).Transaction?.digest;
      if (!digest) throw new Error('payout transaction failed');
      await deps.db.insert(arenaPayouts).values({ roundId, network, status: 'sent', releasedMicros: released, refundedMicros: refunded, transfersJson: JSON.stringify(transfers), digest });
      await deps.db.update(arenaPurchases).set({ settleDigest: digest }).where(and(eq(arenaPurchases.roundId, roundId), eq(arenaPurchases.payNetwork, network)));
      await event(deps, roundId, 'payouts_sent', { digest, network, releasedMicros: released, refundedMicros: refunded, transfers });
      sent++;
    } catch (err) {
      await deps.db.insert(arenaPayouts).values({ roundId, network, status: 'failed', releasedMicros: released, refundedMicros: refunded, transfersJson: JSON.stringify(transfers), error: String((err as Error).message ?? err).slice(0, 500) }).onConflictDoNothing();
      deps.log('payout failed', { roundId, err: String(err) });
    }
  }
  return sent;
}
