import React from 'react';
import { rnd } from './anim';
import { DuskSky, Sun, NightSky, Stars, Moon } from './kit';
import { Pt } from './room';

// Light for the sets: shared gradients and filters, glows, cones, the contrast veil, dust in the beams, paint texture,
// corner shading, and windows onto the dusk sky. Light does most of the work in this look.

/** Shared gradients for the v3 sets; mount once per frame. */
export const SetDefs: React.FC = () => (
  <defs>
    {[
      ['g3warm', '#FFD7A0'],
      ['g3cool', '#9FC0FF'],
      ['g3red', '#FF5A4A'],
    ].map(([id, c]) => (
      <radialGradient key={id} id={id}>
        <stop offset="0%" stopColor={c} stopOpacity={1} />
        <stop offset="30%" stopColor={c} stopOpacity={0.35} />
        <stop offset="100%" stopColor={c} stopOpacity={0} />
      </radialGradient>
    ))}
    <linearGradient id="g3cone" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#FFD7A0" stopOpacity={0.55} />
      <stop offset="100%" stopColor="#FFD7A0" stopOpacity={0} />
    </linearGradient>
    <filter id="g3wall" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.006 0.012" numOctaves={3} seed={7} result="n" />
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.28 -0.09" result="a" />
      <feComposite in="a" in2="SourceGraphic" operator="in" />
    </filter>
    <linearGradient id="g3aoUp" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stopColor="#000" stopOpacity={0.5} />
      <stop offset="100%" stopColor="#000" stopOpacity={0} />
    </linearGradient>
    <linearGradient id="g3aoDown" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#000" stopOpacity={0.45} />
      <stop offset="100%" stopColor="#000" stopOpacity={0} />
    </linearGradient>
    <linearGradient id="g3aoRight" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stopColor="#000" stopOpacity={0.4} />
      <stop offset="100%" stopColor="#000" stopOpacity={0} />
    </linearGradient>
    <linearGradient id="g3aoLeft" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0%" stopColor="#000" stopOpacity={0.4} />
      <stop offset="100%" stopColor="#000" stopOpacity={0} />
    </linearGradient>
    <filter id="g3drop" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx={14} dy={18} stdDeviation={10} floodColor="#000" floodOpacity={0.45} />
    </filter>
    <linearGradient id="g3fadeDown" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#000" stopOpacity={0} />
      <stop offset="100%" stopColor="#000" stopOpacity={0.55} />
    </linearGradient>
  </defs>
);

/** Paint texture over a shape (any fill: only its outline is used). */
export const WallTexture: React.FC<{ d?: string; points?: string; rect?: [number, number, number, number] }> = ({ d, points, rect }) =>
  rect ? (
    <rect x={rect[0]} y={rect[1]} width={rect[2]} height={rect[3]} fill="#000" filter="url(#g3wall)" />
  ) : points ? (
    <polygon points={points} fill="#000" filter="url(#g3wall)" />
  ) : (
    <path d={d} fill="#000" filter="url(#g3wall)" />
  );
/** Darkening where a back wall meets the floor, ceiling and side walls (cheap ambient occlusion). */
export const RoomCorners: React.FC<{ x0: number; x1: number; y0: number; y1: number }> = ({ x0, x1, y0, y1 }) => (
  <g>
    <rect x={x0} y={y1 - 70} width={x1 - x0} height={70} fill="url(#g3aoUp)" />
    <rect x={x0} y={y0} width={x1 - x0} height={60} fill="url(#g3aoDown)" />
    <rect x={x0} y={y0} width={60} height={y1 - y0} fill="url(#g3aoRight)" />
    <rect x={x1 - 60} y={y0} width={60} height={y1 - y0} fill="url(#g3aoLeft)" />
  </g>
);

/** A light source's glow, added on top (screen blend), so it brightens what is under it. */
export const Glow: React.FC<{ x: number; y: number; r: number; kind?: 'warm' | 'cool' | 'red'; o?: number }> = ({ x, y, r, kind = 'warm', o = 0.6 }) => (
  <circle cx={x} cy={y} r={r} fill={`url(#g3${kind})`} opacity={o} style={{ mixBlendMode: 'screen' }} />
);
/**
 * The contrast pass: a dark veil over a whole set with soft holes where light falls, so mid-tones sink and the
 * pools around windows and lamps glow. Characters drawn after it stay at full brightness.
 */
