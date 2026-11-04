'use client';
import { useEffect, useState } from 'react';
import { suiscan } from './names';

interface Item {
  kind: 'seal' | 'episode' | 'lesson';
  namespace: string;
  text: string;
  blobId: string | null;
  at: string;
  digest: string | null;
}

const KIND = { seal: 'Sealed calls', episode: 'Episode', lesson: 'Lesson' };

/** Everything the arena wrote to Walrus Memory, newest first, each with a link to its blob. */
export function MemoryLog() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [kind, setKind] = useState<'all' | Item['kind']>('all');
  useEffect(() => {
    fetch('/api/arena/memories')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setItems(j.items))
      .catch(() => setItems([]));
  }, []);
  if (!items) return <p className="a-p">Loading memories…</p>;
  const shown = items.filter((i) => kind === 'all' || i.kind === kind);
  return (
    <>
      <div className="a-steps-mini" role="group" aria-label="Filter by kind">
        {(['all', 'seal', 'episode', 'lesson'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={kind === k ? 'is-on' : ''} style={{ border: 0, font: 'inherit', cursor: 'pointer', padding: '6px 14px', borderRadius: 999, background: kind === k ? 'var(--blue)' : 'var(--paper-2)', color: kind === k ? '#fff' : 'inherit' }}>
            {k === 'all' ? 'All' : KIND[k]}
          </button>
        ))}
      </div>
      <ul className="a-mem">
        {shown.map((i, n) => (
          <li key={`${i.namespace}${n}`}>
            <span className={`k ${i.kind}`}>{KIND[i.kind]}</span>
            <span>
              {i.text}
              <small>
                {new Date(i.at).toUTCString().slice(5, 22)} UTC, namespace {i.namespace}
              </small>
            </span>
            <span>
              {i.blobId && (
                <a href={`https://walruscan.com/mainnet/blob/${i.blobId}`} target="_blank" rel="noreferrer">
                  Walrus blob
                </a>
              )}
              {i.digest && (
                <>
                  {' '}
                  <a href={suiscan(i.digest)} target="_blank" rel="noreferrer">
                    Sui tx
                  </a>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
