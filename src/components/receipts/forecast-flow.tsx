'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useMemo, useState, useTransition } from 'react';
import { Badge, Button, cn } from '@/components/ui/primitives';
import { ProbabilitySlider } from '@/components/ui/probability-slider';
import { MemoryCard, SealChip, VERDICT_UI, type RecalledMemory, type SealStatus, type Verdict } from './shared';

/**
 * The 3-step lock flow (docs/SPEC.md §5, /m/[marketId]). Presentational + local state only:
 * all side effects come in as props (server actions), so it renders the same in /design and in the app.
 *
 * Step 1 blind lock → Step 2 pick/reveal exactly one advice (fair test = random) → Step 3 informed lock.
 */

export interface FlowAdvisor {
  id: string;
  name: string;
  kind: 'market' | 'whale' | 'tipster' | 'crew' | 'pundit';
  verdict: Verdict;
  n: number;
  /** Latest lesson text for this advisor, if any (shown as a warning for bad/redundant advisors). */
  lesson?: string;
}

export interface AdviceContent {
  advisorId: string;
  title: string; // e.g. "The market says 62%"
  body?: string;
  source?: { label: string; href?: string };
  probabilityPct?: number | null;
  receiptHref?: string; // tipster takes have their own receipt
}

export interface PastedTake {
  handle: string;
  text: string;
  url?: string;
}

export interface ForecastFlowProps {
  market: { question: string; league: string; closesLabel: string; outcome: string; locked?: boolean };
  /** Ordered by the server (stats-driven, docs/MEMORY.md). The pasted-pundit option is added automatically. */
  advisors: FlowAdvisor[];
  memories: Record<string, RecalledMemory[]>;
  initial?: { step: 'blind' | 'advice' | 'informed' | 'done'; blindBps?: number; blindHash?: string; informedBps?: number; informedHash?: string; advice?: AdviceContent };
  actions: {
    lockBlind: (bps: number) => Promise<{ hash: string }>;
    reveal: (input: { advisorId: string; fairTest: boolean; pasted?: PastedTake }) => Promise<AdviceContent>;
    lockInformed: (bps: number) => Promise<{ hash: string }>;
    sealStatus?: (hash: string) => Promise<SealStatus>;
  };
}

const PASTE_ID = 'pundit:new';
const TERMINAL: SealStatus[] = ['verified', 'late', 'failed'];

