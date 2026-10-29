import type { Metadata } from 'next';
import { SiteFooter, SiteNav } from '@/components/marketing/chrome';
import { HeroReceipt } from '@/components/marketing/hero-receipt';
import { Landscape } from '@/components/marketing/landscape';
import { Parallax } from '@/components/marketing/parallax';
import {
  Accent,
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardGrid,
  CardIndex,
  CardTitle,
  Container,
  d,
  Eyebrow,
  Faq,
  H2,
  Hash,
  IntervalBar,
  Lede,
  Muted,
  Section,
  SectionHead,
  Stat,
  Tag,
  Terminal,
} from '@/components/ui/primitives';

export const metadata: Metadata = {
  title: { absolute: 'Receipts: whose advice actually makes you better' },
};

/**
 * Marketing landing page. Fully static (prerendered); the only client JS is <Parallax> (≈0.5 kB) and the inline reveal script.
 * M5+: replace EXAMPLE_SEALS with the latest verified seals from the DB (keep the same shape) and drop the "example" badges.
 */
const EXAMPLE_SEALS = [
  { what: 'Blind call sealed', detail: 'User locks 55% on a home win before seeing any advice', hash: '69110a5b19b0eaf3268be64593159e1a62445f6d853b4fdb4246856f3ce4a46f' },
  { what: 'Informed call sealed', detail: 'After one fair-test pundit take: 80%, chained to the blind seal', hash: '129581ba1aec53f51673f6627aa0fb322b01d79d2038081ee0bb5d93befae0d4' },
  { what: 'Tipster take sealed', detail: 'A tipster publishes 64% on an away win, 2 h before close', hash: '7c1e0b2d9a44f2c1e58f6a3b0d2c9e7f1a4b6c8d0e2f4a6b8c0d2e4f6a8b0c2d' },
  { what: 'Market resolved', detail: 'Tatum Prediction API reports the outcome; both calls get Brier scores', hash: 'resolution:polymarket:uma' },
  { what: 'Lesson remembered', detail: '“Reading @pundit made your forecasts worse (n = 9)” written to Walrus Memory', hash: 'lesson1:ff8f5be99f5f' },
];

const ADVISOR_DEMO = [
  { name: 'The market', kind: 'Polymarket price · Tatum', n: 38, mean: 0.041, low: 0.019, high: 0.063, verdict: ['good', 'Helps you'] as const },
  { name: '@crew_sam', kind: 'Crew take · sealed', n: 12, mean: 0.022, low: -0.031, high: 0.075, verdict: ['neutral', 'No clear effect'] as const },
  { name: '@loud_pundit', kind: 'Pundit take · pasted', n: 17, mean: -0.052, low: -0.091, high: -0.013, verdict: ['bad', 'Makes you worse'] as const },
  { name: 'Whale 0x9f3…a1', kind: 'Top holder · Tatum', n: 5, mean: 0.01, low: null, high: null, verdict: ['neutral', 'Not enough evidence'] as const },
];

