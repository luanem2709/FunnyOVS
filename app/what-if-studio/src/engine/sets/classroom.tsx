import React from 'react';
import { C } from '../rig';
import { S3, Box, makeRoom, pts } from '../room';
import { WallTexture, RoomCorners, LightVeil, Dust } from '../light';
import { FONT } from '../fonts';

// The classroom: dusk windows on the left wall, the board on the back wall (`board` sets what is written on it),
// a pinboard, a clock, the teacher's desk, two rows of desks with classmates seen from behind.
export const CLS = makeRoom({ x: 900, y: 470 }, { x0: 300, x1: 1500, y0: 130, y1: 720 }, 3.2);
export type KidLook = { hair: 'short' | 'bun' | 'pony' | 'cap' | 'curly'; hairC: string; top: string };
export const KIDS: KidLook[] = [
  { hair: 'pony', hairC: '#3A2420', top: '#6A8A9A' },
  { hair: 'cap', hairC: '#2A1C18', top: '#9A6A5A' },
  { hair: 'curly', hairC: '#1E1418', top: '#7A7A4A' },
  { hair: 'bun', hairC: '#5A3A28', top: '#6A5A8A' },
  { hair: 'short', hairC: '#C9925A', top: '#4A6A5A' },
];

/** A classmate seen from behind, sitting; `turn` brings the face round, `laugh` opens the mouth. */
export const Kid: React.FC<{ x: number; y: number; s: number; look: KidLook; turn?: number; laugh?: number; t?: number }> = ({ x, y, s, look, turn = 0, laugh = 0, t = 0 }) => {
  const bob = laugh ? Math.abs(Math.sin(t / 2.4 + x)) * 8 * laugh : 0;
  return (
    <g transform={`translate(${x} ${y - bob}) scale(${s})`} filter="url(#rimL)">
      <path d="M -62 0 Q -64 -96 0 -100 Q 64 -96 62 0 Z" fill={look.top} />
      <path d="M -62 0 Q -64 -96 0 -100 L 0 0 Z" fill="#000" opacity={0.12} />
      <g transform={`translate(0 -150) rotate(${laugh ? -8 * laugh : 0})`}>
        <circle r={52} fill={turn > 0.3 ? C.skin : look.hairC} />
        {turn > 0.3 ? (
          <g>
            <path d="M -52 0 A 52 52 0 0 1 30 -42 Q 6 -10 -40 30 Z" fill={look.hairC} />
            <circle cx={26} cy={-4} r={5} fill={C.ink} />
            {laugh ? <path d="M 14 18 Q 30 34 44 16 Z" fill={C.ink} /> : <path d="M 18 22 L 38 20" stroke={C.ink} strokeWidth={4} strokeLinecap="round" />}
          </g>
        ) : null}
        {look.hair === 'bun' ? <circle cx={0} cy={-56} r={22} fill={look.hairC} /> : null}
        {look.hair === 'pony' ? <path d="M -6 -20 Q -30 40 -10 70 Q 4 40 6 -20 Z" fill={look.hairC} /> : null}
        {look.hair === 'cap' ? <path d="M -54 -6 Q -50 -60 0 -62 Q 50 -60 54 -6 Z M 30 -20 L 86 -14 L 86 -6 L 30 -8 Z" fill="#B0463A" /> : null}
        {look.hair === 'curly' ? [-40, -20, 0, 20, 40].map((cx, i) => <circle key={i} cx={cx} cy={-40 + Math.abs(cx) * 0.4} r={20} fill={look.hairC} />) : null}
      </g>
    </g>
  );
};

/** Desks in perspective for the classroom rows. */
const KidDesk: React.FC<{ u: number; w: number }> = ({ u, w }) => {
  const leg = (uu: number, ww: number, k: number) => {
    const a = CLS.P(uu, 0.83, ww);
    const b = CLS.P(uu, 1, ww);
    return <path key={k} d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} stroke={S3.metal} strokeWidth={5} />;
  };
  return (
    <g>
      {leg(u + 0.01, w + 0.005, 0)}
      {leg(u + 0.13, w + 0.005, 1)}
      {leg(u + 0.01, w + 0.045, 2)}
      {leg(u + 0.13, w + 0.045, 3)}
      <Box r={CLS} u={[u, u + 0.14]} v={[0.8, 0.83]} w={[w, w + 0.05]} front="#7A5747" top="#8A6452" side="#5B4038" rim />
    </g>
  );
};