export const LightVeil: React.FC<{ id: string; lights: [number, number, number][]; o?: number }> = ({ id, lights, o = 0.5 }) => (
  <g>
    <defs>
      <radialGradient id={`${id}hole`}>
        <stop offset="0%" stopColor="#000" stopOpacity={1} />
        <stop offset="45%" stopColor="#000" stopOpacity={0.75} />
        <stop offset="100%" stopColor="#000" stopOpacity={0} />
      </radialGradient>
      <mask id={`${id}mask`} maskUnits="userSpaceOnUse" x={-1500} y={-1500} width={5000} height={4500}>
        <rect x={-1500} y={-1500} width={5000} height={4500} fill="#fff" />
        {lights.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill={`url(#${id}hole)`} />
        ))}
      </mask>
    </defs>
    <rect x={-1500} y={-1500} width={5000} height={4500} fill="#07040C" opacity={o} mask={`url(#${id}mask)`} />
  </g>
);

/** Dust drifting in a beam of light: specks that catch it and twinkle, slowly. */
export const Dust: React.FC<{ t: number; seed: number; x0: number; y0: number; w: number; h: number; n?: number; o?: number }> = ({ t, seed, x0, y0, w, h, n = 40, o = 0.6 }) => (
  <g style={{ mixBlendMode: 'screen' }}>
    {Array.from({ length: n }).map((_, i) => {
      const sp = 0.4 + rnd(seed + 2, i);
      const x = x0 + ((((rnd(seed, i) * w + Math.sin((t / 30) * sp + i) * 26 + t * 0.35 * sp) % w) + w) % w);
      const y = y0 + ((((rnd(seed + 1, i) * h + Math.cos((t / 40) * sp + i * 2) * 18 - t * 0.25 * sp) % h) + h) % h);
      const tw = 0.5 + 0.5 * Math.sin(t / 9 + i * 1.7);
      return <circle key={i} cx={x} cy={y} r={1.4 + rnd(seed + 3, i) * 2.6} fill="#FFE2B0" opacity={o * (0.25 + 0.75 * tw)} />;
    })}
  </g>
);

/** A soft cone of light from a lamp, fading downward. */
export const Cone: React.FC<{ d: string; o?: number }> = ({ d, o = 0.5 }) => <path d={d} fill="url(#g3cone)" opacity={o} style={{ mixBlendMode: 'screen' }} />;

/**
 * A window onto the dusk: sky, low sun, a far skyline, then frame and mullions. `clip` is the opening's shape.
 * `night`: a deep blue sky with stars, the moon where the sun would be (`sun`, `sunR`), and the far city lit up.
 */
export const SkyView: React.FC<{ id: string; clip: string; box: { x: number; y: number; w: number; h: number }; t: number; sun?: Pt; sunR?: number; red?: number; night?: boolean }> = ({
  id, clip, box, t, sun, sunR = 40, red = 0, night = false,
}) => (
  <g>
    <defs>
      <clipPath id={`${id}clip`}>
        <path d={clip} />
      </clipPath>
    </defs>
    <g clipPath={`url(#${id}clip)`}>
      {night ? (
        <g>
          <NightSky id={`${id}sky`} x0={box.x} y0={box.y} w={box.w} h={box.h} horizonY={box.y + box.h * 0.9} />
          <Stars seed={id.length + 11} x0={box.x} y0={box.y} w={box.w} h={box.h * 0.7} t={t} n={Math.round((box.w * box.h) / 2600)} />
          {sun ? <Moon x={sun.x} y={sun.y} r={sunR} /> : null}
        </g>
      ) : (
        <g>
          <DuskSky id={`${id}sky`} x0={box.x} y0={box.y} w={box.w} h={box.h} horizonY={box.y + box.h * 0.9} red={red} />
          {sun ? <Sun x={sun.x} y={sun.y} r={sunR} t={t} red={red} /> : null}
        </g>
      )}
      <FarCity x0={box.x} x1={box.x + box.w} base={box.y + box.h} h={box.h * 0.3} seed={id.length + 3} night={night} />
    </g>
  </g>
);

/** Distant buildings seen through a window, hazy, with a few lit windows. */
const FarCity: React.FC<{ x0: number; x1: number; base: number; h: number; seed: number; night?: boolean }> = ({ x0, x1, base, h, seed, night = false }) => {
  const out: React.ReactNode[] = [];
  let x = x0 - 10;
  let i = 0;
  while (x < x1) {
    const bw = 24 + rnd(seed, i) * 50;
    const bh = h * (0.3 + rnd(seed + 1, i) * 0.7);
    out.push(<rect key={`b${i}`} x={x} y={base - bh} width={bw + 1} height={bh} fill={night ? '#141634' : '#3A2747'} opacity={night ? 0.95 : 0.85} />);
    for (let k = 0; k < 3; k++) {
      if (rnd(seed + 2, i * 5 + k) > (night ? 0.72 : 0.55)) out.push(<rect key={`w${i}-${k}`} x={x + 5 + k * 8} y={base - bh + 8 + rnd(seed + 3, i + k) * (bh - 16)} width={4} height={5} fill="#FFC27A" opacity={night ? 0.85 : 0.7} />);
    }
    x += bw;
    i++;
  }
  return <g>{out}</g>;
};
