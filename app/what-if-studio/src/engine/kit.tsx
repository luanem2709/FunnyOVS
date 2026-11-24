import React from 'react';

// The dusk lighting kit for v2 (see STYLE-SPEC.md, Look A): light does most of the work.
// Back-lit sky with a low sun and slow rays, bloom, haze, bokeh, window light shafts,
// rim-light filters per light direction, and depth-of-field blurs.

export const D = {
  skyTop: '#25184A',
  skyMid: '#6E3A6E',
  horizon: '#F2985A',
  sun: '#FFE7B3',
  warm: '#FFB45E',
  rim: '#FFB15A',
  night: '#120E26',
};

/** The night palette: a deep blue sky with a cool moon, for episodes set after dark (lamps and screens do the work). */
export const N = {
  skyTop: '#060A1C',
  skyMid: '#111A3E',
  horizon: '#33305E',
  moon: '#F1F3FF',
  moonShade: '#C6CEEC',
  glow: '#9FC0FF',
  rim: '#A9C6FF',
};

const rnd = (seed: number, i: number) => Math.abs(Math.sin(seed * 31.7 + i * 12.9898) * 43758.5453) % 1;

/** Filters shared by every shot: rim light from the left or right, blurs for depth of field. */
export const KitDefs: React.FC = () => (
  <defs>
    <filter id="rimR" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx={4} dy={-1} stdDeviation={1.8} floodColor={D.rim} floodOpacity={1} />
      <feDropShadow dx={0} dy={0} stdDeviation={14} floodColor="#FF9A4A" floodOpacity={0.35} />
    </filter>
    <filter id="rimL" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx={-4} dy={-1} stdDeviation={1.8} floodColor={D.rim} floodOpacity={1} />
      <feDropShadow dx={0} dy={0} stdDeviation={14} floodColor="#FF9A4A" floodOpacity={0.35} />
    </filter>
    <filter id="rimRed" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx={0} dy={-2} stdDeviation={2} floodColor="#FF4A4A" floodOpacity={1} />
      <feDropShadow dx={0} dy={0} stdDeviation={16} floodColor="#FF2A3A" floodOpacity={0.45} />
    </filter>
    {/* moonlight and screen light: a cool rim for night shots, from the right or the left */}
    <filter id="rimBlue" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx={4} dy={-1} stdDeviation={1.8} floodColor={N.rim} floodOpacity={1} />
      <feDropShadow dx={0} dy={0} stdDeviation={14} floodColor="#6A8CFF" floodOpacity={0.3} />
    </filter>
    <filter id="rimBlueL" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx={-4} dy={-1} stdDeviation={1.8} floodColor={N.rim} floodOpacity={1} />
      <feDropShadow dx={0} dy={0} stdDeviation={14} floodColor="#6A8CFF" floodOpacity={0.3} />
    </filter>
    <radialGradient id="kitMoonBloom">
      <stop offset="0%" stopColor="#E6EEFF" stopOpacity={0.75} />
      <stop offset="30%" stopColor={N.glow} stopOpacity={0.25} />
      <stop offset="100%" stopColor={N.glow} stopOpacity={0} />
    </radialGradient>
    {[3, 6, 10, 16].map((b) => (
      <filter key={b} id={`blur${b}`} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation={b} />
      </filter>
    ))}
    <radialGradient id="kitBloom">
      <stop offset="0%" stopColor={D.sun} stopOpacity={0.9} />
      <stop offset="35%" stopColor={D.warm} stopOpacity={0.35} />
      <stop offset="100%" stopColor={D.warm} stopOpacity={0} />
    </radialGradient>
    <radialGradient id="kitBloomRed">
      <stop offset="0%" stopColor="#FF6A5A" stopOpacity={0.8} />
      <stop offset="35%" stopColor="#C8102E" stopOpacity={0.3} />
      <stop offset="100%" stopColor="#C8102E" stopOpacity={0} />
    </radialGradient>
    <linearGradient id="kitShaft" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#FFD9A0" stopOpacity={0.32} />
      <stop offset="100%" stopColor="#FFD9A0" stopOpacity={0} />
    </linearGradient>
  </defs>
);

