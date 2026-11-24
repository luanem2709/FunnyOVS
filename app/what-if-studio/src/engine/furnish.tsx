import React from 'react';
import { rnd } from './anim';
import { LEG_LEN } from './rig';
import { Room, S3, Pt } from './room';
import { WallTexture, RoomCorners, SkyView, Glow, Cone } from './light';

// The room kit: build a new interior in a few lines. makeRoom gives the perspective, RoomShell draws the room,
// BackWindow, Pendant, WallLight, FloorPlant and WallFrame furnish it, Box adds furniture, and stand() puts a
// character on the floor at the right size for its depth. Then finish the set with a LightVeil (holes at each light),
// the glows again on top, and Dust in the beams, as the study does.

const BODY_H = 378; // the rig's height at scale 1, from the top of the head to the soles

/** Where a character stands on the floor at (u, w): hip position and scale, so their height is k of the room's. */
export const stand = (r: Room, u: number, w: number, k = 0.62) => {
  const p = r.P(u, 1, w);
  const scale = (k * (r.back.y1 - r.back.y0) * r.s(w)) / BODY_H;
  return { x: p.x, y: p.y - LEG_LEN * scale, scale };
};

/** The room's walls, floor and ceiling. Floors: 'boards' (run toward the back wall) or 'tiles' (a grid). */
export const RoomShell: React.FC<{ r: Room; id: string; floor?: 'boards' | 'tiles'; wall?: string; side?: string; floorC?: string; ceiling?: string; lines?: string }> = ({
  r, id, floor = 'boards', wall = S3.wall, side = S3.wallSide, floorC = S3.floor, ceiling = S3.ceiling, lines = '#22181D',
}) => {
  const { P, Q, back: B } = r;
  const fl: React.ReactNode[] = [];
  if (floor === 'boards') {
    for (let i = 1; i < 14; i++) {
      const a = P(i / 14, 1, 0);
      const b = P(i / 14, 1, 1);
      fl.push(<path key={`fb${i}`} d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} stroke={lines} strokeWidth={2.5} />);
      for (let k = 0; k < 3; k++) {
        const w = 0.12 + rnd(i, k) * 0.8;
        const c = P(i / 14, 1, w);
        const d = P((i + 1) / 14, 1, w);
        fl.push(<path key={`fj${i}-${k}`} d={`M ${c.x} ${c.y} L ${d.x} ${d.y}`} stroke={lines} strokeWidth={1.6} />);
      }
    }
  } else {
    for (let i = 1; i < 12; i++) {
      const a = P(i / 12, 1, 0);
      const b = P(i / 12, 1, 1);
      fl.push(<path key={`ta${i}`} d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} stroke={lines} strokeWidth={2} />);
    }
    for (let j = 1; j < 14; j++) {
      const a = P(0, 1, j / 14);
      const b = P(1, 1, j / 14);
      fl.push(<path key={`tb${j}`} d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} stroke={lines} strokeWidth={2} />);
    }
  }
  return (
    <g>
      <defs>
        <linearGradient id={`${id}L`} gradientUnits="userSpaceOnUse" x1={B.x0} y1={0} x2={B.x0 - 730} y2={0}>
          <stop offset="0%" stopColor="#000" stopOpacity={0} />
          <stop offset="100%" stopColor="#000" stopOpacity={0.5} />
        </linearGradient>
        <linearGradient id={`${id}R`} gradientUnits="userSpaceOnUse" x1={B.x1} y1={0} x2={B.x1 + 730} y2={0}>
          <stop offset="0%" stopColor="#000" stopOpacity={0} />
          <stop offset="100%" stopColor="#000" stopOpacity={0.5} />
        </linearGradient>
        <linearGradient id={`${id}F`} gradientUnits="userSpaceOnUse" x1={0} y1={B.y1} x2={0} y2={B.y1 + 460}>
          <stop offset="0%" stopColor="#000" stopOpacity={0} />
          <stop offset="100%" stopColor="#000" stopOpacity={0.55} />
        </linearGradient>
      </defs>
      <rect x={-1500} y={-1500} width={5000} height={1500 + B.y0 + 60} fill={ceiling} />
      <polygon points={Q([[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]])} fill={ceiling} />
      <polygon points={Q([[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]])} fill={side} />
      <polygon points={Q([[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]])} fill={`url(#${id}L)`} />
      <polygon points={Q([[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]])} fill={side} />
      <polygon points={Q([[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]])} fill={`url(#${id}R)`} />
      <polygon points={Q([[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]])} fill={floorC} />
      {fl}
      <polygon points={Q([[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]])} fill={`url(#${id}F)`} />
      <rect x={B.x0} y={B.y0} width={B.x1 - B.x0} height={B.y1 - B.y0} fill={wall} />
      <WallTexture rect={[B.x0, B.y0, B.x1 - B.x0, B.y1 - B.y0]} />
      <WallTexture points={Q([[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]])} />
      <WallTexture points={Q([[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]])} />
      <RoomCorners x0={B.x0} x1={B.x1} y0={B.y0} y1={B.y1} />
      <rect x={B.x0} y={B.y1 - 14} width={B.x1 - B.x0} height={14} fill={S3.trim} />
      <polygon points={Q([[0, 0.965, 0], [0, 0.965, 1], [0, 1, 1], [0, 1, 0]])} fill={S3.trim} />
      <polygon points={Q([[1, 0.965, 0], [1, 0.965, 1], [1, 1, 1], [1, 1, 0]])} fill={S3.trim} />
      <path d={`M ${B.x0} ${B.y0 + 2} L ${B.x1} ${B.y0 + 2}`} stroke="#2A2331" strokeWidth={5} />
    </g>
  );
};

