import type { Metadata } from 'next';
import { ReceiptView } from '@/components/receipts/receipt-view';
import { AdvisorTable, AppHeader, AuthCard, Field, MatchCard, PageTitle } from '@/components/receipts/shared';
import { Button, CardGrid, Container } from '@/components/ui/primitives';
import { FlowDemo } from './flow-demo';

/**
 * Living style guide: every app screen component with sample data. Codex builds the real routes
 * (/matchday, /m/[id], /r/[hash], /me, /login) by rendering these components with DB data (docs/DESIGN.md).
 */
export const metadata: Metadata = { title: 'Design system', robots: { index: false, follow: false } };

const label = (t: string) => (
  <div className="mono-label mb-6 flex items-center gap-4 text-muted">
    <span>{t}</span>
    <span className="h-px flex-1 bg-line" />
  </div>
);

export default function DesignPage() {
  return (
    <>
      <AppHeader handle="miracle" active="matchday" />
      <main className="bg-paper-2 py-12">
        <Container className="space-y-20">
          <section>
            {label('Matchday · /matchday')}
            <PageTitle eyebrow="Saturday · 4 matches" title="Make your calls before kickoff.">
              <Button variant="outline">Fair test: on</Button>
            </PageTitle>
            <CardGrid cols={3} className="mt-8">
              <MatchCard href="/design" league="Premier League" question="Will the home side win the derby on Saturday?" closesLabel="locks in 3h 12m" state={{ kind: 'open' }} />
              <MatchCard href="/design" league="LaLiga" question="Will the visitors win at the Bernabéu?" closesLabel="locks in 5h 40m" state={{ kind: 'blind', blindPct: 34 }} />
              <MatchCard href="/design" league="Serie A" question="Will the leaders win away?" closesLabel="locked" state={{ kind: 'complete', blindPct: 55, informedPct: 61 }} />
              <MatchCard href="/design" league="Bundesliga" question="Will the hosts win the Klassiker?" closesLabel="settled" state={{ kind: 'settled', delta: -0.084 }} />
              <MatchCard href="/design" league="Ligue 1" question="Will the champions win at home?" closesLabel="settled" state={{ kind: 'settled', delta: 0.112 }} />
              <MatchCard href="/design" league="Champions League" question="Will the home side win the opener?" closesLabel="closed" state={{ kind: 'closed' }} />
            </CardGrid>
          </section>

          <section>
            {label('Forecast flow · /m/[marketId] (interactive, fake actions)')}
            <FlowDemo />
          </section>

          <section id="receipt">
            {label('Receipt · /r/[hash]')}
            <ReceiptView
              kind="informed"
              status="verified"
              league="Premier League"
              question="Will the home side win the derby on Saturday?"
              namespace="rcpt1:ff8f5be99f5f:01f700c5f165:i:129581ba1aec53f51673f6627aa0fb322b01d79d2038081ee0bb5d93befae0d4"
              hash="129581ba1aec53f51673f6627aa0fb322b01d79d2038081ee0bb5d93befae0d4"
              commit={{ digest: '4xK2gvv6Gv3BYcbpDFP15pqMxLNxt3zuKsuamiUq9JBJ', checkpoint: '336,525,848', timeLabel: 'Sat 15:30:31 UTC' }}
              closeLabel="Sat 19:00 UTC"
              probabilityPct={80}
              checks={[
                { id: 'hash', ok: true, severity: 'hard', detail: 'sha256(JCS(forecast)) = 1295…e0d4' },
                { id: 'tags', ok: true, severity: 'hard', detail: 'user ff8f5be99f5f · market 01f700c5f165' },
                { id: 'label_in_tx', ok: true, severity: 'hard', detail: 'tx 4xK2gv… labelled blob 0x37bd…80e' },
                { id: 'tx_success', ok: true, severity: 'hard', detail: 'transaction succeeded' },
                { id: 'account', ok: true, severity: 'hard', detail: 'seal fence account = 0x49cb…cb5' },
                { id: 'owner', ok: true, severity: 'hard', detail: 'memwal_owner = 0x7643…451' },
                { id: 'before_close', ok: true, severity: 'timing', detail: 'committed 15:30:31 vs close 19:00:00' },
                { id: 'after_blind', ok: true, severity: 'note', detail: 'blind committed 15:29:02' },
                { id: 'untouched', ok: true, severity: 'note', detail: 'blob last modified by the commit tx' },
              ]}
              result={{ outcomeLabel: 'did not happen', brier: 0.64, delta: -0.3375 }}
              revealedJson={JSON.stringify({ schema: 'receipts.forecast.v1', kind: 'informed', outcome: 'Yes', probabilityBps: 8000, prev: '69110a5b…a46f', salt: '2222…2222' }, null, 2)}
            />
          </section>

          <section>
            {label('Who helps you · /me')}
            <PageTitle eyebrow="Your advisors · 72 settled tests" title="Whose advice moves you the right way." />
            <div className="mt-8">
              <AdvisorTable
                rows={[
                  { id: 'm', name: 'The market', kind: 'Polymarket price · Tatum', n: 38, fairTestN: 31, mean: 0.041, low: 0.019, high: 0.063, meanAbsMove: 0.11, verdict: 'helps_you' },
                  { id: 'c', name: '@crew_sam', kind: 'Crew take · sealed', n: 12, fairTestN: 9, mean: 0.022, low: -0.031, high: 0.075, meanAbsMove: 0.07, verdict: 'no_clear_effect' },
                  { id: 'p', name: '@loud_pundit', kind: 'Pundit take · pasted', n: 17, fairTestN: 6, mean: -0.052, low: -0.091, high: -0.013, meanAbsMove: 0.19, verdict: 'makes_you_worse' },
                  { id: 't', name: '@quiet_tipster', kind: 'Tipster take · sealed', n: 10, fairTestN: 10, mean: 0.002, low: -0.008, high: 0.012, meanAbsMove: 0.02, verdict: 'rarely_moves_you' },
                  { id: 'w', name: 'Whale 0x9f3…a1', kind: 'Top holder · Tatum', n: 5, fairTestN: 5, mean: 0.01, low: null, high: null, meanAbsMove: 0.05, verdict: 'not_enough_evidence' },
                ]}
              />
            </div>
          </section>

          <section>
            {label('Auth · /login, /signup')}
            <AuthCard title="Welcome back" footer={<>New here? <a className="border-b border-gold text-ink" href="/design">Create an account</a></>}>
              <Field label="Handle" name="handle" placeholder="miracle" autoComplete="username" />
              <Field label="Password" name="password" type="password" autoComplete="current-password" />
              <Button arrow className="w-full justify-between">Log in</Button>
            </AuthCard>
          </section>
        </Container>
      </main>
    </>
  );
}
