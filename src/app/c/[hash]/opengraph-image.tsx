import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { advisorName, agentName, ASSET } from '@/components/arena/names';

export const alt = 'A call sealed on Walrus before its market closed';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

interface Receipt {
  kind: 'blind' | 'informed' | 'take';
  agentId?: string;
  advisorId?: string;
  market: { asset: string; question: string; closeTime: string; resolution: string | null };
  revealed: boolean;
  forecast: { probabilityBps: number; createdAt: string } | null;
  seal: { digest: string | null; status: string | null };
}

// On Vercel the data lives on the arena server; on the server itself, ask the local web app.
const API = process.env.ARENA_API_ORIGIN ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;

export default async function Image({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const [display, text, r] = await Promise.all([
    readFile(join(process.cwd(), 'assets/anybody-118-800.ttf')),
    readFile(join(process.cwd(), 'assets/schibsted-500.ttf')),
    fetch(`${API}/api/arena/receipts/${encodeURIComponent(hash)}`)
      .then((x) => (x.ok ? (x.json() as Promise<{ receipt: Receipt } | Receipt>) : null))
      .catch(() => null),
  ]);
  const rc = r ? ('receipt' in r ? r.receipt : r) : null;
  const who = rc ? (rc.kind === 'take' ? advisorName(rc.advisorId) : rc.agentId?.startsWith('human:') ? 'A player' : agentName(rc.agentId)) : 'A call';
  const what = rc ? (rc.kind === 'blind' ? 'blind call' : rc.kind === 'informed' ? 'call after reading one take' : 'take') : '';
  const market = rc ? (rc.market.asset === 'match' ? rc.market.question : `${ASSET[rc.market.asset] ?? rc.market.asset} up or down, ${rc.market.closeTime.slice(11, 16)} UTC`) : '';
  const yes = rc?.market.asset === 'match' ? 'yes' : 'UP';
  const big = rc?.forecast ? `${(rc.forecast.probabilityBps / 100).toFixed(0)}% ${yes}` : 'Sealed';
  const result = rc?.market.resolution ? `Result: ${rc.market.resolution === 'UP' ? yes : rc.market.asset === 'match' ? 'no' : 'DOWN'}` : rc?.revealed ? 'Waiting for the result' : 'Revealed when the market closes';
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', background: '#1b30e8', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, fontFamily: 'Schibsted' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 30 }}>
          <span>Lift</span>
          <span style={{ color: '#c3cbff' }}>sealed on Walrus before the market closed</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 34, color: '#c3cbff', display: 'flex' }}>
            {who}’s {what}
          </div>
          <div style={{ fontFamily: 'Anybody', fontSize: 150, lineHeight: 1, letterSpacing: -4, display: 'flex', marginTop: 8 }}>{big}</div>
          <div style={{ fontSize: 38, display: 'flex', marginTop: 12, maxWidth: 1050 }}>{market}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 28 }}>
          <span style={{ color: '#ffce3a' }}>{result}</span>
          <span style={{ color: '#c3cbff' }}>{hash.slice(0, 16)}…</span>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: 'Anybody', data: display, weight: 800 }, { name: 'Schibsted', data: text, weight: 500 }] },
  );
}
