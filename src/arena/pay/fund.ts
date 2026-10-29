import { Transaction } from '@mysten/sui/transactions';
import { FORECASTERS } from '../brain/models';
import { agentWallet, clearinghouse, payClient, walletDirectory, type PayConfig } from './wallets';

const SUI = '0x2::sui::SUI';

export async function balances(cfg: PayConfig) {
  const client = payClient(cfg.network);
  const dir = walletDirectory(cfg);
  const rows: { name: string; address: string; sui: number; usdc: number }[] = [];
  const all = [['clearinghouse', dir.clearinghouse], ...Object.entries(dir.agents).map(([k, v]) => [`agent:${k}`, v]), ...Object.entries(dir.advisors).map(([k, v]) => [`advisor:${k}`, v])];
  for (const [name, address] of all) {
    const s = await client.core.getBalance({ owner: address });
    const u = await client.core.getBalance({ owner: address, coinType: cfg.currency.type });
    rows.push({ name, address, sui: Number(s.balance.balance) / 1e9, usdc: Number(u.balance.balance) / 10 ** cfg.currency.decimals });
  }
  return rows;
}

/** From the clearinghouse (the one wallet you fund from the faucets): give each agent gas SUI + USDC to buy takes. */
export async function fundAgents(cfg: PayConfig, opts: { suiEach: number; usdcEach: number }) {
  const signer = clearinghouse(cfg);
  const client = payClient(cfg.network);
  const tx = new Transaction();
  tx.setSender(signer.toSuiAddress());
  for (const f of FORECASTERS) {
    const to = agentWallet(cfg, f.id).toSuiAddress();
    if (opts.suiEach > 0) tx.transferObjects([tx.coin({ type: SUI, balance: BigInt(Math.round(opts.suiEach * 1e9)) })], tx.pure.address(to));
    if (opts.usdcEach > 0)
      tx.moveCall({
        target: '0x2::balance::send_funds',
        typeArguments: [cfg.currency.type],
        arguments: [tx.balance({ type: cfg.currency.type, balance: BigInt(Math.round(opts.usdcEach * 10 ** cfg.currency.decimals)) }), tx.pure.address(to)],
      });
  }
  const res = await client.core.signAndExecuteTransaction({ transaction: await tx.build({ client }), signer, include: { effects: true } });
  return (res as { Transaction?: { digest: string } }).Transaction?.digest ?? JSON.stringify(res).slice(0, 300);
}
