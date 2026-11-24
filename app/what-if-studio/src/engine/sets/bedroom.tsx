import React from 'react';
import { rnd } from '../anim';
import { makeRoom, Box, Pt } from '../room';
import { Glow, Cone, LightVeil, Dust } from '../light';
import { RoomShell, BackWindow, WallFrame, FloorShadow } from '../furnish';
import { AlarmClock, WallCalendar } from '../props';

// The bedroom at night, built with the room kit: the bed in the back left corner (headboard on the back wall), a
// nightstand with a lamp and a digital clock, a window onto the moon and the lit city, fairy lights over the bed,
// posters, a calendar on the wall, a wardrobe on the right wall, a door on the left with the hall light in its crack,
// a rug, a beanbag and the usual floor clutter. The lamp is the main light; the moon and the hall light answer it.
// Characters in bed: draw <Bedroom duvet={false} />, then the character (bedSit), then <BedDuvet /> over their legs.
export const BEDROOM = makeRoom({ x: 940, y: 500 }, { x0: 480, x1: 1440, y0: 320, y1: 742 }, 3.4);

const NIGHT = { wall: '#2E3352', side: '#252A44', floor: '#2A2232', ceiling: '#15182A', lines: '#1C1724' };
const BED = { u0: 0.03, u1: 0.4, top: 0.79, w1: 0.47 };
export const WINDOW = { x0: 1070, x1: 1330, y0: 374, y1: 600, moon: { x: 1135, y: 428 } };
export const CAL = { x: 922, y: 404, w: 92 };

/** A point on the mattress top (under the duvet) at (u, w). */
export const bedTop = (u: number, w: number) => BEDROOM.P(u, BED.top, w);
/** Hip point and scale for someone sitting up in bed against the pillows at u (0.08 to 0.35). */
export const bedSit = (u: number, w = 0.085) => {
  const p = BEDROOM.P(u, BED.top - 0.02, w);
  return { x: p.x, y: p.y, scale: (0.62 * 422 * BEDROOM.s(w)) / 378 };
};
/** Where the lamp's bulb is (for glows, rims and the veil). */
export const LAMP: Pt = (() => {
  const p = BEDROOM.P(0.505, 0.78, 0.05);
  return { x: p.x, y: p.y - 96 };
})();

/** The duvet: over the mattress from the pillows' edge (`from`, a w) to the foot, draped over the front and side. */
export const BedDuvet: React.FC<{ from?: number; knees?: number; kneeU?: number }> = ({ from = 0.13, knees = 0, kneeU = 0.2 }) => {
  const { Q, P } = BEDROOM;
  const kn = P(kneeU, BED.top, from + 0.12);
  const kn2 = P(kneeU, BED.top, from + 0.24);
  return (
    <g>
      {/* the top, the drape over the foot and over the open side */}
      <polygon points={Q([[BED.u0 - 0.01, BED.top - 0.01, from], [BED.u1 + 0.01, BED.top - 0.01, from], [BED.u1 + 0.012, BED.top - 0.01, BED.w1 + 0.012], [BED.u0 - 0.01, BED.top - 0.01, BED.w1 + 0.012]])} fill="#4E5E92" />
      <polygon points={Q([[BED.u0 - 0.01, BED.top - 0.01, BED.w1 + 0.012], [BED.u1 + 0.012, BED.top - 0.01, BED.w1 + 0.012], [BED.u1 + 0.012, 0.93, BED.w1 + 0.012], [BED.u0 - 0.01, 0.93, BED.w1 + 0.012]])} fill="#3E4C7A" />
      <polygon points={Q([[BED.u1 + 0.012, BED.top - 0.01, from], [BED.u1 + 0.012, BED.top - 0.01, BED.w1 + 0.012], [BED.u1 + 0.012, 0.95, BED.w1 + 0.012], [BED.u1 + 0.012, 0.95, from]])} fill="#34406A" />
      {/* the quilting lines and a lit fold toward the lamp */}
      {[0.22, 0.31, 0.4].map((w, i) => (
        <path key={i} d={`M ${P(BED.u0, BED.top - 0.01, w).x} ${P(BED.u0, BED.top - 0.01, w).y} L ${P(BED.u1, BED.top - 0.01, w).x} ${P(BED.u1, BED.top - 0.01, w).y}`} stroke="#43527F" strokeWidth={3} />
      ))}
      <polygon points={Q([[BED.u0 - 0.01, BED.top - 0.012, from], [BED.u1 + 0.012, BED.top - 0.012, from], [BED.u1 + 0.012, BED.top - 0.012, from + 0.035], [BED.u0 - 0.01, BED.top - 0.012, from + 0.035]])} fill="#E4DDCC" />
      <path d={`M ${P(BED.u1 + 0.012, BED.top - 0.01, from).x} ${P(BED.u1 + 0.012, BED.top - 0.01, from).y} L ${P(BED.u1 + 0.012, BED.top - 0.01, BED.w1).x} ${P(BED.u1 + 0.012, BED.top - 0.01, BED.w1).y}`} stroke="#FFC98A" strokeWidth={3} opacity={0.55} />
      {knees > 0 ? (
        <g>
          <ellipse cx={kn.x} cy={kn.y - 14 * knees} rx={70 * BEDROOM.s(from + 0.12)} ry={22 * knees * BEDROOM.s(from + 0.12)} fill="#5A6AA0" />
          <ellipse cx={kn2.x + 30} cy={kn2.y - 8 * knees} rx={60 * BEDROOM.s(from + 0.24)} ry={16 * knees * BEDROOM.s(from + 0.24)} fill="#52629A" />
        </g>
      ) : null}
    </g>
  );
};