/** A sky that fills the frame (in world units around the given box), back-lit by a low sun. */
export const DuskSky: React.FC<{ id: string; x0?: number; y0?: number; w?: number; h?: number; horizonY: number; red?: number }> = ({
  id,
  x0 = -400,
  y0 = -400,
  w = 2720,
  h = 1880,
  horizonY,
  red = 0,
}) => (
  <g>
    <defs>
      <linearGradient id={id} x1="0" y1={y0} x2="0" y2={horizonY + 60} gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={D.skyTop} />
        <stop offset="62%" stopColor={D.skyMid} />
        <stop offset="100%" stopColor={D.horizon} />
      </linearGradient>
    </defs>
    <rect x={x0} y={y0} width={w} height={h} fill={`url(#${id})`} />
    {red > 0 ? <rect x={x0} y={y0} width={w} height={h} fill="#7A0F22" opacity={0.75 * red} /> : null}
  </g>
);

/** Radial god rays from a point, turning slowly. */
export const Rays: React.FC<{ x: number; y: number; t: number; len?: number; n?: number; o?: number; color?: string }> = ({
  x,
  y,
  t,
  len = 1600,
  n = 14,
  o = 0.13,
  color = '#FFE2B0',
}) => (
  <g transform={`translate(${x} ${y}) rotate(${t * 0.12})`} opacity={o}>
    {Array.from({ length: n }).map((_, i) => {
      const a = (i / n) * 360 + rnd(3, i) * 8;
      const wdt = 2.2 + rnd(5, i) * 3.5;
      return <path key={i} transform={`rotate(${a})`} d={`M 0 0 L ${len} ${-len * wdt / 100} L ${len} ${len * wdt / 100} Z`} fill={color} />;
    })}
  </g>
);

export const Sun: React.FC<{ x: number; y: number; r: number; t: number; rays?: boolean; red?: number }> = ({ x, y, r, t, rays = true, red = 0 }) => (
  <g>
    <circle cx={x} cy={y} r={r * 5} fill={red > 0.5 ? 'url(#kitBloomRed)' : 'url(#kitBloom)'} />
    {rays ? <Rays x={x} y={y} t={t} color={red > 0.5 ? '#FF7A6A' : undefined} o={red > 0.5 ? 0.09 : undefined} /> : null}
    <circle cx={x} cy={y} r={r} fill={red > 0.5 ? '#E8414E' : D.sun} />
  </g>
);

