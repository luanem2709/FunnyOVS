// Boi canh bo sung (Pop): trong xe hoi (2 ghe truoc, canh vat chay qua cua so) va ben ho cau ca (cau go, can cau, chiec ung).
import React from 'react';
import { lerp } from '../../engine';
import type { StageDef, Ctx, Place } from '../stages';
import { Sky, todOf } from './sets';

const PS = 1.3;
const OL = '#1B1530';
const W = 4;
const B: React.FC<React.SVGProps<SVGRectElement>> = (p) => <rect stroke={OL} strokeWidth={W} strokeLinejoin="round" {...p} />;
const Pth: React.FC<React.SVGProps<SVGPathElement>> = (p) => <path stroke={OL} strokeWidth={W} strokeLinejoin="round" strokeLinecap="round" {...p} />;
const flat = (x0: number, x1: number, y: number, scale = 1) => (u: number): Place => ({ x: lerp(x0, x1, u), y, scale });
const night = (c: Ctx) => todOf(c) === 'night';

/** Cua so xe: troi + cay chay ngang (dir = 1 sang phai). */
const SideWin: React.FC<{ c: Ctx; x: number; y: number; w: number; h: number; dir: number }> = ({ c, x, y, w, h, dir }) => {
  const id = `${c.id}win${x}`;
  const off = ((c.t * 26 * dir) % 300 + 300) % 300;
  return (
    <g>
      <clipPath id={id}><rect x={x} y={y} width={w} height={h} rx={40} /></clipPath>
      <g clipPath={`url(#${id})`}>
        <svg x={x} y={y} width={w} height={h} viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice"><Sky c={c} horizon={900} /></svg>
        <path d={`M ${x} ${y + h * 0.72} Q ${x + w * 0.3} ${y + h * 0.55} ${x + w * 0.6} ${y + h * 0.7} T ${x + w} ${y + h * 0.66} L ${x + w} ${y + h} L ${x} ${y + h} Z`} fill={night(c) ? '#1E3A2E' : '#7CC67A'} />
        {Array.from({ length: 5 }, (_, i) => {
          const tx = x - 150 + ((i * 300 + off) % (w + 300));
          return <g key={i}><rect x={tx - 10} y={y + h * 0.6} width={20} height={h * 0.4} fill="#6B4A2A" /><circle cx={tx} cy={y + h * 0.55} r={70} fill={night(c) ? '#173025' : '#3FA35A'} stroke={OL} strokeWidth={3} /></g>;
        })}
      </g>
      <rect x={x} y={y} width={w} height={h} rx={40} fill="none" stroke={OL} strokeWidth={10} />
    </g>
  );
};

const SEAT = (x: number, col: string) => (
  <g>
    <B x={x - 70} y={420} width={140} height={110} rx={40} fill={col} />
    <path d={`M ${x - 30} 530 L ${x - 30} 560 M ${x + 30} 530 L ${x + 30} 560`} stroke="#8A8FA0" strokeWidth={10} />
    <B x={x - 170} y={555} width={340} height={420} rx={70} fill={col} />
    <path d={`M ${x - 110} 600 L ${x - 110} 940 M ${x + 110} 600 L ${x + 110} 940`} stroke={OL} strokeWidth={3} opacity={0.35} />
  </g>
);

