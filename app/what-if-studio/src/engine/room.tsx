import React from 'react';
import { lerp } from './anim';

// Rooms in one-point perspective. Measured against the genre, the gap was the world, not the animation: full sets in
// real perspective, 20-40 designed objects, light that comes from something (windows, lamps, sconces, string lights),
// muted walls so that light reads.
// Every room is a one-point perspective box: a point is (u across, v down, w toward camera), 0..1 on the
// back wall's box, w = 0 on the back wall and 1 at the near plane. Equal steps in w are equal steps in depth.

export type Pt = { x: number; y: number };
export type V3 = [number, number, number];
export const pts = (a: Pt[]) => a.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

/** The set palette: muted, mid-dark surfaces, so the practical lights read. */
export const S3 = {
  wall: '#443A4B',
  wallSide: '#362E3E',
  ceiling: '#211B28',
  floor: '#2E2228',
  board: '#253C35',
  wood: '#5B4038',
  woodLight: '#7A5747',
  woodDark: '#3A2826',
  trim: '#231C29',
  warm: '#FFB46A',
  glow: '#FFD39A',
  metal: '#5E5A6C',
};

export const makeRoom = (vp: Pt, back: { x0: number; x1: number; y0: number; y1: number }, S = 3.5) => {
  const s = (w: number) => 1 / lerp(1, 1 / S, w);
  const P = (u: number, v: number, w: number): Pt => {
    const k = s(w);
    return { x: vp.x + (lerp(back.x0, back.x1, u) - vp.x) * k, y: vp.y + (lerp(back.y0, back.y1, v) - vp.y) * k };
  };
  const Q = (a: V3[]) => pts(a.map(([u, v, w]) => P(u, v, w)));
  return { vp, back, s, P, Q };
};
export type Room = ReturnType<typeof makeRoom>;

/** A box in the room, drawn face by face: only the faces this camera can see, lighter on top, darker at the sides. */
export const Box: React.FC<{ r: Room; u: [number, number]; v: [number, number]; w: [number, number]; front: string; top?: string; side?: string; rim?: boolean }> = ({
  r, u: [u0, u1], v: [v0, v1], w: [w0, w1], front, top, side, rim,
}) => {
  const bx = (u: number) => lerp(r.back.x0, r.back.x1, u);
  const by = (v: number) => lerp(r.back.y0, r.back.y1, v);
  const faces: React.ReactNode[] = [];
  if (by(v0) > r.vp.y) faces.push(<polygon key="t" points={r.Q([[u0, v0, w0], [u1, v0, w0], [u1, v0, w1], [u0, v0, w1]])} fill={top ?? front} />);
  if (by(v1) < r.vp.y) faces.push(<polygon key="b" points={r.Q([[u0, v1, w0], [u1, v1, w0], [u1, v1, w1], [u0, v1, w1]])} fill={side ?? front} />);
  if (bx(u0) > r.vp.x) faces.push(<polygon key="l" points={r.Q([[u0, v0, w0], [u0, v0, w1], [u0, v1, w1], [u0, v1, w0]])} fill={side ?? front} />);
  if (bx(u1) < r.vp.x) faces.push(<polygon key="r" points={r.Q([[u1, v0, w0], [u1, v0, w1], [u1, v1, w1], [u1, v1, w0]])} fill={side ?? front} />);
  const a = r.P(u0, v0, w1);
  const b = r.P(u1, v0, w1);
  return (
    <g>
      {faces}
      <polygon points={r.Q([[u0, v0, w1], [u1, v0, w1], [u1, v1, w1], [u0, v1, w1]])} fill={front} />
      {rim ? <path d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} stroke={S3.warm} strokeWidth={2.5} opacity={0.55} /> : null}
    </g>
  );
};