/**
 * A window in the back wall onto the dusk (screen box x0..x1, y0..y1 on the back wall), with frame, mullions, sill,
 * the sun's bloom, optional curtains and its light falling on the floor. `sun` is where the sun sits in it.
 */
export const BackWindow: React.FC<{ r: Room; id: string; t: number; x0: number; x1: number; y0: number; y1: number; sun?: Pt; cols?: number; curtains?: boolean; red?: number; night?: boolean }> = ({
  r, id, t, x0, x1, y0, y1, sun, cols = 2, curtains = true, red = 0, night = false,
}) => {
  const B = r.back;
  const u0 = (x0 - B.x0) / (B.x1 - B.x0);
  const u1 = (x1 - B.x0) / (B.x1 - B.x0);
  const w = x1 - x0;
  const h = y1 - y0;
  const s = sun ?? { x: x0 + w * 0.7, y: y1 - 12 };
  return (
    <g>
      <SkyView id={`${id}win`} clip={`M ${x0} ${y0} L ${x1} ${y0} L ${x1} ${y1} L ${x0} ${y1} Z`} box={{ x: x0, y: y0, w, h }} t={t} sun={s} sunR={Math.min(40, w * 0.1) * (night ? 0.75 : 1)} red={red} night={night} />
      <g fill="#1E1824">
        <rect x={x0 - 12} y={y0 - 12} width={w + 24} height={14} />
        <rect x={x0 - 12} y={y1 - 2} width={w + 24} height={10} />
        <rect x={x0 - 12} y={y0 - 12} width={14} height={h + 20} />
        <rect x={x1 - 2} y={y0 - 12} width={14} height={h + 20} />
        {Array.from({ length: cols - 1 }).map((_, i) => (
          <rect key={i} x={x0 + (w * (i + 1)) / cols - 5} y={y0} width={10} height={h} />
        ))}
        <rect x={x0} y={y0 + h * 0.32} width={w} height={7} />
      </g>
      <polygon points={r.Q([[u0 - 0.02, (y1 + 4 - B.y0) / (B.y1 - B.y0), 0], [u1 + 0.02, (y1 + 4 - B.y0) / (B.y1 - B.y0), 0], [u1 + 0.02, (y1 + 4 - B.y0) / (B.y1 - B.y0), 0.03], [u0 - 0.02, (y1 + 4 - B.y0) / (B.y1 - B.y0), 0.03]])} fill="#6A5056" />
      <path d={`M ${x0 - 10} ${y1 + 8} L ${x1 + 10} ${y1 + 8}`} stroke={night ? '#A9C6FF' : S3.warm} strokeWidth={2} opacity={night ? 0.45 : 0.6} />
      <circle cx={s.x} cy={s.y} r={w * (night ? 0.9 : 1.3)} fill={night ? 'url(#kitMoonBloom)' : 'url(#kitBloom)'} opacity={(night ? 0.3 : 0.42) * (1 - red)} />
      {curtains
        ? [
            { x: x0 - 88, flip: 1 },
            { x: x1 - 6, flip: -1 },
          ].map((c, i) => (
            <g key={`cu${i}`}>
              <path d={`M ${c.x} ${y0 - 20} L ${c.x + 94} ${y0 - 20} L ${c.x + 94 - c.flip * 8} ${y1 + 110} Q ${c.x + 47} ${y1 + 118} ${c.x - c.flip * 6} ${y1 + 110} Z`} fill="#4E2F42" />
              {[0.22, 0.5, 0.78].map((k, j) => (
                <rect key={j} x={c.x + 94 * k - 6} y={y0 - 18} width={12} height={h + 126} fill={j % 2 ? '#40263A' : '#5E3A50'} opacity={0.8} />
              ))}
              <rect x={c.flip > 0 ? c.x + 90 : c.x} y={y0 - 18} width={4} height={h + 126} fill={night ? '#A9C6FF' : S3.warm} opacity={night ? 0.4 : 0.55} />
            </g>
          ))
        : null}
      {curtains ? <rect x={x0 - 100} y={y0 - 26} width={w + 200} height={8} rx={4} fill="#1A1420" /> : null}
      <polygon points={r.Q([[u0 + 0.02, 1, 0.02], [u1 - 0.02, 1, 0.02], [u1 + 0.08, 1, 0.55], [u0 - 0.08, 1, 0.55]])} fill={night ? '#9FC0FF' : '#FFB46A'} opacity={night ? 0.08 : 0.1} style={{ mixBlendMode: 'screen' }} />
    </g>
  );
};