/** `board` replaces the default sum (7 x 8 = ?) with your own chalk; the writing area is x 426-1054, y 196-524. */
export const Classroom: React.FC<{ t: number; solved?: boolean; wrong?: boolean; laugh?: number; id?: string; board?: React.ReactNode }> = ({ t, solved = false, wrong = false, laugh = 0, id = 'cls', board }) => {
  const r = CLS;
  const { P, Q } = r;
  const tiles: React.ReactNode[] = [];
  for (let i = 1; i < 12; i++) {
    const a = P(i / 12, 1, 0);
    const b = P(i / 12, 1, 1);
    tiles.push(<path key={`ta${i}`} d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} stroke="#2A2230" strokeWidth={2} />);
  }
  for (let j = 1; j < 10; j++) {
    const w = j / 10;
    const a = P(0, 1, w);
    const b = P(1, 1, w);
    tiles.push(<path key={`tb${j}`} d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} stroke="#2A2230" strokeWidth={2} />);
  }
  const wins: [number, number][] = [
    [0.06, 0.2],
    [0.28, 0.42],
    [0.5, 0.64],
  ];
  const rows = [
    { w: 0.36, us: [0.3, 0.55] },
    { w: 0.54, us: [0.12, 0.36] },
  ];
  const clock = { x: 1420, y: 250 };
  return (
    <g>
      <defs>
        <linearGradient id={`${id}winsky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5A3A6E" />
          <stop offset="70%" stopColor="#E08A5E" />
          <stop offset="100%" stopColor="#FFC27A" />
        </linearGradient>
      </defs>
      <polygon points={Q([[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]])} fill={S3.ceiling} />
      {[
        [0.3, 0.45, 0.25, 0.33],
        [0.55, 0.7, 0.25, 0.33],
        [0.3, 0.45, 0.55, 0.63],
        [0.55, 0.7, 0.55, 0.63],
      ].map(([u0, u1, w0, w1], i) => (
        <polygon key={`cl${i}`} points={Q([[u0, 0, w0], [u1, 0, w0], [u1, 0, w1], [u0, 0, w1]])} fill="#4A4458" />
      ))}
      <polygon points={Q([[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]])} fill={S3.wallSide} />
      <polygon points={Q([[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]])} fill="#2A2331" />
      <polygon points={Q([[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]])} fill="#3A3240" />
      {tiles}
      <rect x={300} y={130} width={1200} height={590} fill={S3.wall} />
      <WallTexture rect={[300, 130, 1200, 590]} />
      <WallTexture points={Q([[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]])} />
      <WallTexture points={Q([[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]])} />
      <RoomCorners x0={300} x1={1500} y0={130} y1={720} />
      <rect x={300} y={704} width={1200} height={16} fill={S3.trim} />
      {/* the windows on the left wall, and the low sun they let in */}
      {wins.map(([w0, w1], i) => (
        <g key={`wn${i}`}>
          <polygon points={Q([[0, 0.16, w0], [0, 0.16, w1], [0, 0.74, w1], [0, 0.74, w0]])} fill={`url(#${id}winsky)`} />
          <polygon points={Q([[0, 0.16, w0], [0, 0.16, w1], [0, 0.74, w1], [0, 0.74, w0]])} fill="none" stroke="#1E1824" strokeWidth={10} />
          <path d={`M ${P(0, 0.16, (w0 + w1) / 2).x} ${P(0, 0.16, (w0 + w1) / 2).y} L ${P(0, 0.74, (w0 + w1) / 2).x} ${P(0, 0.74, (w0 + w1) / 2).y}`} stroke="#1E1824" strokeWidth={7} />
          <path d={`M ${P(0, 0.42, w0).x} ${P(0, 0.42, w0).y} L ${P(0, 0.42, w1).x} ${P(0, 0.42, w1).y}`} stroke="#1E1824" strokeWidth={7} />
          <polygon points={Q([[0, 0.74, w0], [0, 0.74, w1], [0.32, 1, w1 + 0.08], [0.32, 1, w0 + 0.08]])} fill="#FFC27A" opacity={0.07} style={{ mixBlendMode: 'screen' }} />
          <polygon points={Q([[0.22, 1, w0 + 0.06], [0.5, 1, w0 + 0.1], [0.5, 1, w1 + 0.1], [0.22, 1, w1 + 0.06]])} fill="#FFB46A" opacity={0.16} style={{ mixBlendMode: 'screen' }} />
        </g>
      ))}
      {/* the low sun lands on the back wall too */}
      {[0, 1].map((i) => (
        <polygon key={`wl${i}`} points={pts([{ x: 1130 + i * 150, y: 420 }, { x: 1250 + i * 150, y: 440 }, { x: 1250 + i * 150, y: 640 }, { x: 1130 + i * 150, y: 616 }])} fill="#FFB46A" opacity={0.12} style={{ mixBlendMode: 'screen' }} />
      ))}
      {/* the board: a sum, faded working from an earlier lesson, chalk and a duster */}
      <rect x={410} y={180} width={660} height={360} rx={8} fill="#5A3A3E" />
      <rect x={426} y={196} width={628} height={328} rx={4} fill={S3.board} />
      <g fill="#EDEFE6" opacity={0.12} fontFamily={FONT.hand} fontSize={30}>
        <text x={460} y={250}>a + b = c</text>
        <text x={820} y={490}>12 ÷ 4 = 3</text>
        <path d="M 900 230 L 960 300 L 870 300 Z" fill="none" stroke="#EDEFE6" strokeWidth={3} />
      </g>
      {board ?? (
        <g>
          <text x={690} y={410} textAnchor="middle" fontFamily={FONT.hand} fontSize={120} fill="#EDEFE6" opacity={0.92}>
            7 × 8 =
          </text>
          <text x={950} y={410} textAnchor="middle" fontFamily={FONT.hand} fontSize={120} fill={solved ? '#9BEFB0' : '#EDEFE6'} opacity={0.92}>
            {solved ? '56' : wrong ? '54' : '?'}
          </text>
          {wrong && !solved ? <path d="M 900 340 L 1000 430 M 1000 340 L 900 430" stroke="#FF6A5A" strokeWidth={9} strokeLinecap="round" opacity={0.9} /> : null}
        </g>
      )}
      <rect x={410} y={536} width={660} height={14} fill="#4A3034" />
      <rect x={480} y={528} width={60} height={10} rx={3} fill="#8A8EA6" />
      <rect x={560} y={530} width={30} height={7} rx={3} fill="#F4F1EA" />
      <rect x={604} y={530} width={22} height={7} rx={3} fill="#E9C46A" />
      {/* a pinboard of class work */}
      <rect x={1110} y={210} width={240} height={190} fill="#6A4A34" />
      <rect x={1118} y={218} width={224} height={174} fill="#9A7450" />
      {[
        [1130, 230, '#F4EEE0', -4],
        [1196, 236, '#E9C46A', 3],
        [1262, 228, '#9FC0D6', -2],
        [1138, 304, '#E4A27A', 2],
        [1210, 310, '#F4EEE0', -3],
        [1278, 300, '#B0D49A', 4],
      ].map(([x, y, c, rot], i) => (
        <g key={`pp${i}`} transform={`rotate(${rot} ${x} ${y})`}>
          <rect x={x as number} y={y as number} width={52} height={62} fill={c as string} />
          <circle cx={(x as number) + 26} cy={(y as number) + 6} r={4} fill="#C0392B" />
        </g>
      ))}
      {/* the clock */}
      <circle cx={clock.x} cy={clock.y} r={58} fill="#EFE2CC" />
      <circle cx={clock.x} cy={clock.y} r={58} fill="none" stroke="#1E1824" strokeWidth={8} />
      <path d={`M ${clock.x} ${clock.y} L ${clock.x} ${clock.y - 38} M ${clock.x} ${clock.y} L ${clock.x + 26} ${clock.y + 10}`} stroke="#1E1824" strokeWidth={6} strokeLinecap="round" />
      {/* the teacher's desk, with books, an apple and a globe */}
      <Box r={r} u={[0.06, 0.3]} v={[0.76, 1]} w={[0.14, 0.26]} front="#5B4038" top="#7A5747" side="#3A2826" rim />
      {(() => {
        const tp = P(0.12, 0.76, 0.2);
        const tp2 = P(0.24, 0.76, 0.2);
        return (
          <g>
            <rect x={tp.x - 20} y={tp.y - 20} width={60} height={12} fill="#4A5A7A" />
            <rect x={tp.x - 14} y={tp.y - 32} width={52} height={12} fill="#8A4A4A" />
            <circle cx={tp.x + 70} cy={tp.y - 12} r={12} fill="#C0392B" />
            <path d={`M ${tp.x + 70} ${tp.y - 24} l 4 -8`} stroke="#3A2826" strokeWidth={3} />
            <path d={`M ${tp2.x} ${tp2.y} L ${tp2.x} ${tp2.y - 30}`} stroke="#3A2826" strokeWidth={5} />
            <circle cx={tp2.x} cy={tp2.y - 56} r={28} fill="#4A7AA0" />
            <path d={`M ${tp2.x - 14} ${tp2.y - 70} q 10 6 6 18 q 14 -4 18 8`} fill="#6AA06A" />
          </g>
        );
      })()}
      {(() => {
        const b = P(0.36, 1, 0.24);
        return (
          <g>
            <ellipse cx={b.x + 6} cy={b.y + 4} rx={40} ry={10} fill="#000" opacity={0.3} />
            <path d={`M ${b.x - 30} ${b.y - 70} L ${b.x + 30} ${b.y - 70} L ${b.x + 24} ${b.y} L ${b.x - 24} ${b.y} Z`} fill="#3E6A8A" />
            <ellipse cx={b.x} cy={b.y - 70} rx={30} ry={8} fill="#2E4E6A" />
          </g>
        );
      })()}
      {/* cubbies on the right wall */}
      {[0, 1, 2].map((i) =>
        [0, 1].map((j) => {
          const w0 = 0.42 + i * 0.1;
          const v0 = 0.66 + j * 0.16;
          const c = ['#9A6A5A', '#6A8A9A', '#B0A05A', '#7A6A9A', '#6A9A7A', '#A07A5A'][i * 2 + j];
          return (
            <g key={`cb${i}${j}`}>
              <polygon points={Q([[1, v0, w0], [1, v0, w0 + 0.09], [1, v0 + 0.15, w0 + 0.09], [1, v0 + 0.15, w0]])} fill="#3A2C35" />
              <polygon points={Q([[1, v0 + 0.05, w0 + 0.01], [1, v0 + 0.05, w0 + 0.08], [1, v0 + 0.14, w0 + 0.08], [1, v0 + 0.14, w0 + 0.01]])} fill={c} />
            </g>
          );
        }),
      )}
      <LightVeil id={`${id}veil`} lights={[[P(0, 0.45, 0.35).x, P(0, 0.45, 0.35).y, 900], [1280, 530, 420], [740, 360, 560]]} o={0.42} />
      <Dust t={t} seed={21} x0={300} y0={300} w={1000} h={560} n={50} o={0.5} />
      {/* the rows of desks and the class */}
      {rows.map((row, ri) =>
        row.us.map((u, ui) => {
          const seat = P(u + 0.07, 1, row.w + 0.1);
          const k = r.s(row.w + 0.1) / r.s(0.55);
          return (
            <g key={`row${ri}-${ui}`}>
              <polygon points={Q([[u - 0.01, 1, row.w - 0.01], [u + 0.15, 1, row.w - 0.01], [u + 0.15, 1, row.w + 0.07], [u - 0.01, 1, row.w + 0.07]])} fill="#000" opacity={0.25} />
              <KidDesk u={u} w={row.w} />
              {(() => {
                const bp = P(u + 0.16, 1, row.w + 0.08);
                const k = r.s(row.w + 0.08) / r.s(0.55);
                const c = ['#B0463A', '#3E6A8A', '#6A8A4A', '#8A5A9A'][(ri * 2 + ui) % 4];
                return <path d={`M ${bp.x - 22 * k} ${bp.y} L ${bp.x - 24 * k} ${bp.y - 50 * k} Q ${bp.x} ${bp.y - 66 * k} ${bp.x + 24 * k} ${bp.y - 50 * k} L ${bp.x + 22 * k} ${bp.y} Z`} fill={c} />;
              })()}
              <Kid x={seat.x} y={seat.y - 70 * k} s={0.55 * k} look={KIDS[(ri * 2 + ui) % KIDS.length]} turn={laugh > 0 && (ri + ui) % 2 === 0 ? 1 : 0} laugh={laugh} t={t} />
            </g>
          );
        }),
      )}
    </g>
  );
};

