import Link from 'next/link';
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from 'react';

/**
 * Receipts design system primitives (docs/DESIGN.md). Server components, zero client JS.
 * Rules: radius 0, 1px hairlines, ink text, gold only for accents, mono for numbers/hashes/labels.
 */

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

/** Stagger index for `.enter` / `[data-reveal]` animations. */
export const d = (i: number) => ({ '--d': i }) as CSSProperties;

export function Container({ className, ...p }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('mx-auto w-full max-w-[1200px] px-4 sm:px-8', className)} {...p} />;
}

export function Section({ className, night, ...p }: ComponentPropsWithoutRef<'section'> & { night?: boolean }) {
  return (
    <section
      className={cn('relative border-t border-line py-20 sm:py-28', night && 'night border-night-line bg-night text-white', className)}
      {...p}
    />
  );
}

/** Small gold square + index + rule + label, e.g. "■ 01 —— THE PROBLEM". */
export function Eyebrow({ index, children, className }: { index?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('mono-label flex items-center gap-3 text-muted', className)} data-reveal>
      <span aria-hidden className="size-2 bg-gold" />
      {index && <span className="font-semibold text-ink [.night_&]:text-white">{index}</span>}
      {index && <span aria-hidden className="h-px w-8 bg-line-strong [.night_&]:bg-night-line" />}
      <span>{children}</span>
    </div>
  );
}

/** Outlined tag with a hollow gold square, used above hero headlines. */
export function Tag({ children, className, ...p }: ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      className={cn('inline-flex items-center gap-2.5 border border-gold-line bg-white/60 px-3 py-1.5 text-[13px] text-ink-2 backdrop-blur-sm', className)}
      {...p}
    >
      <span aria-hidden className="size-2.5 border-[1.5px] border-gold" />
      {children}
    </span>
  );
}

export const Muted = ({ children }: { children: ReactNode }) => <span className="tone-muted">{children}</span>;
export const Accent = ({ children }: { children: ReactNode }) => <span className="tone-gold">{children}</span>;

export function H2({ className, children, ...p }: ComponentPropsWithoutRef<'h2'>) {
  return (
    <h2 className={cn('h2 text-[34px] sm:text-[48px] lg:text-[56px]', className)} data-reveal {...p}>
      {children}
    </h2>
  );
}

export function Lede({ className, ...p }: ComponentPropsWithoutRef<'p'>) {
  return <p className={cn('max-w-[34rem] text-[15px] leading-7 text-muted sm:text-base [.night_&]:text-[#a3a8b0]', className)} data-reveal {...p} />;
}

/** Heading block: eyebrow + headline on the left, lede on the right (desktop). */
export function SectionHead({ index, label, title, lede, className }: { index?: string; label: string; title: ReactNode; lede?: ReactNode; className?: string }) {
  return (
    <div className={cn('grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:items-end', className)}>
      <div className="space-y-6">
        <Eyebrow index={index}>{label}</Eyebrow>
        <H2>{title}</H2>
      </div>
      {lede && <Lede className="lg:justify-self-end lg:pb-2">{lede}</Lede>}
    </div>
  );
}

type ButtonVariant = 'primary' | 'glass' | 'dark' | 'gold' | 'outline';
const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-white text-ink shadow-[0_1px_0_rgba(0,0,0,0.04)] hover:bg-paper-2',
  glass: 'bg-white/45 text-ink backdrop-blur-md hover:bg-white/70',
  dark: 'bg-ink text-white hover:bg-ink-2',
  gold: 'bg-gold text-ink hover:brightness-95',
  outline: 'border border-line-strong bg-white text-ink hover:border-ink',
};

function ButtonInner({ children, arrow }: { children: ReactNode; arrow?: boolean }) {
  return (
    <>
      <span>{children}</span>
      {arrow && (
        <span aria-hidden className="grid size-8 place-items-center bg-gold text-ink transition-transform duration-300 group-hover:translate-x-0.5">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1 6h9m0 0L6.5 2.5M10 6 6.5 9.5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </span>
      )}
    </>
  );
}

export function ButtonLink({
  href,
  variant = 'primary',
  arrow,
  className,
  children,
  ...p
}: ComponentPropsWithoutRef<typeof Link> & { variant?: ButtonVariant; arrow?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'group inline-flex h-14 items-center gap-4 text-[15px] font-medium transition-colors duration-200',
        arrow ? 'pl-5 pr-2.5' : 'px-6',
        buttonStyles[variant],
        className,
      )}
      {...p}
    >
      <ButtonInner arrow={arrow}>{children}</ButtonInner>
    </Link>
  );
}

export function Button({ variant = 'dark', arrow, className, children, ...p }: ComponentPropsWithoutRef<'button'> & { variant?: ButtonVariant; arrow?: boolean }) {
  return (
    <button
      className={cn(
        'group inline-flex h-12 items-center justify-center gap-4 text-[15px] font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50',
        arrow ? 'pl-5 pr-2' : 'px-5',
        buttonStyles[variant],
        className,
      )}
      {...p}
    >
      <ButtonInner arrow={arrow}>{children}</ButtonInner>
    </button>
  );
}

/** Hairline grid: the gap shows the background colour as 1px lines. */
export function CardGrid({ cols = 3, className, ...p }: ComponentPropsWithoutRef<'div'> & { cols?: 2 | 3 | 4 }) {
  const c = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[cols];
  return <div className={cn('grid grid-cols-1 gap-px border border-line bg-line [.night_&]:border-night-line [.night_&]:bg-night-line', c, className)} {...p} />;
}

