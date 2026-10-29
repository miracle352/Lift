'use client';

import { useId } from 'react';
import { cn } from './primitives';

/**
 * Probability input in basis points (100..9900 in steps of 100 → 1%..99%).
 * Controlled: the parent owns `valueBps`. Keyboard: arrows ±1%, PageUp/PageDown ±10% (native range behaviour).
 */
export function ProbabilitySlider({
  valueBps,
  onChange,
  label = 'Your probability',
  outcome = 'Yes',
  disabled,
  compareBps,
  className,
}: {
  valueBps: number;
  onChange: (bps: number) => void;
  label?: string;
  outcome?: string;
  disabled?: boolean;
  /** Optional ghost marker (e.g. your blind call while setting the informed one). */
  compareBps?: number;
  className?: string;
}) {
  const id = useId();
  const pct = Math.round(valueBps / 100);
  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-end justify-between gap-4">
        <label htmlFor={id} className="mono-label text-muted">
          {label}
        </label>
        <output htmlFor={id} className="text-[56px] font-medium leading-none tracking-[-0.04em] tabular-nums sm:text-[72px]">
          {pct}
          <span className="text-[0.45em] text-muted">%</span>
        </output>
      </div>
      <div className="relative mt-4">
        {compareBps !== undefined && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-4 w-px -translate-y-1/2 bg-gold-ink"
            style={{ left: `calc(${compareBps / 100}% )` }}
            title={`Blind call ${Math.round(compareBps / 100)}%`}
          />
        )}
        <input
          id={id}
          type="range"
          min={1}
          max={99}
          step={1}
          value={pct}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value) * 100)}
          aria-valuetext={`${pct}% chance of ${outcome}`}
          className="prob-range"
          style={{ ['--fill' as string]: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-faint">
        <span>1% · surely not</span>
        <span>50%</span>
        <span>surely · 99%</span>
      </div>
    </div>
  );
}