/** The hero's own desk in the classroom, toward the classroom's vanishing point. */
export const SchoolDesk: React.FC<{ x: number }> = ({ x }) => {
  const vp = CLS.vp;
  const k = 0.9;
  const bk = (px: number, py: number) => ({ x: vp.x + (px - vp.x) * k, y: vp.y + (py - vp.y) * k });
  const y = 750;
  const a = bk(x - 180, y);
  const b = bk(x + 180, y);
  return (
    <g>
      <polygon points={pts([{ x: x - 180, y }, { x: x + 180, y }, b, a])} fill="#8A6452" />
      <rect x={x - 180} y={y} width={360} height={18} fill="#7A5747" />
      <rect x={x - 180} y={y} width={360} height={2.5} fill={S3.warm} opacity={0.6} />
      <rect x={x - 168} y={y + 18} width={336} height={70} fill="#4A3430" />
      <path d={`M ${x - 160} ${y + 88} L ${x - 166} ${y + 240} M ${x + 160} ${y + 88} L ${x + 166} ${y + 240}`} stroke={S3.metal} strokeWidth={10} />
      <rect x={x - 120} y={y - 10} width={110} height={10} fill="#F4EEE0" transform={`rotate(-3 ${x - 60} ${y - 5})`} />
      <path d={`M ${x + 40} ${y - 6} L ${x + 120} ${y - 14}`} stroke="#E9C46A" strokeWidth={6} strokeLinecap="round" />
    </g>
  );
};
