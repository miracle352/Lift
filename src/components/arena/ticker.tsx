'use client';
import { useEffect, useState } from 'react';
import { advisorName, ASSET, usd } from './names';

/** A strip of real numbers from the arena, scrolling like a ticker: advisor earnings and the latest results. */
export function Ticker() {
  const [items, setItems] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    Promise.all([fetch('/api/arena/leaderboard').then((r) => r.json()), fetch('/api/arena/rounds?limit=3').then((r) => r.json())])
      .then(([lb, rr]) => {
        if (!alive) return;
        const out: string[] = [];
        for (const a of (lb.advisors as { id: string; sold: number; releasedMicros: number; refundedMicros: number }[]).filter((a) => a.sold > 0))
          out.push(`${advisorName(a.id)}  paid ${usd(a.releasedMicros)}  refunded ${usd(a.refundedMicros)}`);
        for (const r of rr.rounds as { id: string; markets: { asset: string; resolution: string | null }[] }[])
          for (const m of r.markets.filter((m) => m.resolution && m.asset !== 'match')) out.push(`${ASSET[m.asset]} ${m.resolution === 'UP' ? '▲ up' : '▼ down'}`);
        setItems(out);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!items.length) return <div className="a-ticker" aria-hidden />;
  const row = items.map((t, i) => <span key={i}>{t}</span>);
  return (
    <div className="a-ticker" aria-hidden>
      <div className="a-ticker-track">
        {row}
        {row}
      </div>
    </div>
  );
}
