// Bo boi canh: thu vien (o dien), rap phim, san khau bieu dien piano, phao dai goi trong phong khach (Pop/Ink).
import React from 'react';
import { clamp, lerp } from '../../engine';
import type { StageDef, Ctx, Place } from '../stages';
import { todOf } from './sets';

const PS = 1.3;
const OL = '#1B1530';
const W = 4;
const F = 'Bricolage Grotesque, sans-serif';
const B: React.FC<React.SVGProps<SVGRectElement>> = (p) => <rect stroke={OL} strokeWidth={W} strokeLinejoin="round" {...p} />;
const Pth: React.FC<React.SVGProps<SVGPathElement>> = (p) => <path stroke={OL} strokeWidth={W} strokeLinejoin="round" strokeLinecap="round" {...p} />;
const flat = (x0: number, x1: number, y: number, scale = 1) => (u: number): Place => ({ x: lerp(x0, x1, u), y, scale });
const night = (c: Ctx) => todOf(c) === 'night';

const Shelf: React.FC<{ x: number; y: number; w: number; n?: boolean }> = ({ x, y, w, n }) => {
  const cols = ['#E8453C', '#2E6FD6', '#F2C14E', '#2E9E66', '#7A5CE0', '#F2A65A'];
  return (
    <g>
      <B x={x} y={y} width={w} height={460} fill={n ? '#5A3E2A' : '#B07A4A'} />
      {[0, 1, 2, 3].map((r) => (
        <g key={r}>
          <rect x={x + 14} y={y + 20 + r * 110} width={w - 28} height={92} fill={n ? '#3A2A1E' : '#7A5034'} />
          {Array.from({ length: Math.floor((w - 40) / 26) }, (_, i) => (
            <rect key={i} x={x + 20 + i * 26} y={y + 30 + r * 110 + ((i * 7 + r * 3) % 3) * 8} width={20} height={82 - ((i * 7 + r * 3) % 3) * 8} fill={cols[(i + r * 2) % 6]} stroke={OL} strokeWidth={2} />
          ))}
        </g>
      ))}
    </g>
  );
};

