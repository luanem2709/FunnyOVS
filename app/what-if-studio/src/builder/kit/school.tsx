// Bo boi canh truong hoc + san truoc nha (Pop/Ink): can tin (khay mi Y bay), hanh lang tu khoa, phong the duc nem bong, san truoc nha co loi xe + duong pho (xe lao qua).
import React from 'react';
import { clamp, lerp } from '../../engine';
import type { StageDef, Ctx, Place } from '../stages';
import { Sky, todOf } from './sets';

const PS = 1.3;
const OL = '#1B1530';
const W = 4;
const F = 'Bricolage Grotesque, sans-serif';
const B: React.FC<React.SVGProps<SVGRectElement>> = (p) => <rect stroke={OL} strokeWidth={W} strokeLinejoin="round" {...p} />;
const Pth: React.FC<React.SVGProps<SVGPathElement>> = (p) => <path stroke={OL} strokeWidth={W} strokeLinejoin="round" strokeLinecap="round" {...p} />;
const flat = (x0: number, x1: number, y: number, scale = 1) => (u: number): Place => ({ x: lerp(x0, x1, u), y, scale });
const night = (c: Ctx) => todOf(c) === 'night';
const prog = (c: Ctx) => clamp(c.k);

/** Bong do (cua Lily / bong ne). */
const Ball: React.FC<{ x: number; y: number; r?: number; col?: string; rot?: number }> = ({ x, y, r = 34, col = '#E8453C', rot = 0 }) => (
  <g transform={`translate(${x} ${y}) rotate(${rot})`}>
    <circle r={r} fill={col} stroke={OL} strokeWidth={W} />
    <path d={`M ${-r} 0 Q 0 ${r * 0.5} ${r} 0`} stroke="#FFFFFF" strokeWidth={4} fill="none" opacity={0.7} />
    <circle cx={-r * 0.35} cy={-r * 0.35} r={r * 0.22} fill="#FFFFFF" opacity={0.5} />
  </g>
);

/** Khay an co mi Y. */
const Tray: React.FC<{ x: number; y: number; rot?: number; s?: number }> = ({ x, y, rot = 0, s = 1 }) => (
  <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
    <B x={-110} y={-14} width={220} height={28} rx={10} fill="#8FB8D8" />
    <ellipse cx={-30} cy={-24} rx={56} ry={22} fill="#FFFFFF" stroke={OL} strokeWidth={3} />
    <path d="M -70 -30 q 12 -16 24 0 q 12 -16 24 0 q 12 -16 24 0 q 12 -16 24 0" stroke="#F2C14E" strokeWidth={8} fill="none" />
    <circle cx={-34} cy={-36} r={14} fill="#D9412F" stroke={OL} strokeWidth={3} />
    <rect x={44} y={-50} width={40} height={36} rx={6} fill="#FFFFFF" stroke={OL} strokeWidth={3} />
  </g>
);

const Locker: React.FC<{ x: number; col: string; open?: boolean }> = ({ x, col, open }) => (
  <g>
    <B x={x} y={260} width={110} height={560} fill={open ? '#2A2D3E' : col} />
    {open ? <B x={x - 70} y={262} width={70} height={556} fill={col} /> : null}
    {!open ? (
      <g>
        {[0, 1, 2, 3].map((i) => <rect key={i} x={x + 25} y={300 + i * 16} width={60} height={6} rx={3} fill={OL} opacity={0.35} />)}
        <rect x={x + 82} y={520} width={12} height={46} rx={4} fill="#C9CEDA" stroke={OL} strokeWidth={2} />
      </g>
    ) : null}
  </g>
);