export function Card({ className, highlight, ...p }: ComponentPropsWithoutRef<'div'> & { highlight?: boolean }) {
  return (
    <div
      data-reveal
      className={cn(
        'relative bg-white p-6 sm:p-7 [.night_&]:bg-night-2',
        highlight && 'bg-gold-wash shadow-[inset_3px_0_0_var(--gold)]',
        className,
      )}
      {...p}
    />
  );
}

export function CardIndex({ children }: { children: ReactNode }) {
  return <div className="font-mono text-[11px] text-faint">{children}</div>;
}

export function CardTitle({ className, ...p }: ComponentPropsWithoutRef<'h3'>) {
  return <h3 className={cn('text-[17px] font-semibold tracking-[-0.01em] text-ink [.night_&]:text-white', className)} {...p} />;
}

export function CardBody({ className, ...p }: ComponentPropsWithoutRef<'p'>) {
  return <p className={cn('mt-2.5 text-[13.5px] leading-6 text-muted [.night_&]:text-[#9aa0a8]', className)} {...p} />;
}

export function Stat({ value, label, className, style }: { value: ReactNode; label: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div data-reveal style={style} className={cn('bg-white px-6 py-7', className)}>
      <div className="text-[40px] font-medium leading-none tracking-[-0.03em] tabular-nums">{value}</div>
      <div className="mt-3 text-[12.5px] text-muted">{label}</div>
    </div>
  );
}

export type BadgeTone = 'neutral' | 'good' | 'bad' | 'warn' | 'gold' | 'dashed' | 'ink';
const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-paper-2 text-muted border-line',
  good: 'bg-good-wash text-good border-transparent',
  bad: 'bg-bad-wash text-bad border-transparent',
  warn: 'bg-warn-wash text-warn border-transparent',
  gold: 'bg-gold text-ink border-transparent',
  dashed: 'bg-white text-ink-2 border-dashed border-ink-2',
  ink: 'bg-ink text-white border-transparent',
};
export function Badge({ tone = 'neutral', className, ...p }: ComponentPropsWithoutRef<'span'> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn('inline-flex h-6 items-center gap-1.5 border px-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em]', badgeTones[tone], className)}
      {...p}
    />
  );
}

/** Middle-truncated hash/digest in mono, optional link with gold underline. */
export function Hash({ value, href, head = 8, tail = 4, className }: { value: string; href?: string; head?: number; tail?: number; className?: string }) {
  const short = value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
  const cls = cn('font-mono text-[12.5px] tabular-nums', className);
  if (!href) return <span className={cls} title={value}>{short}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" title={value} className={cn(cls, 'inline-flex items-center gap-1 border-b border-gold pb-px text-ink hover:border-ink')}>
      {short}
      <svg aria-hidden width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 8 8 2m0 0H3.5M8 2v4.5" stroke="currentColor" strokeWidth="1.4" /></svg>
    </a>
  );
}

/** Dark terminal / code panel with a gold-square title bar. */
export function Terminal({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div data-reveal className={cn('overflow-hidden bg-night text-[12.5px] leading-6 text-[#d7dae0]', className)}>
      <div className="mono-label flex items-center gap-2.5 border-b border-night-line px-5 py-3 text-[#8b9099]">
        <span aria-hidden className="size-2 bg-gold" />
        {title}
      </div>
      <pre className="overflow-x-auto px-5 py-5 font-mono">{children}</pre>
    </div>
  );
}

export function Faq({ items }: { items: Array<{ q: string; a: ReactNode }> }) {
  return (
    <div className="border-t border-line">
      {items.map((it, i) => (
        <details key={it.q} className="group border-b border-line" data-reveal style={d(i)}>
          <summary className="flex items-center justify-between gap-6 py-5 text-[16px] font-medium sm:text-[17px]">
            {it.q}
            <span aria-hidden className="faq-icon grid size-7 shrink-0 place-items-center border border-line-strong text-lg leading-none group-hover:border-ink">+</span>
          </summary>
          <div className="faq-body max-w-[46rem] pb-6 text-[14.5px] leading-7 text-muted">{it.a}</div>
        </details>
      ))}
    </div>
  );
}

/**
 * 95% interval bar around zero: shows mean and interval for "did reading this advisor help you?".
 * `range` is the half-width of the axis (default ±0.2 Brier points).
 */
export function IntervalBar({ mean, low, high, range = 0.2, className }: { mean: number | null; low: number | null; high: number | null; range?: number; className?: string }) {
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v + range) / (2 * range)) * 100))}%`;
  const known = mean !== null && low !== null && high !== null;
  const tone = !known ? 'bg-faint' : low! > 0 ? 'bg-good' : high! < 0 ? 'bg-bad' : 'bg-ink-2';
  return (
    <div className={cn('relative h-6 w-full min-w-[120px]', className)} aria-hidden>
      <div className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
      <div className="absolute top-1 bottom-1 left-1/2 w-px bg-ink/40" />
      {known && (
        <>
          <div
            data-reveal="line"
            className={cn('absolute top-1/2 h-[3px] -translate-y-1/2 opacity-80', tone)}
            style={{ left: pos(low!), width: `calc(${pos(high!)} - ${pos(low!)})` }}
          />
          <div className={cn('absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 border-2 border-white', tone)} style={{ left: pos(mean!) }} />
        </>
      )}
    </div>
  );
}

export function Rule({ className }: { className?: string }) {
  return <div data-reveal="line" className={cn('h-px w-full bg-line', className)} />;
}
