'use client';
import { useEffect, useState } from 'react';
import { advisorName, ASSET, usd } from './names';

/** A strip of real numbers from the arena, scrolling like a ticker: advisor earnings and the latest results. */
export function Ticker() {
  const [items, setItems] = useState<{ t: string; r?: boolean }[]>([]);
  useEffect(() => {
    let alive = true;
    Promise.all([fetch('/api/arena/leaderboard').then((r) => r.json()), fetch('/api/arena/rounds?limit=3').then((r) => r.json())])
      .then(([lb, rr]) => {
        if (!alive) return;
        const out: { t: string; r?: boolean }[] = [];
        for (const a of (lb.advisors as { id: string; sold: number; releasedMicros: number; refundedMicros: number }[]).filter((a) => a.sold > 0))
          out.push({ t: `${advisorName(a.id)} kept ${usd(a.releasedMicros)} for advice that helped, refunded ${usd(a.refundedMicros)}`, r: a.refundedMicros > a.releasedMicros });
        for (const r of rr.rounds as { id: string; markets: { asset: string; resolution: string | null }[] }[])
          for (const m of r.markets.filter((m) => m.resolution && m.asset !== 'match')) out.push({ t: `${ASSET[m.asset]} closed ${m.resolution === 'UP' ? 'up' : 'down'}` });
        setItems(out);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!items.length) return <div className="a-ticker" aria-hidden />;
  const row = items.map((x, i) => (
    <span key={i}>
      <i className={x.r ? 'r' : ''} />
      {x.t}
    </span>
  ));
  return (
    <div className="a-ticker" aria-hidden>
      <div className="a-ticker-track">
        {row}
        {row}
      </div>
    </div>
  );
}