const SCHOOL: Record<string, StageDef> = {
  cafeteria: {
    label: 'Căng tin trường (Pop)',
    hint: 'Can tin truong: quay phat do an + khay phia sau, ban dai + ghe bang phia truoc (sit = ngoi ban). board = chu tren bang treo (mac dinh LUNCH). fx2 > 0.3 = khay mi Y bay qua man hinh (bay luc 0.3-0.6, > 0.8 = mi Y rot xuong dat).',
    actors: true,
    back: (c) => {
      const n = night(c);
      const sign = (c.shot.board || 'LUNCH').toUpperCase();
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill={n ? '#3A3550' : '#F6E7C8'} />
          <rect x={-400} y={-200} width={2720} height={160} fill={n ? '#2E2A44' : '#EAD5AE'} />
          {/* cua so cao */}
          {[120, 560, 1360, 1800].map((x) => (
            <g key={x}>
              <rect x={x - 130} y={60} width={260} height={180} fill={n ? '#1A2440' : '#BFE6FF'} stroke={OL} strokeWidth={8} />
              <path d={`M ${x} 60 L ${x} 240`} stroke={OL} strokeWidth={6} />
            </g>
          ))}
          {/* bang treo */}
          <B x={760} y={70} width={400} height={120} rx={16} fill="#E8453C" />
          <text x={960} y={152} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={66} fill="#FFFFFF">{sign.slice(0, 12)}</text>
          {/* quay phat do an */}
          <B x={200} y={420} width={1520} height={260} rx={10} fill={n ? '#5A6478' : '#C9CEDA'} />
          <B x={180} y={400} width={1560} height={40} rx={8} fill="#8A8FA0" />
          <rect x={240} y={300} width={1440} height={100} fill={n ? '#46506A' : '#E6E9F2'} stroke={OL} strokeWidth={3} opacity={0.7} />
          {[340, 620, 900, 1180, 1460].map((x, i) => (
            <g key={x}>
              <ellipse cx={x} cy={392} rx={100} ry={16} fill="#8A8FA0" stroke={OL} strokeWidth={3} />
              <ellipse cx={x} cy={384} rx={80} ry={10} fill={['#F2C14E', '#7CC67A', '#D9412F', '#F2A65A', '#E6E9F2'][i]} />
            </g>
          ))}
          {/* chong khay */}
          {[0, 1, 2, 3].map((i) => <rect key={i} x={1580} y={460 - i * 14} width={120} height={12} rx={4} fill="#8FB8D8" stroke={OL} strokeWidth={2} />)}
          {/* san */}
          <rect x={-400} y={680} width={2720} height={700} fill={n ? '#4A4458' : '#E2CFA8'} />
          <path d="M -400 680 L 2320 680" stroke={OL} strokeWidth={W} />
          {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M ${-400 + i * 240} 680 L ${-700 + i * 300} 1300`} stroke={OL} strokeWidth={2} opacity={0.12} />)}
          {/* ban dai phia sau */}
          <B x={-100} y={760} width={700} height={36} rx={8} fill="#F2A65A" />
          <B x={1320} y={760} width={700} height={36} rx={8} fill="#F2A65A" />
          {[0, 560, 1420, 1980].map((x) => <rect key={x} x={x - 8} y={796} width={16} height={80} fill="#8A8FA0" />)}
        </g>
      );
    },
    front: (c) => {
      const fx = c.fx;
      const p = prog(c);
      return (
        <g>
          {/* ban dai phia truoc */}
          <B x={-200} y={1010} width={2320} height={44} rx={10} fill="#F2A65A" />
          <rect x={-200} y={1054} width={2320} height={18} fill="#C97A3A" />
          {[200, 960, 1720].map((x) => <rect key={x} x={x - 10} y={1072} width={20} height={80} fill="#8A8FA0" stroke={OL} strokeWidth={2} />)}
          {fx > 0.3 && fx <= 0.8 ? (() => {
            const k = clamp((p - 0.15) / 0.7);
            const x = lerp(500, 1500, k), y = 640 - Math.sin(k * Math.PI) * 360;
            return (
              <g>
                <Tray x={x} y={y} rot={k * 300} s={1.1} />
                {[0, 1, 2].map((i) => <path key={i} d={`M ${x - 40 - i * 70} ${y + 40 + i * 20} q 30 -30 60 0 q 30 30 60 0`} stroke="#F2C14E" strokeWidth={9} fill="none" opacity={1 - i * 0.25} />)}
              </g>
            );
          })() : null}
          {fx > 0.8 ? (
            <g>
              <Tray x={1300} y={1040} rot={170} />
              <path d="M 1150 1050 q 40 -40 80 0 q 40 40 80 0 q 40 -40 80 0" stroke="#F2C14E" strokeWidth={10} fill="none" />
              <circle cx={1240} cy={1040} r={20} fill="#D9412F" stroke={OL} strokeWidth={3} />
            </g>
          ) : null}
        </g>
      );
    },
    place: (u) => ({ x: lerp(380, 1540, u), y: 940 - 140 * PS, scale: PS }),
    seat: (u) => ({ x: lerp(380, 1540, u), y: 1010 - 70 * PS - 4, scale: PS }),
    surface: flat(300, 1620, 1010),
    floor: flat(380, 1540, 940),
    wide: () => [960, 560, 1],
    rim: 'popRimWarm',
    mediumUp: 110,
  },
  schoolhall: {
    label: 'Hành lang trường - tủ khóa (Pop)',
    hint: 'Hanh lang truong: day tu khoa nhieu mau, bang tin giua. board = chu tren bang tin (mac dinh SPRING DANCE). fx2 > 0.5 = mot tu khoa mo cua + giay bay.',
    actors: true,
    back: (c) => {
      const n = night(c);
      const note = (c.shot.board || 'SPRING DANCE').toUpperCase().split('\n');
      const cols = ['#2E6FD6', '#E8453C', '#2E9E66', '#F2A65A'];
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill={n ? '#2E3A4A' : '#F2EEE4'} />
          <rect x={-400} y={-200} width={2720} height={140} fill={n ? '#263040' : '#E2DCCE'} />
          {[200, 960, 1720].map((x) => <rect key={x} x={x - 160} y={-40} width={320} height={22} rx={8} fill={n ? '#5A6478' : '#FFFFFF'} stroke={OL} strokeWidth={2} />)}
          <rect x={-400} y={180} width={2720} height={30} fill="#2E6FD6" opacity={0.6} />
          {Array.from({ length: 6 }, (_, i) => <Locker key={i} x={-260 + i * 120} col={cols[i % 4]} open={c.fx > 0.5 && i === 4} />)}
          {Array.from({ length: 6 }, (_, i) => <Locker key={`r${i}`} x={1460 + i * 120} col={cols[(i + 2) % 4]} />)}
          {/* bang tin */}
          <B x={540} y={240} width={840} height={400} rx={10} fill="#B07A4A" />
          <rect x={570} y={270} width={780} height={340} fill="#D9B07A" stroke={OL} strokeWidth={3} />
          <B x={640} y={300} width={640} height={200} rx={6} fill="#FF7AB6" transform="rotate(-2 960 400)" />
          {note.slice(0, 2).map((ln, i) => <text key={i} x={960} y={note.length > 1 ? 385 + i * 70 : 420} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={note.length > 1 ? 56 : 66} fill="#FFFFFF" stroke={OL} strokeWidth={2} transform="rotate(-2 960 400)">{ln.slice(0, 16)}</text>)}
          <B x={620} y={520} width={180} height={70} fill="#FFF3C4" transform="rotate(4 710 555)" />
          <B x={1120} y={515} width={190} height={75} fill="#BFE6FF" transform="rotate(-5 1215 552)" />
          {[700, 1220, 960].map((x) => <circle key={x} cx={x} cy={310} r={9} fill="#E8453C" stroke={OL} strokeWidth={2} />)}
          {/* san */}
          <rect x={-400} y={820} width={2720} height={500} fill={n ? '#3A4456' : '#D8D2C2'} />
          <path d="M -400 820 L 2320 820" stroke={OL} strokeWidth={W} />
          {Array.from({ length: 14 }, (_, i) => <path key={i} d={`M ${-400 + i * 200} 820 L ${-560 + i * 230} 1300`} stroke={OL} strokeWidth={2} opacity={0.12} />)}
          {c.fx > 0.5 ? [0, 1, 2].map((i) => { const k = (prog(c) * 1.4 + i * 0.25) % 1; return <rect key={i} x={260 + i * 60 + k * 200} y={500 + k * 360} width={60} height={44} fill="#FFFFFF" stroke={OL} strokeWidth={2} transform={`rotate(${k * 200 + i * 40} ${290 + i * 60 + k * 200} ${522 + k * 360})`} />; }) : null}
        </g>
      );
    },
    place: (u) => ({ x: lerp(380, 1540, u), y: 960 - 140 * PS, scale: PS }),
    seat: (u) => ({ x: lerp(380, 1540, u), y: 960 - 70 * PS - 4, scale: PS }),
    surface: flat(380, 1540, 960),
    floor: flat(380, 1540, 960),
    wide: () => [960, 560, 1],
    rim: 'popRim',
  },
  dodgeball: {
    label: 'Phòng thể dục - ném bóng (Pop)',
    hint: 'Phong the duc truong: san go, khan dai, ro bong ro, bang diem. board = chu tren bang diem (vd HOME 3 / AWAY 0). fx2 = so bong bay (0 khong co, 0.5 vai qua, 1 rat nhieu).',
    actors: true,
    back: (c) => {
      const n = night(c);
      const sc = (c.shot.board || 'HOME 0\nAWAY 0').toUpperCase().split('\n');
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill={n ? '#2A2D3E' : '#DCE6F2'} />
          {/* xa nha */}
          {Array.from({ length: 8 }, (_, i) => <path key={i} d={`M ${-400 + i * 400} -200 L ${-200 + i * 400} 60`} stroke="#8A8FA0" strokeWidth={8} />)}
          {[300, 960, 1620].map((x) => <g key={x}><path d={`M ${x} -200 L ${x} 20`} stroke="#3A3E52" strokeWidth={4} /><ellipse cx={x} cy={30} rx={70} ry={20} fill={n ? '#5A6478' : '#FFF7D6'} stroke={OL} strokeWidth={3} /></g>)}
          {/* bang diem */}
          <B x={760} y={100} width={400} height={170} rx={12} fill="#14182A" />
          {sc.slice(0, 2).map((ln, i) => <text key={i} x={960} y={sc.length > 1 ? 172 + i * 66 : 205} textAnchor="middle" fontFamily="Fragment Mono, monospace" fontSize={52} fill={i ? '#FFD23F' : '#FF6A3D'}>{ln.slice(0, 12)}</text>)}
          {/* khan dai */}
          {[0, 1, 2, 3].map((r) => <B key={r} x={-400} y={440 + r * 70} width={2720} height={70} fill={r % 2 ? '#B07A4A' : '#C98E58'} />)}
          {/* ro */}
          <B x={60} y={180} width={200} height={130} fill="#FFFFFF" />
          <rect x={120} y={230} width={80} height={60} fill="none" stroke="#E8453C" strokeWidth={5} />
          <ellipse cx={160} cy={318} rx={50} ry={10} fill="none" stroke="#FF6A3D" strokeWidth={7} />
          <path d="M 115 320 L 130 380 L 160 322 L 190 380 L 205 320" stroke="#FFFFFF" strokeWidth={3} fill="none" />
          <B x={1660} y={180} width={200} height={130} fill="#FFFFFF" />
          <rect x={1720} y={230} width={80} height={60} fill="none" stroke="#E8453C" strokeWidth={5} />
          <ellipse cx={1760} cy={318} rx={50} ry={10} fill="none" stroke="#FF6A3D" strokeWidth={7} />
          {/* san go */}
          <rect x={-400} y={720} width={2720} height={600} fill={n ? '#8A6A4A' : '#E6B678'} />
          <path d="M -400 720 L 2320 720" stroke={OL} strokeWidth={W} />
          {Array.from({ length: 10 }, (_, i) => <path key={i} d={`M -400 ${750 + i * 40} L 2320 ${750 + i * 40}`} stroke="#C98E58" strokeWidth={3} opacity={0.6} />)}
          <path d="M 960 720 L 960 1300" stroke="#FFFFFF" strokeWidth={10} />
          <ellipse cx={960} cy={1000} rx={300} ry={90} fill="none" stroke="#FFFFFF" strokeWidth={8} />
          <path d="M 300 720 L 160 1300 M 1620 720 L 1760 1300" stroke="#E8453C" strokeWidth={8} opacity={0.8} />
        </g>
      );
    },
    front: (c) => {
      const nb = Math.round(clamp(c.fx) * 6);
      if (!nb) return null;
      const p = c.t;
      return (
        <g>
          {Array.from({ length: nb }, (_, i) => {
            const k = ((p * (0.012 + i * 0.002) + i * 0.37) % 1);
            const dir = i % 2 ? -1 : 1;
            const x = dir > 0 ? lerp(-100, 2020, k) : lerp(2020, -100, k);
            const y = 380 + (i * 97) % 300 - Math.sin(k * Math.PI) * 120;
            return <Ball key={i} x={x} y={y} r={38} col={['#E8453C', '#7A5CE0', '#2E9E66'][i % 3]} rot={k * 720} />;
          })}
        </g>
      );
    },
    place: (u) => ({ x: lerp(360, 1560, u), y: 950 - 140 * PS, scale: PS }),
    seat: (u) => ({ x: lerp(360, 1560, u), y: 950 - 70 * PS - 4, scale: PS }),
    surface: flat(360, 1560, 950),
    floor: flat(360, 1560, 950),
    wide: () => [960, 560, 1],
    rim: 'popRim',
  },
  frontyard: {
    label: 'Sân trước nhà + đường phố (Pop)',
    hint: 'San co truoc nha, ben trai la hien + cua nha, loi xe (driveway) xam chay ra duong pho phia sau. spot < 0.7 dung tren co; spot 0.7-1 = buoc ra giua duong (nho dan, xa hon). fx2: 0.1-0.4 = bong do nay tren loi xe; 0.4-0.7 = bong lan ra duong; > 0.7 = xe hoi lao qua duong (nhanh, co vet gio). board = so nha (mac dinh 42).',
    actors: true,
    back: (c) => {
      const n = night(c);
      const num = c.shot.board || '42';
      return (
        <g>
          <Sky c={c} horizon={520} />
          {/* nha ben kia duong */}
          {[[1000, '#F2A65A'], [1500, '#8FB8D8'], [1950, '#B8E0A0']].map(([x, col]) => (
            <g key={x as number}>
              <B x={(x as number) - 170} y={330} width={340} height={230} fill={col as string} />
              <Pth d={`M ${(x as number) - 200} 340 L ${x} 220 L ${(x as number) + 200} 340 Z`} fill="#8A4A3A" />
              <B x={(x as number) - 40} y={440} width={80} height={120} fill="#6B4A2A" />
              <B x={(x as number) - 140} y={380} width={70} height={60} fill="#FFF3C4" />
            </g>
          ))}
          <rect x={-400} y={540} width={2720} height={40} fill={n ? '#2E5A3E' : '#6FBF6A'} />
          {/* via he + duong */}
          <rect x={-400} y={580} width={2720} height={34} fill="#C9CEDA" stroke={OL} strokeWidth={3} />
          <rect x={-400} y={614} width={2720} height={176} fill={n ? '#2A2D3E' : '#5A5F70'} />
          {Array.from({ length: 10 }, (_, i) => <rect key={i} x={-380 + i * 280} y={696} width={140} height={12} rx={4} fill="#FFD23F" />)}
          <rect x={-400} y={790} width={2720} height={26} fill="#C9CEDA" stroke={OL} strokeWidth={3} />
          {/* bai co */}
          <rect x={-400} y={816} width={2720} height={520} fill={n ? '#2E5A3E' : '#7CC67A'} />
          {Array.from({ length: 30 }, (_, i) => <path key={i} d={`M ${-380 + i * 90} ${900 + (i * 53) % 300} l 8 -18 l 8 18`} stroke={n ? '#244A32' : '#5AA65A'} strokeWidth={4} fill="none" />)}
          {/* loi xe tu duong xuong phai truoc */}
          <path d="M 1180 816 L 1460 816 L 1820 1320 L 1240 1320 Z" fill={n ? '#4A4E60' : '#B8BCC8'} stroke={OL} strokeWidth={W} />
          <path d="M 1320 816 L 1530 1320" stroke="#8A8FA0" strokeWidth={4} opacity={0.6} />
          {/* hien nha ben trai */}
          <B x={-300} y={360} width={420} height={460} fill="#FFF3C4" />
          <B x={-60} y={560} width={120} height={260} fill="#2E6FD6" />
          <circle cx={36} cy={700} r={8} fill="#FFD23F" stroke={OL} strokeWidth={2} />
          <B x={-80} y={520} width={160} height={30} rx={6} fill="#FFFFFF" />
          <text x={0} y={545} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={26} fill={OL}>{num}</text>
          <Pth d="M -340 370 L -60 220 L 220 370 Z" fill="#B0503A" />
          <B x={-140} y={810} width={300} height={30} fill="#C9CEDA" />
          <B x={-120} y={840} width={260} height={30} fill="#C9CEDA" />
          {/* hang rao + hop thu */}
          <B x={1080} y={720} width={20} height={100} fill="#6B4A2A" />
          <B x={1040} y={690} width={100} height={50} rx={18} fill="#2E6FD6" />
        </g>
      );
    },
    front: (c) => {
      const fx = c.fx;
      const p = prog(c);
      const els: React.ReactNode[] = [];
      if (fx > 0.1 && fx <= 0.4) {
        const k = (c.t * 0.04) % 1;
        els.push(<Ball key="b" x={1400 + Math.sin(c.t * 0.05) * 60} y={1000 - Math.abs(Math.sin(k * Math.PI * 2)) * 160} />);
      } else if (fx > 0.4 && fx <= 0.7) {
        const k = clamp(p * 1.2);
        els.push(<Ball key="b" x={lerp(1420, 1120, k)} y={lerp(980, 700, k) - Math.abs(Math.sin(k * Math.PI * 3)) * lerp(120, 30, k)} r={lerp(34, 24, k)} rot={k * 720} />);
      } else if (fx > 0.7) {
        const k = clamp((p - 0.05) / 0.75);
        const x = lerp(-700, 2600, k);
        const n = night(c);
        els.push(
          <g key="car">
            <Ball x={1250} y={735} r={24} />
            {[0, 1, 2].map((i) => <path key={i} d={`M ${x - 360 - i * 80} ${640 + i * 34} l -220 0`} stroke="#FFFFFF" strokeWidth={8} strokeLinecap="round" opacity={0.7 - i * 0.2} />)}
            <g transform={`translate(${x} 0)`}>
              <Pth d="M -300 760 L -300 680 Q -290 650 -250 640 L -150 640 L -90 570 L 120 570 L 200 640 L 290 655 Q 320 665 320 700 L 320 760 Z" fill="#E8453C" />
              <Pth d="M -70 585 L 105 585 L 165 640 L -125 640 Z" fill={n ? '#3A4A62' : '#BFE6FF'} />
              <path d="M 20 585 L 20 640" stroke={OL} strokeWidth={6} />
              {[-180, 180].map((wx) => <g key={wx}><circle cx={wx} cy={765} r={50} fill="#2A2D3E" stroke={OL} strokeWidth={W} /><circle cx={wx} cy={765} r={20} fill="#C9CEDA" /></g>)}
              <rect x={290} y={680} width={30} height={22} rx={6} fill="#FFE38A" stroke={OL} strokeWidth={3} />
              {n ? <path d="M 320 690 L 700 640 L 700 760 Z" fill="#FFE38A" opacity={0.35} /> : null}
            </g>
          </g>,
        );
      }
      return <g>{els}</g>;
    },
    place: (u) => (u <= 0.7
      ? { x: lerp(300, 1320, u / 0.7), y: 1000 - 140 * PS, scale: PS }
      : { x: lerp(1320, 1180, (u - 0.7) / 0.3), y: lerp(1000, 760, (u - 0.7) / 0.3) - 140 * PS * lerp(1, 0.75, (u - 0.7) / 0.3), scale: PS * lerp(1, 0.75, (u - 0.7) / 0.3) }),
    seat: (u) => ({ x: lerp(300, 1320, u), y: 1000 - 70 * PS - 4, scale: PS }),
    surface: flat(300, 1320, 1000),
    floor: flat(300, 1320, 1000),
    wide: () => [960, 560, 1],
    rim: 'popRimWarm',
  },
};

export default SCHOOL;
