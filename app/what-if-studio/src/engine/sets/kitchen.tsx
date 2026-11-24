import React from 'react';
import { makeRoom, Box, S3, pts } from '../room';
import { RoomShell, BackWindow, Pendant, pendantLight, WallLight, FloorShadow, WallClock } from '../furnish';
import { Glow, LightVeil, Dust } from '../light';
import { rnd } from '../anim';

// The kitchen at dusk, built with the room kit: a counter run along the back wall under a window with the low sun,
// a tiled splashback, open shelves with jars, a tall fridge on the right, wall cabinets and a wall light on the left,
// two pendants over an island in the middle. Characters stand behind the island at about w 0.4 (stand(KITCHEN, u,
// 0.4)); draw <KitchenIsland /> after them so it hides their legs. Worktop height is v 0.72.

export const KITCHEN = makeRoom({ x: 960, y: 500 }, { x0: 500, x1: 1420, y0: 330, y1: 745 }, 3.4);
const K = { wall: '#3B4148', side: '#30353C', floor: '#2C2A30', cab: '#4F5F5A', cabDark: '#3E4B47', top: '#B9AE9C', topEdge: '#8E8474', tile: '#5A6266' };
export const KITCHEN_TOP = 0.72; // the worktop's v

/** Cupboard doors and handles on a box front (the face at w1). */
const Doors: React.FC<{ u0: number; u1: number; v0: number; v1: number; w: number; n: number }> = ({ u0, u1, v0, v1, w, n }) => {
  const R = KITCHEN;
  const out: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const a = u0 + ((u1 - u0) * i) / n + 0.006;
    const b = u0 + ((u1 - u0) * (i + 1)) / n - 0.006;
    out.push(<polygon key={`d${i}`} points={R.Q([[a, v0 + 0.02, w], [b, v0 + 0.02, w], [b, v1 - 0.02, w], [a, v1 - 0.02, w]])} fill="none" stroke="#2E3836" strokeWidth={3} />);
    const h = R.P(i % 2 ? a + 0.012 : b - 0.012, v0 + 0.07, w);
    out.push(<rect key={`h${i}`} x={h.x - 3} y={h.y} width={6} height={22 * R.s(w)} rx={3} fill="#C9B48A" />);
  }
  return <g>{out}</g>;
};