export const Haze: React.FC<{ y: number; h?: number; o?: number }> = ({ y, h = 260, o = 0.35 }) => (
  <g>
    <defs>
      <linearGradient id={`haze${y}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={D.warm} stopOpacity={0} />
        <stop offset="50%" stopColor={D.warm} stopOpacity={o} />
        <stop offset="100%" stopColor={D.warm} stopOpacity={0} />
      </linearGradient>
    </defs>
    <rect x={-400} y={y - h / 2} width={2720} height={h} fill={`url(#haze${y})`} />
  </g>
);

export const Bokeh: React.FC<{ seed: number; n?: number; x0: number; y0: number; w: number; h: number; t: number; o?: number }> = ({ seed, n = 10, x0, y0, w, h, t, o = 0.22 }) => (
  <g filter="url(#blur6)">
    {Array.from({ length: n }).map((_, i) => (
      <circle
        key={i}
        cx={x0 + rnd(seed, i) * w + Math.sin(t / 40 + i) * 12}
        cy={y0 + rnd(seed + 1, i) * h + Math.cos(t / 50 + i) * 8}
        r={14 + rnd(seed + 2, i) * 36}
        fill={i % 3 ? '#FFD9A0' : '#FF9AB0'}
        opacity={o * (0.5 + rnd(seed + 3, i) * 0.5)}
      />
    ))}
  </g>
);

/** A light shaft through a window: a soft, fading quad. */
export const Shaft: React.FC<{ d: string; o?: number }> = ({ d, o = 1 }) => <path d={d} fill="url(#kitShaft)" opacity={o} />;

/** A dark, blurred foreground shape for depth (over-the-shoulder heads, a desk edge). */
export const Foreground: React.FC<{ children: React.ReactNode; blur?: number }> = ({ children, blur = 10 }) => (
  <g filter={`url(#blur${blur})`}>{children}</g>
);

export const Skyline: React.FC<{ y: number; seed: number; color?: string; h?: number }> = ({ y, seed, color = '#2A1B45', h = 160 }) => {
  let d = `M -400 ${y}`;
  let x = -400;
  let i = 0;
  while (x < 2320) {
    const bw = 60 + rnd(seed, i) * 120;
    const bh = 40 + rnd(seed + 1, i) * h;
    d += ` L ${x} ${y - bh} L ${x + bw} ${y - bh}`;
    x += bw;
    i++;
  }
  d += ` L 2320 ${y} Z`;
  return (
    <g>
      <path d={d} fill={color} />
      {Array.from({ length: 40 }).map((_, k) => (
        <rect key={k} x={-300 + rnd(seed + 5, k) * 2500} y={y - 20 - rnd(seed + 6, k) * h * 0.8} width={8} height={10} fill="#FFC27A" opacity={0.25 + rnd(seed + 7, k) * 0.5} />
      ))}
    </g>
  );
};

/** A night sky that fills the frame (world units around the given box): deep blue, a faint city glow at the horizon. */
export const NightSky: React.FC<{ id: string; x0?: number; y0?: number; w?: number; h?: number; horizonY: number }> = ({ id, x0 = -400, y0 = -400, w = 2720, h = 1880, horizonY }) => (
  <g>
    <defs>
      <linearGradient id={id} x1="0" y1={y0} x2="0" y2={horizonY + 60} gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={N.skyTop} />
        <stop offset="60%" stopColor={N.skyMid} />
        <stop offset="100%" stopColor={N.horizon} />
      </linearGradient>
    </defs>
    <rect x={x0} y={y0} width={w} height={h} fill={`url(#${id})`} />
  </g>
);

/** Stars that twinkle slowly, scattered over a box. */
export const Stars: React.FC<{ seed: number; x0: number; y0: number; w: number; h: number; t: number; n?: number; o?: number }> = ({ seed, x0, y0, w, h, t, n = 40, o = 0.8 }) => (
  <g>
    {Array.from({ length: n }).map((_, i) => {
      const tw = 0.55 + 0.45 * Math.sin(t / (7 + rnd(seed + 3, i) * 9) + i * 2.1);
      return <circle key={i} cx={x0 + rnd(seed, i) * w} cy={y0 + rnd(seed + 1, i) * h} r={0.8 + rnd(seed + 2, i) * 1.8} fill="#EAF0FF" opacity={o * tw} />;
    })}
  </g>
);

/** The moon: a cool bloom, the disc lit from one side, a few soft craters. */
export const Moon: React.FC<{ x: number; y: number; r: number; bloom?: number }> = ({ x, y, r, bloom = 1 }) => (
  <g>
    <circle cx={x} cy={y} r={r * 6} fill="url(#kitMoonBloom)" opacity={bloom} />
    <circle cx={x} cy={y} r={r} fill={N.moon} />
    <path d={`M ${x + r * 0.15} ${y - r} A ${r} ${r} 0 0 1 ${x + r * 0.15} ${y + r} A ${r * 0.8} ${r} 0 0 0 ${x + r * 0.15} ${y - r} Z`} fill={N.moonShade} opacity={0.55} />
    {[[-0.35, -0.2, 0.22], [0.1, 0.35, 0.16], [0.3, -0.35, 0.12], [-0.25, 0.4, 0.1]].map(([dx, dy, k], i) => (
      <circle key={i} cx={x + dx * r} cy={y + dy * r} r={k * r} fill={N.moonShade} opacity={0.7} />
    ))}
  </g>
);
