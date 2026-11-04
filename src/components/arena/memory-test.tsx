'use client';
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { usd } from './names';

interface MemoryTest {
  pairs: number;
  memory: { brier: number | null; liftPerCall: number | null; helped: number; releasedMicros: number; refundedMicros: number };
  goldfish: { brier: number | null; liftPerCall: number | null; helped: number; releasedMicros: number; refundedMicros: number };
  series: { at: string; memory: number; goldfish: number }[];
  learning: { agentId: string; name: string; calls: number; earlyCutPct: number; lateCutPct: number }[];
}

function useMemoryTest() {
  const [d, setD] = useState<MemoryTest | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch('/api/arena/memory-test')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => alive && j && setD(j as MemoryTest))
        .catch(() => {});
    load();
    const t = window.setInterval(load, 120_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);
  return d;
}

const pct = (x: number) => `${x > 0 ? '' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(Math.abs(x) < 10 ? 1 : 0)}%`;

/** First quarter vs last quarter of each agent's calls: how much of its error the advice it bought removed. */
export function LearningBars() {
  const d = useMemoryTest();
  if (!d) return <p className="a-p">Loading…</p>;
  const vals = d.learning.flatMap((l) => [l.earlyCutPct, l.lateCutPct]);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(1, ...vals);
  const span = hi - lo;
  const zero = (-lo / span) * 100;
  const bar = (v: number) => ({ width: `${(Math.abs(v) / span) * 100}%`, left: v < 0 ? `${zero - (Math.abs(v) / span) * 100}%` : `${zero}%` });
  return (
    <ul className="a-learn" data-m>
      {d.learning.map((l, i) => (
        <li key={l.agentId} style={{ '--i': i } as CSSProperties}>
          <div className="who">
            <b>{l.name}</b>
            <small>{l.calls.toLocaleString('en-US')} calls</small>
          </div>
          <div className="bars">
            <div className={`bar early ${l.earlyCutPct < 0 ? 'neg' : ''}`}>
              <div className="track">
                <i style={bar(l.earlyCutPct)} />
                <em className="axis" style={{ left: `${zero}%` }} />
              </div>
              <span>{l.earlyCutPct < 0 ? `${pct(-l.earlyCutPct)} worse, first quarter` : `${pct(l.earlyCutPct)}, first quarter`}</span>
            </div>
            <div className={`bar late ${l.lateCutPct < 0 ? 'neg' : ''}`}>
              <div className="track">
                <i style={bar(l.lateCutPct)} />
                <em className="axis" style={{ left: `${zero}%` }} />
              </div>
              <span>{l.lateCutPct < 0 ? `${pct(-l.lateCutPct)} worse, last quarter` : `${pct(l.lateCutPct)}, last quarter`}</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Rookie (remembers) vs the Goldfish (its identical twin with no memory), on the same markets. */
export function Twins() {
  const d = useMemoryTest();
  if (!d) return null;
  const enough = d.pairs >= 16;
  const cut = (b: number | null) => (b === null ? null : Math.round((1000 * (0.25 - b)) / 0.25) / 10);
  const W = 900;
  const H = 220;
  const ys = d.series.flatMap((s) => [s.memory, s.goldfish, 0]);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys, 0.001);
  const x = (i: number) => (i / Math.max(1, d.series.length - 1)) * (W - 60) + 50;
  const y = (v: number) => H - 24 - ((v - lo) / (hi - lo || 1)) * (H - 48);
  const line = (k: 'memory' | 'goldfish') => d.series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s[k]).toFixed(1)}`).join(' ');
  return (
    <div className="a-twins" data-m>
      <div className="a-twin mem">
        <h3>Rookie, with memory</h3>
        <p>Recalls its lessons and past calls from Walrus Memory before it buys.</p>
        {enough && <div className="big">{pct(cut(d.memory.brier) ?? 0)}</div>}
        <p>{enough ? `less error than a coin flip, over ${d.pairs} shared markets` : `${d.pairs} shared markets so far, results from 16`}</p>
      </div>
      <div className="a-twin">
        <h3>Goldfish, no memory</h3>
        <p>Rookie’s identical twin. Same blind call, same advisors, but it remembers nothing.</p>
        {enough && <div className="big">{pct(cut(d.goldfish.brier) ?? 0)}</div>}
        <p>{enough ? `less error than a coin flip, same ${d.pairs} markets` : `${d.pairs} shared markets so far, results from 16`}</p>
      </div>
      <div className="a-chart">
        {d.series.length > 1 ? (
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Total improvement from advice over time, Rookie versus Goldfish">
            <line className="zero" x1={50} x2={W - 10} y1={y(0)} y2={y(0)} />
            <text x={0} y={y(0) + 4}>
              0
            </text>
            <path className="ln gold" d={line('goldfish')} />
            <path className="ln mem" d={line('memory')} />
            <text x={x(d.series.length - 1) - 4} y={y(d.series.at(-1)!.memory) - 10} textAnchor="end" style={{ fill: 'var(--blue)', fontWeight: 600 }}>
              Rookie
            </text>
            <text x={x(d.series.length - 1) - 4} y={y(d.series.at(-1)!.goldfish) + 18} textAnchor="end">
              Goldfish
            </text>
          </svg>
        ) : (
          <p className="a-p" style={{ fontSize: 15 }}>
            The Goldfish joined on 4 November. Both twins play every round from now on, and this chart fills in as the markets settle (every two hours).
          </p>
        )}
        {enough && (
          <p className="a-note">
            Advice Rookie paid for: {usd(d.memory.releasedMicros)} kept by advisors, {usd(d.memory.refundedMicros)} refunded. Goldfish: {usd(d.goldfish.releasedMicros)} kept, {usd(d.goldfish.refundedMicros)} refunded.
          </p>
        )}
      </div>
    </div>
  );
}
