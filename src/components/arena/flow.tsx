'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { agentName, hhmm, short, suiscan, usd } from './names';

/**
 * The hero: a replay of the money in the last settled round, from real data (/api/arena/flow).
 * Each dot is one take an agent bought. It travels agent → escrow, waits for the market, then goes to the
 * advisor (gold) if the take improved that agent's call, or back to the agent (pink) if it didn't.
 */
interface FlowData {
  roundId: string;
  closeTime: string;
  markets: { asset: string; resolution: string | null }[];
  declines: number;
  flows: { agentId: string; advisorId: string; advisor: string; micros: number; status: string | null; network: string | null }[];
  payout: { digest: string | null; network: string; releasedMicros: number | null; refundedMicros: number | null } | null;
}

const AGENTS = ['rookie', 'chartist', 'cautious', 'gambler', 'goldfish'];
const SHORT: Record<string, string> = { cautious: 'Cautious', crowd: 'Crowd', quant: 'Quant', trend: 'Trend', fader: 'Fader', book: 'Book', hype: 'Tipster', fence: 'Fence', whale: 'Whale', 'x-crowd-plus': 'Crowd+' };
// timeline (ms): coins leave agents, wait in escrow, settle, rest
const BUY = 2600;
const HOLD = 1500;
const SETTLE = 2600;
const LOOP = BUY + HOLD + SETTLE + 3200;
const TRAVEL = 1500;

type Pt = { x: number; y: number };
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const quad = (a: Pt, c: Pt, b: Pt, t: number): Pt => ({ x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y });

function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

function layout(advisorIds: string[], narrow: boolean) {
  if (!narrow) {
    const W = 1100;
    const H = 620;
    const ay = (i: number) => 90 + (i * (H - 180)) / (AGENTS.length - 1);
    const vy = (i: number, n: number) => (n === 1 ? H / 2 : 60 + (i * (H - 120)) / (n - 1));
    return {
      W,
      H,
      vault: { x: 590, y: H / 2 },
      agent: Object.fromEntries(AGENTS.map((id, i) => [id, { x: 250, y: ay(i) }])) as Record<string, Pt>,
      advisor: Object.fromEntries(advisorIds.map((id, i) => [id, { x: 880, y: vy(i, advisorIds.length) }])) as Record<string, Pt>,
      ctl: (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: a.x < 590 ? a.y : b.y }),
      label: { agent: (p: Pt) => ({ x: p.x - 26, y: p.y, anchor: 'end' as const }), advisor: (p: Pt) => ({ x: p.x + 26, y: p.y, anchor: 'start' as const }) },
      narrow,
    };
  }
  const W = 600;
  const H = 880;
  const ax = (i: number) => 60 + (i * (W - 120)) / (AGENTS.length - 1);
  const rows = [advisorIds.slice(0, 4), advisorIds.slice(4)];
  const advisor: Record<string, Pt> = {};
  rows.forEach((r, ri) => r.forEach((id, i) => (advisor[id] = { x: r.length === 1 ? W / 2 : 75 + (i * (W - 150)) / (r.length - 1), y: 700 + ri * 110 })));
  return {
    W,
    H,
    vault: { x: W / 2, y: 400 },
    agent: Object.fromEntries(AGENTS.map((id, i) => [id, { x: ax(i), y: 130 }])) as Record<string, Pt>,
    advisor,
    ctl: (a: Pt, b: Pt) => ({ x: a.y < 400 ? a.x : b.x, y: (a.y + b.y) / 2 }),
    label: { agent: (p: Pt) => ({ x: p.x, y: p.y - 44, anchor: 'middle' as const }), advisor: (p: Pt) => ({ x: p.x, y: p.y + 40, anchor: 'middle' as const }) },
    narrow,
  };
}

