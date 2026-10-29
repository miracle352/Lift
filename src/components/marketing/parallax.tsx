'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Sets `--sy` (scroll offset in px, clamped) on its wrapper while it is on screen, once per frame.
 * Children use it in transforms (see Landscape). Does nothing under prefers-reduced-motion.
 */
export function Parallax({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Pause all hero animations while it is off screen (battery + main thread).
    const pauseIo = new IntersectionObserver(([e]) => el.toggleAttribute('data-paused', !e.isIntersecting));
    pauseIo.observe(el);
    // Scroll parallax repaints the SVG each frame: large fine-pointer screens only.
    if (window.matchMedia('(prefers-reduced-motion: reduce), (max-width: 1023px), (pointer: coarse)').matches) return () => pauseIo.disconnect();
    let frame = 0;
    let visible = true;
    const update = () => {
      frame = 0;
      const top = el.getBoundingClientRect().top;
      el.style.setProperty('--sy', String(Math.max(-1200, Math.min(1200, -top))));
    };
    const onScroll = () => {
      if (visible && !frame) frame = requestAnimationFrame(update);
    };
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      pauseIo.disconnect();
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
