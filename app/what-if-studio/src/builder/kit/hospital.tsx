// Bo boi canh benh vien bo sung (Pop): phong benh 2 giuong (rem chia, cua so nhin cay, man hinh nhip tim) va hanh lang (cua phong co so, quay y ta, may ban hang, xe lan).
import React from 'react';
import { clamp, lerp } from '../../engine';
import type { StageDef, Ctx, Place } from '../stages';
import { Sky, todOf } from './sets';

const PS = 1.3;
const OL = '#1B1530';
const W = 4;
const F = 'Bricolage Grotesque, sans-serif';
const B: React.FC<React.SVGProps<SVGRectElement>> = (p) => <rect stroke={OL} strokeWidth={W} strokeLinejoin="round" {...p} />;
const flat = (x0: number, x1: number, y: number, scale = 1) => (u: number): Place => ({ x: lerp(x0, x1, u), y, scale });
const night = (c: Ctx) => todOf(c) === 'night';
const sitters = (c: Ctx) => (c.shot.actors ?? []).map((a, i, all) => ({ a, u: clamp(a.spot ?? (all.length <= 1 ? 0.5 : i / (all.length - 1))) })).filter((x) => x.a.pose === 'sit' && !x.a.pose2);

/** Xe lan: phan sau (lung ghe) ve truoc nhan vat, banh lon ve o lop truoc. */
const ChairBack: React.FC<{ x: number; y: number; d: number }> = ({ x, y, d }) => (
  <g transform={`translate(${x} ${y})`}>
    <path d={`M ${-d * 70} -150 L ${-d * 70} 20 L ${d * 60} 20`} stroke="#3A3E52" strokeWidth={14} fill="none" strokeLinecap="round" />
    <rect x={d > 0 ? -80 : 54} y={-150} width={26} height={150} rx={8} fill="#2E6FD6" stroke={OL} strokeWidth={3} />
    <rect x={-70} y={4} width={130} height={24} rx={8} fill="#2E6FD6" stroke={OL} strokeWidth={3} />
  </g>
);
const ChairWheel: React.FC<{ x: number; y: number; d: number; t: number }> = ({ x, y, d, t }) => (
  <g transform={`translate(${x - d * 10} ${y + 60})`}>
    <circle r={78} fill="none" stroke={OL} strokeWidth={14} />
    <circle r={78} fill="none" stroke="#8A8FA0" strokeWidth={8} />
    <g transform={`rotate(${t * 9})`}>{[0, 45, 90, 135].map((a) => <path key={a} transform={`rotate(${a})`} d="M -72 0 L 72 0" stroke="#8A8FA0" strokeWidth={3} />)}</g>
    <circle r={12} fill="#3A3E52" stroke={OL} strokeWidth={3} />
    <circle cx={d * 110} cy={50} r={18} fill="#3A3E52" stroke={OL} strokeWidth={3} />
  </g>
);

const Bed: React.FC<{ x: number; w: number; n: boolean }> = ({ x, w, n }) => (
  <g>
    <B x={x} y={560} width={26} height={300} fill="#C9CEDA" />
    <B x={x - 10} y={540} width={46} height={30} rx={10} fill="#E6E9F2" />
    <B x={x + 10} y={700} width={w - 20} height={70} rx={10} fill="#C9CEDA" />
    <B x={x + 20} y={650} width={w - 40} height={70} rx={24} fill={n ? '#C8D2E6' : '#FFFFFF'} />
    <B x={x + 40} y={630} width={150} height={50} rx={22} fill="#F4F2EE" />
    <B x={x + 200} y={660} width={w - 230} height={60} rx={20} fill={n ? '#5A7FB8' : '#8FC4FF'} />
    <B x={x + w - 26} y={600} width={26} height={260} fill="#C9CEDA" />
    {[x + 60, x + w - 80].map((cx) => <circle key={cx} cx={cx} cy={870} r={16} fill="#3A3E52" stroke={OL} strokeWidth={3} />)}
  </g>
);