export default function Home() {
  return (
    <>
      <SiteNav />
      <main id="main">
        {/* ---------------- HERO ---------------- */}
        <Parallax className="relative isolate min-h-[100svh] overflow-hidden">
          <Landscape className="absolute inset-0 -z-10 h-full w-full" />
          <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-[42%] bg-gradient-to-t from-black/55 via-black/15 to-transparent" />
          <div className="pointer-events-none absolute right-[max(2rem,calc((100vw-1200px)/2+2rem))] top-[44%] hidden xl:block">
            <HeroReceipt />
          </div>
          <Container className="flex min-h-[100svh] flex-col pt-32 pb-10 sm:pt-40">
            <div className="enter" style={d(0)}>
              <Tag>Sealed on Walrus Memory · verified through Tatum</Tag>
            </div>
            <h1 className="display mt-8 text-[42px] sm:text-[68px] lg:text-[88px]">
              <span className="enter-solid block" style={d(1)}>Everyone remembers</span>
              <span className="enter-solid block text-[#575b63]" style={d(2)}>their wins.</span>
              <span className="enter-solid block" style={d(3)}>
                <Accent>We keep receipts.</Accent>
              </span>
            </h1>
            <div className="enter mt-10 flex flex-wrap gap-3" style={d(4)}>
              <ButtonLink href="/signup" arrow>
                Start forecasting
              </ButtonLink>
              <ButtonLink href="#how" variant="glass">
                See how it works
              </ButtonLink>
            </div>
            <div className="mt-auto flex flex-col items-start justify-between gap-10 pt-16 lg:flex-row lg:items-end">
              <p className="enter-solid max-w-[36rem] text-[16px] leading-7 text-white/90 sm:text-[18px] sm:leading-8" style={d(5)}>
                Lock your call before you read a tip, lock it again after, and let the results show whose advice actually
                makes <em className="not-italic text-gold">you</em> better: the market, onchain whales, tipsters, your crew. Every call is
                sealed before kickoff and checkable by anyone.
              </p>

            </div>
          </Container>
        </Parallax>

        {/* ---------------- INTRO + FLOW ---------------- */}
        <Section className="border-t-0">
          <Container>
            <div className="space-y-8">
              <div data-reveal>
                <Tag className="bg-white">Built for Total Recall · Markets &amp; Sports Prediction</Tag>
              </div>
              <H2 className="max-w-[22ch]">
                Advice is cheap. <Muted>Knowing which advice</Muted> <Accent>moves you the right way</Accent> isn’t.
              </H2>
              <Lede className="max-w-[40rem]">
                Receipts runs a tiny experiment every time you forecast. You call it blind, read exactly one piece of advice,
                and call it again. When the market resolves, both calls are scored. Over weeks, the gap between them tells you
                which voices sharpen your judgement and which ones just feel convincing.
              </Lede>
            </div>

            <div className="mt-14 grid gap-3 lg:grid-cols-[1fr_auto_1.1fr_auto_1fr] lg:items-center">
              <FlowCard label="You · step 1" title="Blind call" items={['Probability before any advice', 'Market price hidden', 'Sealed on Walrus Memory']} i={0} />
              <Connector top="hash ⇢ namespace" bottom="committed through Walrus, on Sui" />
              <FlowCard
                highlight
                label="Advice · one, at random"
                title="Then you read one take"
                items={['The market, a whale, a tipster, your crew or a pundit', 'Chosen at random in fair-test mode', 'Second call sealed and chained to the first']}
                i={1}
              />
              <Connector top="Tatum Prediction API" bottom="resolves → both calls scored" />
              <FlowCard label="Memory · over time" title="Who helps you" items={['Brier before vs after, per advisor', '95% intervals, never a guess', 'Lessons stored in Walrus Memory']} i={2} />
            </div>

            <CardGrid cols={4} className="mt-14">
              <Stat value="2" label="seals per forecast: blind and informed" style={d(0)} />
              <Stat value="10" label="checks behind every receipt" style={d(1)} />
              <Stat value="8" label="settled tests before any verdict" style={d(2)} />
              <Stat value="0" label="silent edits once a call is sealed" style={d(3)} />
            </CardGrid>
          </Container>
        </Section>

        {/* ---------------- PROOF TABLE ---------------- */}
        <Section id="proof">
          <Container>
            <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:items-end">
              <div className="space-y-6">
                <div className="mono-label flex items-center gap-3 text-muted" data-reveal>
                  <span aria-hidden className="live-dot size-2 bg-gold" />
                  <span className="font-semibold text-ink">Sui mainnet</span>
                  <span aria-hidden className="h-px w-8 bg-line-strong" />
                  <span>Onchain proof</span>
                </div>
                <H2>
                  Not a screenshot. <Muted>Calls you</Muted> <Accent>can’t quietly edit.</Accent>
                </H2>
              </div>
              <Lede className="lg:justify-self-end">
                Each call is hashed and committed through Walrus Memory before the market closes. After close it is revealed, and
                anyone can re-check the hash against Sui’s transaction history through Tatum. Change one digit and the receipt fails.
              </Lede>
            </div>
            <div className="mt-12 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-[14px]">
                <thead>
                  <tr className="mono-label border-b border-line text-faint">
                    <th className="py-3 pr-6 font-normal">What happened</th>
                    <th className="py-3 pr-6 font-normal">Details</th>
                    <th className="py-3 font-normal">
                      Reference <Badge className="ml-2 h-5">example</Badge>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {EXAMPLE_SEALS.map((r, i) => (
                    <tr key={r.what} className="border-b border-line" data-reveal style={d(i)}>
                      <td className="py-4 pr-6 font-medium text-ink">{r.what}</td>
                      <td className="py-4 pr-6 text-muted">{r.detail}</td>
                      <td className="py-4">
                        <Hash value={r.hash} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Container>
        </Section>

        {/* ---------------- 01 PROBLEM ---------------- */}
        <Section>
          <Container>
            <SectionHead
              index="01"
              label="The problem"
              title={
                <>
                  Everyone has a hot take. Nobody keeps score of <Accent>what it did to you.</Accent>
                </>
              }
              lede="Win rates are easy to fake and say nothing about the one thing that matters: did reading this person make your own call better or worse?"
            />
            <CardGrid cols={4} className="mt-14">
              {[
                ['Records get edited', 'Deleted posts, “I said this yesterday” screenshots, selective memory. Losing calls quietly disappear.'],
                ['Right isn’t useful', 'An advisor who agrees with the market is right a lot and tells you nothing you couldn’t read yourself.'],
                ['Persuasive isn’t accurate', 'Confident takes pull you hard. Sometimes they pull you the wrong way, and you never measure it.'],
                ['Paying blind', 'People pay for tips with no way to check if those tips improve their own forecasts.'],
              ].map(([t, b], i) => (
                <Card key={t} style={d(i)}>
                  <div className="flex items-center justify-between">
                    <CardIndex>0{i + 1}</CardIndex>
                    <span aria-hidden className="size-2.5 border-[1.5px] border-gold" />
                  </div>
                  <CardTitle className="mt-8">{t}</CardTitle>
                  <CardBody>{b}</CardBody>
                </Card>
              ))}
            </CardGrid>
          </Container>
        </Section>

        {/* ---------------- 02 ADVISORS ---------------- */}
        <Section id="advisors">
          <Container>
            <SectionHead
              index="02"
              label="What Receipts does"
              title={
                <>
                  Seal every call, test one advisor at a time, <Accent>remember what worked.</Accent>
                </>
              }
            />
            <CardGrid cols={3} className="mt-14">
              {[
                ['Sealed calls', 'Your probability is hashed with a random salt and committed through Walrus Memory before close. Revealed after. Tamper-evident by design.'],
                ['Paired tests', 'Blind call, one piece of advice, informed call. The difference in score is what that advice did for you on that question.'],
                ['Memory that learns', 'Every settled test becomes a memory. Lessons change which advisors you see first, what you’re warned about, and what your agent will pay for.'],
              ].map(([t, b], i) => (
                <Card key={t} style={d(i)}>
                  <span aria-hidden className="block size-2.5 bg-gold" />
                  <CardTitle className="mt-8">{t}</CardTitle>
                  <CardBody>{b}</CardBody>
                </Card>
              ))}
            </CardGrid>

            <div className="mono-label mt-16 flex items-center gap-4 text-muted" data-reveal>
              <span>Five kinds of advisor</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <CardGrid cols={3} className="mt-6 lg:grid-cols-5">
              {[
                ['■', 'The market', 'The live Polymarket price via Tatum. The honest benchmark: most people improve by reading it.'],
                ['□', 'Whales', 'Top holders on each side of the market, from Tatum’s position data.'],
                ['■', 'Tipsters', 'People who publish takes in Receipts. Their takes are sealed too.'],
                ['□', 'Your crew', 'Friends in your group. Find out who makes the whole chat better.'],
                ['■', 'Pundits', 'Paste any take you’re reading: a post, a column, a voice note transcript.'],
              ].map(([icon, t, b], i) => (
                <Card key={t} style={d(i)} highlight={i === 0}>
                  <div className="mono-label flex items-center gap-2 text-faint">
                    <span className="text-gold">{icon}</span> Advisor
                  </div>
                  <CardTitle className="mt-4">{t}</CardTitle>
                  <CardBody>{b}</CardBody>
                </Card>
              ))}
            </CardGrid>
          </Container>
        </Section>

        {/* ---------------- 03 HOW IT WORKS ---------------- */}
        <Section id="how">
          <Container>
            <SectionHead
              index="03"
              label="How it works"
              title={
                <>
                  One match, eight steps, <Accent>two receipts.</Accent>
                </>
              }
              lede="Each step leaves a trace you can open: the seal on Sui, the market resolution, the memory that changed your next recommendation."
            />
            <CardGrid cols={4} className="mt-14">
              {[
                ['Pick a match', 'Curated football markets from Polymarket, via Tatum. One market per match.', 'Tatum Prediction API'],
                ['Call it blind', 'Set your probability. The market price stays hidden until you lock.', 'Blind seal'],
                ['Seal it', 'sha256 of the full forecast becomes a Walrus Memory namespace on Sui mainnet.', 'Walrus Memory'],
                ['Read one take', 'Fair-test mode picks the advisor at random so your stats stay honest.', 'Fair test'],
                ['Call it again', 'Move the slider or tap “Unchanged”. Sealed and chained to your blind call.', 'Informed seal'],
                ['Verify', 'The commit transaction is read back from Sui history through Tatum’s gRPC gateway.', 'Tatum Sui gRPC'],
                ['Settle', 'When the market resolves, both calls get a Brier score. The gap is the advice effect.', 'Scoring'],
                ['Remember', 'The episode and any new lesson are written to Walrus Memory and change what you see next.', 'Learning loop'],
              ].map(([t, b, tag], i) => (
                <Card key={t} style={d(i % 4)}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[30px] font-medium leading-none tracking-[-0.03em] tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                    <span className="border border-line-strong px-1.5 py-0.5 font-mono text-[10px] text-ink-2">{tag}</span>
                  </div>
                  <CardTitle className="mt-8">{t}</CardTitle>
                  <CardBody>{b}</CardBody>
                </Card>
              ))}
            </CardGrid>

            <div className="mono-label mt-16 flex items-center gap-4 text-muted" data-reveal>
              <span>What a receipt contains</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <div className="mt-6 grid gap-8 lg:grid-cols-2">
              <div className="space-y-5" data-reveal>
                <h3 className="text-[22px] font-semibold tracking-[-0.02em]">The hash travels, the forecast waits.</h3>
                <p className="text-[14.5px] leading-7 text-muted">
                  Before close, only the hash is public. It is the{' '}
                  <code className="bg-gold-wash px-1 font-mono text-[12.5px] text-gold-ink">memwal_namespace</code> label on a Walrus blob, written in a Sui transaction.
                  After close the forecast is revealed and anyone can recompute it.
                </p>
                <ol className="border-t border-line">
                  {[
                    'Your call is canonicalised (RFC 8785) and hashed with a 32-byte salt.',
                    'Walrus Memory stores it encrypted; the relayer pays storage and gas.',
                    'The namespace is read back from the transaction’s inputs, not mutable object state.',
                    'Checkpoint time must be earlier than the market’s close.',
                  ].map((s, i) => (
                    <li key={s} className="flex gap-5 border-b border-line py-4 text-[14px] text-ink-2" data-reveal style={d(i)}>
                      <span className="font-mono text-[12px] text-gold-ink">0{i + 1}</span>
                      {s}
                    </li>
                  ))}
                </ol>
              </div>
              <Terminal title="receipt · informed call (revealed)">
                <span className="text-[#8b9099]"># sha256(JCS(forecast)) → namespace on Sui</span>
                {'\n'}
                <span className="text-gold">rcpt1:ff8f5be99f5f:01f700c5f165:i:1295…e0d4</span>
                {'\n\n'}
                {`{
  "schema": "receipts.forecast.v1",
  "kind": "informed",
  "market": { "platform": "polymarket", "closeTime": "…" },
  "outcome": "Yes",
  "probabilityBps": 8000,
  "prev": "69110a5b…a46f",
  "advice": { "advisorKind": "pundit", "fairTest": true },
  "salt": "…"
}`}
                {'\n\n'}
                <span className="text-[#8b9099]"># verify via Tatum gRPC</span>
                {'\n'}
                <span className="text-[#7ee2a8]">✓ hash ✓ label_in_tx ✓ account ✓ before_close</span>
              </Terminal>
            </div>
          </Container>
        </Section>

        {/* ---------------- 04 SCORING ---------------- */}
        <Section>
          <Container>
            <SectionHead
              index="04"
              label="Scoring"
              title={
                <>
                  Advisors earn trust by improving you. <Muted>Not by sounding sure,</Muted> <Accent>not by promises.</Accent>
                </>
              }
              lede="Every settled test compares your blind and informed calls with the Brier score. Receipts only gives a verdict when the 95% interval clears zero, after at least eight tests."
            />
            <div className="mt-14 border border-line" data-reveal>
              <div className="mono-label hidden grid-cols-[1.4fr_0.5fr_2fr_1fr] gap-6 border-b border-line bg-paper-2 px-6 py-3 text-faint md:grid">
                <span>Advisor</span>
                <span>Tests</span>
                <span>Change in your score (95% interval)</span>
                <span>Verdict</span>
              </div>
              {ADVISOR_DEMO.map((a, i) => (
                <div key={a.name} className="grid grid-cols-2 items-center gap-x-6 gap-y-3 border-b border-line px-6 py-5 last:border-b-0 md:grid-cols-[1.4fr_0.5fr_2fr_1fr]" data-reveal style={d(i)}>
                  <div>
                    <div className="text-[15px] font-medium">{a.name}</div>
                    <div className="text-[12.5px] text-muted">{a.kind}</div>
                  </div>
                  <div className="text-right font-mono text-[13px] tabular-nums md:text-left">n = {a.n}</div>
                  <div className="col-span-2 flex items-center gap-4 md:col-span-1">
                    <IntervalBar mean={a.mean} low={a.low} high={a.high} range={0.12} />
                    <span className="w-14 shrink-0 text-right font-mono text-[12.5px] tabular-nums text-ink-2">
                      {a.mean > 0 ? '+' : ''}
                      {a.mean.toFixed(3)}
                    </span>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <Badge tone={a.verdict[0]}>{a.verdict[1]}</Badge>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 font-mono text-[11px] text-faint">Example data. Your table fills in as your tests settle.</p>

            <CardGrid cols={3} className="mt-10">
              {[
                ['Brier, before vs after', '(p − outcome)². Blind 55% → informed 80% on something that didn’t happen: 0.30 → 0.64. That advice cost you 0.34.'],
                ['Intervals, not vibes', 'Student-t 95% intervals per advisor. “Not enough evidence yet” until there are eight settled tests.'],
                ['The market is the bar', 'Most people improve by reading the price. A tipster only adds value if they beat that.'],
              ].map(([t, b], i) => (
                <Card key={t} style={d(i)}>
                  <CardIndex>0{i + 1}</CardIndex>
                  <CardTitle className="mt-6">{t}</CardTitle>
                  <CardBody>{b}</CardBody>
                </Card>
              ))}
            </CardGrid>
          </Container>
        </Section>

        {/* ---------------- 05 INTEGRITY (dark) ---------------- */}
        <Section night id="integrity" className="overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute -top-56 right-[-15%] size-[900px]" style={{ background: 'radial-gradient(closest-side, rgba(240,180,20,0.18), rgba(240,180,20,0.06) 55%, transparent)' }} />
          <Container className="relative">
            <SectionHead
              index="05"
              label="Integrity"
              title={
                <>
                  Ten checks stand between a claim and <Accent>a receipt.</Accent>
                </>
              }
              lede="Hard checks make a seal invalid. Timing checks mark it late. Notes add context without hiding anything. Every check is shown on every receipt."
            />
            <div className="mt-14 grid gap-10 lg:grid-cols-[1.2fr_1fr]">
              <div className="border-t border-night-line">
                {[
                  ['hash', 'Recomputed hash matches the namespace', 'hard'],
                  ['tags', 'User and market tags match the reveal', 'hard'],
                  ['label_in_tx', 'The commit tx wrote this exact namespace', 'hard'],
                  ['tx_success', 'The transaction succeeded', 'hard'],
                  ['account', 'Written through Receipts’ Walrus Memory account', 'hard'],
                  ['owner', 'Owner label and transfer recipient match', 'hard'],
                  ['before_close', 'Checkpoint time earlier than market close', 'timing'],
                  ['after_blind', 'Informed call sealed after the blind call', 'note'],
                  ['untouched', 'Blob not modified since the commit', 'note'],
                  ['alive', 'Blob storage still paid for', 'note'],
                ].map(([id, label, sev], i) => (
                  <div key={id} className="grid grid-cols-[2.2rem_1fr_auto] items-center gap-4 border-b border-night-line py-3.5 text-[14px]" data-reveal style={d(i % 5)}>
                    <span className="font-mono text-[11px] text-[#8b9099]">{String(i + 1).padStart(2, '0')}</span>
                    <span>
                      <span className="font-mono text-[12.5px] text-gold">{id}</span>
                      <span className="ml-3 text-[#c9ccd2]">{label}</span>
                    </span>
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-[#8b9099]">{sev}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-px">
                {[
                  ['Tamper-evident, honestly', 'Walrus blob labels can be changed later by their owner, so Receipts never trusts current state. It reads the label from the immutable transaction that wrote it.'],
                  ['Nothing disappears', 'Every seal is listed on your profile: revealed, sealed, late or failed. A tipster’s unrevealed take counts as the worst possible score.'],
                  ['Limits, stated', 'Nodes prune old history, so evidence is captured at seal time and stored. The Walrus Memory relayer sees plaintext while encrypting. We say so.'],
                ].map(([t, b], i) => (
                  <div key={t} className="border-t border-night-line py-6 first:border-t-0 first:pt-0" data-reveal style={d(i)}>
                    <div className="flex items-start gap-4">
                      <span aria-hidden className="mt-1.5 size-2 shrink-0 bg-gold" />
                      <div>
                        <h3 className="text-[16px] font-semibold">{t}</h3>
                        <p className="mt-2 text-[14px] leading-7 text-[#9aa0a8]">{b}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Container>
        </Section>

        {/* ---------------- 06 AGENT PAYMENTS ---------------- */}
        <Section>
          <Container>
            <SectionHead
              index="06"
              label="Agent payments"
              title={
                <>
                  Your agent only pays for advice that <Accent>has helped you.</Accent>
                </>
              }
              lede="Tipsters can price their sealed takes in USDC. Your agent pays over MPP, settled on Sui, and only when your own record says that tipster improves your calls."
            />
            <div className="mt-14 grid gap-8 lg:grid-cols-2">
              <ol className="border-t border-line">
                {[
                  'Your agent asks for a paid take and gets HTTP 402 with the price, in USDC on Sui.',
                  'It checks your stats: buy only if the interval for this tipster is above zero and the weekly budget allows.',
                  'It pays, the seller verifies on Sui, and Receipts confirms the payment again through Tatum.',
                  'The take unlocks with its own receipt, and the decision is logged with the lesson that justified it.',
                ].map((s, i) => (
                  <li key={s} className="flex gap-5 border-b border-line py-4 text-[14.5px] text-ink-2" data-reveal style={d(i)}>
                    <span className="font-mono text-[12px] text-gold-ink">0{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
              <Terminal title="mpp · agent buys a take">
                <span className="text-[#8b9099]"># agent → tipster</span>
                {'\nGET /api/takes/7c1e…/unlock\n\n'}
                <span className="text-[#8b9099]"># tipster → agent</span>
                {'\n'}
                <span className="text-gold">HTTP/1.1 402 Payment Required</span>
                {'\nWWW-Authenticate: Payment method="sui", amount="0.25"\n\n'}
                <span className="text-[#8b9099]"># decision (from your stats)</span>
                {'\n@crew_sam  n=14  +0.031 [+0.004, +0.058]  → buy\n@loud_pundit  n=17  −0.052  → skip\n\n'}
                <span className="text-[#8b9099]"># retry with payment proof → 200 OK</span>
                {'\n'}
                <span className="text-[#7ee2a8]">✓ USDC settled on Sui · confirmed via Tatum</span>
              </Terminal>
            </div>
          </Container>
        </Section>

        {/* ---------------- 07 STACK ---------------- */}
        <Section>
          <Container>
            <SectionHead
              index="07"
              label="Under the hood"
              title={
                <>
                  Walrus Memory and Tatum, <Accent>doing real work.</Accent>
                </>
              }
            />
            <CardGrid cols={4} className="mt-14">
              {[
                ['Walrus Memory', 'Seals every call; stores episodes and lessons; restores the ledger'],
                ['Tatum Prediction API', 'Markets, live prices, whale positions, resolutions'],
                ['Tatum Sui gRPC', 'Reads commit transactions to verify every receipt'],
                ['Sui mainnet', 'Where every seal and payment lands'],
                ['Seal encryption', 'Memories encrypted at rest on Walrus'],
                ['MPP on Sui', 'Agent-to-tipster payments in USDC'],
                ['Brier + t-intervals', 'Deterministic scoring, never an LLM'],
                ['Next.js + Turso', 'Fast pages, tiny client bundle'],
              ].map(([t, b], i) => (
                <Card key={t} style={d(i % 4)} className="py-6">
                  <CardTitle className="text-[15px]">{t}</CardTitle>
                  <CardBody className="mt-1.5 text-[12.5px]">{b}</CardBody>
                </Card>
              ))}
              <a href="/signup" className="group flex flex-col justify-between bg-gold p-6 text-ink transition-[filter] hover:brightness-95 sm:col-span-2 lg:col-span-1" data-reveal>
                <span className="text-[15px] font-semibold">Start keeping receipts</span>
                <span aria-hidden className="mt-6 text-xl transition-transform duration-300 group-hover:translate-x-1">→</span>
              </a>
            </CardGrid>
          </Container>
        </Section>

        {/* ---------------- 08 FAQ ---------------- */}
        <Section id="faq">
          <Container className="grid gap-12 lg:grid-cols-[1fr_1.6fr]">
            <div className="space-y-6">
              <Eyebrow index="08">FAQ</Eyebrow>
              <H2>
                Questions people <Accent>ask first.</Accent>
              </H2>
            </div>
            <Faq
              items={[
                { q: 'Is this a betting app?', a: 'No. Receipts never takes bets or holds your money. It reads public prediction-market data to score forecasts you make for free. 18+ only.' },
                { q: 'Why lock a blind call first?', a: 'Without your “before”, nobody can tell what the advice did. The blind call is the baseline; the informed call is the result. Two seals, one honest measurement.' },
                { q: 'What does “sealed” actually mean?', a: 'A SHA-256 hash of your full forecast, with a random salt, is committed through Walrus Memory as a namespace on Sui mainnet before the market closes. After close we reveal the forecast so anyone can recompute the hash and check it against Sui history.' },
                { q: 'Can Receipts edit my record?', a: 'Not without it showing. Every seal is a public Sui transaction, profiles list every seal including unrevealed ones, and verification reads immutable transaction inputs. Tamper-evident, not magic.' },
                { q: 'How many tests before I get a verdict?', a: 'At least eight settled tests with an advisor, and the 95% interval has to clear zero. Until then Receipts says “not enough evidence yet”.' },
                { q: 'What is fair-test mode?', a: 'Receipts picks which advisor you see at random. If you only ever read people you already agree with, your stats would flatter them. Fair tests keep the comparison honest.' },
              ]}
            />
          </Container>
        </Section>
      </main>
      <SiteFooter />
    </>
  );
}

function FlowCard({ label, title, items, highlight, i }: { label: string; title: string; items: string[]; highlight?: boolean; i: number }) {
  return (
    <div
      data-reveal
      style={d(i * 2)}
      className={highlight ? 'border border-gold bg-white p-6 shadow-[inset_0_3px_0_var(--gold)]' : 'border border-line bg-white p-6'}
    >
      <div className="mono-label text-faint">{label}</div>
      <div className="mt-3 flex items-center gap-2.5">
        <span aria-hidden className={highlight ? 'size-2.5 bg-gold' : 'size-2.5 border-[1.5px] border-gold'} />
        <h3 className="text-[18px] font-semibold tracking-[-0.01em]">{title}</h3>
      </div>
      <ul className="mt-4 space-y-2">
        {items.map((it) => (
          <li key={it} className="flex gap-2.5 text-[13px] text-muted">
            <span aria-hidden className="mt-[7px] size-1.5 shrink-0 bg-gold" />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Connector({ top, bottom }: { top: string; bottom: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-1 py-2 text-center lg:w-40" data-reveal>
      <span className="font-mono text-[10.5px] text-gold-ink">{top}</span>
      <span aria-hidden className="my-2 h-6 w-px bg-gold lg:h-px lg:w-full" data-reveal="line" />
      <span className="text-[11.5px] text-muted">{bottom}</span>
    </div>
  );
}
