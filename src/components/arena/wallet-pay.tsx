'use client';
import { useEffect, useState } from 'react';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import { ADVISORS } from './names';
import { connectWallet, onWalletsChange, shortAddr, suiWallets, usdcBalance, walletFetch, type Network } from './wallet';

export interface Paid {
  status: string;
  digest: string | null;
}
interface TakeResult {
  advisorId: string;
  fairTest: boolean;
  shown: { advisor: string; says: string; probabilityBps: number };
  paid: Paid | null;
}

const CRYPTO_ADVISORS = ['crowd', 'quant', 'trend', 'fader', 'book', 'hype', 'fence', 'x-crowd-plus'];

/** Pay for ONE take from your own Sui wallet, the same way the agents do (MPP, escrowed, pay-for-lift). */
export function WalletPay(props: { network: Network; priceMicros: number; token: string; roundId: string; asset: string; disabled?: boolean; onTake: (t: TakeResult) => void }) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [advisor, setAdvisor] = useState('random');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const sync = () => setWallets(suiWallets());
    queueMicrotask(sync);
    return onWalletsChange(sync);
  }, []);
  useEffect(() => {
    if (!account) return;
    usdcBalance(account.address, props.network).then(setBalance).catch(() => setBalance(null));
  }, [account, props.network]);

  const connect = async (w: Wallet) => {
    setMsg('');
    try {
      const a = await connectWallet(w);
      setWallet(w);
      setAccount(a);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const pay = async () => {
    if (!wallet || !account) return;
    setBusy(true);
    setMsg('Waiting for your wallet…');
    const fair = advisor === 'random';
    const advisorId = fair ? CRYPTO_ADVISORS[Math.floor(Math.random() * CRYPTO_ADVISORS.length)] : advisor;
    const url = `/api/arena/play/buy?roundId=${encodeURIComponent(props.roundId)}&asset=${encodeURIComponent(props.asset)}&advisorId=${advisorId}${fair ? '&fair=1' : ''}`;
    try {
      const f = walletFetch(wallet, account, props.network);
      for (let i = 0; i < 15; i++) {
        const res = await f(url, { headers: { 'x-player-token': props.token } });
        const j = await res.json().catch(() => ({}));
        if (res.status === 425) {
          setMsg('Sealing your blind call on Walrus first…');
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        if (!res.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
        setMsg('');
        props.onTake(j as TakeResult);
        return;
      }
      throw new Error('Your blind call is taking long to seal. Try again in a moment.');
    } catch (e) {
      setMsg((e as Error).message.replace(/^Payment transaction failed: /, 'Payment failed: '));
    } finally {
      setBusy(false);
    }
  };

  const price = `$${(props.priceMicros / 1e6).toFixed(2)}`;
  return (
    <div className="a-wallet">
      <h3>Or pay for a take, like the agents do</h3>
      <p>
        {price} in USDC from your own Sui wallet, held in escrow. If the take makes your call better, the advisor keeps it. If not, it comes
        back to your wallet after the market settles.
        {props.network === 'testnet' && (
          <>
            {' '}
            Payments run on Sui testnet: switch your wallet to testnet and get free test USDC at{' '}
            <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
              faucet.circle.com
            </a>
            .
          </>
        )}
      </p>
      {!account ? (
        wallets.length ? (
          <div className="a-ctas">
            {wallets.map((w) => (
              <button key={w.name} className="a-btn a-btn-line" onClick={() => connect(w)} disabled={props.disabled}>
                {/* wallet icons are data: URLs from the wallet itself */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {w.icon && <img src={w.icon} alt="" width={20} height={20} />}
                Connect {w.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="a-note">No Sui wallet found in this browser. Install Slush, Phantom or Suiet to pay for a take.</p>
        )
      ) : (
        <>
          <p className="a-note">
            Connected {shortAddr(account.address)}
            {balance !== null && `, ${balance.toFixed(2)} USDC on ${props.network}`}.
          </p>
          <div className="a-field" style={{ marginTop: 10 }}>
            <select className="a-input" value={advisor} onChange={(e) => setAdvisor(e.target.value)} aria-label="Which advisor to buy from" disabled={busy}>
              <option value="random">A random advisor (fair test)</option>
              {CRYPTO_ADVISORS.map((id) => (
                <option key={id} value={id}>
                  {ADVISORS[id] ?? id}
                </option>
              ))}
            </select>
            <button className="a-btn a-btn-blue" onClick={pay} disabled={busy || props.disabled}>
              Pay {price} and read it
            </button>
          </div>
        </>
      )}
      {msg && <p className={msg.startsWith('Waiting') || msg.startsWith('Sealing') ? 'a-ok' : 'a-err'}>{msg}</p>}
    </div>
  );
}