export function MoneyFlow() {
  const [data, setData] = useState<FlowData | null>(null);
  const [phase, setPhase] = useState(1);
  const [still, setStill] = useState(false);
  const narrow = useNarrow();
  const coins = useRef<(SVGCircleElement | null)[]>([]);
  const trails = useRef<(SVGCircleElement | null)[]>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch('/api/arena/flow')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => alive && j && setData(j as FlowData))
        .catch(() => {});
    load();
    const t = window.setInterval(load, 5 * 60_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  const flows = useMemo(() => (data?.flows ?? []).filter((f) => f.status === 'released' || f.status === 'refunded'), [data]);
  const advisorIds = useMemo(() => {
    const paid = new Map<string, number>();
    for (const f of flows) paid.set(f.advisorId, (paid.get(f.advisorId) ?? 0) + (f.status === 'released' ? f.micros : 0) + 1);
    return [...paid.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, 8);
  }, [flows]);
  const L = useMemo(() => layout(advisorIds, narrow), [advisorIds, narrow]);
  const shown = useMemo(() => flows.filter((f) => L.advisor[f.advisorId] && L.agent[f.agentId]), [flows, L]);

  const totals = useMemo(() => {
    const paid = new Map<string, number>();
    const back = new Map<string, number>();
    const bought = new Map<string, number>();
    for (const f of shown) {
      bought.set(f.agentId, (bought.get(f.agentId) ?? 0) + 1);
      if (f.status === 'released') paid.set(f.advisorId, (paid.get(f.advisorId) ?? 0) + f.micros);
      else back.set(f.agentId, (back.get(f.agentId) ?? 0) + f.micros);
    }
    return { paid, back, bought, released: [...paid.values()].reduce((a, b) => a + b, 0), refunded: [...back.values()].reduce((a, b) => a + b, 0) };
  }, [shown]);

  useEffect(() => {
    if (!shown.length) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const place = (el: SVGCircleElement | null, p: Pt | null) => {
      if (!el) return;
      if (!p) return el.setAttribute('opacity', '0');
      el.setAttribute('opacity', '1');
      el.setAttribute('cx', p.x.toFixed(1));
      el.setAttribute('cy', p.y.toFixed(1));
    };
    const n = shown.length;
    const pos = (i: number, t: number): { p: Pt | null; cls: string } => {
      const f = shown[i];
      const a = L.agent[f.agentId];
      const dest = f.status === 'released' ? L.advisor[f.advisorId] : a;
      const delay = (i / n) * (BUY - TRAVEL);
      if (t < BUY) {
        const k = (t - delay) / TRAVEL;
        if (k <= 0) return { p: null, cls: 'out' };
        if (k >= 1) return { p: null, cls: 'out' };
        return { p: quad(a, L.ctl(a, L.vault), L.vault, ease(k)), cls: 'out' };
      }
      const s = t - BUY - HOLD;
      if (s < 0) return { p: null, cls: 'out' };
      const k = Math.min(1, (s - (i / n) * (SETTLE - TRAVEL)) / TRAVEL);
      if (k <= 0) return { p: null, cls: f.status === 'released' ? 'paid' : 'back' };
      return { p: quad(L.vault, L.ctl(L.vault, dest), dest, ease(k)), cls: f.status === 'released' ? 'paid' : 'back' };
    };
    if (reduce) {
      queueMicrotask(() => setStill(true));
      shown.forEach((_, i) => place(coins.current[i], null));
      return;
    }
    let raf = 0;
    let visible = true;
    let lastT = 0;
    const arrived = new Set<string>();
    const hit = (key: string) => {
      const el = box.current?.querySelector(`[data-node="${key}"]`);
      if (!el) return;
      el.classList.remove('hit');
      void (el as SVGGraphicsElement).getBBox();
      el.classList.add('hit');
    };
    const t0 = performance.now();
    let last = 0;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    if (box.current) io.observe(box.current);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      const t = (now - t0) % LOOP;
      const ph = t < BUY ? 1 : t < BUY + HOLD ? 2 : t < BUY + HOLD + SETTLE ? 3 : 4;
      if (ph !== last) {
        last = ph;
        setPhase(ph);
      }
      if (t < lastT) arrived.clear(); // new loop
      lastT = t;
      for (let i = 0; i < n; i++) {
        const { p, cls } = pos(i, t);
        const el = coins.current[i];
        if (el && el.getAttribute('class') !== `coin ${cls}`) el.setAttribute('class', `coin ${cls}`);
        place(el, p); // settled coins rest on their destination until the loop restarts
        // a short trail behind each moving coin
        for (let k = 0; k < 2; k++) {
          const tr = trails.current[i * 2 + k];
          const q = pos(i, Math.max(0, t - (k + 1) * 55)).p;
          const moving = p && q && (Math.abs(q.x - p.x) > 0.5 || Math.abs(q.y - p.y) > 0.5);
          if (tr) {
            if (tr.getAttribute('class') !== `coin trail ${cls}`) tr.setAttribute('class', `coin trail ${cls}`);
            place(tr, moving ? q : null);
            if (moving) tr.setAttribute('r', String(4 - k * 1.2));
          }
        }
        // the node pulses when money lands on it
        const f = shown[i];
        const inKey = `in:${i}`;
        const outKey = `out:${i}`;
        const delay = (i / n) * (BUY - TRAVEL);
        if (t >= delay + TRAVEL && t < BUY && !arrived.has(inKey)) {
          arrived.add(inKey);
          hit('vault');
        }
        const s2 = t - BUY - HOLD - (i / n) * (SETTLE - TRAVEL);
        if (s2 >= TRAVEL && !arrived.has(outKey)) {
          arrived.add(outKey);
          hit(f.status === 'released' ? `adv-${f.advisorId}` : `ag-${f.agentId}`);
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [shown, L]);

  const step = still ? 4 : phase;
  const round = data ? `${hhmm(data.closeTime)} UTC` : '';
  const isTest = data?.payout?.network?.endsWith('testnet') ?? true;

  return (
    <div ref={box} className={`a-flow ph-${step} ${still ? 'is-still' : ''}`}>
      <svg viewBox={`0 0 ${L.W} ${L.H}`} role="img" aria-label={data ? `Last round: ${shown.length} takes bought, ${usd(totals.released)} paid to advisors whose take helped, ${usd(totals.refunded)} refunded to the agents.` : 'Loading the last round'}>
        {shown.length > 0 && (
          <g aria-hidden>
            {AGENTS.map((id) => {
              const a = L.agent[id];
              return <path key={`in-${id}`} className="lane" d={`M${a.x},${a.y} Q${L.ctl(a, L.vault).x},${L.ctl(a, L.vault).y} ${L.vault.x},${L.vault.y}`} />;
            })}
            {advisorIds.map((id) => {
              const b = L.advisor[id];
              const c = L.ctl(L.vault, b);
              return <path key={`out-${id}`} className={`lane ${totals.paid.get(id) ? 'paid' : ''}`} d={`M${L.vault.x},${L.vault.y} Q${c.x},${c.y} ${b.x},${b.y}`} />;
            })}
            <circle className="vault-ring" cx={L.vault.x} cy={L.vault.y} r={40} />
            <circle className="vault node-v" data-node="vault" cx={L.vault.x} cy={L.vault.y} r={40} />
            <text className="sub" x={L.vault.x} y={L.vault.y + 72} textAnchor="middle">
              escrow
            </text>
            {AGENTS.map((id) => {
              const p = L.agent[id];
              const lb = L.label.agent(p);
              const back = totals.back.get(id);
              const name = L.narrow ? (SHORT[id] ?? agentName(id)) : agentName(id);
              return (
                <g key={id}>
                  <circle className="node" data-node={`ag-${id}`} cx={p.x} cy={p.y} r={9} />
                  <text className="lbl" x={lb.x} y={lb.y - (L.narrow ? 0 : 4)} textAnchor={lb.anchor}>
                    {name}
                  </text>
                  {!L.narrow && (
                    <text className="sub" x={lb.x} y={lb.y + 20} textAnchor={lb.anchor}>
                      {id === 'goldfish' ? 'no memory' : `${totals.bought.get(id) ?? 0} takes`}
                    </text>
                  )}
                  {back ? (
                    <text className="amt back" x={lb.x} y={lb.y + (L.narrow ? 22 : 42)} textAnchor={lb.anchor}>
                      {usd(back)} back
                    </text>
                  ) : null}
                </g>
              );
            })}
            {advisorIds.map((id) => {
              const p = L.advisor[id];
              const lb = L.label.advisor(p);
              const paid = totals.paid.get(id);
              const name = L.narrow ? (SHORT[id] ?? id) : (shown.find((f) => f.advisorId === id)?.advisor ?? id);
              return (
                <g key={id}>
                  <circle className="node" data-node={`adv-${id}`} cx={p.x} cy={p.y} r={9} style={paid ? { fill: '#ffce3a', stroke: '#ffce3a' } : undefined} />
                  <text className="lbl" x={lb.x} y={lb.y + (L.narrow ? 0 : 6)} textAnchor={lb.anchor} style={L.narrow ? { fontSize: 17 } : undefined}>
                    {name}
                  </text>
                  <text className={`amt ${paid ? 'paid' : 'back'}`} x={lb.x} y={lb.y + (L.narrow ? 24 : 32)} textAnchor={lb.anchor}>
                    {paid ? `+${usd(paid)}` : 'not paid'}
                  </text>
                </g>
              );
            })}
            {shown.flatMap((f, i) => [0, 1].map((k) => <circle key={`t${i}-${k}`} ref={(el) => void (trails.current[i * 2 + k] = el)} className="coin trail out" r={4} opacity={0} />))}
            {shown.map((f, i) => (
              <circle key={i} ref={(el) => void (coins.current[i] = el)} className="coin out" r={6} opacity={0} />
            ))}
          </g>
        )}
        {!data && (
          <text className="sub" x={L.W / 2} y={L.H / 2} textAnchor="middle">
            Loading the last round…
          </text>
        )}
      </svg>
      <ol className="a-flow-cap">
        <li className={step === 1 ? 'on' : ''}>
          <b>Agents pay for advice</b>
          one take per market, over MPP in USDC
        </li>
        <li className={step === 2 ? 'on' : ''}>
          <b>The money waits</b>
          in escrow until the market settles
        </li>
        <li className={step >= 3 ? 'on' : ''}>
          <b>Paid only if it helped</b>
          gold to the advisor, pink back to the agent
        </li>
      </ol>
      {data && (
        <p className="a-flow-meta">
          Replay of the round that closed at {round}: {data.markets.length} markets, {shown.length} takes bought, {usd(totals.released)} paid, {usd(totals.refunded)} refunded
          {data.payout?.digest ? (
            <>
              . Payout{' '}
              <a href={suiscan(data.payout.digest, isTest ? 'testnet' : 'mainnet')} target="_blank" rel="noreferrer">
                {short(data.payout.digest)}
              </a>{' '}
              on Sui{isTest ? ' testnet' : ''}.
            </>
          ) : (
            '.'
          )}
        </p>
      )}
    </div>
  );
}