const EXTRA: Record<string, StageDef> = {
  car: {
    label: 'Trong xe hơi (Pop)',
    hint: 'Nhin tu kinh truoc vao: 2 ghe truoc (spot < 0.5 ghe lai co vo lang, > 0.5 ghe phu), cua so hai ben cay chay qua, kinh sau thay duong. Dung tu the sit. fx2 > 0.5 = radio bat (not nhac bay).',
    actors: true,
    back: (c) => {
      const n = night(c);
      const dash = (c.t * 0.05) % 1;
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill={n ? '#2A2D3E' : '#5A5F78'} />
          <rect x={-400} y={-200} width={2720} height={330} fill={n ? '#202232' : '#4A4E66'} />
          <SideWin c={c} x={-120} y={170} w={620} h={420} dir={1} />
          <SideWin c={c} x={1420} y={170} w={620} h={420} dir={-1} />
          {/* kinh sau: duong chay lui */}
          <g>
            <clipPath id={`${c.id}rear`}><rect x={620} y={190} width={680} height={300} rx={50} /></clipPath>
            <g clipPath={`url(#${c.id}rear)`}>
              <svg x={620} y={190} width={680} height={300} viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice"><Sky c={c} horizon={700} /></svg>
              <path d="M 620 400 L 1300 400 L 1300 490 L 620 490 Z" fill={n ? '#1E3A2E' : '#7CC67A'} />
              <path d="M 930 400 L 990 400 L 1180 490 L 740 490 Z" fill={n ? '#2A2D3E' : '#6A6F80'} />
              {[0, 1, 2].map((i) => { const k = (i / 3 + dash) % 1; return <rect key={i} x={960 - 4 - k * 14} y={400 + k * 85} width={8 + k * 28} height={6 + k * 10} fill="#FFE38A" />; })}
            </g>
            <rect x={620} y={190} width={680} height={300} rx={50} fill="none" stroke={OL} strokeWidth={10} />
          </g>
          {/* ghe sau */}
          <B x={440} y={500} width={1040} height={200} rx={60} fill={n ? '#3A3E52' : '#7A6A5A'} />
          {SEAT(800, n ? '#4A4458' : '#B0754A')}
          {SEAT(1120, n ? '#4A4458' : '#B0754A')}
          <rect x={-400} y={940} width={2720} height={400} fill={n ? '#202232' : '#3A3E52'} />
        </g>
      );
    },
    front: (c) => {
      const radio = c.fx > 0.5;
      return (
        <g>
          {/* khung kinh truoc */}
          <path d="M -400 -200 L 2320 -200 L 2320 60 L -400 60 Z" fill={OL} />
          <path d="M -400 60 L 130 60 L -60 1300 L -400 1300 Z" fill={OL} />
          <path d="M 2320 60 L 1790 60 L 1980 1300 L 2320 1300 Z" fill={OL} />
          <B x={880} y={60} width={160} height={50} rx={14} fill="#3A3E52" />
          <path d="M 960 60 L 960 30" stroke={OL} strokeWidth={8} />
          {/* tap-lo */}
          <Pth d="M -100 1000 Q 960 900 2020 1000 L 2020 1300 L -100 1300 Z" fill="#2A2D3E" />
          <B x={880} y={968} width={160} height={70} rx={10} fill="#14182A" />
          <text x={960} y={1015} textAnchor="middle" fontFamily="Fragment Mono, monospace" fontSize={34} fill={radio ? '#5ED3A8' : '#3A3E52'}>{radio ? 'FM 98.7' : '--.-'}</text>
          {radio ? [0, 1, 2].map((i) => { const k = (c.t * 0.03 + i / 3) % 1; return <text key={i} x={960 + Math.sin(i * 2 + c.t * 0.1) * 80} y={960 - k * 220} textAnchor="middle" fontSize={54} fill="#FFD23F" opacity={1 - k} stroke={OL} strokeWidth={2}>♪</text>; }) : null}
          {/* vo lang truoc ghe lai */}
          <g transform={`translate(800 930) rotate(${Math.sin(c.t * 0.04) * 4})`}>
            <ellipse cx={0} cy={0} rx={150} ry={95} fill="none" stroke={OL} strokeWidth={30} />
            <ellipse cx={0} cy={0} rx={150} ry={95} fill="none" stroke="#3A3E52" strokeWidth={20} />
            <path d="M -140 10 L 140 10" stroke="#3A3E52" strokeWidth={18} />
            <circle cx={0} cy={10} r={34} fill="#3A3E52" stroke={OL} strokeWidth={W} />
          </g>
        </g>
      );
    },
    place: (u) => ({ x: u < 0.5 ? 800 : 1120, y: 905 - 140 * PS, scale: PS }),
    seat: (u) => ({ x: u < 0.5 ? 800 : 1120, y: 905 - 70 * PS - 4, scale: PS }),
    surface: flat(880, 1040, 968),
    floor: flat(700, 1220, 960),
    wide: () => [960, 560, 1],
    rim: 'popRim',
    mediumUp: 110,
  },
  lake: {
    label: 'Bờ hồ câu cá (Pop)',
    hint: 'Cau go nho ra mat ho, doi cay phia xa. Ngoi (sit) o mep cau. fx2: > 0.2 = 2 can cau + phao nhap nho, > 0.8 = can ben phai keo len... mot chiec ung.',
    actors: true,
    back: (c) => {
      const n = night(c);
      return (
        <g>
          <Sky c={c} horizon={540} />
          <path d="M -400 470 Q -100 380 200 450 Q 500 360 820 440 Q 1150 370 1450 450 Q 1750 380 2320 460 L 2320 560 L -400 560 Z" fill={n ? '#1E3A2E' : '#4E9E6A'} stroke={OL} strokeWidth={W} />
          {Array.from({ length: 14 }, (_, i) => <path key={i} d={`M ${-300 + i * 180} 520 l 30 -110 l 30 110 Z`} fill={n ? '#173025' : '#2E7E4E'} stroke={OL} strokeWidth={3} />)}
          <rect x={-400} y={540} width={2720} height={800} fill={n ? '#1A3050' : '#5FB8E6'} />
          <rect x={-400} y={540} width={2720} height={60} fill="#FFFFFF" opacity={0.15} />
          {Array.from({ length: 12 }, (_, i) => { const x = ((i * 233 + c.t * 3) % 2400) - 300, y = 600 + (i * 47) % 300; return <path key={i} d={`M ${x} ${y} q 30 -10 60 0`} stroke="#FFFFFF" strokeWidth={4} opacity={0.5} fill="none" />; })}
          {/* cau go */}
          {[480, 760, 1040, 1320].map((x) => <B key={x} x={x - 18} y={880} width={36} height={260} fill="#6B4A2A" />)}
          <B x={380} y={850} width={1160} height={44} fill="#B07A4A" />
          {Array.from({ length: 10 }, (_, i) => <path key={i} d={`M ${380 + i * 116} 850 L ${380 + i * 116} 894`} stroke={OL} strokeWidth={3} opacity={0.5} />)}
          <B x={1420} y={780} width={110} height={72} rx={8} fill="#E8453C" />
          <B x={1410} y={770} width={130} height={20} rx={6} fill="#FFFFFF" />
        </g>
      );
    },
    front: (c) => {
      if (c.fx <= 0.2) return null;
      const boot = c.fx > 0.8;
      const rod = (x: number, tipX: number, tipY: number, k: number) => {
        const bob = Math.sin(c.t * 0.2 + k) * 6;
        return (
          <g key={x}>
            <path d={`M ${x} 820 L ${tipX} ${tipY}`} stroke="#3A2A1A" strokeWidth={8} strokeLinecap="round" />
            {boot && k ? (
              <g>
                <path d={`M ${tipX} ${tipY} L ${tipX} ${tipY + 180}`} stroke="#FFFFFF" strokeWidth={2} />
                <Pth d={`M ${tipX - 30} ${tipY + 180} L ${tipX + 20} ${tipY + 180} L ${tipX + 20} ${tipY + 260} L ${tipX + 80} ${tipY + 270} L ${tipX + 80} ${tipY + 300} L ${tipX - 30} ${tipY + 300} Z`} fill="#6B4A2A" transform={`rotate(${Math.sin(c.t * 0.15) * 10} ${tipX} ${tipY})`} />
              </g>
            ) : (
              <g>
                <path d={`M ${tipX} ${tipY} Q ${tipX + 60} ${tipY + 200} ${tipX + 90} ${980 + bob}`} stroke="#FFFFFF" strokeWidth={2} fill="none" />
                <circle cx={tipX + 90} cy={980 + bob} r={12} fill="#E8453C" stroke={OL} strokeWidth={3} />
                <ellipse cx={tipX + 90} cy={992} rx={30} ry={6} fill="none" stroke="#FFFFFF" strokeWidth={2} opacity={0.6} />
              </g>
            )}
          </g>
        );
      };
      return <g>{rod(760, 1000, 520, 0)}{rod(1120, boot ? 1420 : 1380, boot ? 380 : 520, 1)}</g>;
    },
    place: (u) => ({ x: lerp(560, 1360, u), y: 860 - 140 * PS, scale: PS }),
    seat: (u) => ({ x: lerp(600, 1320, u), y: 860 - 70 * PS - 4, scale: PS }),
    surface: flat(600, 1320, 850),
    floor: flat(560, 1360, 870),
    wide: () => [960, 560, 1],
    rim: 'popRimWarm',
  },
};

export default EXTRA;
