'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { advisorName, ASSET, hhmm, VERDICT } from './names';

interface Open {
  round: { roundId: string; closeTime: string; blindUntil: string; markets: { asset: string; question: string; url: string }[] } | null;
  matches: { roundId: string; asset: string; league: string; title: string; question: string; kickoff: string }[];
}
interface Pick {
  roundId: string;
  asset: string;
  label: string;
  question: string;
  closes: string;
}
type Step = 'blind' | 'reveal' | 'informed' | 'done';

const KEY = 'receipts-player';
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') as { token: string; handle: string } | null;
  } catch {
    return null;
  }
};

async function api(path: string, token: string | null, body?: unknown) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((j as { error?: string }).error ?? `HTTP ${res.status}`), { status: res.status });
  return j;
}

export function PlayApp() {
  const [me, setMe] = useState<{ token: string; handle: string } | null>(null);
  const [handle, setHandle] = useState('');
  const [open, setOpen] = useState<Open | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [step, setStep] = useState<Step>('blind');
  const [blind, setBlind] = useState(50);
  const [informed, setInformed] = useState(50);
  const [take, setTake] = useState<{ advisorId: string; fairTest: boolean; shown: { advisor: string; says: string; probabilityBps: number } } | null>(null);
  const [receipts, setReceipts] = useState<{ blind?: string; informed?: string }>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [record, setRecord] = useState<{ episodes: number; advisors: { advisorId: string; name: string; n: number; verdict: string }[] } | null>(null);

  useEffect(() => {
    const saved = load();
    if (saved) queueMicrotask(() => setMe(saved)); // localStorage is only readable after hydration
  }, []);
  useEffect(() => {
    api('/api/arena/play', null).then(setOpen).catch(() => setOpen({ round: null, matches: [] }));
  }, []);
  useEffect(() => {
    if (me) api('/api/arena/me', me.token).then(setRecord).catch(() => {});
  }, [me, step]);

  const join = async () => {
    setErr('');
    try {
      const r = (await api('/api/arena/players', null, { handle })) as { token: string; handle: string };
      const v = { token: r.token, handle: r.handle };
      try {
        localStorage.setItem(KEY, JSON.stringify(v));
      } catch {}
      setMe(v);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const choose = (p: Pick) => {
    setPick(p);
    setStep('blind');
    setTake(null);
    setReceipts({});
    setErr('');
    setBlind(50);
  };

  const lockBlind = async () => {
    if (!me || !pick) return;
    setBusy(true);
    setErr('');
    try {
      const r = (await api('/api/arena/play/blind', me.token, { roundId: pick.roundId, asset: pick.asset, probabilityBps: blind * 100 })) as { hash: string };
      setReceipts({ blind: r.hash });
      setInformed(blind);
      setStep('reveal');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reveal = useCallback(
    async (advisorId?: string) => {
      if (!me || !pick) return;
      setBusy(true);
      setErr('');
      for (let i = 0; i < 20; i++) {
        try {
          const r = await api('/api/arena/play/reveal', me.token, { roundId: pick.roundId, asset: pick.asset, advisorId });
          setTake(r);
          setStep('informed');
          setBusy(false);
          return;
        } catch (e) {
          if ((e as { status?: number }).status !== 425) {
            setErr((e as Error).message);
            setBusy(false);
            return;
          }
          setErr('Sealing your blind call on Walrus first…');
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
      setBusy(false);
    },
    [me, pick],
  );

  const lockInformed = async () => {
    if (!me || !pick) return;
    setBusy(true);
    setErr('');
    try {
      const r = (await api('/api/arena/play/informed', me.token, { roundId: pick.roundId, asset: pick.asset, probabilityBps: informed * 100 })) as { hash: string };
      setReceipts((x) => ({ ...x, informed: r.hash }));
      setStep('done');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!me)
    return (
      <div className="a-card" style={{ marginTop: 36, maxWidth: 560 }}>
        <label htmlFor="h" style={{ display: 'block', marginBottom: 10 }}>
          Pick a handle to play. It appears on your receipts.
        </label>
        <div className="a-field">
          <input id="h" className="a-input" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="your_handle" autoComplete="off" />
          <button className="a-btn a-btn-amber" onClick={join} disabled={handle.length < 3}>
            Start playing
          </button>
        </div>
        {err && <p className="a-err">{err}</p>}
      </div>
    );

  const picks: Pick[] = [
    ...(open?.round?.markets.map((m) => ({ roundId: open.round!.roundId, asset: m.asset, label: `${ASSET[m.asset]} up or down`, question: m.question, closes: open.round!.closeTime })) ?? []),
    ...(open?.matches.map((m) => ({ roundId: m.roundId, asset: 'match', label: m.title.replace(/ FC\b/g, ''), question: m.question, closes: m.kickoff })) ?? []),
  ];
  const yesWord = pick?.asset === 'match' ? 'home win' : 'UP';

  return (
    <div className="a-split" style={{ marginTop: 40 }}>
      <div>
        <p className="a-p">Playing as @{me.handle}. Pick a market:</p>
        <div className="a-matches">
          {open === null && <p className="a-p">Loading markets…</p>}
          {open && picks.length === 0 && <p className="a-p">Nothing open right now. A new crypto round opens at minute 51 of every hour.</p>}
          {picks.map((p) => (
            <button key={`${p.roundId}${p.asset}`} className="a-match" aria-pressed={pick?.roundId === p.roundId && pick?.asset === p.asset} onClick={() => choose(p)}>
              <span>
                <h3>{p.label}</h3>
                <small>{p.question}</small>
              </span>
              <small>closes {hhmm(p.closes)} UTC</small>
            </button>
          ))}
        </div>
      </div>
      <div>
        {pick ? (
          <div className="a-card">
            <h2 style={{ fontFamily: 'var(--d)', fontSize: 36, margin: 0 }}>{pick.label}</h2>
            <div className="a-steps-mini">
              <span className={step === 'blind' ? 'is-on' : ''}>1 Blind call</span>
              <span className={step === 'reveal' ? 'is-on' : ''}>2 Read one take</span>
              <span className={step === 'informed' ? 'is-on' : ''}>3 Call again</span>
            </div>
            {step === 'blind' && (
              <>
                <p className="a-p">How likely is a {yesWord}? Decide before you see anything else.</p>
                <div className="a-big">{blind}%</div>
                <input className="a-slider" type="range" min={1} max={99} value={blind} onChange={(e) => setBlind(Number(e.target.value))} aria-label="Your blind probability" />
                <button className="a-btn a-btn-amber" onClick={lockBlind} disabled={busy}>
                  Seal my blind call
                </button>
              </>
            )}
            {step === 'reveal' && (
              <>
                <p className="a-ok">Blind call sealed at {blind}%.</p>
                <p className="a-p">You get to read exactly one take. Let the arena pick at random so the test is fair, or choose.</p>
                <div className="a-ctas" style={{ marginTop: 18 }}>
                  <button className="a-btn a-btn-amber" onClick={() => reveal()} disabled={busy}>
                    Show me a random take
                  </button>
                </div>
              </>
            )}
            {(step === 'informed' || step === 'done') && take && (
              <>
                <div className="a-take" style={{ margin: '6px 0 20px' }}>
                  <b>{take.shown.advisor}</b>
                  {take.shown.says}
                </div>
                {step === 'informed' ? (
                  <>
                    <p className="a-p">Your blind call was {blind}%. Has this changed your mind?</p>
                    <div className="a-big">{informed}%</div>
                    <input className="a-slider" type="range" min={1} max={99} value={informed} onChange={(e) => setInformed(Number(e.target.value))} aria-label="Your informed probability" />
                    <div className="a-ctas">
                      <button className="a-btn a-btn-amber" onClick={lockInformed} disabled={busy}>
                        Seal my second call
                      </button>
                      <button className="a-btn a-btn-line" onClick={() => setInformed(blind)} disabled={busy}>
                        Keep {blind}%
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="a-ok">
                      Both calls are sealed: {blind}% then {informed}%. You’ll see whether {advisorName(take.advisorId)} helped you when the market settles.
                    </p>
                    <p className="a-p" style={{ fontSize: 16 }}>
                      Receipts: <Link href={`/verify?hash=${receipts.blind}`}>blind call</Link> · <Link href={`/verify?hash=${receipts.informed}`}>second call</Link>
                    </p>
                  </>
                )}
              </>
            )}
            {err && <p className={err.startsWith('Sealing') ? 'a-ok' : 'a-err'}>{err}</p>}
          </div>
        ) : (
          <div className="a-card">
            <p className="a-p">Choose a market on the left to start.</p>
          </div>
        )}
        {record && record.episodes > 0 && (
          <div className="a-card" style={{ marginTop: 16 }}>
            <h3 style={{ fontFamily: 'var(--d)', fontSize: 28, margin: '0 0 10px' }}>Who helps you so far</h3>
            {record.advisors.map((a) => (
              <p key={a.advisorId} className="a-p" style={{ fontSize: 17 }}>
                {a.name}: {VERDICT[a.verdict]} (n={a.n})
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
