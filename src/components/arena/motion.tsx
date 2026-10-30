'use client';
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * Motion helpers. Everything is CSS transforms/clip-paths triggered when an element scrolls into view
 * ([data-m] gets the class "on"), and everything is skipped under prefers-reduced-motion.
 */
export function MotionRoot() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('on');
            io.unobserve(e.target);
          }
        }),
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
    );
    const scan = () =>
      document.querySelectorAll('[data-m]').forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        if (reduce) el.classList.add('on');
        else io.observe(el);
      });
    document.documentElement.classList.add('m-ready');
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
  return null;
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