/** A pendant lamp hanging from the ceiling over the floor point (u, w), swaying a touch, with its cone and glow. */
export const Pendant: React.FC<{ r: Room; u: number; w: number; v?: number; t: number; cone?: number; glow?: number }> = ({ r, u, w, v = 0.27, t, cone = 0.28, glow = 0.55 }) => {
  const top = r.P(u, 0, w);
  const sh = r.P(u, v, w);
  const k = r.s(w) / r.s(0.42);
  return (
    <g transform={`rotate(${Math.sin(t / 28) * 1.2} ${top.x} ${top.y})`}>
      <path d={`M ${top.x} ${top.y} L ${sh.x} ${sh.y - 30 * k}`} stroke="#120E16" strokeWidth={3} />
      <path d={`M ${sh.x - 16 * k} ${sh.y - 32 * k} L ${sh.x + 16 * k} ${sh.y - 32 * k} L ${sh.x + 44 * k} ${sh.y} L ${sh.x - 44 * k} ${sh.y} Z`} fill="#1C1620" />
      <ellipse cx={sh.x} cy={sh.y} rx={44 * k} ry={8 * k} fill="#FFE2B0" />
      <Cone d={`M ${sh.x - 40 * k} ${sh.y} L ${sh.x + 40 * k} ${sh.y} L ${sh.x + 240 * k} ${sh.y + 520 * k} L ${sh.x - 240 * k} ${sh.y + 520 * k} Z`} o={cone} />
      <Glow x={sh.x} y={sh.y + 6} r={220 * k} o={glow} />
    </g>
  );
};
/** Where a Pendant's light is, for the LightVeil and the glows on top: [x, y, radius]. */
export const pendantLight = (r: Room, u: number, w: number, v = 0.27): [number, number, number] => {
  const sh = r.P(u, v, w);
  return [sh.x, sh.y + 40, 460 * (r.s(w) / r.s(0.42))];
};

