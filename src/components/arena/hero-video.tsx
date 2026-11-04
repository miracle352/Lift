'use client';
import { useEffect, useRef } from 'react';

/**
 * Real footage (Mixkit, free licence: a stadium crowd seen through the goal net), duotoned in CSS onto lift blue
 * and looped seamlessly in code:
 * two <video> elements play the same clip half a cycle apart and crossfade, so the cut never shows.
 * A slow push-in runs in CSS. Off screen or with reduced motion, only the poster frame is shown.
 */
export function HeroVideo() {
  const box = useRef<HTMLDivElement>(null);
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = box.current;
    const va = a.current;
    const vb = b.current;
    if (!el || !va || !vb) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      va.classList.add('is-on'); // still poster frame only
      return;
    }
    let front = va;
    let back = vb;
    let timer = 0;
    const swapAt = () => (front.duration || 10) - 1.6;
    const tick = () => {
      if (front.currentTime >= swapAt()) {
        back.currentTime = 0;
        void back.play().catch(() => {});
        back.classList.add('is-on');
        front.classList.remove('is-on');
        [front, back] = [back, front];
      }
      timer = window.setTimeout(tick, 200);
    };
    const start = () => {
      el.classList.add('is-live');
      va.classList.add('is-on');
      void va.play().catch(() => {});
      tick();
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        if (!timer) start();
        else void front.play().catch(() => {});
      } else {
        front.pause();
        back.pause();
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, []);
  const src = (
    <>
      <source src="/media/crowd.mp4" type="video/mp4" />
    </>
  );
  return (
    <div ref={box} className="a-hero-media" aria-hidden>
      <video ref={a} muted playsInline preload="auto" poster="/media/crowd-poster.jpg">
        {src}
      </video>
      <video ref={b} muted playsInline preload="auto">
        {src}
      </video>
    </div>
  );
}
