'use client';
import { getWallets } from '@wallet-standard/app';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';
import { Mppx } from 'mppx/client';
import { sui, USDC, USDC_TESTNET } from '@suimpp/mpp/client';

/**
 * A visitor's own Sui wallet (any Wallet Standard wallet: Slush, Phantom, Suiet…) paying an MPP challenge.
 * The arena builds the exact USDC transfer the challenge asks for, the wallet signs it (the key never leaves the
 * wallet), we execute it on the public fullnode, and the wallet signs the payment-proof message MPP requires.
 */
export type Network = 'testnet' | 'mainnet';
type Feature<T> = Record<string, T>;
interface SignTx {
  signTransaction(input: { transaction: { toJSON(): Promise<string> }; account: WalletAccount; chain: string }): Promise<{ bytes: string; signature: string }>;
}
interface SignMsg {
  signPersonalMessage(input: { message: Uint8Array; account: WalletAccount; chain?: string }): Promise<{ bytes: string; signature: string }>;
}
interface Connect {
  connect(input?: { silent?: boolean }): Promise<{ accounts: readonly WalletAccount[] }>;
}

export function suiWallets(): Wallet[] {
  return getWallets()
    .get()
    .filter((w) => w.chains.some((c) => c.startsWith('sui:')) && 'sui:signTransaction' in w.features && 'sui:signPersonalMessage' in w.features && 'standard:connect' in w.features);
}

export function onWalletsChange(cb: () => void) {
  const api = getWallets();
  const a = api.on('register', cb);
  const b = api.on('unregister', cb);
  return () => {
    a();
    b();
  };
}

export async function connectWallet(w: Wallet): Promise<WalletAccount> {
  const { accounts } = await (w.features['standard:connect'] as unknown as Connect).connect();
  const acc = accounts.find((a) => a.chains.some((c: string) => c.startsWith('sui:'))) ?? accounts[0];
  if (!acc) throw new Error('The wallet did not share an account');
  return acc;
}

const clients: Partial<Record<Network, SuiGrpcClient>> = {};
const client = (n: Network) => (clients[n] ??= new SuiGrpcClient({ network: n, baseUrl: `https://fullnode.${n}.sui.io:443` }));

export async function usdcBalance(address: string, n: Network) {
  const r = await client(n).core.getBalance({ owner: address, coinType: (n === 'mainnet' ? USDC : USDC_TESTNET).type });
  return Number(r.balance.balance) / 1e6;
}

/** fetch() that pays a 402 MPP challenge from the connected wallet, then retries. */
export function walletFetch(w: Wallet, account: WalletAccount, n: Network) {
  const chain = `sui:${n}`;
  const signTx = (w.features['sui:signTransaction'] as Feature<unknown> as unknown as SignTx).signTransaction.bind(w.features['sui:signTransaction']);
  const signMsg = (w.features['sui:signPersonalMessage'] as Feature<unknown> as unknown as SignMsg).signPersonalMessage.bind(w.features['sui:signPersonalMessage']);
  const signer = {
    toSuiAddress: () => account.address,
    signPersonalMessage: async (message: Uint8Array) => {
      const r = await signMsg({ message, account, chain });
      return { bytes: r.bytes, signature: r.signature };
    },
  };
  const mppx = Mppx.create({
    methods: [
      sui({
        client: client(n),
        currency: n === 'mainnet' ? USDC : USDC_TESTNET,
        signer: signer as never,
        execute: async (tx: Transaction) => {
          tx.setSenderIfNotSet(account.address);
          const built = await tx.build({ client: client(n) });
          const signed = await signTx({ transaction: Transaction.from(built), account, chain });
          const res = await client(n).core.executeTransaction({ transaction: built, signatures: [signed.signature], include: { effects: true } });
          const r = res as { Transaction?: { digest: string }; FailedTransaction?: { status: { error?: { message?: string } } } };
          if (!r.Transaction) throw new Error(r.FailedTransaction?.status.error?.message ?? 'transaction failed');
          await client(n).core.waitForTransaction({ digest: r.Transaction.digest }).catch(() => {});
          return { digest: r.Transaction.digest };
        },
      }),
    ],
    polyfill: false,
  });
  return mppx.fetch;
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