export const Kitchen: React.FC<{ t: number; id?: string; veil?: number; red?: number }> = ({ t, id = 'kit', veil = 0.5, red = 0 }) => {
  const R = KITCHEN;
  const { P, Q } = R;
  const T = KITCHEN_TOP;
  const shelfV = [0.3, 0.45];
  const jars: React.ReactNode[] = [];
  shelfV.forEach((v, si) => {
    for (let k = 0; k < 5; k++) {
      const u = 0.635 + k * 0.026;
      const p = P(u, v, 0.012);
      const h = 34 + rnd(si + 3, k) * 22;
      const c = ['#C98E58', '#9FB49A', '#D9C69A', '#B9705A', '#8FA6B9'][(k + si * 2) % 5];
      jars.push(
        <g key={`j${si}-${k}`}>
          <rect x={p.x - 11} y={p.y - h} width={22} height={h} rx={5} fill={c} opacity={0.9} />
          <rect x={p.x - 12} y={p.y - h - 6} width={24} height={7} rx={2} fill="#3A2C2A" />
          <rect x={p.x - 8} y={p.y - h + 6} width={4} height={h - 12} rx={2} fill="#FFFFFF" opacity={0.25} />
        </g>,
      );
    }
  });
  const tiles: React.ReactNode[] = [];
  const ty0 = P(0, 0.56, 0).y;
  const ty1 = P(0, T, 0).y;
  for (let x = 500; x < 1100; x += 28) tiles.push(<path key={`tx${x}`} d={`M ${x} ${ty0} L ${x} ${ty1}`} stroke="#4A5155" strokeWidth={2} />);
  for (let y = ty0; y < ty1; y += 20) tiles.push(<path key={`ty${y}`} d={`M 500 ${y} L 1100 ${y}`} stroke="#4A5155" strokeWidth={2} />);
  return (
    <g>
      <RoomShell r={R} id={id} floor="tiles" wall={K.wall} side={K.side} floorC={K.floor} lines="#232127" />
      {/* the splashback: small tiles from the worktop up to the window sill */}
      <rect x={500} y={ty0} width={600} height={ty1 - ty0} fill={K.tile} opacity={0.5} />
      {tiles}
      <BackWindow r={R} id={`${id}w`} t={t} x0={640} x1={940} y0={375} y1={540} sun={{ x: 860, y: 530 }} cols={2} curtains={false} red={red} />
      {/* a café curtain on a rod across the window's lower half */}
      <rect x={624} y={452} width={332} height={6} rx={3} fill="#1A1420" />
      <path d={`M 630 458 L 950 458 L 950 520 Q 870 530 790 520 Q 710 530 630 520 Z`} fill="#7A4A52" opacity={0.92} />
      <path d="M 630 458 L 950 458" stroke={S3.warm} strokeWidth={2} opacity={0.5} />
      {/* open shelves with jars, a clock above */}
      {shelfV.map((v, i) => (
        <polygon key={`sh${i}`} points={Q([[0.62, v, 0], [0.77, v, 0], [0.77, v, 0.03], [0.62, v, 0.03]])} fill="#6A4E40" />
      ))}
      {jars}
      <WallClock x={P(0.695, 0.15, 0).x} y={P(0.695, 0.15, 0).y} r={26} t={t} />
      {/* the back counter: cupboards, a worktop with a sink under the window and a hob */}
      <Box r={R} u={[0, 0.6]} v={[T, 1]} w={[0, 0.13]} front={K.cab} side={K.cabDark} />
      <Doors u0={0.005} u1={0.6} v0={T} v1={0.985} w={0.13} n={6} />
      <Box r={R} u={[0, 0.61]} v={[T - 0.02, T]} w={[0, 0.145]} front={K.topEdge} top={K.top} side={K.topEdge} rim />
      <polygon points={Q([[0.17, T - 0.02, 0.03], [0.38, T - 0.02, 0.03], [0.38, T - 0.02, 0.11], [0.17, T - 0.02, 0.11]])} fill="#8A9298" />
      <polygon points={Q([[0.18, T - 0.02, 0.04], [0.37, T - 0.02, 0.04], [0.37, T - 0.02, 0.1], [0.18, T - 0.02, 0.1]])} fill="#5A6268" />
      {(() => {
        const a = P(0.275, T - 0.02, 0.02);
        return <path d={`M ${a.x} ${a.y} L ${a.x} ${a.y - 52} Q ${a.x} ${a.y - 70} ${a.x + 22} ${a.y - 66} L ${a.x + 22} ${a.y - 54}`} stroke="#B8BEC4" strokeWidth={7} fill="none" strokeLinecap="round" />;
      })()}
      <polygon points={Q([[0.45, T - 0.02, 0.025], [0.57, T - 0.02, 0.025], [0.57, T - 0.02, 0.12], [0.45, T - 0.02, 0.12]])} fill="#1E1E24" />
      {[0.48, 0.54].map((u, i) => {
        const c = P(u, T - 0.02, 0.07);
        return <ellipse key={`hb${i}`} cx={c.x} cy={c.y} rx={22} ry={7} fill="none" stroke="#3A3A44" strokeWidth={4} />;
      })}
      {(() => {
        // a kettle on the hob, a chopping board and a bowl of lemons on the worktop
        const k = P(0.51, T - 0.02, 0.07);
        const b = P(0.07, T - 0.02, 0.07);
        const l = P(0.41, T - 0.02, 0.07);
        return (
          <g>
            <path d={`M ${k.x - 30} ${k.y} L ${k.x - 26} ${k.y - 48} Q ${k.x} ${k.y - 62} ${k.x + 26} ${k.y - 48} L ${k.x + 30} ${k.y} Z`} fill="#C2553E" />
            <path d={`M ${k.x - 16} ${k.y - 58} Q ${k.x} ${k.y - 82} ${k.x + 16} ${k.y - 58}`} stroke="#2A2026" strokeWidth={6} fill="none" />
            <path d={`M ${k.x + 28} ${k.y - 30} L ${k.x + 52} ${k.y - 46}`} stroke="#C2553E" strokeWidth={9} strokeLinecap="round" />
            <rect x={k.x - 26} y={k.y - 46} width={6} height={40} fill="#FFFFFF" opacity={0.25} />
            <polygon points={pts([{ x: b.x - 60, y: b.y - 2 }, { x: b.x + 50, y: b.y - 2 }, { x: b.x + 40, y: b.y - 16 }, { x: b.x - 52, y: b.y - 16 }])} fill="#A07A50" />
            <ellipse cx={l.x} cy={l.y - 8} rx={34} ry={12} fill="#E6E0D4" />
            {[-14, 4, 18].map((dx, i) => (
              <ellipse key={i} cx={l.x + dx} cy={l.y - 18 - (i === 1 ? 6 : 0)} rx={11} ry={9} fill="#E9C84A" />
            ))}
          </g>
        );
      })()}
      {/* wall cabinets and a wall light on the left wall */}
      <Box r={R} u={[0, 0.07]} v={[0.08, 0.4]} w={[0.14, 0.5]} front={K.cab} side={K.cabDark} />
      <polygon points={Q([[0.07, 0.1, 0.16], [0.07, 0.1, 0.32], [0.07, 0.38, 0.32], [0.07, 0.38, 0.16]])} fill="none" stroke="#2E3836" strokeWidth={3} />
      <polygon points={Q([[0.07, 0.1, 0.33], [0.07, 0.1, 0.48], [0.07, 0.38, 0.48], [0.07, 0.38, 0.33]])} fill="none" stroke="#2E3836" strokeWidth={3} />
      <WallLight r={R} u={0} v={0.42} w={0.66} />
      {/* the fridge on the right, with magnets and a child's drawing */}
      <FloorShadow r={R} u={[0.78, 0.98]} w={[0.02, 0.2]} />
      <Box r={R} u={[0.79, 0.98]} v={[0.16, 1]} w={[0.02, 0.2]} front="#8E9497" side="#666C70" top="#7C8285" />
      {(() => {
        const a = P(0.79, 0.16, 0.2);
        const b = P(0.79, 1, 0.2);
        const m = P(0.79, 0.44, 0.2);
        const f = (u: number, v: number) => P(u, v, 0.2);
        const d0 = f(0.81, 0.5);
        return (
          <g>
            <path d={`M ${a.x} ${m.y} L ${f(0.98, 0.44).x} ${m.y}`} stroke="#5E6468" strokeWidth={4} />
            <rect x={f(0.955, 0.25).x - 5} y={f(0.955, 0.25).y} width={10} height={70} rx={5} fill="#4E5458" />
            <rect x={f(0.955, 0.52).x - 5} y={f(0.955, 0.52).y} width={10} height={110} rx={5} fill="#4E5458" />
            <rect x={d0.x} y={d0.y} width={88} height={70} fill="#D9D0BE" transform={`rotate(-4 ${d0.x} ${d0.y})`} />
            <circle cx={d0.x + 30} cy={d0.y + 30} r={14} fill="#E9A84A" />
            <path d={`M ${d0.x + 50} ${d0.y + 58} l 10 -26 l 10 26 Z`} fill="#4A7AA0" />
            <circle cx={f(0.9, 0.3).x} cy={f(0.9, 0.3).y} r={9} fill="#D9534F" />
            <circle cx={f(0.86, 0.36).x} cy={f(0.86, 0.36).y} r={8} fill="#4A9A7A" />
            <path d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} stroke={S3.warm} strokeWidth={2.5} opacity={0.4} />
          </g>
        );
      })()}
      {/* a bin by the fridge */}
      {(() => {
        const b = P(0.72, 1, 0.12);
        return (
          <g>
            <ellipse cx={b.x + 5} cy={b.y + 3} rx={40} ry={10} fill="#000" opacity={0.35} />
            <rect x={b.x - 30} y={b.y - 88} width={60} height={88} rx={6} fill="#5A5E66" />
            <rect x={b.x - 33} y={b.y - 94} width={66} height={12} rx={5} fill="#46494F" />
          </g>
        );
      })()}
      <Pendant r={R} u={0.36} w={0.5} v={0.24} t={t} />
      <Pendant r={R} u={0.64} w={0.5} v={0.24} t={t + 9} />
      <LightVeil id={`${id}veil`} lights={[[800, 470, 430], pendantLight(R, 0.36, 0.5, 0.24), pendantLight(R, 0.64, 0.5, 0.24), [P(0, 0.42, 0.66).x, P(0, 0.42, 0.66).y - 24, 300], [930, 900, 420]]} o={veil} />
      <circle cx={860} cy={530} r={300} fill="url(#kitBloom)" opacity={0.3 * (1 - red)} />
      {[0.36, 0.64].map((u) => {
        const [x, y] = pendantLight(R, u, 0.5, 0.24);
        return <Glow key={u} x={x} y={y - 34} r={250} o={0.32} />;
      })}
      <Dust t={t} seed={31} x0={640} y0={420} w={420} h={420} n={36} />
      {red > 0 ? <rect x={-1500} y={-1500} width={5000} height={4500} fill="#3A0010" opacity={0.35 * red} style={{ mixBlendMode: 'multiply' }} /> : null}
    </g>
  );
};

