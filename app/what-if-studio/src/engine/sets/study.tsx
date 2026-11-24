import React from 'react';
import { rnd } from '../anim';
import { makeRoom, Box, S3, pts, Pt } from '../room';
import { WallTexture, RoomCorners, SkyView, Glow, Cone, LightVeil, Dust } from '../light';

// The study at dusk: a window with the low sun behind the desk, a bookcase on the left wall, a door on the right,
// a pendant lamp and a wall light. Pass `veil` lower (0.28) for a wide that must show the floor.
// `night`: the moon and the lit city in the window, the pendant off, cool moonlight on the floor (the desk lamp in
// `Desk` becomes the main light). `shelf` (0..1) is how many of the books are still on the shelves.
/** The bookcase's shelf heights (v, top to bottom) on the left wall at u 0.07, w 0.135 to 0.5: books fly from here. */
export const STUDY_SHELF_V = [0.16, 0.36, 0.56, 0.76, 0.985];
export const STUDY = makeRoom({ x: 980, y: 500 }, { x0: 530, x1: 1430, y0: 335, y1: 740 }, 3.5);
const BOOKS = ['#7A4A4A', '#4A5A7A', '#8A7A4A', '#4A6A5A', '#6A4A6A', '#9A6A4A', '#3E4A62', '#7A6252'];

