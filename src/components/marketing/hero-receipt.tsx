import type { CSSProperties } from 'react';

/**
 * The hero's "printing receipt": prints out, shows blind → informed call, then gets stamped.
 * Pure CSS (no JS). Illustrative content, labelled as an example.
 */
const at = (s: number, extra: CSSProperties = {}): CSSProperties => ({ animationDelay: `${s}s`, ...extra });

export function HeroReceipt() {
  return (
    <div className="ls-float relative w-[300px]" aria-label="Example receipt">
      <div
        className="relative bg-white/95 px-5 pt-5 pb-7 font-mono text-[11.5px] text-ink-2 shadow-[0_30px_60px_-20px_rgba(20,15,0,0.45)] backdrop-blur"
        style={{ animation: 'print 1.4s 0.9s cubic-bezier(.2,.8,.2,1) both' }}
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold tracking-[0.14em] text-ink">RECEIPT</span>
          <span className="text-faint">example</span>
        </div>
        <div className="my-3 border-t border-dashed border-line-strong" />
        <p className="font-sans text-[13px] font-medium leading-snug text-ink">Will the home side win the derby?</p>
        <dl className="mt-3 space-y-1.5">
          <Row k="blind call" v="55%" delay={1.6} />
          <Row k="advice" v="@pundit · fair test" delay={1.9} />
          <Row k="after advice" v="80%" delay={2.2} gold />
          <Row k="sealed" v="12 min before close" delay={2.5} />
        </dl>
        <div className="my-3 border-t border-dashed border-line-strong" />
        <div className="space-y-1 text-[10.5px] text-faint">
          <div className="enter" style={at(2.7)}>rcpt1:ff8f5b…:01f700…:i:1295…e0d4</div>
          <div className="enter" style={at(2.85)}>sui tx 4xK2gv…JBJ · ckpt 336,525,848</div>
        </div>
        {/* perforated bottom edge */}
        <div
          aria-hidden
          className="absolute inset-x-0 -bottom-[7px] h-[8px]"
          style={{ background: 'radial-gradient(circle at 5px 0, transparent 4.5px, rgba(255,255,255,0.95) 5px) 0 0 / 10px 8px repeat-x' }}
        />
      </div>
      <div
        className="absolute -left-6 bottom-9 border-[2.5px] border-good px-2.5 py-1 font-mono text-[12px] font-bold tracking-[0.14em] text-good"
        style={{ animation: 'stamp 0.55s 3.1s cubic-bezier(.2,.9,.3,1.3) both', background: 'rgba(233,247,238,0.85)' }}
      >
        SEALED ✓ SUI
      </div>
    </div>
  );
}

function Row({ k, v, delay, gold }: { k: string; v: string; delay: number; gold?: boolean }) {
  return (
    <div className="enter flex items-baseline justify-between gap-3" style={at(delay)}>
      <dt className="text-faint">{k}</dt>
      <dd className={gold ? 'font-semibold text-gold-ink' : 'text-ink'}>{v}</dd>
    </div>
  );
}