/**
 * The island in the middle of the kitchen: draw it after the characters standing behind it. Its top is at v 0.72.
 * `stools` puts two bar stools in front of it (good foreground depth in mediums).
 */
export const KitchenIsland: React.FC<{ u?: [number, number]; stools?: boolean }> = ({ u = [0.28, 0.72], stools = true }) => {
  const R = KITCHEN;
  const T = KITCHEN_TOP;
  const a = R.P(u[0] + 0.01, T, 0.59);
  const b = R.P(u[1] - 0.01, 1, 0.59);
  return (
    <g>
      <FloorShadow r={R} u={[u[0] + 0.01, u[1]]} w={[0.47, 0.6]} o={0.45} />
      <Box r={R} u={[u[0] + 0.01, u[1] - 0.01]} v={[T, 1]} w={[0.47, 0.59]} front={K.cab} side={K.cabDark} />
      <Doors u0={u[0] + 0.015} u1={u[1] - 0.015} v0={T} v1={0.985} w={0.59} n={4} />
      <rect x={a.x} y={a.y} width={b.x - a.x} height={b.y - a.y} fill="url(#g3fadeDown)" />
      <rect x={a.x} y={a.y} width={b.x - a.x} height={26} fill="#000" opacity={0.25} />
      <Box r={R} u={u} v={[T - 0.025, T]} w={[0.45, 0.61]} front={K.topEdge} top={K.top} side={K.topEdge} rim />
      {stools
        ? [u[0] + 0.1, u[1] - 0.1].map((su, i) => {
            const seat = R.P(su, 0.8, 0.7);
            const foot = R.P(su, 1, 0.7);
            const k = R.s(0.7) / R.s(0.5);
            return (
              <g key={i}>
                <ellipse cx={foot.x + 8} cy={foot.y + 4} rx={60 * k} ry={12 * k} fill="#000" opacity={0.4} />
                <path d={`M ${seat.x - 34 * k} ${seat.y} L ${foot.x - 44 * k} ${foot.y} M ${seat.x + 34 * k} ${seat.y} L ${foot.x + 44 * k} ${foot.y} M ${seat.x} ${seat.y} L ${foot.x} ${foot.y}`} stroke="#1E1A22" strokeWidth={9 * k} strokeLinecap="round" />
                <path d={`M ${seat.x - 40 * k} ${seat.y + (foot.y - seat.y) * 0.6} L ${seat.x + 40 * k} ${seat.y + (foot.y - seat.y) * 0.6}`} stroke="#1E1A22" strokeWidth={6 * k} />
                <ellipse cx={seat.x} cy={seat.y} rx={52 * k} ry={16 * k} fill="#6A4A3E" />
                <ellipse cx={seat.x} cy={seat.y - 6 * k} rx={52 * k} ry={16 * k} fill="#8A6452" />
                <path d={`M ${seat.x - 46 * k} ${seat.y - 12 * k} Q ${seat.x} ${seat.y - 26 * k} ${seat.x + 46 * k} ${seat.y - 12 * k}`} stroke={S3.warm} strokeWidth={2.5} fill="none" opacity={0.5} />
              </g>
            );
          })
        : null}
    </g>
  );
};
/** A point on the island's top, for putting things on it: u across, d 0 (back edge) to 1 (front edge). */
export const islandTop = (u: number, d: number) => KITCHEN.P(u, KITCHEN_TOP - 0.025, 0.45 + 0.16 * d);
