import { Transaction } from '@mysten/sui/transactions';
import { ADVISORS, FORECASTERS } from '../brain/models';
import type { ArenaDeps } from '../deps';
import { advisorWallet, agentWallet, clearinghouse, payClient, type PayConfig } from './wallets';

/**
 * Keeps the arena's money moving in a closed loop (every wallet below is derived from ARENA_WALLET_SEED):
 *   agents ──MPP──▶ clearinghouse ──pay-for-lift──▶ advisors (released) / agents (refunded)
 *   advisors ──sweep (≥ SWEEP_AT)──▶ clearinghouse ──top-up (< LOW)──▶ agents
 * so a few dollars of real USDC on mainnet keep the arena paying for weeks; only gas is spent.
 * Runs at most once every 30 minutes.
 */
const SUI = '0x2::sui::SUI';
const EVERY_MS = 30 * 60_000;
export const RECYCLE = { agentLowUsdc: 0.15, agentTopUsdc: 0.4, agentLowSui: 0.05, agentTopSui: 0.25, advisorSweepUsdc: 0.25, advisorGasSui: 0.02 };

let last = 0;

async function bal(cfg: PayConfig, owner: string) {
  const client = payClient(cfg.network);
  const [s, u] = await Promise.all([client.core.getBalance({ owner }), client.core.getBalance({ owner, coinType: cfg.currency.type })]);
  return { sui: Number(s.balance.balance) / 1e9, usdc: Number(u.balance.balance) / 10 ** cfg.currency.decimals };
}

async function send(cfg: PayConfig, signer: ReturnType<typeof clearinghouse>, items: { to: string; sui?: number; usdc?: number }[]) {
  if (!items.length) return null;
  const client = payClient(cfg.network);
  const tx = new Transaction();
  tx.setSender(signer.toSuiAddress());
  const usdcTotal = items.reduce((s, i) => s + Math.round((i.usdc ?? 0) * 10 ** cfg.currency.decimals), 0);
  const usdcItems = items.filter((i) => i.usdc);
  if (usdcTotal > 0) {
    // one withdrawal, split (Sui allows at most 10 balance-withdraw reservations per transaction)
    const pot = tx.coin({ type: cfg.currency.type, balance: BigInt(usdcTotal) });
    const parts = tx.splitCoins(pot, usdcItems.map((i) => BigInt(Math.round(i.usdc! * 10 ** cfg.currency.decimals))));
    usdcItems.forEach((i, k) => {
      const b = tx.moveCall({ target: '0x2::coin::into_balance', typeArguments: [cfg.currency.type], arguments: [parts[k]] });
      tx.moveCall({ target: '0x2::balance::send_funds', typeArguments: [cfg.currency.type], arguments: [b, tx.pure.address(i.to)] });
    });
    tx.moveCall({ target: '0x2::coin::destroy_zero', typeArguments: [cfg.currency.type], arguments: [pot] });
  }
  for (const i of items.filter((x) => x.sui)) tx.transferObjects([tx.coin({ type: SUI, balance: BigInt(Math.round(i.sui! * 1e9)) })], tx.pure.address(i.to));
  const res = await client.core.signAndExecuteTransaction({ transaction: await tx.build({ client }), signer, include: { effects: true } });
  const digest = (res as { Transaction?: { digest: string } }).Transaction?.digest;
  if (!digest) throw new Error(`recycle transaction failed: ${JSON.stringify(res).slice(0, 200)}`);
  return digest;
}

export async function recycleFunds(deps: ArenaDeps, opts: { force?: boolean } = {}) {
  if (!deps.pay || deps.pay.cfg.network !== 'mainnet') return { skipped: true };
  const now = deps.now();
  if (!opts.force && now - last < EVERY_MS) return { skipped: true };
  last = now;
  const cfg = deps.pay.cfg;
  const house = clearinghouse(cfg);
  const houseAddr = house.toSuiAddress();
  const digests: string[] = [];

  // 1) advisors → clearinghouse (each pays its own gas; it is topped up with a little SUI below if needed)
  const advisorGas: { to: string; sui: number }[] = [];
  // the example marketplace advisor (Crowd Plus) is run by us too, so its wallet is in the loop
  for (const id of [...ADVISORS.map((a) => a.id), 'x-crowd-plus']) {
    const kp = advisorWallet(cfg, id);
    const b = await bal(cfg, kp.toSuiAddress());
    if (b.sui < RECYCLE.advisorGasSui / 2) advisorGas.push({ to: kp.toSuiAddress(), sui: RECYCLE.advisorGasSui });
    else if (b.usdc >= RECYCLE.advisorSweepUsdc) {
      const d = await send(cfg, kp, [{ to: houseAddr, usdc: Math.floor(b.usdc * 1e6) / 1e6 }]).catch((err) => (deps.log('sweep failed', { advisor: id, err: String(err) }), null));
      if (d) digests.push(d);
    }
  }

  // 2) clearinghouse → agents (USDC to buy takes, SUI for gas) and gas for advisors
  const top: { to: string; sui?: number; usdc?: number }[] = [...advisorGas];
  for (const f of FORECASTERS) {
    const to = agentWallet(cfg, f.id).toSuiAddress();
    const b = await bal(cfg, to);
    const item: { to: string; sui?: number; usdc?: number } = { to };
    if (b.usdc < RECYCLE.agentLowUsdc) item.usdc = Math.round((RECYCLE.agentTopUsdc - b.usdc) * 1e6) / 1e6;
    if (b.sui < RECYCLE.agentLowSui) item.sui = Math.round((RECYCLE.agentTopSui - b.sui) * 1e9) / 1e9;
    if (item.usdc || item.sui) top.push(item);
  }
  if (top.length) {
    const d = await send(cfg, house, top.slice(0, 9));
    if (d) digests.push(d);
  }
  if (digests.length) deps.log('recycled arena funds', { digests });
  return { digests };
}