/** A wall light on a side wall (u 0 or 1) or the back wall (w 0), at height v. */
export const WallLight: React.FC<{ r: Room; u: number; v: number; w: number; o?: number }> = ({ r, u, v, w, o = 0.55 }) => {
  const p = r.P(u, v, w);
  const k = r.s(w) / r.s(0.66);
  return (
    <g>
      <rect x={p.x - 9 * k} y={p.y - 20 * k} width={18 * k} height={30 * k} rx={6 * k} fill="#2A2026" />
      <path d={`M ${p.x - 20 * k} ${p.y - 8 * k} L ${p.x + 20 * k} ${p.y - 8 * k} L ${p.x + 14 * k} ${p.y - 42 * k} L ${p.x - 14 * k} ${p.y - 42 * k} Z`} fill="#F2C08A" />
      <Glow x={p.x} y={p.y - 24 * k} r={230 * k} o={o} />
    </g>
  );
};

/** A potted plant on the floor at (u, w): a terracotta pot and five long leaves. */
export const FloorPlant: React.FC<{ r: Room; u: number; w: number; size?: number }> = ({ r, u, w, size = 1 }) => {
  const b = r.P(u, 1, w);
  const k = (r.s(w) / r.s(0.07)) * size;
  return (
    <g>
      <ellipse cx={b.x + 6 * k} cy={b.y + 2} rx={56 * k} ry={12 * k} fill="#000" opacity={0.35} />
      <path d={`M ${b.x - 40 * k} ${b.y - 74 * k} L ${b.x + 40 * k} ${b.y - 74 * k} L ${b.x + 30 * k} ${b.y} L ${b.x - 30 * k} ${b.y} Z`} fill="#8A5040" />
      <rect x={b.x - 44 * k} y={b.y - 84 * k} width={88 * k} height={14 * k} rx={4 * k} fill="#6A3C30" />
      {[[-60, -150], [-20, -190], [30, -170], [64, -120], [-80, -90]].map(([dx, dy], i) => {
        const o = { x: b.x, y: b.y - 80 * k };
        return <path key={i} d={`M ${o.x} ${o.y} Q ${o.x + dx * 0.3 * k} ${o.y + dy * 0.6 * k} ${o.x + dx * k} ${o.y + dy * k} Q ${o.x + dx * 0.7 * k} ${o.y + dy * 0.4 * k} ${o.x} ${o.y} Z`} fill={i % 2 ? '#3F5E44' : '#4E7350'} />;
      })}
    </g>
  );
};

/** A framed picture on the back wall: a dark frame, a mount, and a simple dusk landscape or an abstract. */
export const WallFrame: React.FC<{ x: number; y: number; w: number; h: number; art?: 0 | 1 | 2 }> = ({ x, y, w, h, art = 0 }) => (
  <g>
    <rect x={x} y={y} width={w} height={h} fill="#1E1824" />
    <rect x={x + 7} y={y + 7} width={w - 14} height={h - 14} fill="#E6D4B6" />
    {art === 0 ? (
      <g>
        <rect x={x + 14} y={y + 14} width={w - 28} height={h - 28} fill="#E4A27A" />
        <circle cx={x + w / 2} cy={y + h * 0.55} r={Math.min(w, h) * 0.12} fill="#FFE2B0" />
        <path d={`M ${x + 14} ${y + h - 14} L ${x + w * 0.35} ${y + h * 0.5} L ${x + w * 0.55} ${y + h - 26} L ${x + w * 0.7} ${y + h * 0.6} L ${x + w - 14} ${y + h - 14} Z`} fill="#6A3E5A" />
      </g>
    ) : art === 1 ? (
      <g>
        <rect x={x + 14} y={y + 14} width={w - 28} height={h - 28} fill="#4A5A7A" />
        <circle cx={x + w / 2 - w * 0.08} cy={y + h / 2 - h * 0.08} r={Math.min(w, h) * 0.16} fill="#E9C46A" />
        <circle cx={x + w / 2 + w * 0.12} cy={y + h / 2 + h * 0.12} r={Math.min(w, h) * 0.11} fill="#D9906A" />
      </g>
    ) : (
      <g>
        <rect x={x + 14} y={y + 14} width={w - 28} height={h - 28} fill="#9FC0D6" />
        <rect x={x + 14} y={y + h - 34} width={w - 28} height={20} fill="#4A6A8A" />
        <path d={`M ${x + w * 0.45} ${y + h - 34} L ${x + w * 0.45} ${y + 26} L ${x + w * 0.66} ${y + h - 38} Z`} fill="#F4EEE0" />
      </g>
    )}
  </g>
);

