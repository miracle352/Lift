import type { CSSProperties } from 'react';
import { GLOW_FAR_L, GLOW_FAR_R, GLOW_MID_R, RIDGE_FAR, RIDGE_FRONT, RIDGE_MID, RIDGE_NEAR, RIVER_FILL, RIVER_LINE, VIEW } from './landscape-paths';

/**
 * Original, code-drawn dawn valley (≈5 kB gzipped, no image request, no SVG filters).
 * Motion: the river pours in through an animated mask and keeps glinting, sunlit crests ignite,
 * haze drifts, the sun breathes, and layers parallax on scroll via `--sy` (set by <Parallax>).
 * Everything animates transform / opacity / stroke-dashoffset only, and stops under prefers-reduced-motion.
 */
const layer = (k: number): CSSProperties => ({ transform: `translate3d(0, calc(var(--sy, 0) * ${k}px), 0)` });
const draw = (dur: number, delay: number): CSSProperties => ({ animation: `draw ${dur}s ${delay}s cubic-bezier(.6,0,.2,1) forwards` });

function Crest({ d, delay, strong }: { d: string; delay: number; strong?: boolean }) {
  const common = { d, fill: 'none', pathLength: 1, strokeDasharray: '1', strokeDashoffset: '1', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <>
      <path {...common} stroke="#ffd34d" strokeOpacity={0.35} strokeWidth={strong ? 9 : 6} style={draw(3, delay)} />
      <path {...common} stroke="#fff3c4" strokeWidth={strong ? 2 : 1.4} style={draw(3, delay)} />
    </>
  );
}

function Haze({ y, h, color, opacity, drift }: { y: number; h: number; color: string; opacity: number; drift?: number }) {
  return (
    <g style={drift ? { animation: `drift ${drift}s ease-in-out infinite alternate` } : undefined}>
      <rect x={-200} y={y} width={VIEW.w + 400} height={h} fill={color} opacity={opacity} />
    </g>
  );
}

export function Landscape({ className, variant = 'hero' }: { className?: string; variant?: 'hero' | 'footer' }) {
  const id = `ls-${variant}`;
  const g = (name: string) => `url(#${id}-${name})`;
  return (
    <svg className={className} viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} preserveAspectRatio="xMidYMax slice" role="img" aria-label="Dawn over a mountain valley with a golden river">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbf4df" />
          <stop offset="0.4" stopColor="#f9e6b0" />
          <stop offset="0.68" stopColor="#f4d27f" />
        </linearGradient>
        <radialGradient id={`${id}-sun`}>
          <stop offset="0" stopColor="#fffef6" />
          <stop offset="0.18" stopColor="#fff4c8" stopOpacity="0.95" />
          <stop offset="0.55" stopColor="#ffdf86" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffd56b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-far`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a9adb0" />
          <stop offset="0.6" stopColor="#d3cbb0" />
        </linearGradient>
        <linearGradient id={`${id}-mid`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7e868e" />
          <stop offset="0.7" stopColor="#aaa58f" />
        </linearGradient>
        <linearGradient id={`${id}-near`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#47515b" />
          <stop offset="0.8" stopColor="#5f6058" />
        </linearGradient>
        <linearGradient id={`${id}-front`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1c232a" />
          <stop offset="0.6" stopColor="#0c1014" />
        </linearGradient>
        <linearGradient id={`${id}-river`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffbe8" />
          <stop offset="0.3" stopColor="#fff0a8" />
          <stop offset="1" stopColor="#ffc21f" />
        </linearGradient>
        {/* haze: vertical fade so it has no hard edges */}
        <linearGradient id={`${id}-haze`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbefcb" stopOpacity="0" />
          <stop offset="0.55" stopColor="#fbefcb" stopOpacity="1" />
          <stop offset="1" stopColor="#fbefcb" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-haze-dark`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9d3c0" stopOpacity="0" />
          <stop offset="0.5" stopColor="#d9d3c0" stopOpacity="1" />
          <stop offset="1" stopColor="#d9d3c0" stopOpacity="0" />
        </linearGradient>
        {/* drifting wisps: horizontal variation so movement is visible */}
        <linearGradient id={`${id}-wisp`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.2" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="0.38" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.8" stopColor="#fff" stopOpacity="0.1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-vfade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`${id}-soft-a`} maskUnits="userSpaceOnUse" x="-400" y="0" width="2400" height={VIEW.h}>
          <rect x="-400" y="500" width="2400" height="110" fill={`url(#${id}-vfade)`} />
        </mask>
        <mask id={`${id}-soft-b`} maskUnits="userSpaceOnUse" x="-400" y="0" width="2400" height={VIEW.h}>
          <rect x="-400" y="690" width="2400" height="90" fill={`url(#${id}-vfade)`} />
        </mask>
        <mask id={`${id}-pour`} maskUnits="userSpaceOnUse" x="0" y="0" width={VIEW.w} height={VIEW.h}>
          <path d={RIVER_LINE} fill="none" stroke="#fff" strokeWidth="60" strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset="1" style={draw(2.6, 0.4)} />
        </mask>
      </defs>

      <rect width={VIEW.w} height={VIEW.h} fill={g('sky')} />
      <g style={layer(-0.05)}>
        <circle cx="1235" cy="372" r="300" fill={g('sun')} className="ls-sun" style={{ transformOrigin: '1235px 372px' }} />
      </g>

      <g style={layer(0.02)}>
        <path d={RIDGE_FAR} fill={g('far')} />
        <Crest d={GLOW_FAR_R} delay={0.7} strong />
        <Crest d={GLOW_FAR_L} delay={1.3} />
        <rect x="0" y="470" width={VIEW.w} height="170" fill={g('haze')} opacity="0.85" />
        <g mask={`url(#${id}-soft-a)`}>
          <g className="ls-drift-a">
            <rect x="-300" y="500" width="2200" height="110" fill={g('wisp')} opacity="0.75" />
          </g>
        </g>
      </g>

      <g style={layer(0.06)}>
        <path d={RIDGE_MID} fill={g('mid')} />
        <Crest d={GLOW_MID_R} delay={1.1} />
        <rect x="0" y="560" width={VIEW.w} height="150" fill={g('haze')} opacity="0.6" />
      </g>

      <g style={layer(0.1)}>
        <path d={RIDGE_NEAR} fill={g('near')} />
        <Haze y={640} h={130} color={g('haze-dark')} opacity={0.55} />
      </g>

      <g style={layer(0.14)}>
        <g mask={`url(#${id}-pour)`}>
          <path d={RIVER_LINE} fill="none" stroke="#ffcf45" strokeOpacity="0.22" strokeWidth="18" strokeLinecap="round" />
          <path d={RIVER_FILL} fill={g('river')} />
        </g>
        <path d={RIVER_LINE} fill="none" stroke="#fffdf0" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="26 420" className="ls-glint" />
        <g mask={`url(#${id}-soft-b)`}>
          <g className="ls-drift-b">
            <rect x="-300" y="690" width="2200" height="90" fill={g('wisp')} opacity="0.5" />
          </g>
        </g>
      </g>

      <g style={layer(0.2)}>
        <path d={RIDGE_FRONT} fill={g('front')} />
      </g>
    </svg>
  );
}