/** The bedroom at night. `clock` is what the bedside clock reads, `lamp` (0..1) how bright the lamp is (flicker it, kill it). */
export const Bedroom: React.FC<{ t: number; id?: string; veil?: number; duvet?: boolean; clock?: string; lamp?: number; crossed?: number; pillowDent?: boolean }> = ({
  t, id = 'bed', veil = 0.46, duvet = true, clock = '04:12', lamp = 1, crossed = 9, pillowDent = false,
}) => {
  const r = BEDROOM;
  const { P, Q } = r;
  const k = (w: number) => r.s(w) / r.s(0.05);
  const door = P(0, 0.6, 0.64);
  // fairy lights across the wall above the bed
  const fairy = Array.from({ length: 13 }).map((_, i) => {
    const x = 500 + i * 30;
    const y = 368 + 30 * (1 - Math.pow((x - 680) / 190, 2)) + Math.sin(t / 26 + i) * 1.2;
    return { x, y };
  });
  const ns = { u0: 0.43, u1: 0.53, v0: 0.78, w0: 0.01, w1: 0.11 };
  const clockAt = P(0.455, ns.v0, 0.075);
  const lampBase = P(0.505, ns.v0, 0.05);
  return (
    <g>
      <RoomShell r={r} id={id} wall={NIGHT.wall} side={NIGHT.side} floorC={NIGHT.floor} ceiling={NIGHT.ceiling} lines={NIGHT.lines} />
      {/* a flush ceiling light, off */}
      {(() => {
        const c = P(0.55, 0, 0.42);
        return <ellipse cx={c.x} cy={c.y + 10} rx={70} ry={14} fill="#2A2C40" />;
      })()}
      {/* the left wall: a door ajar, the hall light in the crack and on the floor */}
      <polygon points={Q([[0, 0.2, 0.5], [0, 0.2, 0.78], [0, 1, 0.78], [0, 1, 0.5]])} fill="#1A1C2C" />
      <polygon points={Q([[0, 0.23, 0.52], [0, 0.23, 0.555], [0, 1, 0.555], [0, 1, 0.52]])} fill="#FFC27A" opacity={0.85} />
      <polygon points={Q([[0, 0.23, 0.555], [0, 0.23, 0.76], [0, 1, 0.76], [0, 1, 0.555]])} fill="#3A3552" />
      <polygon points={Q([[0, 0.3, 0.58], [0, 0.3, 0.73], [0, 0.55, 0.73], [0, 0.55, 0.58]])} fill="none" stroke="#2C2840" strokeWidth={4} />
      <polygon points={Q([[0, 1, 0.52], [0.16, 1, 0.6], [0.2, 1, 0.66], [0, 1, 0.555]])} fill="#FFB46A" opacity={0.16} style={{ mixBlendMode: 'screen' }} />
      {/* posters and fairy lights over the bed */}
      <WallFrame x={528} y={404} w={108} h={140} art={1} />
      <WallFrame x={668} y={420} w={92} h={112} art={2} />
      <rect x={790} y={410} width={70} height={92} fill="#1E1824" />
      <rect x={796} y={416} width={58} height={80} fill="#C96A5A" />
      <path d="M 806 480 L 826 430 L 846 480 Z" fill="#F6EFE3" opacity={0.8} />
      <path d={`M ${fairy.map((p) => `${p.x} ${p.y}`).join(' L ')}`} stroke="#141220" strokeWidth={2} fill="none" />
      {fairy.map((p, i) => (
        <circle key={`fl${i}`} cx={p.x} cy={p.y + 6} r={4.5} fill={i % 3 === 1 ? '#FFB4C8' : '#FFE2B0'} opacity={0.75 + 0.25 * Math.sin(t / 6 + i * 1.9)} />
      ))}
      {/* the calendar between the bed and the window */}
      <WallCalendar x={CAL.x} y={CAL.y} w={CAL.w} crossed={crossed} />
      {/* the window: the moon, stars and the lit city */}
      <BackWindow r={r} id={`${id}w`} t={t} x0={WINDOW.x0} x1={WINDOW.x1} y0={WINDOW.y0} y1={WINDOW.y1} sun={WINDOW.moon} cols={2} night />
      {/* the dresser under the window, with a plant, a speaker and a trophy */}
      <FloorShadow r={r} u={[0.62, 0.86]} w={[0, 0.1]} />
      <Box r={r} u={[0.62, 0.86]} v={[0.76, 1]} w={[0, 0.1]} front="#40323A" top="#54434A" side="#30252C" rim />
      {[0.82, 0.9].map((v, i) => (
        <g key={`dr${i}`}>
          <polygon points={Q([[0.635, v - 0.06, 0.1], [0.845, v - 0.06, 0.1], [0.845, v + 0.02, 0.1], [0.635, v + 0.02, 0.1]])} fill="none" stroke="#2A2026" strokeWidth={3} />
          <circle cx={P(0.74, v - 0.02, 0.1).x} cy={P(0.74, v - 0.02, 0.1).y} r={4} fill="#C9A46A" />
        </g>
      ))}
      {(() => {
        const a = P(0.66, 0.76, 0.05);
        const b = P(0.8, 0.76, 0.05);
        const c = P(0.73, 0.76, 0.06);
        return (
          <g>
            <path d={`M ${a.x - 14} ${a.y} L ${a.x + 14} ${a.y} L ${a.x + 11} ${a.y - 26} L ${a.x - 11} ${a.y - 26} Z`} fill="#8A5040" />
            {[[-26, -50], [-6, -62], [16, -54], [26, -36]].map(([dx, dy], i) => (
              <path key={i} d={`M ${a.x} ${a.y - 26} Q ${a.x + dx * 0.4} ${a.y - 26 + dy * 0.6} ${a.x + dx} ${a.y - 26 + dy} Q ${a.x + dx * 0.6} ${a.y - 26 + dy * 0.4} ${a.x} ${a.y - 26} Z`} fill={i % 2 ? '#3F5E44' : '#4E7350'} />
            ))}
            <rect x={b.x - 18} y={b.y - 46} width={36} height={46} rx={8} fill="#1E1C28" />
            <circle cx={b.x} cy={b.y - 30} r={10} fill="#2E2C3A" />
            <circle cx={b.x} cy={b.y - 12} r={5} fill="#2E2C3A" />
            <path d={`M ${c.x - 10} ${c.y} L ${c.x + 10} ${c.y} L ${c.x + 6} ${c.y - 10} L ${c.x + 4} ${c.y - 26} Q ${c.x + 18} ${c.y - 40} ${c.x + 8} ${c.y - 46} L ${c.x - 8} ${c.y - 46} Q ${c.x - 18} ${c.y - 40} ${c.x - 4} ${c.y - 26} L ${c.x - 6} ${c.y - 10} Z`} fill="#C9A44A" />
          </g>
        );
      })()}
      {/* the wardrobe against the right wall */}
      <FloorShadow r={r} u={[0.86, 1]} w={[0.1, 0.42]} o={0.4} />
      <Box r={r} u={[0.87, 1]} v={[0.1, 1]} w={[0.1, 0.42]} front="#3A2E36" side="#2E242C" top="#46383F" />
      <polygon points={Q([[0.87, 0.14, 0.26], [0.87, 0.14, 0.262], [0.87, 0.97, 0.262], [0.87, 0.97, 0.26]])} fill="#1E181E" />
      {[0.22, 0.3].map((w, i) => (
        <rect key={`wk${i}`} x={P(0.87, 0.55, w).x - 4} y={P(0.87, 0.55, w).y - 16} width={8} height={32} rx={3} fill="#C9A46A" />
      ))}
      <polygon points={Q([[0.87, 0.1, 0.1], [0.87, 0.1, 0.42], [0.87, 0.115, 0.42], [0.87, 0.115, 0.1]])} fill="#FFC98A" opacity={0.25} />
      {/* the rug, a beanbag, a backpack and a pair of trainers */}
      <polygon points={Q([[0.42, 1, 0.42], [0.84, 1, 0.42], [0.84, 1, 0.82], [0.42, 1, 0.82]])} fill="#41304E" />
      <polygon points={Q([[0.45, 1, 0.45], [0.81, 1, 0.45], [0.81, 1, 0.79], [0.45, 1, 0.79]])} fill="none" stroke="#5A426A" strokeWidth={5} />
      {(() => {
        const b = P(0.74, 1, 0.5);
        const s = r.s(0.5);
        return (
          <g>
            <ellipse cx={b.x + 10} cy={b.y + 4} rx={92 * s} ry={18 * s} fill="#000" opacity={0.35} />
            <path d={`M ${b.x - 86 * s} ${b.y} Q ${b.x - 92 * s} ${b.y - 84 * s} ${b.x - 20 * s} ${b.y - 96 * s} Q ${b.x + 70 * s} ${b.y - 100 * s} ${b.x + 86 * s} ${b.y - 20 * s} Q ${b.x + 80 * s} ${b.y + 6 * s} ${b.x} ${b.y + 4 * s} Z`} fill="#8A4A3E" />
            <path d={`M ${b.x - 50 * s} ${b.y - 52 * s} Q ${b.x} ${b.y - 74 * s} ${b.x + 54 * s} ${b.y - 44 * s}`} stroke="#6E3A32" strokeWidth={4} fill="none" />
            <path d={`M ${b.x - 70 * s} ${b.y - 70 * s} Q ${b.x - 30 * s} ${b.y - 98 * s} ${b.x + 10 * s} ${b.y - 94 * s}`} stroke="#FFC98A" strokeWidth={3} fill="none" opacity={0.5} />
          </g>
        );
      })()}
      {(() => {
        const b = P(0.585, 1, 0.16);
        const s = r.s(0.16);
        return (
          <g>
            <ellipse cx={b.x + 6} cy={b.y + 2} rx={40 * s} ry={8 * s} fill="#000" opacity={0.35} />
            <path d={`M ${b.x - 34 * s} ${b.y} L ${b.x - 30 * s} ${b.y - 70 * s} Q ${b.x} ${b.y - 86 * s} ${b.x + 30 * s} ${b.y - 70 * s} L ${b.x + 34 * s} ${b.y} Z`} fill="#2F6E69" />
            <rect x={b.x - 22 * s} y={b.y - 44 * s} width={44 * s} height={30 * s} rx={6 * s} fill="#265A56" />
            <path d={`M ${b.x - 18 * s} ${b.y - 78 * s} Q ${b.x} ${b.y - 100 * s} ${b.x + 18 * s} ${b.y - 78 * s}`} stroke="#1E4846" strokeWidth={5 * s} fill="none" />
          </g>
        );
      })()}
      {/* a pair of trainers kicked off by the bed, side-on: white sole, teal upper, dark laces */}
      {[[0.5, 0.5, 1, -6], [0.56, 0.53, -1, 8]].map(([u, w, fl, rot], i) => {
        const p = P(u, 1, w);
        const s = r.s(w) * 0.8;
        return (
          <g key={`sn${i}`} transform={`translate(${p.x} ${p.y}) rotate(${rot}) scale(${fl * s} ${s})`}>
            <ellipse cx={4} cy={2} rx={44} ry={7} fill="#000" opacity={0.35} />
            <path d="M -40 -2 L 40 -2 Q 46 -8 40 -16 Q 22 -18 12 -30 L -16 -34 Q -30 -30 -38 -18 Z" fill="#2FB7A6" />
            <rect x={-42} y={-6} width={86} height={8} rx={4} fill="#E9E2D2" />
            <path d="M -8 -30 L 4 -22 M -2 -32 L 10 -24" stroke="#1E1C28" strokeWidth={3} strokeLinecap="round" />
            <path d="M -16 -34 Q -30 -30 -38 -18" stroke="#FFC98A" strokeWidth={2} fill="none" opacity={0.5} />
          </g>
        );
      })}
      {/* the bed: headboard, frame, sheet, pillows, then the duvet */}
      <polygon points={Q([[BED.u0, 1, 0.03], [BED.u1 + 0.03, 1, 0.03], [BED.u1 + 0.03, 1, BED.w1 + 0.03], [BED.u0, 1, BED.w1 + 0.03]])} fill="#000" opacity={0.4} />
      <Box r={r} u={[BED.u0, BED.u1]} v={[0.52, 1]} w={[0, 0.03]} front="#4A3A44" side="#3A2E36" top="#5A4652" rim />
      <Box r={r} u={[BED.u0, BED.u1]} v={[0.85, 1]} w={[0.03, BED.w1]} front="#3E3038" side="#2E242A" top="#4A3A44" />
      <Box r={r} u={[BED.u0 + 0.005, BED.u1 - 0.005]} v={[BED.top, 0.86]} w={[0.03, BED.w1 - 0.005]} front="#D8D2C4" side="#B8B2A6" top="#E6E0D2" />
      {[0.12, 0.3].map((u, i) => {
        const a = P(u - 0.085, BED.top, 0.04);
        const b = P(u + 0.085, BED.top, 0.04);
        const c = P(u, BED.top, 0.09);
        return (
          <g key={`pw${i}`}>
            <path d={`M ${a.x} ${a.y} Q ${a.x - 8} ${a.y - 34} ${(a.x + b.x) / 2} ${a.y - 40} Q ${b.x + 8} ${b.y - 34} ${b.x} ${b.y} Q ${c.x} ${c.y + 8} ${a.x} ${a.y} Z`} fill={i ? '#E9E2D2' : '#DCD4C4'} />
            {pillowDent && i === 0 ? null : <path d={`M ${a.x + 14} ${a.y - 18} Q ${(a.x + b.x) / 2} ${a.y - 30} ${b.x - 14} ${b.y - 18}`} stroke="#C9C0AE" strokeWidth={3} fill="none" />}
          </g>
        );
      })}
      {duvet ? <BedDuvet /> : null}
      {/* the nightstand: a drawer, the lamp and the clock on top */}
      <FloorShadow r={r} u={[ns.u0, ns.u1]} w={[ns.w0, ns.w1]} />
      <Box r={r} u={[ns.u0, ns.u1]} v={[ns.v0, 1]} w={[ns.w0, ns.w1]} front="#4A3A36" top="#5E4A44" side="#3A2C29" rim />
      <polygon points={Q([[ns.u0 + 0.01, 0.82, ns.w1], [ns.u1 - 0.01, 0.82, ns.w1], [ns.u1 - 0.01, 0.9, ns.w1], [ns.u0 + 0.01, 0.9, ns.w1]])} fill="none" stroke="#2E2220" strokeWidth={3} />
      <circle cx={P(0.48, 0.86, ns.w1).x} cy={P(0.48, 0.86, ns.w1).y} r={4} fill="#C9A46A" />
      <AlarmClock x={clockAt.x} y={clockAt.y} s={0.3 * k(0.075)} text={clock} />
      <g>
        <ellipse cx={lampBase.x} cy={lampBase.y - 3} rx={22} ry={6} fill="#2A2026" />
        <path d={`M ${lampBase.x} ${lampBase.y - 4} L ${lampBase.x} ${lampBase.y - 72}`} stroke="#2A2026" strokeWidth={6} />
        <path d={`M ${LAMP.x - 26} ${LAMP.y - 20} L ${LAMP.x + 26} ${LAMP.y - 20} L ${LAMP.x + 40} ${LAMP.y + 26} L ${LAMP.x - 40} ${LAMP.y + 26} Z`} fill={lamp > 0.3 ? '#F2D2A0' : '#6A5A50'} />
        <path d={`M ${LAMP.x - 40} ${LAMP.y + 26} L ${LAMP.x + 40} ${LAMP.y + 26}`} stroke="#FFE7B8" strokeWidth={4} opacity={lamp} />
        <Cone d={`M ${LAMP.x - 38} ${LAMP.y + 26} L ${LAMP.x + 38} ${LAMP.y + 26} L ${LAMP.x + 150} ${lampBase.y + 4} L ${LAMP.x - 150} ${lampBase.y + 4} Z`} o={0.55 * lamp} />
      </g>
      {/* a glass of water by the lamp */}
      {(() => {
        const g = P(0.515, ns.v0, 0.095);
        return <path d={`M ${g.x - 9} ${g.y - 30} L ${g.x + 9} ${g.y - 30} L ${g.x + 7} ${g.y} L ${g.x - 7} ${g.y} Z`} fill="#BFD6FF" opacity={0.45} />;
      })()}
      {/* the contrast pass, then the lights again on top */}
      <LightVeil
        id={`${id}veil`}
        lights={[
          [LAMP.x, LAMP.y + 20, 420 * (0.25 + 0.75 * lamp)],
          [(WINDOW.x0 + WINDOW.x1) / 2, 480, 300],
          [door.x, door.y, 260],
          [680, 390, 230],
          [1180, 900, 380],
        ]}
        o={veil}
      />
      <Glow x={LAMP.x} y={LAMP.y + 6} r={300} o={0.6 * lamp} />
      <Glow x={LAMP.x} y={LAMP.y + 10} r={120} o={0.5 * lamp} />
      <circle cx={WINDOW.moon.x} cy={WINDOW.moon.y} r={300} fill="url(#kitMoonBloom)" opacity={0.25} />
      <Glow x={door.x} y={door.y} r={160} o={0.3} />
      {fairy.map((p, i) => (i % 2 ? <Glow key={`fg${i}`} x={p.x} y={p.y + 6} r={34} o={0.6} /> : null))}
      <Dust t={t} seed={13} x0={LAMP.x - 200} y0={LAMP.y - 60} w={400} h={260} n={18} o={0.45 * lamp} />
      <Dust t={t} seed={17} x0={WINDOW.x0} y0={WINDOW.y1} w={WINDOW.x1 - WINDOW.x0} h={300} n={14} o={0.3} />
      {/* a scatter of glints to keep the dark corners alive */}
      {Array.from({ length: 6 }).map((_, i) => (
        <circle key={`gl${i}`} cx={520 + rnd(5, i) * 880} cy={720 + rnd(6, i) * 200} r={1.5} fill="#BFD6FF" opacity={0.2} />
      ))}
    </g>
  );
};
