import type { ReactNode } from 'react';
import { Badge, cn, Hash } from '@/components/ui/primitives';
import { SealChip, type SealStatus } from './shared';

/** Mirrors src/core/evidence.ts `Check` so verification results render directly. */
export interface ReceiptCheck {
  id: string;
  ok: boolean | null;
  severity: 'hard' | 'timing' | 'note';
  detail: string;
}

const CHECK_LABEL: Record<string, string> = {
  hash: 'Hash matches the sealed namespace',
  tags: 'User and market tags match',
  label_in_tx: 'Commit transaction wrote this namespace',
  tx_success: 'Transaction succeeded',
  account: 'Written through Receipts’ Walrus Memory account',
  owner: 'Owner label and recipient match',
  before_close: 'Sealed before the market closed',
  after_blind: 'Sealed after the blind call',
  untouched: 'Blob unchanged since commit',
  alive: 'Blob storage still paid for',
};

export interface ReceiptViewProps {
  kind: 'blind' | 'informed' | 'take';
  status: SealStatus;
  question: string;
  league?: string;
  namespace: string;
  hash: string;
  commit?: { digest: string; checkpoint: string | null; timeLabel: string } | null;
  closeLabel: string;
  checks: ReceiptCheck[];
  /** Canonical JSON once revealed; null while sealed. */
  revealedJson?: string | null;
  /** Probability shown only to the owner before reveal, or to everyone after. */
  probabilityPct?: number | null;
  result?: { outcomeLabel: string; brier: number; delta?: number | null } | null;
  footer?: ReactNode;
}

const KIND_LABEL = { blind: 'Blind call', informed: 'Informed call', take: 'Tipster take' } as const;

export function ReceiptView(p: ReceiptViewProps) {
  return (
    <article className="relative mx-auto w-full max-w-[640px] bg-white shadow-[0_40px_80px_-40px_rgba(20,15,0,0.35)]" aria-label="Receipt">
      <div className="border border-line px-6 pt-7 pb-8 sm:px-9">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[12px] font-semibold tracking-[0.16em]">RECEIPT · {KIND_LABEL[p.kind].toUpperCase()}</div>
            {p.league && <div className="mono-label mt-2 text-faint">{p.league}</div>}
          </div>
          <SealChip status={p.status} />
        </header>
        <h1 className="mt-6 text-[22px] font-semibold leading-snug tracking-[-0.02em]">{p.question}</h1>

        <dl className="mt-6 grid grid-cols-2 gap-px border border-line bg-line font-mono text-[12.5px]">
          <Cell k="call" v={p.probabilityPct == null ? 'sealed' : `${p.probabilityPct}%`} big />
          <Cell k="market closes" v={p.closeLabel} />
          <Cell k="sealed at (Sui)" v={p.commit?.timeLabel ?? 'pending'} />
          <Cell k="checkpoint" v={p.commit?.checkpoint ?? '—'} />
        </dl>

        <div className="mt-6 space-y-2 font-mono text-[11.5px] text-muted">
          <div className="break-all">
            <span className="text-faint">namespace </span>
            {p.namespace}
          </div>
          {p.commit && (
            <div>
              <span className="text-faint">sui tx </span>
              <Hash value={p.commit.digest} href={`https://suiscan.xyz/mainnet/tx/${p.commit.digest}`} head={10} tail={6} />
            </div>
          )}
        </div>

        <div className="my-7 border-t border-dashed border-line-strong" />

        <h2 className="mono-label text-muted">Verification · via Tatum Sui gRPC</h2>
        <ul className="mt-3">
          {p.checks.map((c, i) => (
            <li key={c.id} className="flex items-start gap-3 border-b border-line py-2.5 text-[13.5px] last:border-b-0" data-reveal style={{ ['--d' as string]: i }}>
              <span
                aria-label={c.ok === true ? 'passed' : c.ok === false ? 'failed' : 'unknown'}
                className={cn(
                  'mt-0.5 grid size-5 shrink-0 place-items-center font-mono text-[11px] font-bold',
                  c.ok === true && 'bg-good-wash text-good',
                  c.ok === false && (c.severity === 'hard' ? 'bg-bad-wash text-bad' : 'bg-warn-wash text-warn'),
                  c.ok === null && 'bg-paper-2 text-faint',
                )}
              >
                {c.ok === true ? '✓' : c.ok === false ? '✕' : '?'}
              </span>
              <span className="flex-1">
                <span className="text-ink">{CHECK_LABEL[c.id] ?? c.id}</span>
                <span className="block font-mono text-[11px] text-faint">{c.detail}</span>
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">{c.severity}</span>
            </li>
          ))}
        </ul>

        {p.result && (
          <dl className="mt-7 grid grid-cols-3 gap-px border border-line bg-line font-mono text-[12.5px]">
            <Cell k="result" v={p.result.outcomeLabel} />
            <Cell k="brier" v={p.result.brier.toFixed(3)} />
            <Cell k="advice effect" v={p.result.delta == null ? '—' : `${p.result.delta > 0 ? '+' : ''}${p.result.delta.toFixed(3)}`} />
          </dl>
        )}

        {p.revealedJson ? (
          <details className="mt-7 border border-line">
            <summary className="flex items-center justify-between px-4 py-3 text-[13.5px] font-medium">
              Revealed forecast (canonical JSON)
              <Badge>recompute the hash</Badge>
            </summary>
            <pre className="overflow-x-auto border-t border-line bg-paper-2 p-4 font-mono text-[11.5px] leading-5">{p.revealedJson}</pre>
          </details>
        ) : (
          <p className="mt-7 bg-paper-2 px-4 py-3 text-[13px] text-muted">Sealed. The forecast is revealed after the market closes; only the hash is public until then.</p>
        )}
        {p.footer}
      </div>
      <div
        aria-hidden
        className="absolute inset-x-0 -bottom-[7px] h-[8px]"
        style={{ background: 'radial-gradient(circle at 5px 0, transparent 4.5px, #fff 5px) 0 0 / 10px 8px repeat-x' }}
      />
    </article>
  );
}

function Cell({ k, v, big }: { k: string; v: ReactNode; big?: boolean }) {
  return (
    <div className="bg-white px-4 py-3">
      <dt className="text-[10.5px] uppercase tracking-[0.1em] text-faint">{k}</dt>
      <dd className={cn('mt-1 text-ink', big && 'font-sans text-[28px] font-medium tracking-[-0.03em]')}>{v}</dd>
    </div>
  );
}
