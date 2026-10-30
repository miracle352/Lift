'use client';
import { useEffect, useState } from 'react';
import { advisorName, agentName, usd, VERDICT } from './names';

interface Leaderboard {
  agents: { id: string; name: string; episodes: number; advisors: { advisorId: string; n: number; trust: number; verdict: string; meanDelta: number | null }[] }[];
  advisors: { id: string; name: string; pitch: string; kind: string; sold: number; releasedMicros: number; refundedMicros: number; escrowedMicros: number; priceMicros: number }[];
  lessons: { agentId: string; advisorId: string; verdict: string; text: string; walrusBlobId: string | null; at: string }[];
}
interface Stats {
  verifiedSeals: number;
  sealedForecasts: number;
  settledEpisodes: number;
  lessonsOnWalrus: number;
  settledRounds: number;
  tatumCalls: number;
}

function useJson<T>(url: string, everyMs = 60_000) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => alive && j && setData(j as T))
        .catch(() => {});
    load();
    const t = window.setInterval(load, everyMs);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [url, everyMs]);
  return data;
}

/** Paid (amber) vs refunded (red) per advisor: pay-for-lift, from real settlements. */
export function Earnings() {
  const lb = useJson<Leaderboard>('/api/arena/leaderboard');
  if (!lb) return <p className="a-p">Loading the ledger…</p>;
  const rows = [...lb.advisors].filter((a) => a.sold > 0).sort((a, b) => b.releasedMicros - a.releasedMicros);
  const max = Math.max(1, ...rows.map((a) => a.releasedMicros + a.refundedMicros));
  return (
    <table className="a-earn">
      <thead>
        <tr>
          <th>Advisor</th>
          <th>Paid for helping · refunded for not</th>
          <th style={{ textAlign: 'right' }}>Paid / refunded</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.id}>
            <td style={{ paddingRight: 16 }}>
              <div className="a-name">
                {a.name}
                {a.kind === 'external' && <span className="a-tag">marketplace</span>}
              </div>
              <div className="a-sub">{a.pitch}</div>
            </td>
            <td style={{ width: '42%' }}>
              <div className="a-bar" style={{ width: `${(100 * (a.releasedMicros + a.refundedMicros)) / max}%` }} aria-hidden>
                <i className="p" style={{ width: `${(100 * a.releasedMicros) / Math.max(1, a.releasedMicros + a.refundedMicros)}%` }} />
                <i className="r" style={{ flex: 1 }} />
              </div>
            </td>
            <td className="a-num">
              {usd(a.releasedMicros)} / {usd(a.refundedMicros)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Each agent's verdict on each advisor, computed from its own settled calls. */
export function VerdictGrid() {
  const lb = useJson<Leaderboard>('/api/arena/leaderboard');
  if (!lb) return null;
  const advisorIds = lb.advisors.filter((a) => a.sold > 0).map((a) => a.id);
  return (
    <div className="a-grid" style={{ gridTemplateColumns: `minmax(120px, 1.2fr) repeat(${advisorIds.length}, minmax(92px, 1fr))` }} role="table" aria-label="Verdicts by agent and advisor">
      <div className="a-cell h" role="columnheader" />
      {advisorIds.map((id) => (
        <div key={id} className="a-cell h" role="columnheader">
          {advisorName(id)}
        </div>
      ))}
      {lb.agents.map((ag) => (
        <div key={ag.id} style={{ display: 'contents' }} role="row">
          <div className="a-cell h" role="rowheader">
            {agentName(ag.id)}
            <span className="n" style={{ fontFamily: 'var(--t)', fontWeight: 400 }}>
              {ag.episodes} calls
            </span>
          </div>
          {advisorIds.map((id) => {
            const s = ag.advisors.find((x) => x.advisorId === id);
            const v = s?.verdict ?? 'not_enough_evidence';
            return (
              <div key={id} className={`a-cell ${v}`} role="cell">
                <span className="v">{VERDICT[v]}</span>
                <span className="n">
                  n={s?.n ?? 0} · trust {s ? s.trust.toFixed(2) : '–'}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function Lessons() {
  const lb = useJson<Leaderboard>('/api/arena/leaderboard');
  if (!lb) return null;
  return (
    <ul className="a-lessons">
      {lb.lessons.slice(0, 6).map((l) => (
        <li key={`${l.agentId}${l.advisorId}${l.at}`} className="a-lesson">
          {l.text.split(' [[')[0]}
          <small>
            {new Date(l.at).toUTCString().slice(5, 22)} UTC ·{' '}
            {l.walrusBlobId ? (
              <a href={`https://walruscan.com/mainnet/blob/${l.walrusBlobId}`} target="_blank" rel="noreferrer">
                Walrus blob {l.walrusBlobId.slice(0, 10)}…
              </a>
            ) : (
              'writing to Walrus…'
            )}
          </small>
        </li>
      ))}
    </ul>
  );
}

export function StatsStrip() {
  const s = useJson<Stats>('/api/arena/stats');
  const items: [number | undefined, string][] = [
    [s?.sealedForecasts, 'calls sealed on Walrus'],
    [s?.settledEpisodes, 'calls settled by the market'],
    [s?.settledRounds, 'rounds played'],
    [s?.lessonsOnWalrus, 'lessons the agents remember'],
  ];
  return (
    <div className="a-stats">
      {items.map(([n, label]) => (
        <div key={label} className="a-stat">
          <b>{n === undefined ? '—' : n.toLocaleString('en-US')}</b>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
