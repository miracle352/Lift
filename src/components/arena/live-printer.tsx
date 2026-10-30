'use client';
import { useEffect, useState } from 'react';
import { advisorName, agentName, ASSET, hhmm, short, suiscan, usd } from './names';

/**
 * The hero's printer: every line is a real arena event, streamed from /api/arena/feed (SSE).
 * New lines feed in at the top like thermal paper coming out of the slot.
 */
interface Ev {
  id: number;
  at: string;
  roundId: string | null;
  type: string;
  agentId: string | null;
  advisorId: string | null;
  payload: Record<string, unknown>;
}

const SKIP = new Set(['take_bought', 'take_declined', 'lessons_recalled', 'batch_submitted', 'human_reveal']);

function line(e: Ev): { title: React.ReactNode; body: React.ReactNode } | null {
  const p = e.payload as Record<string, never>;
  const round = e.roundId?.startsWith('15m:') ? `${hhmm(e.roundId.slice(4))} UTC round` : e.roundId?.startsWith('fb:') ? 'match' : '';
  switch (e.type) {
    case 'round_locked':
      return { title: `Round locked · ${round}`, body: <>{(p.markets as unknown[]).length} markets, {p.buys} takes bought, {p.declines} declined</> };
    case 'takes_paid':
      return {
        title: `Paid over MPP · ${agentName(e.agentId)}`,
        body: (
          <>
            <b>{usd(p.micros)}</b> USDC for {p.picks} takes ·{' '}
            {p.digest ? (
              <a href={suiscan(p.digest, String(p.network).endsWith('testnet') ? 'testnet' : 'mainnet')} target="_blank" rel="noreferrer">
                tx {short(p.digest)}
              </a>
            ) : null}
          </>
        ),
      };
    case 'batch_on_sui':
      return {
        title: `Sealed on Sui · ${p.phase} calls`,
        body: (
          <>
            checkpoint {p.checkpoint} ·{' '}
            <a href={suiscan(p.digest)} target="_blank" rel="noreferrer">
              {short(p.digest)}
            </a>
          </>
        ),
      };
    case 'market_resolved':
      return { title: `Resolved · ${ASSET[p.asset] ?? p.asset}`, body: <>went <b>{p.outcome === 'UP' ? (p.asset === 'match' ? 'YES' : 'UP') : p.asset === 'match' ? 'NO' : 'DOWN'}</b> · source {String(p.source ?? 'Tatum').replace(/^https?:\/\//, '').slice(0, 32)}</> };
    case 'round_settled':
      return {
        title: `Settled · ${round}`,
        body: (
          <>
            <span className="a-paid">{p.released} paid</span> to advisors that helped · <span className="a-ref">{p.refunded} refunded</span>
          </>
        ),
      };
    case 'payouts_sent':
      return {
        title: 'Pay-for-lift payout',
        body: (
          <>
            <span className="a-paid">{usd(p.releasedMicros)} released</span> · <span className="a-ref">{usd(p.refundedMicros)} refunded</span> ·{' '}
            <a href={suiscan(p.digest, String(p.network).endsWith('testnet') ? 'testnet' : 'mainnet')} target="_blank" rel="noreferrer">
              tx {short(p.digest)}
            </a>
          </>
        ),
      };
    case 'lesson_learned':
      return { title: `Lesson stored on Walrus · ${agentName(e.agentId)}`, body: <>{String(p.text).split(' (n=')[0].replace(/^Lesson for [^:]+: /, '')}</> };
    case 'match_opened':
      return { title: `Match open · ${p.league}`, body: <>{String(p.title).replace(/ FC\b/g, '')} · kickoff {hhmm(p.kickoff)} UTC</> };
    case 'human_blind':
    case 'human_informed':
      return { title: `A player sealed a call · ${ASSET[p.asset] ?? p.asset}`, body: <>{e.type === 'human_blind' ? 'blind call, before any advice' : `after reading ${advisorName(e.advisorId)}`}</> };
    case 'payment_failed':
      return null;
    default:
      return null;
  }
}

export function LivePrinter() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [live, setLive] = useState(false);
  const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set());
  useEffect(() => {
    // On Vercel the live stream connects straight to the arena server (long-lived streams don't suit proxies)
    const es = new EventSource(`${process.env.NEXT_PUBLIC_ARENA_API_ORIGIN ?? ''}/api/arena/feed?tail=24`);
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    const onEvent = (m: MessageEvent) => {
      const e = JSON.parse(m.data) as Ev;
      if (SKIP.has(e.type)) return;
      setFresh((f) => new Set(f).add(e.id));
      setEvents((prev) => [e, ...prev.filter((x) => x.id !== e.id)].slice(0, 40));
      window.setTimeout(() => setFresh((f) => { const n = new Set(f); n.delete(e.id); return n; }), 1500);
    };
    const types = ['round_locked', 'takes_paid', 'batch_on_sui', 'market_resolved', 'round_settled', 'payouts_sent', 'lesson_learned', 'match_opened', 'human_blind', 'human_informed'];
    for (const t of types) es.addEventListener(t, onEvent as EventListener);
    return () => es.close();
  }, []);
  // one line per round for resolutions: "Resolved · BTC ↓  ETH ↑ …"
  const merged: Ev[] = [];
  for (const e of events) {
    const prev = merged[merged.length - 1];
    if (e.type === 'market_resolved' && prev?.type === 'market_resolved_group' && prev.roundId === e.roundId) {
      (prev.payload.items as Ev[]).push(e);
      continue;
    }
    merged.push(e.type === 'market_resolved' ? { ...e, type: 'market_resolved_group', payload: { items: [e] } } : e);
  }
  const lines = merged
    .map((e) => {
      if (e.type !== 'market_resolved_group') return { e, l: line(e) };
      const items = e.payload.items as Ev[];
      const up = (x: Ev) => x.payload.outcome === 'UP';
      return {
        e,
        l: {
          title: items[0].payload.asset === 'match' ? 'Match result' : `Resolved · ${items.length} markets`,
          body: (
            <>
              {items.map((x) => (
                <span key={x.id} style={{ marginRight: 10, whiteSpace: 'nowrap' }}>
                  {ASSET[String(x.payload.asset)] ?? String(x.payload.asset)} <b>{x.payload.asset === 'match' ? (up(x) ? 'home win' : 'no home win') : up(x) ? '↑' : '↓'}</b>
                </span>
              )).flatMap((s, i) => (i ? [' ', s] : [s]))}
            </>
          ),
        },
      };
    })
    .filter((x) => x.l);
  return (
    <div className="a-printer" aria-label="Live arena feed">
      <div className="a-slot">
        <span className={`a-lamp ${live ? 'is-on' : ''}`} />
      </div>
      <div className="a-paper-window">
        <div className="a-paper" role="log" aria-live="polite">
          {lines.length === 0 && <div className="a-ln">Warming up the printer…</div>}
          {lines.map(({ e, l }) => (
            <div key={e.id} className={`a-ln ${fresh.has(e.id) ? 'a-ln-new' : ''}`}>
              <div className="a-ln-top">
                <span>{l!.title}</span>
                <span>{hhmm(e.at)}</span>
              </div>
              <div>{l!.body}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="a-printer-cap">
        <span>{live ? 'Printing live from the arena' : 'Connecting…'}</span>
        <span>every line is on chain</span>
      </div>
    </div>
  );
}
