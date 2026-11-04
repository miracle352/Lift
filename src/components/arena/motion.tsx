'use client';
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * Motion helpers. Everything is CSS transforms/clip-paths triggered when an element scrolls into view
 * ([data-m] gets the class "on"), and everything is skipped under prefers-reduced-motion.
 */
export function MotionRoot() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = window.matchMedia('(pointer: fine)').matches;
    const root = document.documentElement;
    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('on');
            io.unobserve(e.target);
          }
        }),
      { rootMargin: '0px 0px -60px 0px', threshold: 0 },
    );
    const scan = () =>
      document.querySelectorAll('[data-m], .a-h2').forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        if (reduce) el.classList.add('on');
        else io.observe(el);
      });
    root.classList.add('m-ready');
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    if (reduce)
      return () => {
        io.disconnect();
        mo.disconnect();
      };

    // scroll: parallax ([data-px] moves at its own speed) + scroll velocity (drives the marquee and skews)
    let lastY = window.scrollY;
    let vel = 0;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const y = window.scrollY;
      vel += (y - lastY - vel) * 0.18;
      lastY = y;
      root.style.setProperty('--vel', vel.toFixed(2));
      root.style.setProperty('--sy', y.toFixed(0));
      document.querySelectorAll<HTMLElement>('[data-px]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > window.innerHeight + 200) return;
        const mid = r.top + r.height / 2 - window.innerHeight / 2;
        el.style.translate = `0 ${(-mid * Number(el.dataset.px)).toFixed(1)}px`;
      });
    };
    raf = requestAnimationFrame(loop);

    // pointer: a soft light follows the cursor on blue panels, and buttons lean towards it (magnetic)
    const onMove = (ev: PointerEvent) => {
      root.style.setProperty('--mx', `${ev.clientX}px`);
      root.style.setProperty('--my', `${ev.clientY}px`);
      root.style.setProperty('--px', (ev.clientX / window.innerWidth - 0.5).toFixed(3));
      root.style.setProperty('--py', (ev.clientY / window.innerHeight - 0.5).toFixed(3));
      const t = (ev.target as HTMLElement | null)?.closest?.('.a-btn') as HTMLElement | null;
      document.querySelectorAll<HTMLElement>('.a-btn.is-mag').forEach((b) => {
        if (b !== t) {
          b.classList.remove('is-mag');
          b.style.translate = '';
        }
      });
      if (t && fine) {
        const r = t.getBoundingClientRect();
        t.classList.add('is-mag');
        t.style.translate = `${((ev.clientX - r.left - r.width / 2) * 0.22).toFixed(1)}px ${((ev.clientY - r.top - r.height / 2) * 0.3).toFixed(1)}px`;
      }
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      io.disconnect();
      mo.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);
  return null;
}

/** A huge band of words that drifts sideways, faster (and leaning) while you scroll. */
export function Marquee({ items, reverse = false, tone = 'ink' }: { items: string[]; reverse?: boolean; tone?: 'ink' | 'blue' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let x = 0;
    let raf = 0;
    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);
    const track = el.firstElementChild as HTMLElement;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      const vel = Number(getComputedStyle(document.documentElement).getPropertyValue('--vel') || 0);
      x += (0.6 + Math.min(14, Math.abs(vel) * 0.35)) * (reverse ? 1 : -1);
      const w = track.scrollWidth / 2;
      if (x <= -w) x += w;
      if (x > 0) x -= w;
      track.style.transform = `translate3d(${x.toFixed(1)}px,0,0) skewX(${Math.max(-12, Math.min(12, -vel * 0.4)).toFixed(2)}deg)`;
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [reverse]);
  const row = items.map((t, i) => (
    <span key={i}>
      {t}
      <i aria-hidden />
    </span>
  ));
  return (
    <div ref={ref} className={`a-marquee is-${tone}`} aria-hidden>
      <div className="a-marquee-track">
        {row}
        {row}
      </div>
    </div>
  );
}

/** Types its text out once it scrolls into view (code samples). */
export function TypeOut({ text, className, speed = 9 }: { text: string; className?: string; speed?: number }) {
  const ref = useRef<HTMLPreElement>(null);
  const [n, setN] = useState(text.length);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    queueMicrotask(() => setN(0));
    let timer = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      let i = 0;
      timer = window.setInterval(() => {
        i += 3;
        setN(Math.min(text.length, i));
        if (i >= text.length) window.clearInterval(timer);
      }, speed);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
    };
  }, [text, speed]);
  return (
    <pre ref={ref} className={className} aria-label={text}>
      <span aria-hidden>{text.slice(0, n)}</span>
      <span className="a-caret" aria-hidden />
      <span aria-hidden style={{ visibility: 'hidden' }}>{text.slice(n)}</span>
    </pre>
  );
}

/** A headline whose words stretch in one after another (Anybody's width axis), then breathe with the pointer. */
export function StretchTitle({ text, className }: { text: string; className?: string }) {
  return (
    <h1 className={`${className ?? ''} m-stretch`} aria-label={text}>
      {text.split(' ').map((w, i) => (
        <Fragment key={i}>
          <span className="m-sw" aria-hidden style={{ '--i': i } as CSSProperties}>
            {w}
          </span>{' '}
        </Fragment>
      ))}
    </h1>
  );
}

/** Splits a heading into words that rise out of a mask one after another when it scrolls in. */
export function Words({ text, as: Tag = 'h2', className }: { text: string; as?: 'h2' | 'h1' | 'h3'; className?: string }) {
  return (
    <Tag className={`${className ?? ''} m-words`} data-m aria-label={text}>
      {text.split(' ').map((w, i) => (
        <Fragment key={i}>
          <span className="m-w" aria-hidden>
            <span style={{ '--i': i } as CSSProperties}>{w}</span>
          </span>{' '}
        </Fragment>
      ))}
    </Tag>
  );
}

/** Counts up to `to` once it is visible. */
export function CountUp({ to, format = (n) => Math.round(n).toLocaleString('en-US'), ms = 1400 }: { to: number; format?: (n: number) => string; ms?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const t = window.setTimeout(() => setV(to), 0);
      return () => window.clearTimeout(t);
    }
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / ms);
        setV(to * (1 - Math.pow(1 - k, 4)));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, ms]);
  return <span ref={ref}>{format(v)}</span>;
}

/** Tilts its child a little towards the pointer (desktop, fine pointer only). */
export function Tilt({ children, max = 5 }: { children: ReactNode; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia('(pointer: fine) and (prefers-reduced-motion: no-preference)').matches) return;
    let raf = 0;
    const onMove = (ev: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const x = ev.clientX / window.innerWidth - 0.5;
        const y = ev.clientY / window.innerHeight - 0.5;
        el.style.transform = `perspective(1200px) rotateY(${(-x * max).toFixed(2)}deg) rotateX(${(y * max * 0.6).toFixed(2)}deg)`;
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [max]);
  return (
    <div ref={ref} className="m-tilt">
      {children}
    </div>
  );
}
