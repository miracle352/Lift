import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';

/**
 * Sui testnet faucet for scripts (POST /v3/gas with proof of work — the faucet's documented path for
 * agents/CI, no browser). PoW: find a nonce such that the first 8 bytes (big-endian u64) of
 * argon2d(preimage, salt, m=8192 KiB, t=1, p=1, 32 bytes) are below `threshold`, where
 * preimage = [domain, chainId, checkpointSeq, checkpointDigest, randomBytes, faucetAddress, recipient, nonce].join("\n").
 * Spec + vectors: https://faucet.sui.io/pow-spec/ (tests/arena/faucet.test.ts checks them).
 */

export interface Challenge {
  domain: string;
  chainId: string;
  checkpointSeq: string;
  checkpointDigest: string;
  randomBytes: string;
  faucetAddress: string;
  recipient: string;
  salt: string;
  memorySize: number;
  iterations: number;
  parallelism: number;
  hashLength: number;
  threshold: string;
  windowSeconds: number;
  amountMist: string;
}

export const preimageOf = (c: Pick<Challenge, 'domain' | 'chainId' | 'checkpointSeq' | 'checkpointDigest' | 'randomBytes' | 'faucetAddress' | 'recipient'>, nonce: bigint | string) =>
  [c.domain, c.chainId, c.checkpointSeq, c.checkpointDigest, c.randomBytes, c.faucetAddress, c.recipient, String(nonce)].join('\n');

const WORKER_SRC = `
const { parentPort, workerData } = require('node:worker_threads');
const { argon2d } = require(workerData.hashWasm);
(async () => {
  const c = workerData.c; const threshold = BigInt(c.threshold);
  for (let n = BigInt(workerData.start); ; n += BigInt(workerData.step)) {
    const pre = [c.domain, c.chainId, c.checkpointSeq, c.checkpointDigest, c.randomBytes, c.faucetAddress, c.recipient, n.toString()].join('\\n');
    const h = await argon2d({ password: pre, salt: c.salt, parallelism: c.parallelism, iterations: c.iterations, memorySize: c.memorySize, hashLength: c.hashLength, outputType: 'hex' });
    if (BigInt('0x' + h.slice(0, 16)) < threshold) { parentPort.postMessage({ nonce: n.toString(), hashHex: h }); return; }
  }
})();
`;

export async function solve(c: Challenge, threads = Math.max(1, availableParallelism() - 1)): Promise<{ nonce: string; hashHex: string }> {
  const { createRequire } = await import('node:module');
  const hashWasm = createRequire(import.meta.url).resolve('hash-wasm');
  const offset = Math.floor(Math.random() * 1e9);
  const workers = Array.from({ length: threads }, (_, i) => new Worker(WORKER_SRC, { eval: true, workerData: { c, start: offset + i, step: threads, hashWasm } }));
  try {
    return await Promise.race(workers.map((w) => new Promise<{ nonce: string; hashHex: string }>((res, rej) => (w.on('message', res), w.on('error', rej)))));
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
  }
}

export async function requestTestnetSui(recipient: string, opts: { host?: string; attempts?: number; log?: (m: string) => void } = {}) {
  const host = opts.host ?? 'https://faucet.testnet.sui.io';
  for (let attempt = 0; attempt < (opts.attempts ?? 4); attempt++) {
    const c = (await (await fetch(`${host}/v3/challenge?recipient=${recipient}`)).json()) as Challenge;
    const t0 = Date.now();
    const sol = await solve(c);
    opts.log?.(`solved in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    const res = await fetch(`${host}/v3/gas`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recipient: c.recipient, checkpointSeq: c.checkpointSeq, nonce: sol.nonce, hashHex: sol.hashHex }) });
    const body = (await res.json().catch(() => ({}))) as { status?: string; digest?: string; amountMist?: string; error?: string; code?: string };
    if (body.status === 'success') return { digest: body.digest!, amountMist: body.amountMist ?? c.amountMist };
    opts.log?.(`faucet said ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
    if (!/stale|not_ready|overloaded/i.test(JSON.stringify(body))) throw new Error(`faucet: ${JSON.stringify(body).slice(0, 300)}`);
  }
  throw new Error('faucet: gave up after retries');
}
