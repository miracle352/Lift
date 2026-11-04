'use client';
import { ShareCall } from './share';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { short, suiscan } from './names';

interface Check {
  id: string;
  ok: boolean | null;
  severity: string;
  detail: string;
}
interface Result {
  error?: string;
  closeTime?: string;
  tampered?: boolean;
  receipt?: { kind: string; market: { question: string; closeTime: string; resolution: string | null }; forecast: { probabilityBps: number; createdAt: string }; seal: { type: string; digest: string | null; namespace: string | null } };
  verification?: { status: string; checks: Check[]; commit: { digest: string; checkpoint: string | null } };
}

const LABEL: Record<string, string> = {
  hash: 'The call hashes to what was sealed',
  inclusion: 'The call is inside the sealed batch (Merkle proof)',
  tags: 'Sealed under the right round',
  label_in_tx: 'The Sui transaction wrote this seal',
  tx_success: 'The transaction succeeded',
  account: 'Written by the arena’s Walrus Memory account',
  owner: 'Stored for the arena’s owner address',
  before_close: 'Sealed before the market closed',
  after_blind: 'Sealed after the blind call',
  untouched: 'Blob unchanged since',
  alive: 'Still stored on Walrus',
};

export function VerifyApp() {
  const params = useSearchParams();
  const [hash, setHash] = useState(params.get('hash') ?? '');
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (tamper?: string) => {
    if (!/^[0-9a-fA-F]{64}$/.test(hash)) return setRes({ error: 'A receipt hash is 64 hex characters.' });
    setBusy(true);
    const r = await fetch(`/api/arena/verify?hash=${hash}${tamper ? `&tamper=${tamper}` : ''}`).then((x) => x.json()).catch(() => ({ error: 'Could not reach the verifier.' }));
    setRes(r);
    setBusy(false);
  };
  useEffect(() => {
    if (params.get('hash')) void Promise.resolve().then(() => run());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const f = res?.receipt?.forecast;
  return (
    <div className="a-split" style={{ marginTop: 36 }}>
      <div>
        <div className="a-field">
          <input className="a-input" style={{ flex: 1, fontFamily: 'var(--m)', fontSize: 14 }} value={hash} onChange={(e) => setHash(e.target.value.trim())} placeholder="64-character receipt hash" aria-label="Receipt hash" />
          <button className="a-btn a-btn-amber" onClick={() => run()} disabled={busy}>
            Check on Sui
          </button>
        </div>
        {res?.error && <p className="a-err">{res.error === 'not revealed yet' ? `This call stays secret until its market closes (${res.closeTime?.slice(11, 16)} UTC). Only its hash is public.` : res.error}</p>}
        {res?.receipt && (
          <div className="a-card" style={{ marginTop: 20 }}>
            <p className="a-p" style={{ fontSize: 17 }}>{res.receipt.market.question}</p>
            <div className="a-big" style={{ fontSize: 72 }}>{(f!.probabilityBps / 100).toFixed(f!.probabilityBps % 100 ? 2 : 0)}%</div>
            <p className="a-p" style={{ fontSize: 16 }}>
              {res.receipt.kind} call · market {res.receipt.market.resolution ? `went ${res.receipt.market.resolution}` : 'not settled yet'}
            </p>
            {!res.tampered ? (
              <button className="a-btn a-btn-line" style={{ marginTop: 16 }} onClick={() => run(`probabilityBps:${f!.probabilityBps > 5000 ? 2000 : 8000}`)} disabled={busy}>
                Try changing it to {f!.probabilityBps > 5000 ? 20 : 80}%
              </button>
            ) : (
              <button className="a-btn a-btn-line" style={{ marginTop: 16 }} onClick={() => run()} disabled={busy}>
                Put the real number back
              </button>
            )}
            <span style={{ marginLeft: 10, display: 'inline-block', marginTop: 16 }}>
              <ShareCall hash={hash} text="This call was sealed on Walrus before its market closed. Check it yourself:" />
            </span>
          </div>
        )}
      </div>
      <div>
        {res?.verification && (
          <div className="a-take">
            <b style={{ color: res.verification.status.startsWith('valid') ? '#7a4a0c' : '#a8352b' }}>
              {res.verification.status.startsWith('valid') ? 'Checks out on Sui' : res.tampered ? 'Edited: no longer matches what was sealed' : 'Does not check out'}
            </b>
            <ul className="a-checks">
              {res.verification.checks.map((c) => (
                <li key={c.id}>
                  <span>{c.ok === true ? '✓' : c.ok === false ? '✗' : '–'}</span>
                  <span>{LABEL[c.id] ?? c.id}</span>
                </li>
              ))}
            </ul>
            <p style={{ marginTop: 12, fontSize: 12 }}>
              Sui transaction{' '}
              <a href={suiscan(res.verification.commit.digest)} target="_blank" rel="noreferrer">
                {short(res.verification.commit.digest, 10)}
              </a>{' '}
              {res.verification.commit.checkpoint && `· checkpoint ${res.verification.commit.checkpoint}`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