function useSealStatus(hash: string | undefined, poll?: (h: string) => Promise<SealStatus>) {
  const [status, setStatus] = useState<SealStatus>('queued');
  useEffect(() => {
    if (!hash || !poll) return;
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = async (delay: number) => {
      try {
        const s = await poll(hash);
        if (stop) return;
        setStatus(s);
        if (TERMINAL.includes(s)) return;
      } catch {
        /* keep polling */
      }
      t = setTimeout(() => tick(Math.min(delay * 1.5, 15000)), delay);
    };
    tick(3000);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [hash, poll]);
  return status;
}

export function ForecastFlow({ market, advisors, memories, initial, actions }: ForecastFlowProps) {
  const [step, setStep] = useState(initial?.step ?? 'blind');
  const [blindBps, setBlindBps] = useState(initial?.blindBps ?? 5000);
  const [informedBps, setInformedBps] = useState(initial?.informedBps ?? initial?.blindBps ?? 5000);
  const [blindHash, setBlindHash] = useState(initial?.blindHash);
  const [informedHash, setInformedHash] = useState(initial?.informedHash);
  const [advice, setAdvice] = useState<AdviceContent | undefined>(initial?.advice);
  const [fairTest, setFairTest] = useState(true);
  const [chosen, setChosen] = useState<string | null>(null);
  const [pasted, setPasted] = useState<PastedTake>({ handle: '', text: '', url: '' });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const blindStatus = useSealStatus(blindHash, actions.sealStatus);
  const informedStatus = useSealStatus(informedHash, actions.sealStatus);
  const randomPool = useMemo(() => advisors.filter((a) => a.id !== PASTE_ID), [advisors]);
  const locked = market.locked;

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      }
    });

  const pickRandom = () => {
    const a = randomPool[Math.floor(Math.random() * randomPool.length)];
    setChosen(a?.id ?? null);
  };
  const chosenAdvisor = advisors.find((a) => a.id === chosen);

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
      <ol className="space-y-4">
        {/* ---------- STEP 1 ---------- */}
        <StepShell n={1} title="Your call, before any advice" state={step === 'blind' ? 'active' : 'done'} aside={blindHash && <SealChip status={blindStatus} />}>
          {step === 'blind' ? (
            <div className="space-y-7">
              <ProbabilitySlider valueBps={blindBps} onChange={setBlindBps} outcome={market.outcome} disabled={locked || pending} label={`Chance of “${market.outcome}”`} />
              <div className="flex flex-wrap items-center gap-4">
                <Button arrow disabled={locked || pending} onClick={() => run(async () => {
                  const r = await actions.lockBlind(blindBps);
                  setBlindHash(r.hash);
                  setInformedBps(blindBps);
                  setStep('advice');
                })}>
                  {pending ? 'Sealing…' : 'Lock my call'}
                </Button>
                <span className="text-[13px] text-muted">The market price stays hidden until you lock.</span>
              </div>
            </div>
          ) : (
            <p className="text-[15px]">
              You said <strong className="font-semibold">{Math.round(blindBps / 100)}%</strong>, sealed before seeing anything.
            </p>
          )}
        </StepShell>

        {/* ---------- STEP 2 ---------- */}
        <StepShell n={2} title="Read exactly one piece of advice" state={step === 'advice' ? 'active' : step === 'blind' ? 'todo' : 'done'}>
          {step === 'advice' && (
            <div className="space-y-6">
              <label className="flex cursor-pointer items-center justify-between gap-4 border border-line bg-paper-2 px-4 py-3">
                <span>
                  <span className="text-[14.5px] font-medium">Fair test</span>
                  <span className="block text-[12.5px] text-muted">Receipts picks the advisor at random, so your stats stay honest.</span>
                </span>
                <input type="checkbox" className="size-5 accent-[var(--gold)]" checked={fairTest} onChange={(e) => { setFairTest(e.target.checked); setChosen(null); }} />
              </label>

              {fairTest ? (
                !chosen && (
                  <Button variant="gold" onClick={pickRandom} disabled={!randomPool.length}>
                    Pick my advisor at random
                  </Button>
                )
              ) : (
                <div className="grid gap-px border border-line bg-line sm:grid-cols-2" role="radiogroup" aria-label="Choose an advisor">
                  {[...advisors, { id: PASTE_ID, name: 'Paste a take', kind: 'pundit' as const, verdict: 'not_enough_evidence' as const, n: 0 }].map((a) => (
                    <button
                      key={a.id}
                      role="radio"
                      aria-checked={chosen === a.id}
                      onClick={() => setChosen(a.id)}
                      className={cn('flex flex-col items-start gap-2 bg-white p-4 text-left transition-colors hover:bg-gold-wash', chosen === a.id && 'bg-gold-wash shadow-[inset_0_0_0_2px_var(--gold)]')}
                    >
                      <span className="text-[14.5px] font-medium">{a.name}</span>
                      <span className="flex items-center gap-2">
                        <span className="mono-label text-faint">{a.kind}</span>
                        {a.id !== PASTE_ID && <Badge tone={VERDICT_UI[a.verdict].tone}>{VERDICT_UI[a.verdict].short}</Badge>}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {chosen && chosen !== PASTE_ID && chosenAdvisor && (
                <div className="space-y-4">
                  {fairTest && (
                    <p className="text-[14px]">
                      Random pick: <strong className="font-semibold">{chosenAdvisor.name}</strong>
                    </p>
                  )}
                  {(chosenAdvisor.verdict === 'makes_you_worse' || chosenAdvisor.verdict === 'rarely_moves_you') && chosenAdvisor.lesson && (
                    <div className="border-l-[3px] border-bad bg-bad-wash px-4 py-3 text-[13.5px] text-ink-2">
                      <strong className="font-semibold">Heads up.</strong> {chosenAdvisor.lesson}
                    </div>
                  )}
                  <MemoryCard advisorName={chosenAdvisor.name} items={memories[chosenAdvisor.id] ?? []} />
                  <Button arrow disabled={pending} onClick={() => run(async () => {
                    setAdvice(await actions.reveal({ advisorId: chosenAdvisor.id, fairTest }));
                    setStep('informed');
                  })}>
                    {pending ? 'Opening…' : 'Reveal the advice'}
                  </Button>
                </div>
              )}

              {chosen === PASTE_ID && (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      setAdvice(await actions.reveal({ advisorId: `pundit:${pasted.handle.trim().toLowerCase()}`, fairTest: false, pasted }));
                      setStep('informed');
                    });
                  }}
                >
                  <input required placeholder="@handle" value={pasted.handle} onChange={(e) => setPasted({ ...pasted, handle: e.target.value })} className="h-11 w-full border border-line-strong px-3 text-[14.5px] focus:border-ink focus:outline-none" />
                  <textarea required maxLength={1000} rows={4} placeholder="Paste the take exactly as you read it" value={pasted.text} onChange={(e) => setPasted({ ...pasted, text: e.target.value })} className="w-full border border-line-strong p-3 text-[14.5px] focus:border-ink focus:outline-none" />
                  <input type="url" placeholder="Link (optional)" value={pasted.url} onChange={(e) => setPasted({ ...pasted, url: e.target.value })} className="h-11 w-full border border-line-strong px-3 text-[14.5px] focus:border-ink focus:outline-none" />
                  <Button type="submit" arrow disabled={pending}>Use this take</Button>
                </form>
              )}
            </div>
          )}
          {(step === 'informed' || step === 'done') && advice && <AdviceBox advice={advice} />}
        </StepShell>

        {/* ---------- STEP 3 ---------- */}
        <StepShell n={3} title="Your call, after the advice" state={step === 'informed' ? 'active' : step === 'done' ? 'done' : 'todo'} aside={informedHash && <SealChip status={informedStatus} />}>
          {step === 'informed' && (
            <div className="space-y-7">
              <ProbabilitySlider valueBps={informedBps} onChange={setInformedBps} outcome={market.outcome} disabled={pending} compareBps={blindBps} label="After reading it" />
              <div className="flex flex-wrap gap-3">
                <Button arrow disabled={pending} onClick={() => run(async () => {
                  const r = await actions.lockInformed(informedBps);
                  setInformedHash(r.hash);
                  setStep('done');
                })}>
                  {pending ? 'Sealing…' : 'Lock it'}
                </Button>
                <Button variant="outline" disabled={pending} onClick={() => setInformedBps(blindBps)}>
                  Unchanged ({Math.round(blindBps / 100)}%)
                </Button>
              </div>
            </div>
          )}
          {step === 'done' && (
            <div className="space-y-4">
              <p className="text-[15px]">
                {Math.round(blindBps / 100)}% → <strong className="font-semibold">{Math.round(informedBps / 100)}%</strong>. Both calls are sealed. Scores arrive when the market resolves.
              </p>
              <div className="flex flex-wrap gap-3 text-[14px]">
                {blindHash && <Link className="border-b border-gold" href={`/r/${blindHash}`}>Blind receipt →</Link>}
                {informedHash && <Link className="border-b border-gold" href={`/r/${informedHash}`}>Informed receipt →</Link>}
              </div>
            </div>
          )}
        </StepShell>
        {error && <p role="alert" className="border-l-[3px] border-bad bg-bad-wash px-4 py-3 text-[14px] text-bad">{error}</p>}
      </ol>

      {/* ---------- SIDE ---------- */}
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="border border-line bg-white p-5">
          <div className="mono-label text-faint">{market.league}</div>
          <p className="mt-3 text-[17px] font-semibold leading-snug">{market.question}</p>
          <p className="mt-4 font-mono text-[12px] text-muted">{market.closesLabel}</p>
        </div>
        <div className="border border-line bg-paper-2 p-5 text-[13px] leading-6 text-muted">
          <strong className="font-semibold text-ink">How this is scored.</strong> When the market resolves, both calls get a Brier score. If your second call is closer to
          what happened, that advice helped you this time. Verdicts need at least eight tests.
        </div>
      </aside>
    </div>
  );
}