const VENUE: Record<string, StageDef> = {
  library: {
    label: 'Thư viện trường - ổ điện (Pop)',
    hint: 'Thu vien truong: ke sach, cua so, ban hoc dai phia truoc (sit = ngoi ban), o dien tren tuong ben phai (x ~1500) co day sac. board = bien tren tuong (mac dinh LIBRARY). fx2 > 0.5 = day sac cam vao o dien keo xuong ban.',
    actors: true,
    back: (c) => {
      const n = night(c);
      const sign = (c.shot.board || 'LIBRARY').toUpperCase();
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill={n ? '#2E2A40' : '#EDE3CF'} />
          <Shelf x={-300} y={260} w={420} n={n} />
          <Shelf x={150} y={260} w={420} n={n} />
          <Shelf x={1780} y={260} w={420} n={n} />
          {/* cua so */}
          <B x={660} y={120} width={600} height={340} fill={n ? '#1A2440' : '#BFE6FF'} />
          <path d="M 960 120 L 960 460 M 660 290 L 1260 290" stroke={OL} strokeWidth={6} />
          <B x={760} y={30} width={400} height={70} rx={10} fill="#2E6FD6" />
          <text x={960} y={80} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={44} fill="#FFFFFF">{sign.slice(0, 14)}</text>
          {/* o dien */}
          <B x={1470} y={560} width={70} height={100} rx={10} fill="#FFFFFF" />
          {[590, 630].map((y) => <g key={y}><rect x={1490} y={y - 8} width={8} height={18} rx={2} fill={OL} /><rect x={1512} y={y - 8} width={8} height={18} rx={2} fill={OL} /></g>)}
          {c.fx > 0.5 ? <Pth d="M 1505 640 C 1505 760 1300 760 1260 860" fill="none" strokeWidth={8} stroke="#F4F4F4" /> : null}
          {/* san */}
          <rect x={-400} y={720} width={2720} height={600} fill={n ? '#3A3048' : '#C9A87A'} />
          <path d="M -400 720 L 2320 720" stroke={OL} strokeWidth={W} />
          {Array.from({ length: 10 }, (_, i) => <path key={i} d={`M -400 ${760 + i * 50} L 2320 ${760 + i * 50}`} stroke={OL} strokeWidth={2} opacity={0.1} />)}
          {/* ghe sau */}
          {[300, 1660].map((x) => <B key={x} x={x - 60} y={760} width={120} height={20} rx={6} fill="#2E9E66" />)}
        </g>
      );
    },
    front: () => (
      <g>
        <B x={-200} y={1000} width={2320} height={40} rx={8} fill="#B07A4A" />
        <rect x={-200} y={1040} width={2320} height={16} fill="#7A5034" />
        {[160, 960, 1760].map((x) => <rect key={x} x={x - 10} y={1056} width={20} height={80} fill="#7A5034" stroke={OL} strokeWidth={2} />)}
        <B x={300} y={960} width={110} height={40} fill="#E8453C" transform="rotate(-6 355 980)" />
        <B x={1420} y={966} width={90} height={34} fill="#F2C14E" />
      </g>
    ),
    place: (u) => ({ x: lerp(380, 1540, u), y: 950 - 140 * PS, scale: PS }),
    seat: (u) => ({ x: lerp(380, 1540, u), y: 1000 - 70 * PS - 4, scale: PS }),
    surface: flat(300, 1620, 1000),
    floor: flat(380, 1540, 950),
    wide: () => [960, 560, 1],
    rim: 'popRimWarm',
    mediumUp: 110,
  },
  cinema: {
    label: 'Rạp chiếu phim (Pop)',
    hint: 'Rap phim toi: man hinh lon phia sau, hang ghe do phia truoc (sit = ngoi ghe, ai ngoi cung bi lung ghe che nua duoi). board = chu tren man hinh (vd PLEASE TURN OFF/YOUR PHONE, "/" xuong dong; trong = canh phim kinh di). fx2 > 0.5 = den pin cua nguoi soat ve roi vao giua; > 0.8 = man hinh loe trang (jump scare).',
    actors: true,
    back: (c) => {
      const txt = (c.shot.board || '').toUpperCase().split('\n').filter(Boolean);
      const flash = c.fx > 0.8;
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill="#14101E" />
          <rect x={-400} y={-200} width={300} height={1500} fill="#5A1A24" />
          <rect x={2020} y={-200} width={300} height={1500} fill="#5A1A24" />
          <B x={180} y={40} width={1560} height={560} rx={8} fill={flash ? '#FFFFFF' : txt.length ? '#1E2A44' : '#24324A'} />
          {txt.length ? txt.slice(0, 2).map((ln, i) => (
            <text key={i} x={960} y={txt.length > 1 ? 290 + i * 100 : 350} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={84} fill="#FFFFFF">{ln.slice(0, 20)}</text>
          )) : (
            !flash ? (
              <g>
                <rect x={180} y={400} width={1560} height={200} fill="#151C2C" />
                <Pth d="M 620 400 L 620 200 L 760 120 L 900 200 L 900 400 Z" fill="#0E1320" />
                <rect x={720} y={220} width={70} height={90} fill="#FFE38A" opacity={0.7} />
                <circle cx={1380} cy={160} r={60} fill="#E6E9F2" opacity={0.6} />
                <Pth d="M 1150 400 q 30 -140 60 0" fill="#0E1320" />
              </g>
            ) : null
          )}
          <path d="M 960 -200 L 180 600 M 960 -200 L 1740 600" stroke="#FFFFFF" strokeWidth={2} opacity={0.05} />
          <rect x={-400} y={640} width={2720} height={700} fill="#1E1626" />
          {[0, 1].map((r) => (
            <g key={r}>
              {Array.from({ length: 14 }, (_, i) => <B key={i} x={-260 + i * 170} y={660 + r * 70} width={150} height={70} rx={20} fill="#8A1F2E" />)}
            </g>
          ))}
          {flash ? <rect x={-400} y={-200} width={2720} height={1500} fill="#FFFFFF" opacity={0.25} /> : null}
        </g>
      );
    },
    front: (c) => (
      <g>
        {Array.from({ length: 12 }, (_, i) => <B key={i} x={-260 + i * 200} y={1000} width={180} height={200} rx={30} fill="#A3263A" />)}
        <rect x={-400} y={1130} width={2720} height={200} fill="#14101E" />
        {c.fx > 0.5 ? <path d={`M 1900 380 L ${980 + Math.sin(c.t * 0.08) * 60} 760 L ${1240 + Math.sin(c.t * 0.08) * 60} 860 Z`} fill="#FFF3B0" opacity={0.35} /> : null}
      </g>
    ),
    place: (u) => ({ x: lerp(380, 1540, u), y: 980 - 140 * PS, scale: PS }),
    seat: (u) => ({ x: lerp(380, 1540, u), y: 1010 - 70 * PS - 4, scale: PS }),
    surface: flat(300, 1620, 1010),
    floor: flat(380, 1540, 980),
    wide: () => [960, 560, 1],
    rim: 'popRim',
  },
  recital: {
    label: 'Sân khấu biểu diễn piano (Pop)',
    hint: 'San khau bieu dien: rem do, den roi, dan piano o giua (sit = ngoi ghe dan khi spot ~0.5), hang ghe khan gia toi phia truoc. board = bang ten chuong trinh (mac dinh SPRING RECITAL). fx2: 0 den sang ca san khau; > 0.4 chi con den roi giua; > 0.8 = not nhac bay.',
    actors: true,
    back: (c) => {
      const t = (c.shot.board || 'SPRING RECITAL').toUpperCase();
      const dark = c.fx > 0.4;
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill="#1A1424" />
          <B x={-400} y={-200} width={2720} height={160} fill="#9A1E2E" />
          {Array.from({ length: 16 }, (_, i) => <path key={i} d={`M ${-380 + i * 175} -40 q 40 50 80 0`} stroke="#6E1420" strokeWidth={8} fill="none" />)}
          <rect x={-400} y={-40} width={380} height={1300} fill="#9A1E2E" />
          <rect x={1940} y={-40} width={380} height={1300} fill="#9A1E2E" />
          {[-300, -200, -100, 2020, 2120, 2220].map((x) => <path key={x} d={`M ${x} -40 L ${x} 1260`} stroke="#6E1420" strokeWidth={6} />)}
          <rect x={-20} y={-40} width={1960} height={760} fill={dark ? '#1E1830' : '#3A2E50'} />
          <B x={660} y={30} width={600} height={80} rx={12} fill="#F2C14E" />
          <text x={960} y={86} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={44} fill={OL}>{t.slice(0, 18)}</text>
          {/* san go */}
          <rect x={-20} y={720} width={1960} height={140} fill={dark ? '#5A3E2A' : '#B07A4A'} stroke={OL} strokeWidth={W} />
          {/* den roi */}
          <path d="M 960 -40 L 640 800 L 1280 800 Z" fill="#FFF3B0" opacity={dark ? 0.28 : 0.1} />
          <ellipse cx={960} cy={790} rx={330} ry={40} fill="#FFF3B0" opacity={dark ? 0.4 : 0.15} />
          {/* piano */}
          <g>
            <Pth d="M 1040 560 L 1260 560 Q 1330 560 1330 640 L 1330 700 L 1040 700 Z" fill="#14101E" />
            <B x={1020} y={640} width={60} height={20} fill="#FFFFFF" />
            <Pth d="M 1060 560 L 1220 420" stroke={OL} strokeWidth={6} />
            <Pth d="M 1080 560 L 1300 470 L 1320 560 Z" fill="#14101E" />
            {[1070, 1290].map((x) => <rect key={x} x={x - 8} y={700} width={16} height={60} fill="#14101E" stroke={OL} strokeWidth={2} />)}
            <B x={880} y={700} width={110} height={24} rx={6} fill="#14101E" />
            {[900, 970].map((x) => <rect key={x} x={x - 6} y={724} width={12} height={36} fill="#14101E" />)}
          </g>
          {c.fx > 0.8 ? [0, 1, 2, 3].map((i) => { const k = (c.t * 0.015 + i * 0.25) % 1; return <text key={i} x={1100 + i * 50 - k * 200} y={520 - k * 380} fontSize={70} fill="#FFD23F" opacity={1 - k} fontFamily={F}>{i % 2 ? '♪' : '♫'}</text>; }) : null}
        </g>
      );
    },
    front: () => (
      <g>
        <rect x={-400} y={860} width={2720} height={460} fill="#120E1A" />
        {Array.from({ length: 12 }, (_, i) => <B key={i} x={-260 + i * 200} y={1040} width={180} height={180} rx={30} fill="#3A2440" />)}
      </g>
    ),
    place: (u) => ({ x: lerp(300, 1620, u), y: 790 - 140 * PS * 0.85, scale: PS * 0.85 }),
    seat: (u) => ({ x: lerp(300, 1620, u), y: 724 - 70 * PS * 0.85 - 4, scale: PS * 0.85 }),
    surface: flat(300, 1620, 724),
    floor: flat(300, 1620, 790),
    wide: () => [960, 520, 1],
    rim: 'popRimWarm',
  },
  pillowfort: {
    label: 'Pháo đài gối trong phòng khách (Pop)',
    hint: 'Phao dai goi trong phong khach: chan trum thanh mai, goi xep thanh tuong, day den nho, bien "NO PHONES" (board doi chu bien). sit = ngoi trong phao dai. fx2 > 0.5 = ban dem trong phao dai, chi con den nho + den pin.',
    actors: true,
    back: (c) => {
      const n = night(c) || c.fx > 0.5;
      const sign = (c.shot.board || 'NO PHONES').toUpperCase();
      const cols = ['#F2A65A', '#7CC67A', '#FF7AB6', '#8FB8D8', '#F2C14E'];
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill={n ? '#2A2440' : '#F6E7C8'} />
          <B x={1500} y={160} width={300} height={260} fill={n ? '#1A2440' : '#BFE6FF'} />
          <path d="M 1650 160 L 1650 420" stroke={OL} strokeWidth={6} />
          <rect x={-400} y={780} width={2720} height={540} fill={n ? '#3A3050' : '#C98E58'} />
          <path d="M -400 780 L 2320 780" stroke={OL} strokeWidth={W} />
          {/* chan lam mai */}
          <Pth d="M 160 820 L 340 200 Q 960 80 1580 200 L 1760 820 Z" fill={n ? '#4A3E70' : '#7A5CE0'} />
          <Pth d="M 340 200 Q 960 330 1580 200" fill="none" stroke="#5A42B0" strokeWidth={6} />
          {[420, 700, 960, 1220, 1500].map((x, i) => <circle key={x} cx={x} cy={250 + (i % 2) * 40} r={12} fill={['#FFD23F', '#FF7AB6', '#7CC67A', '#8FB8D8', '#FFD23F'][i]} stroke={OL} strokeWidth={2} />)}
          <path d="M 400 250 Q 680 320 960 280 Q 1240 320 1520 250" stroke={OL} strokeWidth={2} fill="none" />
          {/* trong phao dai */}
          <Pth d="M 300 820 L 440 300 Q 960 380 1480 300 L 1620 820 Z" fill={n ? '#2A2240' : '#C9B6F2'} />
          {/* bien */}
          <g transform="rotate(-4 960 420)">
            <B x={780} y={370} width={360} height={100} rx={8} fill="#FFFFFF" />
            <text x={960} y={438} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={48} fill="#E8453C">{sign.slice(0, 12)}</text>
          </g>
          {/* goi */}
          {[0, 1, 2, 3, 4, 5, 6].map((i) => <B key={i} x={60 + i * 270} y={720 + (i % 2) * 20} width={260} height={120} rx={50} fill={cols[i % 5]} />)}
          {n ? <circle cx={960} cy={560} r={420} fill="#FFE38A" opacity={0.12} /> : null}
        </g>
      );
    },
    front: () => (
      <g>
        {[0, 1, 2, 3, 4, 5].map((i) => <B key={i} x={-200 + i * 400} y={1050} width={380} height={160} rx={70} fill={['#FF7AB6', '#F2C14E', '#8FB8D8', '#7CC67A', '#F2A65A', '#FF7AB6'][i]} />)}
      </g>
    ),
    place: (u) => ({ x: lerp(560, 1360, u), y: 1000 - 140 * PS, scale: PS }),
    seat: (u) => ({ x: lerp(560, 1360, u), y: 1000 - 70 * PS - 4, scale: PS }),
    surface: flat(560, 1360, 1000),
    floor: flat(560, 1360, 1000),
    wide: () => [960, 560, 1],
    rim: 'popRimWarm',
  },
};

export default VENUE;
