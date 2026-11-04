'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { advisorName, agentName, ASSET, hhmm } from './names';

interface Receipt {
  kind: 'blind' | 'informed' | 'take';
  agentId?: string;
  advisorId?: string;
  market: { asset: string; question: string; closeTime: string; resolution: string | null };
  revealed: boolean;
  forecast: { probabilityBps: number } | null;
}

/** Landing page for a shared call: what was sealed, and a link to check it. */
export function SharedCall() {
  const { hash } = useParams<{ hash: string }>();
  const [r, setR] = useState<Receipt | null | 'missing'>(null);
  useEffect(() => {
    fetch(`/api/arena/receipts/${hash}`)
      .then((x) => (x.ok ? x.json() : 'missing'))
      .then(setR)
      .catch(() => setR('missing'));
  }, [hash]);
  if (r === null) return <p className="a-p">Loading the call…</p>;
  if (r === 'missing') return <p className="a-p">No sealed call has that hash.</p>;
  const who = r.kind === 'take' ? advisorName(r.advisorId) : r.agentId?.startsWith('human:') ? 'A player' : agentName(r.agentId);
  const yes = r.market.asset === 'match' ? 'yes' : 'UP';
  return (
    <div className="a-split">
      <div>
        <h1 className="a-h2">
          {who} called it {r.forecast ? `${(r.forecast.probabilityBps / 100).toFixed(0)}% ${yes}` : 'before the market closed'}
        </h1>
        <p className="a-p">
          {r.market.asset === 'match' ? r.market.question : `${ASSET[r.market.asset] ?? r.market.asset} up or down, closing ${hhmm(r.market.closeTime)} UTC`}.{' '}
          {r.market.resolution ? `It went ${r.market.resolution === 'UP' ? yes : r.market.asset === 'match' ? 'no' : 'DOWN'}.` : r.revealed ? 'The result is on its way.' : 'The number stays hidden until the market closes.'}
        </p>
        <p className="a-p">The call was sealed on Walrus Memory before the market closed, so it can’t be edited after the fact.</p>
        <div className="a-ctas" style={{ marginTop: 24 }}>
          <Link className="a-btn a-btn-blue" href={`/verify?hash=${hash}`}>
            Check it yourself
          </Link>
          <Link className="a-btn a-btn-line" href="/play">
            Make your own call
          </Link>
        </div>
      </div>
    </div>
  );
}
