import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Logo } from '@/components/marketing/chrome';
import { Badge, type BadgeTone, cn, Container, IntervalBar } from '@/components/ui/primitives';

/* ---------------- verdicts (docs/SPEC.md §5) ---------------- */

export type Verdict = 'not_enough_evidence' | 'helps_you' | 'makes_you_worse' | 'rarely_moves_you' | 'no_clear_effect';
export const VERDICT_UI: Record<Verdict, { tone: BadgeTone; short: string; copy: (n: number) => string }> = {
  not_enough_evidence: { tone: 'neutral', short: 'Not enough evidence', copy: (n) => `Not enough evidence yet (${n} of 8)` },
  helps_you: { tone: 'good', short: 'Helps you', copy: () => 'Reading them has improved your forecasts' },
  makes_you_worse: { tone: 'bad', short: 'Makes you worse', copy: () => 'Reading them has made your forecasts worse' },
  rarely_moves_you: { tone: 'warn', short: 'Rarely moves you', copy: () => 'Rarely changes your mind: probably redundant for you' },
  no_clear_effect: { tone: 'neutral', short: 'No clear effect', copy: () => 'No clear effect yet' },
};
export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const v = VERDICT_UI[verdict];
  return <Badge tone={v.tone}>{v.short}</Badge>;
}

/* ---------------- seal status chip ---------------- */

export type SealStatus = 'queued' | 'accepted' | 'stored' | 'onchain' | 'verified' | 'late' | 'failed';
const SEAL_UI: Record<SealStatus, { tone: BadgeTone; label: string; busy?: boolean }> = {
  queued: { tone: 'dashed', label: 'Queued', busy: true },
  accepted: { tone: 'dashed', label: 'Sealing', busy: true },
  stored: { tone: 'neutral', label: 'On Walrus', busy: true },
  onchain: { tone: 'neutral', label: 'On Sui', busy: true },
  verified: { tone: 'good', label: 'Verified ✓' },
  late: { tone: 'warn', label: 'Late' },
  failed: { tone: 'bad', label: 'Failed' },
};
export function SealChip({ status, className }: { status: SealStatus; className?: string }) {
  const s = SEAL_UI[status];
  return (
    <Badge tone={s.tone} className={className} aria-live="polite">
      {s.busy && <span aria-hidden className="live-dot size-1.5 bg-gold" />}
      {s.label}
    </Badge>
  );
}

/* ---------------- app chrome ---------------- */

export function AppHeader({ handle, active }: { handle?: string; active?: 'matchday' | 'me' | 'verify' }) {
  const item = (href: string, label: string, key: typeof active) => (
    <Link
      href={href}
      className={cn('px-3 py-2 text-[14px] transition-colors', active === key ? 'bg-ink text-white' : 'text-ink-2 hover:bg-paper-2')}
      aria-current={active === key ? 'page' : undefined}
    >
      {label}
    </Link>
  );
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/85 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav className="flex items-center gap-1 overflow-x-auto" aria-label="App">
          {item('/matchday', 'Matchday', 'matchday')}
          {item('/me', 'Who helps you', 'me')}
          {item('/verify', 'Verify', 'verify')}
          {handle ? (
            <Link href={`/u/${handle}`} className="ml-2 hidden border border-line px-3 py-2 font-mono text-[12.5px] sm:block">
              @{handle}
            </Link>
          ) : (
            <Link href="/login" className="ml-2 bg-gold px-3 py-2 text-[14px] font-medium text-ink">
              Log in
            </Link>
          )}
        </nav>
      </Container>
    </header>
  );
}

export function PageTitle({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-line pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mono-label flex items-center gap-2.5 text-muted">
          <span aria-hidden className="size-2 bg-gold" />
          {eyebrow}
        </div>
        <h1 className="h2 mt-4 text-[34px] sm:text-[44px]">{title}</h1>
      </div>
      {children}
    </div>
  );
}

/* ---------------- matchday card ---------------- */

export type MatchState =
  | { kind: 'open' }
  | { kind: 'blind'; blindPct: number }
  | { kind: 'complete'; blindPct: number; informedPct: number }
  | { kind: 'settled'; delta: number }
  | { kind: 'closed' };

export function MatchCard({ href, league, question, closesLabel, state }: { href: string; league: string; question: string; closesLabel: string; state: MatchState }) {
  const right = (() => {
    switch (state.kind) {
      case 'open':
        return <span className="text-[13px] font-medium text-ink">Make your call →</span>;
      case 'blind':
        return <Badge tone="dashed">Blind {state.blindPct}% · read advice</Badge>;
      case 'complete':
        return <Badge tone="neutral">{state.blindPct}% → {state.informedPct}%</Badge>;
      case 'settled':
        return <Badge tone={state.delta > 0 ? 'good' : state.delta < 0 ? 'bad' : 'neutral'}>{`${state.delta > 0 ? '+' : ''}${state.delta.toFixed(3)}`}</Badge>;
      case 'closed':
        return <Badge>Closed</Badge>;
    }
  })();
  return (
    <Link href={href} data-reveal className="group flex flex-col gap-5 bg-white p-6 transition-colors hover:bg-gold-wash">
      <div className="flex items-center justify-between gap-3">
        <span className="mono-label text-faint">{league}</span>
        <span className="font-mono text-[11.5px] text-muted">{closesLabel}</span>
      </div>
      <p className="text-[17px] font-semibold leading-snug tracking-[-0.01em]">{question}</p>
      <div className="mt-auto flex items-center justify-between border-t border-line pt-4">
        {right}
        <span aria-hidden className="size-2 bg-line transition-colors group-hover:bg-gold" />
      </div>
    </Link>
  );
}