const HOSP: Record<string, StageDef> = {
  ward: {
    label: 'Phòng bệnh 2 giường (Pop)',
    hint: 'Phong benh 2 giuong: giuong trai (spot < 0.5) canh tuong co poster meo "HANG IN THERE", giuong phai canh cua so nhin cay. Rem treo giua 2 giuong. Man hinh nhip tim tren tuong: board = so BPM (vd 180; tren 120 thi nhap do). fx2 = rem keo kin (0 mo, 0.5 nua, 1 kin). Ngoi/nam (sit/lie/sleep) tren giuong.',
    actors: true,
    back: (c) => {
      const n = night(c);
      const bpm = parseInt(c.shot.board || '72', 10) || 72;
      const fast = bpm > 120;
      const curt = clamp(c.fx);
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill={n ? '#2E3A4A' : '#DDF2EE'} />
          <rect x={-400} y={-200} width={2720} height={130} fill={n ? '#263040' : '#C9E6E0'} />
          {/* cua so ben phai nhin ra cay */}
          <g>
            <clipPath id={`${c.id}wwin`}><rect x={1380} y={170} width={460} height={340} /></clipPath>
            <g clipPath={`url(#${c.id}wwin)`}>
              <svg x={1380} y={170} width={460} height={340} viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice"><Sky c={c} horizon={900} /></svg>
              {[1440, 1600, 1760].map((x, i) => <g key={x}><rect x={x - 12} y={380} width={24} height={140} fill="#6B4A2A" /><circle cx={x} cy={360 + Math.sin(c.t * 0.05 + i) * 4} r={80} fill={n ? '#1E4A32' : '#3FA35A'} stroke={OL} strokeWidth={3} /></g>)}
            </g>
            <rect x={1380} y={170} width={460} height={340} fill="none" stroke={OL} strokeWidth={12} />
            <path d="M 1610 170 L 1610 510 M 1380 340 L 1840 340" stroke={OL} strokeWidth={8} />
          </g>
          {/* poster meo ben trai */}
          <B x={60} y={190} width={240} height={300} rx={8} fill="#FFF3C4" />
          <circle cx={180} cy={300} r={60} fill="#F2A65A" stroke={OL} strokeWidth={3} />
          <path d="M 135 255 L 140 215 L 165 245 M 225 255 L 220 215 L 195 245" fill="#F2A65A" stroke={OL} strokeWidth={3} />
          <circle cx={160} cy={295} r={7} fill={OL} /><circle cx={200} cy={295} r={7} fill={OL} />
          <text x={180} y={420} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={30} fill={OL}>HANG IN</text>
          <text x={180} y={458} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={30} fill={OL}>THERE</text>
          {/* man hinh nhip tim giua */}
          <B x={560} y={150} width={280} height={190} rx={14} fill="#2E3346" />
          <rect x={578} y={168} width={244} height={124} fill="#0E1A24" />
          <path
            d={Array.from({ length: 25 }, (_, i) => {
              const x = 580 + i * 10;
              const ph = (i + Math.floor(c.t * (bpm / 110))) % (fast ? 6 : 12);
              const y = ph === 2 ? 190 : ph === 3 ? 280 : ph === 4 ? 220 : 240;
              return `${i ? 'L' : 'M'} ${x} ${y}`;
            }).join(' ')}
            stroke={fast ? '#FF4D6D' : '#6FFFB0'}
            strokeWidth={5}
            fill="none"
          />
          <text x={810} y={325} textAnchor="end" fontFamily="Fragment Mono, monospace" fontSize={34} fill={fast ? '#FF4D6D' : '#6FFFB0'}>♥ {bpm}</text>
          {fast && Math.floor(c.t / 5) % 2 ? <circle cx={800} cy={175} r={10} fill="#FF4D6D" /> : null}
          <path d="M 640 340 Q 600 470 560 600" stroke="#3A3E52" strokeWidth={4} fill="none" />
          {/* thanh treo rem */}
          <B x={420} y={96} width={1080} height={14} fill="#C9CEDA" />
          <rect x={-400} y={850} width={2720} height={460} fill={n ? '#3A4456' : '#C9D6E8'} />
          <path d="M -400 850 L 2320 850" stroke={OL} strokeWidth={W} />
          <Bed x={120} w={680} n={n} />
          <Bed x={1120} w={680} n={n} />
          {/* rem: keo tu ben trai thanh giua */}
          {curt > 0.02 ? (
            <g>
              <path d={`M ${960 - 110 * curt} 110 ${Array.from({ length: 6 }, (_, i) => `Q ${960 - 110 * curt + (i + 0.5) * (220 * curt) / 6} ${470 + (i % 2 ? 30 : -30)} ${960 - 110 * curt + (i + 1) * (220 * curt) / 6} 110`).join(' ')} L ${960 + 110 * curt} 840 L ${960 - 110 * curt} 840 Z`} fill="#7FCFE0" stroke={OL} strokeWidth={W} opacity={0.97} />
              {Array.from({ length: 5 }, (_, i) => <path key={i} d={`M ${960 - 110 * curt + (i + 1) * (220 * curt) / 6} 120 L ${960 - 110 * curt + (i + 1) * (220 * curt) / 6} 830`} stroke="#5AB2C8" strokeWidth={5} />)}
            </g>
          ) : (
            <path d="M 430 110 Q 450 480 430 840 L 500 840 Q 480 480 500 110 Z" fill="#7FCFE0" stroke={OL} strokeWidth={W} />
          )}
        </g>
      );
    },
    place: (u) => ({ x: u < 0.5 ? lerp(260, 820, u * 2) : lerp(1100, 1660, (u - 0.5) * 2), y: 930 - 140 * PS, scale: PS }),
    seat: (u) => ({ x: u < 0.5 ? 520 : 1400, y: 660 - 70 * PS - 4, scale: PS }),
    surface: flat(1100, 1700, 650),
    floor: flat(300, 1620, 950),
    wide: () => [960, 560, 1],
    rim: 'popRim',
    mediumUp: 110,
  },
  hallway: {
    label: 'Hành lang bệnh viện (Pop)',
    hint: 'Hanh lang dai: cua phong co so, quay y ta, may ban hang tu dong. board = so phong tren cua giua (vd 312). fx2 > 0.5 = moi nhan vat ngoi (sit) ngoi tren xe lan (dua xe lan: dung move pan/follow + ui speed).',
    actors: true,
    back: (c) => {
      const n = night(c);
      const room = c.shot.board || '304';
      const chairs = c.fx > 0.5 ? sitters(c) : [];
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill={n ? '#2E3A4A' : '#EAF4F2'} />
          {/* tran + den */}
          <path d="M -400 -200 L 2320 -200 L 1260 300 L 660 300 Z" fill={n ? '#263040' : '#D5E6E2'} />
          {[0, 1, 2].map((i) => <rect key={i} x={900 - 160 / (i + 1)} y={300 - 120 / (i + 1) - i * 40} width={320 / (i + 1) + 60} height={16} rx={6} fill={n ? '#5A6478' : '#FFFFFF'} />)}
          {/* tuong phoi canh */}
          <path d="M -400 -200 L 660 300 L 660 720 L -400 1300 Z" fill={n ? '#34425A' : '#DDF0EC'} stroke={OL} strokeWidth={W} />
          <path d="M 2320 -200 L 1260 300 L 1260 720 L 2320 1300 Z" fill={n ? '#34425A' : '#DDF0EC'} stroke={OL} strokeWidth={W} />
          <rect x={660} y={300} width={600} height={420} fill={n ? '#3A4A62' : '#CDE8E4'} stroke={OL} strokeWidth={W} />
          {/* cua cuoi hanh lang */}
          <B x={860} y={420} width={200} height={300} fill="#8FB8D8" />
          <text x={960} y={400} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={40} fill="#2E9E66">EXIT</text>
          {/* cua phong 2 ben */}
          {[[120, 300, 880], [430, 360, 760]].map(([x, top, bot], i) => (
            <g key={i}>
              <path d={`M ${x} ${top} L ${x + 160 - i * 60} ${top + 70 - i * 10} L ${x + 160 - i * 60} ${bot - 40 + i * 10} L ${x} ${bot} Z`} fill="#6FA8D8" stroke={OL} strokeWidth={W} />
              <text x={x + 70 - i * 25} y={top - 14} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={44 - i * 10} fill={OL}>{i ? '306' : room}</text>
            </g>
          ))}
          {[[1640, 300, 880], [1340, 360, 760]].map(([x, top, bot], i) => (
            <g key={i}>
              <path d={`M ${x + 160 - i * 60} ${top} L ${x} ${top + 70 - i * 10} L ${x} ${bot - 40 + i * 10} L ${x + 160 - i * 60} ${bot} Z`} fill="#6FA8D8" stroke={OL} strokeWidth={W} />
              <text x={x + 90 - i * 30} y={top - 14} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={44 - i * 10} fill={OL}>{i ? '310' : '312'}</text>
            </g>
          ))}
          {/* tay vin */}
          <path d="M -400 760 L 660 560" stroke="#C9A24A" strokeWidth={10} />
          <path d="M 2320 760 L 1260 560" stroke="#C9A24A" strokeWidth={10} />
          {/* san bong */}
          <path d="M -400 1300 L 660 720 L 1260 720 L 2320 1300 Z" fill={n ? '#3A4456' : '#C9D6E8'} stroke={OL} strokeWidth={W} />
          {[0, 1, 2, 3].map((i) => { const y = 720 + Math.pow((i + 1) / 5, 1.6) * 580; return <path key={i} d={`M ${lerp(660, -400, (y - 720) / 580)} ${y} L ${lerp(1260, 2320, (y - 720) / 580)} ${y}`} stroke="#FFFFFF" strokeWidth={3} opacity={0.4} />; })}
          <path d="M 960 720 L 960 1300" stroke="#FFFFFF" strokeWidth={4} opacity={0.25} />
          {/* may ban hang */}
          <B x={1500} y={430} width={170} height={330} rx={10} fill="#E8453C" />
          <rect x={1520} y={460} width={110} height={200} fill="#14182A" stroke={OL} strokeWidth={3} />
          {[0, 1, 2].map((r) => [0, 1].map((k) => <rect key={`${r}${k}`} x={1532 + k * 50} y={475 + r * 62} width={36} height={44} rx={4} fill={['#FFD23F', '#5ED3A8', '#6FA8FF'][(r + k) % 3]} />))}
          {/* quay y ta */}
          <B x={140} y={690} width={420} height={150} rx={10} fill="#F4F2EE" />
          <B x={120} y={670} width={460} height={30} rx={8} fill="#7FCFE0" />
          <text x={350} y={780} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={34} fill={OL}>NURSES</text>
          {chairs.map(({ a, u }, i) => <ChairBack key={i} x={lerp(520, 1400, u)} y={900 - 70 * PS - 4 + 110} d={(a.facing ?? 'right') === 'left' ? -1 : 1} />)}
        </g>
      );
    },
    front: (c) => {
      if (c.fx <= 0.5) return null;
      return <g>{sitters(c).map(({ a, u }, i) => <ChairWheel key={i} x={lerp(520, 1400, u)} y={900 - 70 * PS - 4 + 110} d={(a.facing ?? 'right') === 'left' ? -1 : 1} t={c.t} />)}</g>;
    },
    place: (u) => ({ x: lerp(520, 1400, u), y: 960 - 140 * PS, scale: PS }),
    seat: (u) => ({ x: lerp(520, 1400, u), y: 900 - 70 * PS - 4, scale: PS }),
    surface: flat(160, 560, 670),
    floor: flat(520, 1400, 980),
    wide: () => [960, 560, 1],
    rim: 'popRim',
  },
};

export default HOSP;