export const Study: React.FC<{ t: number; id?: string; veil?: number; night?: boolean; shelf?: number }> = ({ t, id = 'off', veil = 0.44, night = false, shelf = 1 }) => {
  const r = STUDY;
  const { P, Q } = r;
  // floorboards run toward the window; their end joints are staggered
  const boards: React.ReactNode[] = [];
  for (let i = 1; i < 14; i++) {
    const a = P(i / 14, 1, 0);
    const b = P(i / 14, 1, 1);
    boards.push(<path key={`fb${i}`} d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} stroke="#22181D" strokeWidth={2.5} />);
    for (let k = 0; k < 3; k++) {
      const w = 0.12 + rnd(i, k) * 0.8;
      const c = P(i / 14, 1, w);
      const d = P((i + 1) / 14, 1, w);
      boards.push(<path key={`fj${i}-${k}`} d={`M ${c.x} ${c.y} L ${d.x} ${d.y}`} stroke="#22181D" strokeWidth={1.6} />);
    }
  }
  // books along the shelves of the bookcase on the left wall (the shelf front faces into the room, u = 0.07)
  const shelfV = STUDY_SHELF_V;
  const books: React.ReactNode[] = [];
  let bi = 0;
  shelfV.slice(1).forEach((vb, si) => {
    let w = 0.135;
    let k = 0;
    while (w < 0.5) {
      const dw = 0.011 + rnd(si + 4, k) * 0.014;
      if (rnd(si + 9, k) > 0.86) {
        w += dw * 1.4;
        k++;
        continue;
      }
      const top = vb - (shelfV[si + 1] - shelfV[si]) * (0.55 + rnd(si + 7, k) * 0.32);
      // books leave the shelves in a scattered order as `shelf` drops
      if (rnd(77, bi++) < shelf) books.push(<polygon key={`bk${si}-${k}`} points={Q([[0.07, top, w], [0.07, top, w + dw], [0.07, vb, w + dw], [0.07, vb, w]])} fill={BOOKS[(k + si * 3) % BOOKS.length]} />);
      w += dw + 0.002;
      k++;
    }
  });
  const pend = P(0.32, 0, 0.42);
  const shade = P(0.32, 0.27, 0.42);
  const sconce = P(0, 0.33, 0.66);
  const shelfTop = P(0.035, 0.16, 0.3);
  return (
    <g>
      <defs>
        <linearGradient id={`${id}L`} gradientUnits="userSpaceOnUse" x1={530} y1={0} x2={-200} y2={0}>
          <stop offset="0%" stopColor="#000" stopOpacity={0} />
          <stop offset="100%" stopColor="#000" stopOpacity={0.5} />
        </linearGradient>
        <linearGradient id={`${id}R`} gradientUnits="userSpaceOnUse" x1={1430} y1={0} x2={2160} y2={0}>
          <stop offset="0%" stopColor="#000" stopOpacity={0} />
          <stop offset="100%" stopColor="#000" stopOpacity={0.5} />
        </linearGradient>
        <linearGradient id={`${id}F`} gradientUnits="userSpaceOnUse" x1={0} y1={740} x2={0} y2={1200}>
          <stop offset="0%" stopColor="#000" stopOpacity={0} />
          <stop offset="100%" stopColor="#000" stopOpacity={0.55} />
        </linearGradient>
      </defs>
      {/* shell (the ceiling colour backs wide framings that see past the near plane) */}
      <rect x={-1500} y={-1500} width={5000} height={1900} fill={S3.ceiling} />
      <polygon points={Q([[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]])} fill={S3.ceiling} />
      <polygon points={Q([[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]])} fill={S3.wallSide} />
      <polygon points={Q([[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]])} fill={`url(#${id}L)`} />
      <polygon points={Q([[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]])} fill={S3.wallSide} />
      <polygon points={Q([[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]])} fill={`url(#${id}R)`} />
      <polygon points={Q([[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]])} fill={S3.floor} />
      {boards}
      <polygon points={Q([[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]])} fill={`url(#${id}F)`} />
      <rect x={530} y={335} width={900} height={405} fill={S3.wall} />
      <WallTexture rect={[530, 335, 900, 405]} />
      <WallTexture points={Q([[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]])} />
      <WallTexture points={Q([[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]])} />
      <RoomCorners x0={530} x1={1430} y0={335} y1={740} />
      {/* a clock and two small photos on the back wall */}
      <circle cx={1330} cy={430} r={32} fill="#EFE2CC" />
      <circle cx={1330} cy={430} r={32} fill="none" stroke="#1E1824" strokeWidth={6} />
      <path d="M 1330 430 L 1330 410 M 1330 430 L 1344 438" stroke="#1E1824" strokeWidth={4} strokeLinecap="round" />
      <rect x={592} y={402} width={56} height={70} fill="#1E1824" />
      <rect x={598} y={408} width={44} height={58} fill="#C9A88A" />
      <rect x={604} y={418} width={32} height={42} fill="#7A5A6A" />
      <rect x={660} y={430} width={46} height={46} fill="#1E1824" />
      <rect x={666} y={436} width={34} height={34} fill="#9FB4C8" />
      {/* skirting and the crown line */}
      <rect x={530} y={726} width={900} height={14} fill={S3.trim} />
      <polygon points={Q([[0, 0.965, 0], [0, 0.965, 1], [0, 1, 1], [0, 1, 0]])} fill={S3.trim} />
      <polygon points={Q([[1, 0.965, 0], [1, 0.965, 1], [1, 1, 1], [1, 1, 0]])} fill={S3.trim} />
      <path d={`M 530 337 L 1430 337`} stroke="#2A2331" strokeWidth={5} />
      {/* the window, the sun low in it, and its light into the room */}
      <SkyView id={`${id}win`} clip="M 782 380 L 1178 380 L 1178 606 L 782 606 Z" box={{ x: 782, y: 380, w: 396, h: 226 }} t={t} sun={night ? { x: 1070, y: 432 } : { x: 1085, y: 596 }} sunR={night ? 24 : 38} night={night} />
      <g fill="#1E1824">
        <rect x={770} y={368} width={420} height={14} />
        <rect x={770} y={604} width={420} height={10} />
        <rect x={770} y={368} width={14} height={244} />
        <rect x={1176} y={368} width={14} height={244} />
        <rect x={973} y={380} width={12} height={226} />
        <rect x={874} y={380} width={7} height={226} />
        <rect x={1077} y={380} width={7} height={226} />
        <rect x={782} y={452} width={396} height={7} />
      </g>
      <polygon points={Q([[0.26, 0.665, 0], [0.74, 0.665, 0], [0.74, 0.665, 0.03], [0.26, 0.665, 0.03]])} fill="#6A5056" />
      <path d="M 772 612 L 1188 612" stroke={night ? '#A9C6FF' : S3.warm} strokeWidth={2} opacity={night ? 0.45 : 0.6} />
      {night ? <circle cx={1070} cy={432} r={360} fill="url(#kitMoonBloom)" opacity={0.3} /> : <circle cx={1085} cy={596} r={520} fill="url(#kitBloom)" opacity={0.42} />}
      {/* curtains, lit on their inner edge */}
      {[
        { x: 692, w: 94, flip: 1 },
        { x: 1174, w: 94, flip: -1 },
      ].map((c, i) => (
        <g key={`cu${i}`}>
          <path d={`M ${c.x} 360 L ${c.x + c.w} 360 L ${c.x + c.w - (c.flip > 0 ? 8 : -8)} 722 Q ${c.x + c.w / 2} 730 ${c.x + (c.flip > 0 ? -6 : 6)} 722 Z`} fill="#4E2F42" />
          {[0.22, 0.5, 0.78].map((k, j) => (
            <rect key={j} x={c.x + c.w * k - 6} y={362} width={12} height={360} fill={j % 2 ? '#40263A' : '#5E3A50'} opacity={0.8} />
          ))}
          <rect x={c.flip > 0 ? c.x + c.w - 4 : c.x} y={362} width={4} height={360} fill={night ? '#A9C6FF' : S3.warm} opacity={night ? 0.4 : 0.55} />
        </g>
      ))}
      <rect x={680} y={354} width={600} height={8} rx={4} fill="#1A1420" />
      {/* the radiator under the window */}
      <rect x={830} y={638} width={300} height={78} rx={6} fill="#4A4250" />
      {Array.from({ length: 16 }).map((_, i) => (
        <rect key={`rd${i}`} x={840 + i * 18} y={646} width={8} height={62} rx={3} fill="#3A3340" />
      ))}
      <rect x={830} y={638} width={300} height={3} fill={S3.warm} opacity={0.35} />
      {/* window light on the floor */}
      <polygon points={Q([[0.28, 1, 0.02], [0.72, 1, 0.02], [0.82, 1, 0.55], [0.18, 1, 0.55]])} fill={night ? '#9FC0FF' : '#FFB46A'} opacity={night ? 0.07 : 0.1} style={{ mixBlendMode: 'screen' }} />
      {/* the rug */}
      <polygon points={Q([[0.2, 1, 0.3], [0.8, 1, 0.3], [0.8, 1, 0.82], [0.2, 1, 0.82]])} fill="#4A2C3A" />
      <polygon points={Q([[0.24, 1, 0.34], [0.76, 1, 0.34], [0.76, 1, 0.78], [0.24, 1, 0.78]])} fill="none" stroke="#6A4252" strokeWidth={5} />
      {/* the bookcase on the left wall, its shadow on the floor */}
      <polygon points={Q([[0.07, 1, 0.12], [0.13, 1, 0.12], [0.13, 1, 0.52], [0.07, 1, 0.52]])} fill="#000" opacity={0.35} />
      <Box r={r} u={[0, 0.07]} v={[0.16, 0.985]} w={[0.12, 0.52]} front="#3E2B29" side="#2A1C1B" />
      {books}
      {shelfV.map((v, i) => (
        <polygon key={`sh${i}`} points={Q([[0.07, v - 0.012, 0.12], [0.07, v - 0.012, 0.52], [0.07, v + 0.008, 0.52], [0.07, v + 0.008, 0.12]])} fill="#5A4038" />
      ))}
      {/* things on top of the bookcase: a plant and a globe */}
      <ellipse cx={shelfTop.x} cy={shelfTop.y - 18} rx={20} ry={24} fill="#4A6A4E" />
      <path d={`M ${shelfTop.x - 6} ${shelfTop.y - 30} q -30 -30 -24 -60 q 18 18 24 60 M ${shelfTop.x + 4} ${shelfTop.y - 30} q 20 -34 44 -40 q -10 26 -44 40`} fill="#5E8A5E" />
      {/* the wall light on the left */}
      <rect x={sconce.x - 9} y={sconce.y - 20} width={18} height={30} rx={6} fill="#2A2026" />
      <path d={`M ${sconce.x - 20} ${sconce.y - 8} L ${sconce.x + 20} ${sconce.y - 8} L ${sconce.x + 14} ${sconce.y - 42} L ${sconce.x - 14} ${sconce.y - 42} Z`} fill="#F2C08A" />
      <Glow x={sconce.x} y={sconce.y - 24} r={230} o={0.55} />
      {/* a waste bin by the bookcase */}
      {(() => {
        const b = P(0.14, 1, 0.6);
        return (
          <g>
            <ellipse cx={b.x + 6} cy={b.y + 4} rx={46} ry={12} fill="#000" opacity={0.35} />
            <path d={`M ${b.x - 36} ${b.y - 86} L ${b.x + 36} ${b.y - 86} L ${b.x + 28} ${b.y} L ${b.x - 28} ${b.y} Z`} fill="#3A3444" />
            <ellipse cx={b.x} cy={b.y - 86} rx={36} ry={9} fill="#26222E" />
            <path d={`M ${b.x - 14} ${b.y - 92} q 10 -14 22 -2`} stroke="#E9E2D2" strokeWidth={8} fill="none" />
          </g>
        );
      })()}
      {/* the right wall: a door and a framed print */}
      <polygon points={Q([[1, 0.2, 0.1], [1, 0.2, 0.4], [1, 1, 0.4], [1, 1, 0.1]])} fill="#4A3C48" />
      <polygon points={Q([[1, 0.24, 0.125], [1, 0.24, 0.375], [1, 0.985, 0.375], [1, 0.985, 0.125]])} fill="#2C232F" />
      <polygon points={Q([[1, 0.3, 0.16], [1, 0.3, 0.34], [1, 0.55, 0.34], [1, 0.55, 0.16]])} fill="none" stroke="#3A2F3C" strokeWidth={4} />
      <polygon points={Q([[1, 0.62, 0.16], [1, 0.62, 0.34], [1, 0.92, 0.34], [1, 0.92, 0.16]])} fill="none" stroke="#3A2F3C" strokeWidth={4} />
      <circle cx={P(1, 0.6, 0.35).x} cy={P(1, 0.6, 0.35).y} r={6} fill="#C9A46A" />
      {/* a coat hung on the door */}
      <polygon points={Q([[1, 0.3, 0.2], [1, 0.3, 0.27], [1, 0.72, 0.29], [1, 0.72, 0.18]])} fill="#5A3A3A" />
      <polygon points={Q([[1, 0.3, 0.2], [1, 0.3, 0.27], [1, 0.4, 0.25], [1, 0.4, 0.22]])} fill="#4A2E2E" />
      <polygon points={Q([[1, 0.24, 0.5], [1, 0.24, 0.7], [1, 0.54, 0.7], [1, 0.54, 0.5]])} fill="#1E1924" />
      <polygon points={Q([[1, 0.27, 0.52], [1, 0.27, 0.68], [1, 0.51, 0.68], [1, 0.51, 0.52]])} fill="#E9C9A0" />
      <polygon points={Q([[1, 0.27, 0.52], [1, 0.27, 0.68], [1, 0.41, 0.68], [1, 0.41, 0.52]])} fill="#D9906A" />
      <polygon points={Q([[1, 0.51, 0.52], [1, 0.36, 0.58], [1, 0.42, 0.62], [1, 0.33, 0.68], [1, 0.51, 0.68]])} fill="#5A3A5A" />
      {/* a tall plant in the far right corner */}
      <polygon points={Q([[0.84, 1, 0.03], [0.96, 1, 0.03], [0.96, 1, 0.12], [0.84, 1, 0.12]])} fill="#000" opacity={0.35} />
      <Box r={r} u={[0.86, 0.94]} v={[0.86, 0.995]} w={[0.03, 0.1]} front="#8A5040" top="#5A3A30" side="#6A3C30" />
      {[[-60, -150], [-20, -190], [30, -170], [64, -120], [-80, -90]].map(([dx, dy], i) => {
        const b = P(0.9, 0.86, 0.07);
        return <path key={`pl${i}`} d={`M ${b.x} ${b.y} Q ${b.x + dx * 0.3} ${b.y + dy * 0.6} ${b.x + dx} ${b.y + dy} Q ${b.x + dx * 0.7} ${b.y + dy * 0.4} ${b.x} ${b.y} Z`} fill={i % 2 ? '#3F5E44' : '#4E7350'} />;
      })}
      {/* the pendant lamp, swaying a touch */}
      <g transform={`rotate(${Math.sin(t / 28) * 1.2} ${pend.x} ${pend.y})`}>
      <path d={`M ${pend.x} ${pend.y} L ${shade.x} ${shade.y - 30}`} stroke="#120E16" strokeWidth={3} />
      <path d={`M ${shade.x - 16} ${shade.y - 32} L ${shade.x + 16} ${shade.y - 32} L ${shade.x + 44} ${shade.y} L ${shade.x - 44} ${shade.y} Z`} fill="#1C1620" />
      <ellipse cx={shade.x} cy={shade.y} rx={44} ry={8} fill={night ? '#3A3242' : '#FFE2B0'} />
      {night ? null : <Cone d={`M ${shade.x - 40} ${shade.y} L ${shade.x + 40} ${shade.y} L ${shade.x + 240} ${shade.y + 520} L ${shade.x - 240} ${shade.y + 520} Z`} o={0.28} />}
      {night ? null : <Glow x={shade.x} y={shade.y + 6} r={220} o={0.55} />}
      </g>
      {night ? (
        <g>
          <LightVeil id={`${id}veil`} lights={[[1000, 470, 380], [sconce.x, sconce.y - 24, 300], [1100, 760, 420]]} o={veil} />
          <circle cx={1070} cy={432} r={260} fill="url(#kitMoonBloom)" opacity={0.25} />
          <Glow x={sconce.x} y={sconce.y - 24} r={170} o={0.3} />
          <Dust t={t} seed={3} x0={780} y0={420} w={420} h={420} n={22} o={0.35} />
        </g>
      ) : (
        <g>
          <LightVeil id={`${id}veil`} lights={[[980, 500, 780], [shade.x, shade.y + 40, 460], [sconce.x, sconce.y - 24, 360], [980, 980, 520]]} o={veil} />
          <circle cx={1085} cy={596} r={380} fill="url(#kitBloom)" opacity={0.3} />
          <Glow x={shade.x} y={shade.y + 6} r={260} o={0.35} />
          <Glow x={sconce.x} y={sconce.y - 24} r={190} o={0.35} />
          <Dust t={t} seed={3} x0={760} y0={400} w={560} h={560} n={46} />
          <Dust t={t} seed={8} x0={shade.x - 160} y0={shade.y + 20} w={320} h={380} n={22} o={0.5} />
        </g>
      )}
    </g>
  );
};