/* ---------------- advisor table (who helps you) ---------------- */

export interface AdvisorRow {
  id: string;
  name: string;
  kind: string;
  n: number;
  fairTestN?: number;
  mean: number | null;
  low: number | null;
  high: number | null;
  meanAbsMove?: number | null;
  verdict: Verdict;
}

export function AdvisorTable({ rows, range = 0.12 }: { rows: AdvisorRow[]; range?: number }) {
  return (
    <div className="border border-line" role="table" aria-label="Who helps you">
      <div role="row" className="mono-label hidden grid-cols-[1.4fr_0.6fr_2fr_0.6fr_1fr] gap-6 border-b border-line bg-paper-2 px-6 py-3 text-faint md:grid">
        <span role="columnheader">Advisor</span>
        <span role="columnheader">Tests</span>
        <span role="columnheader">Change in your score (95% interval)</span>
        <span role="columnheader">Typical move</span>
        <span role="columnheader">Verdict</span>
      </div>
      {rows.map((a, i) => (
        <div
          key={a.id}
          role="row"
          data-reveal
          style={{ ['--d' as string]: i }}
          className="grid grid-cols-2 items-center gap-x-6 gap-y-3 border-b border-line px-6 py-5 last:border-b-0 md:grid-cols-[1.4fr_0.6fr_2fr_0.6fr_1fr]"
        >
          <div role="cell">
            <div className="text-[15px] font-medium">{a.name}</div>
            <div className="text-[12.5px] text-muted">{a.kind}</div>
          </div>
          <div role="cell" className="text-right font-mono text-[13px] tabular-nums md:text-left">
            n = {a.n}
            {a.fairTestN !== undefined && <span className="block text-[11px] text-faint">{a.fairTestN} fair</span>}
          </div>
          <div role="cell" className="col-span-2 flex items-center gap-4 md:col-span-1">
            <IntervalBar mean={a.mean} low={a.low} high={a.high} range={range} />
            <span className="w-14 shrink-0 text-right font-mono text-[12.5px] tabular-nums text-ink-2">
              {a.mean === null ? '—' : `${a.mean > 0 ? '+' : ''}${a.mean.toFixed(3)}`}
            </span>
          </div>
          <div role="cell" className="font-mono text-[12.5px] tabular-nums text-muted">
            {a.meanAbsMove == null ? '—' : `${Math.round(a.meanAbsMove * 100)} pts`}
          </div>
          <div role="cell" className="col-span-2 md:col-span-1">
            <VerdictBadge verdict={a.verdict} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- memory card (recalled from Walrus Memory) ---------------- */

export interface RecalledMemory {
  text: string;
  blobId: string;
  kind: 'episode' | 'lesson';
  when: string;
}

export function MemoryCard({ advisorName, items }: { advisorName: string; items: RecalledMemory[] }) {
  return (
    <div className="border border-gold-line bg-gold-wash p-5" data-reveal>
      <div className="mono-label flex items-center justify-between gap-3 text-gold-ink">
        <span className="flex items-center gap-2">
          <span aria-hidden className="size-2 bg-gold" />
          Before you read {advisorName}
        </span>
        <span className="text-faint">from Walrus Memory</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-[14px] text-muted">No history with this advisor yet. This test starts it.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gold-line">
          {items.map((m) => (
            <li key={m.blobId} className="py-3 text-[14px] leading-6 text-ink-2">
              <span className={cn('mr-2 font-mono text-[10.5px] uppercase', m.kind === 'lesson' ? 'text-gold-ink' : 'text-faint')}>{m.kind}</span>
              {m.text}
              <span className="mt-1 block font-mono text-[11px] text-faint">
                {m.when} · blob {m.blobId.slice(0, 10)}…
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- auth card ---------------- */

export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[420px] border border-line bg-white p-8 shadow-[0_30px_60px_-30px_rgba(20,15,0,0.25)]">
      <Logo />
      <h1 className="h2 mt-8 text-[30px]">{title}</h1>
      <div className="mt-6 space-y-4">{children}</div>
      {footer && <div className="mt-6 border-t border-line pt-5 text-[13.5px] text-muted">{footer}</div>}
    </div>
  );
}

export function Field({ label, hint, ...p }: ComponentPropsWithoutRef<'input'> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mono-label text-muted">{label}</span>
      <input
        className="mt-2 h-12 w-full border border-line-strong bg-white px-3.5 text-[15px] outline-none transition-colors placeholder:text-faint focus:border-ink"
        {...p}
      />
      {hint && <span className="mt-1.5 block text-[12px] text-faint">{hint}</span>}
    </label>
  );
}