function StepShell({ n, title, state, aside, children }: { n: number; title: string; state: 'todo' | 'active' | 'done'; aside?: ReactNode; children?: ReactNode }) {
  return (
    <li className={cn('border transition-colors', state === 'active' ? 'border-ink bg-white' : 'border-line', state === 'todo' ? 'bg-paper-2 text-muted' : 'bg-white')} aria-current={state === 'active' ? 'step' : undefined}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="flex items-center gap-4">
          <span className={cn('grid size-8 place-items-center font-mono text-[13px]', state === 'done' ? 'bg-gold text-ink' : state === 'active' ? 'bg-ink text-white' : 'border border-line-strong bg-white text-muted')}>
            {state === 'done' ? '✓' : String(n).padStart(2, '0')}
          </span>
          <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{title}</h2>
        </div>
        {aside}
      </div>
      {state !== 'todo' && children && <div className="px-5 py-6 sm:px-6">{children}</div>}
    </li>
  );
}

function AdviceBox({ advice }: { advice: AdviceContent }) {
  return (
    <div className="border border-gold bg-white p-5 shadow-[inset_3px_0_0_var(--gold)]" style={{ animation: 'rise .6s var(--ease-out-expo) both' }}>
      <p className="text-[18px] font-semibold tracking-[-0.01em]">{advice.title}</p>
      {advice.body && <p className="mt-2 whitespace-pre-line text-[14.5px] leading-7 text-ink-2">{advice.body}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[11.5px] text-muted">
        {advice.source && (advice.source.href ? <a className="border-b border-gold" href={advice.source.href} target="_blank" rel="noreferrer">{advice.source.label}</a> : <span>{advice.source.label}</span>)}
        {advice.receiptHref && <Link className="border-b border-gold" href={advice.receiptHref}>their receipt →</Link>}
      </div>
    </div>
  );
}