/** The study desk, drawn toward the room's vanishing point, with what is on it (laptop, books, pen cup, lamp). */
export const Desk: React.FC<{ x0: number; x1: number; y: number; laptop?: boolean; lamp?: boolean; vp?: Pt }> = ({ x0, x1, y, laptop = true, lamp = true, vp = STUDY.vp }) => {
  const k = 0.9;
  const bk = (x: number, yy: number) => ({ x: vp.x + (x - vp.x) * k, y: vp.y + (yy - vp.y) * k });
  const a = bk(x0, y);
  const b = bk(x1, y);
  const floor = y + 250;
  return (
    <g>
      <ellipse cx={(x0 + x1) / 2} cy={floor + 4} rx={(x1 - x0) * 0.55} ry={16} fill="#000" opacity={0.35} />
      <polygon points={pts([{ x: x0, y }, { x: x1, y }, b, a])} fill="#6B4B42" />
      <rect x={x0} y={y} width={x1 - x0} height={16} fill="#7A5747" />
      <rect x={x0} y={y} width={x1 - x0} height={2.5} fill={S3.warm} opacity={0.6} />
      <rect x={x0 + 14} y={y + 16} width={x1 - x0 - 28} height={50} fill="#4A3430" />
      <rect x={x0 + 30} y={y + 66} width={x1 - x0 - 60} height={floor - y - 66} fill="#33231F" />
      <rect x={x0 + 14} y={y + 16} width={34} height={floor - y - 16} fill="#3E2B28" />
      <rect x={x1 - 214} y={y + 16} width={200} height={floor - y - 16} fill="#43302B" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={x1 - 204} y={y + 28 + i * 74} width={180} height={64} rx={4} fill="#4E3832" />
          <rect x={x1 - 134} y={y + 54 + i * 74} width={40} height={8} rx={4} fill="#B89A6A" />
        </g>
      ))}
      <rect x={x0 + 30} y={y + 66} width={x1 - x0 - 60} height={floor - y - 66} fill="url(#g3fadeDown)" />
      {laptop ? (
        <g>
          <polygon points={pts([{ x: x0 + 86, y: y - 4 }, { x: x0 + 258, y: y - 4 }, { x: x0 + 250, y: y - 14 }, { x: x0 + 94, y: y - 14 }])} fill="#8A8EA6" />
          <path d={`M ${x0 + 92} ${y - 12} L ${x0 + 252} ${y - 12} L ${x0 + 238} ${y - 132} L ${x0 + 106} ${y - 132} Z`} fill="#24222E" />
          <path d={`M ${x0 + 106} ${y - 132} L ${x0 + 238} ${y - 132}`} stroke="#9FC0FF" strokeWidth={3} opacity={0.8} />
          <Glow x={x0 + 172} y={y - 140} r={150} kind="cool" o={0.4} />
          {/* a stack of books and a pen cup */}
          <rect x={x0 + 22} y={y - 22} width={56} height={11} rx={2} fill="#4A5A7A" />
          <rect x={x0 + 26} y={y - 33} width={50} height={11} rx={2} fill="#8A7A4A" />
          <rect x={x0 + 20} y={y - 44} width={54} height={11} rx={2} fill="#7A4A4A" />
          <rect x={x0 + 284} y={y - 40} width={26} height={36} rx={4} fill="#3E4A62" />
          <path d={`M ${x0 + 290} ${y - 40} l -6 -26 M ${x0 + 298} ${y - 40} l 2 -30 M ${x0 + 305} ${y - 40} l 8 -22`} stroke="#D9C8A8" strokeWidth={3} strokeLinecap="round" />
        </g>
      ) : null}
      {lamp ? (
        <g>
          <ellipse cx={x1 - 70} cy={y - 4} rx={34} ry={8} fill="#1C1620" />
          <path d={`M ${x1 - 70} ${y - 8} L ${x1 - 46} ${y - 118} L ${x1 - 112} ${y - 150}`} stroke="#1C1620" strokeWidth={8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={`M ${x1 - 136} ${y - 170} L ${x1 - 96} ${y - 150} L ${x1 - 122} ${y - 104} L ${x1 - 168} ${y - 128} Z`} fill="#2A2230" />
          <path d={`M ${x1 - 168} ${y - 128} L ${x1 - 122} ${y - 104}`} stroke="#FFE2B0" strokeWidth={6} strokeLinecap="round" />
          <Cone d={`M ${x1 - 168} ${y - 128} L ${x1 - 122} ${y - 104} L ${x1 - 90} ${y} L ${x1 - 300} ${y} Z`} o={0.45} />
          <Glow x={x1 - 150} y={y - 112} r={170} o={0.6} />
          <ellipse cx={x1 - 200} cy={y - 2} rx={110} ry={10} fill="#FFD39A" opacity={0.18} style={{ mixBlendMode: 'screen' }} />
        </g>
      ) : null}
    </g>
  );
};