/** A round wall clock on the back wall. */
export const WallClock: React.FC<{ x: number; y: number; r?: number; t?: number }> = ({ x, y, r = 32, t = 0 }) => (
  <g>
    <circle cx={x} cy={y} r={r} fill="#EFE2CC" />
    <circle cx={x} cy={y} r={r} fill="none" stroke="#1E1824" strokeWidth={r * 0.19} />
    <path d={`M ${x} ${y} L ${x} ${y - r * 0.62} M ${x} ${y} L ${x + r * 0.44} ${y + r * 0.25}`} stroke="#1E1824" strokeWidth={r * 0.13} strokeLinecap="round" transform={`rotate(${t * 0.2} ${x} ${y})`} />
  </g>
);

/** A shadow on the floor under a box-shaped thing (a cabinet, a table): an offset dark quad. */
export const FloorShadow: React.FC<{ r: Room; u: [number, number]; w: [number, number]; o?: number }> = ({ r, u: [u0, u1], w: [w0, w1], o = 0.35 }) => (
  <polygon points={r.Q([[u0, 1, w0], [u1 + 0.02, 1, w0], [u1 + 0.02, 1, w1 + 0.02], [u0, 1, w1 + 0.02]])} fill="#000" opacity={o} />
);

/**
 * A table top seen from high above, filling the frame (a desk, a worktop): the surface with its grain running away
 * toward the top, its lit front edge at y `edge`, the floor far below past the edge, out of focus. Put props on it in
 * screen coordinates. For a pure top-down shot, push `edge` past the bottom of frame (1300).
 */
export const Tabletop: React.FC<{ edge?: number; wood?: string; grain?: string; lip?: string; floor?: string; floorLines?: string; kind?: 'wood' | 'stone' }> = ({
  edge = 640, wood = '#6B4B42', grain = '#5C4038', lip = '#7A5747', floor = '#2E2228', floorLines = '#22181D', kind = 'wood',
}) => {
  const gx = (x0: number, y: number) => x0 + (960 - x0) * ((edge - y) / (edge + 1600));
  return (
    <g>
      <g filter="url(#blur3)">
        <rect x={-400} y={edge} width={2720} height={900} fill={floor} />
        {Array.from({ length: 40 }).map((_, i) => {
          const x = -500 + i * 72;
          return <path key={i} d={`M ${x} ${edge + 90} L ${960 + (x - 960) * 1.5} 1400`} stroke={floorLines} strokeWidth={3} />;
        })}
      </g>
      <rect x={-400} y={-400} width={2720} height={edge + 400} fill={wood} />
      {kind === 'wood'
        ? Array.from({ length: 30 }).map((_, i) => {
            const x0 = -800 + i * 130;
            return <path key={i} d={`M ${x0} ${edge} L ${gx(x0, -400)} -400`} stroke={grain} strokeWidth={i % 3 ? 2 : 4} opacity={0.75} />;
          })
        : Array.from({ length: 14 }).map((_, i) => (
            <path
              key={i}
              d={`M ${-400 + rnd(41, i) * 2700} ${-400 + rnd(42, i) * 1000} q ${120 + rnd(43, i) * 200} ${40 + rnd(44, i) * 60} ${300 + rnd(45, i) * 300} ${-20 + rnd(46, i) * 80}`}
              stroke={grain}
              strokeWidth={2 + rnd(47, i) * 3}
              fill="none"
              opacity={0.5}
            />
          ))}
      <rect x={-400} y={edge} width={2720} height={24} fill={lip} />
      <rect x={-400} y={edge} width={2720} height={3} fill={S3.warm} opacity={0.7} />
    </g>
  );
};

