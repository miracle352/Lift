import { createServer, type Server } from 'node:http';
import { Mppx } from 'mppx/client';
import { sui } from '@suimpp/mpp/client';
import { agentWallet, payClient, type PayConfig } from './wallets';

/**
 * An agent's payment-aware fetch: on 402 it pays the MPP challenge in USDC on Sui with its own keypair
 * and retries. polyfill:false so it never replaces globalThis.fetch in the worker or the web app.
 */
export function agentFetch(cfg: PayConfig, agentId: string) {
  const mppx = Mppx.create({
    methods: [sui({ client: payClient(cfg.network), signer: agentWallet(cfg, agentId), currency: cfg.currency })],
    polyfill: false,
  });
  return mppx.fetch;
}

export interface BoughtTake {
  asset: string;
  shown: { advisorId: string; advisor: string; market: string; says: string; probabilityBps: number; inputs: Record<string, unknown> };
  takeHash: string;
}

export async function buyTakes(args: { cfg: PayConfig; agentId: string; baseUrl: string; roundId: string; picks: { asset: string; advisorId: string }[] }) {
  const url = `${args.baseUrl}/api/arena/takes?round=${encodeURIComponent(args.roundId)}&picks=${args.picks.map((p) => `${p.asset}:${p.advisorId}`).join(',')}`;
  const res = await agentFetch(args.cfg, args.agentId)(url);
  if (!res.ok) throw new Error(`takes ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { paymentDigest: string | null; takes: BoughtTake[] };
  return { ...body, receipt: res.headers.get('payment-receipt') };
}

/** Minimal node:http → Fetch API adapter, so the worker can serve the paid endpoint on localhost. */
export function serveFetch(handler: (r: Request) => Promise<Response>, port: number, host = '127.0.0.1'): Promise<Server> {
  const server = createServer(async (req, res) => {
    try {
      const url = `http://${req.headers.host ?? `${host}:${port}`}${req.url ?? '/'}`;
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
      const out = await handler(new Request(url, { method: req.method, headers }));
      res.statusCode = out.status;
      out.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(Buffer.from(await out.arrayBuffer()));
    } catch (err) {
      res.statusCode = 500;
      res.end(String((err as Error).message ?? err));
    }
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
}
