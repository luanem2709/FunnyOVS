// 10 boi canh theo cac phong cach pho bien cua kenh nguoi que (ve lai bang vector, khong dung anh cua ai):
// jail (long sat tren nen den), checkpath (duong kinh co dau tich), cave (hang tien su), cafe (quan ca phe via he phac chi),
// tatami (phong Nhat), paper (giay kem ve tay), noirstreet (pho dem anh ho phach), crt (man hinh camera an ninh),
// chalkboard (bang phan tren ban dem), oldtown (pho chau Au co thap sat).
import React from 'react';
import { clamp, lerp } from '../../engine';
import type { StageDef, Ctx, Place } from '../stages';
import { todOf } from './sets';

const PS = 1.3;
const OL = '#1B1530';
const W = 4;
const F = 'Bricolage Grotesque, sans-serif';
const HAND = 'Kalam, cursive';
const B: React.FC<React.SVGProps<SVGRectElement>> = (p) => <rect stroke={OL} strokeWidth={W} strokeLinejoin="round" {...p} />;
const P: React.FC<React.SVGProps<SVGPathElement>> = (p) => <path stroke={OL} strokeWidth={W} strokeLinejoin="round" strokeLinecap="round" {...p} />;
const flat = (x0: number, x1: number, y: number, scale = 1) => (u: number): Place => ({ x: lerp(x0, x1, u), y, scale });
const night = (c: Ctx) => todOf(c) === 'night';
const lines = (s: string, n = 2) => s.toUpperCase().split('\n').filter(Boolean).slice(0, n);

const STD = (y: number, x0 = 380, x1 = 1540) => ({
  place: (u: number) => ({ x: lerp(x0, x1, u), y: y - 140 * PS, scale: PS }),
  seat: (u: number) => ({ x: lerp(x0, x1, u), y: y - 70 * PS - 4, scale: PS }),
  surface: flat(x0, x1, y),
  floor: flat(x0, x1, y),
  wide: () => [960, 560, 1] as [number, number, number],
});

const STYLE: Record<string, StageDef> = {
  jail: {
    label: 'Lồng sắt đỏ trên nền đen (Classic)',
    hint: 'Nen den tuyen, long sat do lon o giua, nhan vat dung TRONG long (spot 0.5). fx2 > 0.5 = cua long mo. board = bien treo tren long (trong = khong co).',
    actors: true,
    back: (c) => (
      <g>
        <rect x={-400} y={-200} width={2720} height={1500} fill="#050507" />
        <ellipse cx={960} cy={980} rx={520} ry={60} fill="#1A0A0C" />
        <B x={600} y={150} width={720} height={40} rx={8} fill="#B3242A" />
        <path d="M 600 190 L 520 260 M 1320 190 L 1400 260" stroke="#7A1418" strokeWidth={14} />
        <B x={520} y={250} width={880} height={40} rx={8} fill="#C0282D" />
        {c.shot.board ? (
          <g>
            <B x={760} y={70} width={400} height={70} rx={8} fill="#F4EBD6" />
            <text x={960} y={120} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={40} fill="#C0282D">{c.shot.board.toUpperCase().slice(0, 16)}</text>
          </g>
        ) : null}
        <rect x={500} y={960} width={920} height={40} rx={8} fill="#8E1B1F" stroke={OL} strokeWidth={W} />
        {Array.from({ length: 5 }, (_, i) => <rect key={i} x={540 + i * 42} y={290} width={14} height={670} fill="#9A1E24" stroke="#5A0E12" strokeWidth={3} />)}
        {Array.from({ length: 5 }, (_, i) => <rect key={`r${i}`} x={1206 + i * 42} y={290} width={14} height={670} fill="#9A1E24" stroke="#5A0E12" strokeWidth={3} />)}
      </g>
    ),
    front: (c) => {
      const open = c.fx > 0.5;
      return (
        <g>
          <g transform={open ? 'translate(780 0) scale(0.25 1) translate(-780 0)' : undefined}>
            {Array.from({ length: 9 }, (_, i) => <rect key={i} x={760 + i * 48} y={290} width={16} height={670} fill="#D9353A" stroke={OL} strokeWidth={3} />)}
            <rect x={750} y={580} width={420} height={22} fill="#C0282D" stroke={OL} strokeWidth={3} />
            {!open ? <g><B x={920} y={540} width={80} height={100} rx={10} fill="#8E1B1F" /><circle cx={960} cy={580} r={12} fill="#2A0A0C" /><rect x={954} y={584} width={12} height={26} fill="#2A0A0C" /></g> : null}
          </g>
          {Array.from({ length: 2 }, (_, i) => <rect key={i} x={520 + i * 860} y={290} width={20} height={670} fill="#C0282D" stroke={OL} strokeWidth={3} />)}
        </g>
      );
    },
    ...STD(960, 820, 1100),
    rim: 'popRim',
  },
  checkpath: {
    label: 'Đường kính có dấu tích (Modern Pop)',
    hint: 'Phong trang 3D sang, nhan vat di tren mot duong kinh xanh co cac o dau tich; fx2 0-1 = so o da sang xanh (tien do). board = chu tren bang lo lung (vd STEP 3).',
    actors: true,
    back: (c) => {
      const lit = Math.round(clamp(c.fx) * 6);
      const t = lines(c.shot.board || '', 1)[0];
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill="#EEF1F5" />
          {[0, 1, 2, 3].map((i) => <rect key={i} x={-300 + i * 640} y={60 + (i % 2) * 60} width={300} height={420} rx={10} fill="#FFFFFF" opacity={0.7} />)}
          <path d="M -400 720 L 2320 720" stroke="#D6DCE6" strokeWidth={3} />
          <rect x={-400} y={720} width={2720} height={600} fill="#E2E7EF" />
          {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M ${-400 + i * 240} 720 L ${-900 + i * 340} 1300`} stroke="#D2D8E2" strokeWidth={2} />)}
          <path d="M 120 900 L 1800 900 L 1900 1010 L 20 1010 Z" fill="#9FD3EA" opacity={0.75} stroke="#6FB2D0" strokeWidth={4} />
          {Array.from({ length: 6 }, (_, i) => {
            const x = 230 + i * 290; const on = i < lit;
            return (
              <g key={i}>
                <path d={`M ${x - 120} 915 L ${x + 120} 915 L ${x + 132} 995 L ${x - 132} 995 Z`} fill={on ? '#C8F0D4' : '#BFE3F2'} stroke="#6FB2D0" strokeWidth={3} />
                <path d={`M ${x - 34} 954 l 22 22 l 46 -44`} stroke={on ? '#2E9E66' : '#8FB8C8'} strokeWidth={12} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            );
          })}
          {t ? <g><rect x={760} y={130} width={400} height={100} rx={20} fill="#FFFFFF" stroke="#C9D3E0" strokeWidth={4} /><text x={960} y={198} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={54} fill="#2E9E66">{t.slice(0, 12)}</text></g> : null}
        </g>
      );
    },
    ...STD(935, 230, 1680),
    rim: 'popRim',
  },
  cave: {
    label: 'Hang đá tiền sử (Prehistoric)',
    hint: 'Hang da mau dat am, cua hang sang ben phai, lua trai ben trai, o rom + xuong. sit = ngoi tren o rom. fx2 = do lon ngon lua (0 tat, 1 bung chay). board = chu ve tren vach da (vd hinh ve tho so).',
    actors: true,
    back: (c) => {
      const fire = clamp(c.fx || 0.6);
      const f = Math.sin(c.t * 0.5) * 8;
      const draw = lines(c.shot.board || '', 1)[0];
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill="#6B4528" />
          <P d="M -400 -200 L 2320 -200 L 2320 120 Q 1900 60 1700 160 Q 1400 40 1100 140 Q 800 30 500 150 Q 200 60 -400 140 Z" fill="#4A2E1A" />
          {[[200, 300, 160], [700, 220, 110], [1250, 280, 140], [1750, 260, 120]].map(([x, y, r], i) => <ellipse key={i} cx={x} cy={y} rx={r} ry={r * 0.6} fill="#7A5232" opacity={0.6} />)}
          <P d="M 1500 760 Q 1500 380 1720 340 Q 1960 320 2000 520 L 2000 760 Z" fill="#E8C890" />
          <P d="M 1560 760 Q 1580 460 1730 430 Q 1900 420 1930 560 L 1930 760 Z" fill="#F6E2B0" />
          {draw ? <text x={700} y={420} textAnchor="middle" fontFamily={HAND} fontSize={70} fill="#E8C890" opacity={0.85}>{draw.slice(0, 14)}</text> : null}
          <g stroke="#E8C890" strokeWidth={5} fill="none" opacity={0.7}><circle cx={420} cy={360} r={18} /><path d="M 420 378 L 420 440 M 390 400 L 450 400 M 420 440 L 395 480 M 420 440 L 445 480" /><path d="M 520 470 Q 560 400 620 470 L 520 470 Z" /></g>
          <rect x={-400} y={760} width={2720} height={560} fill="#8A5A34" />
          <path d="M -400 760 Q 960 720 2320 760" stroke={OL} strokeWidth={W} fill="none" />
          <P d="M 900 860 L 1300 860 L 1330 900 L 870 900 Z" fill="#D9B35A" />
          {Array.from({ length: 14 }, (_, i) => <path key={i} d={`M ${880 + i * 32} 870 l 14 -24`} stroke="#B08A3A" strokeWidth={4} />)}
          <g transform="translate(1180 950) rotate(-14)"><rect x={-50} y={-10} width={100} height={18} rx={9} fill="#F4EBD6" stroke={OL} strokeWidth={3} /><circle cx={-52} cy={-6} r={12} fill="#F4EBD6" stroke={OL} strokeWidth={3} /><circle cx={52} cy={-2} r={12} fill="#F4EBD6" stroke={OL} strokeWidth={3} /></g>
          {fire > 0.05 ? (
            <g transform="translate(330 900)">
              <circle cx={0} cy={-120} r={260 * fire} fill="#FF9A3A" opacity={0.18} />
              {[-1, 1].map((s) => <rect key={s} x={-80} y={-20} width={160} height={22} rx={11} fill="#5A3A2A" stroke={OL} strokeWidth={3} transform={`rotate(${s * 16})`} />)}
              <P d={`M -60 -16 Q -70 ${-120 * fire - f} 0 ${-200 * fire + f} Q 70 ${-120 * fire + f} 60 -16 Z`} fill="#FF7A1A" />
              <path d={`M -30 -20 Q -34 ${-80 * fire} 0 ${-130 * fire - f} Q 34 ${-80 * fire} 30 -20 Z`} fill="#FFD23F" />
            </g>
          ) : null}
        </g>
      );
    },
    ...STD(940),
    seat: (u) => ({ x: lerp(950, 1250, u), y: 860 - 70 * PS - 4, scale: PS }),
    rim: 'popRimWarm',
  },
  cafe: {
    label: 'Quán cà phê vỉa hè - phác chì (Cozy)',
    hint: 'Pho chau Au mau nhat kieu phac chi + mau nuoc: ban tron, ghe sat, cot den, cay xanh, cua kinh quan. sit = ngoi ghe canh ban (spot < 0.5 ben trai ban, > 0.5 ben phai). board = bien ten quan (mac dinh CAFE).',
    actors: true,
    back: (c) => {
      const n = night(c);
      const name = (c.shot.board || 'CAFE').toUpperCase().slice(0, 12);
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill={n ? '#3A3E52' : '#EDEAE0'} />
          {[[-300, '#E4DCCB'], [300, '#DCD6C8'], [900, '#E8E0CC'], [1500, '#DED8CA']].map(([x, col], i) => (
            <g key={i} opacity={0.9}>
              <rect x={x as number} y={-40} width={560} height={780} fill={n ? '#4A4E62' : (col as string)} stroke="#9A968A" strokeWidth={3} />
              {[0, 1, 2].map((r) => [0, 1, 2].map((k) => <rect key={`${r}${k}`} x={(x as number) + 50 + k * 170} y={20 + r * 170} width={110} height={120} fill={n ? '#FFE38A' : '#C9D3D0'} opacity={n ? 0.5 : 0.8} stroke="#8A867A" strokeWidth={2} />))}
            </g>
          ))}
          <rect x={300} y={460} width={760} height={280} fill={n ? '#2A2D3E' : '#9FB0AA'} stroke="#6A6A60" strokeWidth={3} />
          <path d="M 280 440 L 1080 440 L 1040 380 L 320 380 Z" fill={n ? '#7A3A3A' : '#B86A5A'} stroke="#6A3A30" strokeWidth={3} />
          {Array.from({ length: 8 }, (_, i) => <path key={i} d={`M ${330 + i * 92} 440 l 46 0 l 0 30 q -23 18 -46 0 Z`} fill={i % 2 ? '#F4EBD6' : '#B86A5A'} stroke="#6A3A30" strokeWidth={2} />)}
          <text x={680} y={428} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={46} fill="#F4EBD6">{name}</text>
          <g stroke="#3A3E52" strokeWidth={6} fill="none"><path d="M 1500 740 L 1500 200" /><path d="M 1470 200 L 1530 200 L 1520 150 L 1480 150 Z" fill={n ? '#FFE38A' : '#D9D2BE'} /></g>
          {[1700, 1880].map((x) => <g key={x}><rect x={x - 10} y={480} width={20} height={260} fill="#8A7A60" /><circle cx={x} cy={420} r={110} fill={n ? '#4A6A4A' : '#A8C49A'} opacity={0.85} /><circle cx={x - 60} cy={470} r={70} fill={n ? '#3A5A3A' : '#93B585'} opacity={0.8} /></g>)}
          <rect x={-400} y={740} width={2720} height={580} fill={n ? '#4A4E5A' : '#D8D2C2'} />
          {Array.from({ length: 16 }, (_, i) => <path key={i} d={`M ${-400 + i * 180} 740 L ${-640 + i * 220} 1300`} stroke="#B8B2A2" strokeWidth={2} />)}
          {[820, 900, 980, 1060, 1140].map((y, i) => <path key={i} d={`M -400 ${y} L 2320 ${y}`} stroke="#C4BEAE" strokeWidth={2} />)}
          {/* ban + ghe */}
          <g>
            <path d="M 960 900 L 960 1040 M 900 1040 L 1020 1040" stroke="#3A4A48" strokeWidth={8} />
            <ellipse cx={960} cy={900} rx={190} ry={30} fill="#9FC4BC" stroke="#3A4A48" strokeWidth={4} />
            {[680, 1240].map((x) => <g key={x} stroke="#3A4A48" strokeWidth={6} fill="none"><path d={`M ${x - 60} 930 L ${x + 60} 930 M ${x - 60} 930 L ${x - 70} 1040 M ${x + 60} 930 L ${x + 70} 1040`} /><path d={`M ${x + (x < 960 ? -60 : 60)} 930 L ${x + (x < 960 ? -70 : 70)} 790`} /></g>)}
          </g>
        </g>
      );
    },
    ...STD(990, 560, 1360),
    seat: (u) => ({ x: u < 0.5 ? 690 : 1230, y: 930 - 70 * PS - 4, scale: PS }),
    surface: flat(800, 1120, 900),
    rim: 'popRimWarm',
  },
  tatami: {
    label: 'Phòng Nhật - chiếu tatami (Historical)',
    hint: 'Phong kieu Nhat: cua giay shoji, chieu tatami, ban thap o giua (sit = ngoi bet sau ban). board = chu thu phap tren cuon tranh treo tuong (mac dinh 和). fx2 > 0.5 = hoang hon cam qua cua giay.',
    actors: true,
    back: (c) => {
      const warm = c.fx > 0.5 || todOf(c) === 'sunset';
      const n = night(c);
      const scroll = (c.shot.board || '和').slice(0, 4);
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill="#5A3E28" />
          <rect x={-400} y={40} width={2720} height={40} fill="#3A2818" />
          {Array.from({ length: 6 }, (_, i) => {
            const x = -300 + i * 380;
            return (
              <g key={i}>
                <rect x={x} y={80} width={340} height={640} fill={n ? '#4A4A5A' : warm ? '#F2C88A' : '#EFE6D0'} stroke="#3A2818" strokeWidth={10} />
                {[1, 2].map((k) => <path key={k} d={`M ${x + k * 113} 80 L ${x + k * 113} 720`} stroke="#5A3E28" strokeWidth={5} />)}
                {[1, 2, 3, 4].map((k) => <path key={k} d={`M ${x} ${80 + k * 128} L ${x + 340} ${80 + k * 128}`} stroke="#5A3E28" strokeWidth={5} />)}
              </g>
            );
          })}
          <g transform="translate(960 0)">
            <rect x={-120} y={110} width={240} height={420} fill="#F4EBD6" stroke="#3A2818" strokeWidth={6} />
            <rect x={-136} y={96} width={272} height={20} rx={8} fill="#6B4A2A" />
            <text x={0} y={360} textAnchor="middle" fontFamily="serif" fontSize={150} fill="#1B1530">{scroll}</text>
          </g>
          <rect x={-400} y={720} width={2720} height={600} fill="#C9B886" />
          {Array.from({ length: 7 }, (_, i) => <path key={i} d={`M ${-400 + i * 460} 720 L ${-700 + i * 540} 1300`} stroke="#4A6A3A" strokeWidth={8} />)}
          <path d="M -400 960 L 2320 960" stroke="#4A6A3A" strokeWidth={8} />
        </g>
      );
    },
    front: () => (
      <g>
        <P d="M 680 920 L 1240 920 L 1260 950 L 660 950 Z" fill="#6B4A2A" />
        <rect x={690} y={950} width={30} height={60} fill="#4A3020" />
        <rect x={1200} y={950} width={30} height={60} fill="#4A3020" />
        <rect x={880} y={896} width={160} height={24} rx={4} fill="#3A2818" />
      </g>
    ),
    ...STD(1000),
    seat: (u) => ({ x: lerp(760, 1160, u), y: 960 - 70 * PS - 4, scale: PS }),
    surface: flat(700, 1220, 920),
    rim: 'popRimWarm',
  },
  paper: {
    label: 'Giấy kem vẽ tay (Hand-drawn / Explainer)',
    hint: 'Nen giay kem co van, chu viet tay lon o goc trai tren (board, "/" xuong dong, dong 2 to do), net but chi nguech ngoac. Hop cho doan giai thich/su that co nhan vat. fx2 > 0.5 = mui ten ve tay chi tu trai sang phai.',
    actors: true,
    back: (c) => {
      const t = lines(c.shot.board || '', 2);
      const k = clamp(c.k * 1.5);
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill="#F1EADB" />
          {Array.from({ length: 40 }, (_, i) => <circle key={i} cx={(i * 397) % 2400 - 300} cy={(i * 211) % 1300 - 100} r={2 + (i % 3)} fill="#D9CFBA" opacity={0.6} />)}
          {t.map((ln, i) => <text key={i} x={140} y={210 + i * 110} fontFamily={HAND} fontWeight={700} fontSize={i ? 96 : 104} fill={i ? '#C0282D' : '#2A2238'}>{ln.slice(0, 16)}</text>)}
          {t.length ? <path d={`M 140 ${230 + (t.length - 1) * 110} q 200 16 420 -4`} stroke="#C0282D" strokeWidth={8} fill="none" strokeLinecap="round" /> : null}
          {c.fx > 0.5 ? <path d={`M 700 640 Q 960 ${600} ${700 + 520 * k} 640`} stroke="#2A2238" strokeWidth={7} fill="none" strokeLinecap="round" strokeDasharray="1 0" /> : null}
          {c.fx > 0.5 && k > 0.95 ? <path d="M 1190 610 L 1224 642 L 1186 668" stroke="#2A2238" strokeWidth={7} fill="none" strokeLinecap="round" /> : null}
          <path d="M -400 990 Q 960 975 2320 992" stroke="#8A7E6A" strokeWidth={4} fill="none" />
        </g>
      );
    },
    ...STD(985),
    rim: 'popRim',
  },
  noirstreet: {
    label: 'Phố đêm ánh hổ phách (Amber Noir)',
    hint: 'Pho dem toi tim, cua kinh tiem sang cam ben phai (ben trong co xe do), toa nha xa ben trai, den duong. Hop bo Ink. board = chu tren bien tiem (mac dinh OPEN). fx2 > 0.5 = mua.',
    actors: true,
    back: (c) => {
      const sign = (c.shot.board || 'OPEN').toUpperCase().slice(0, 10);
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill="#2A1E32" />
          <rect x={-400} y={-200} width={2720} height={500} fill="#4A2E3A" />
          {[[-300, 120, 300], [60, 40, 260], [380, 160, 220]].map(([x, y, w], i) => (
            <g key={i}><rect x={x} y={y} width={w} height={760 - y} fill="#3A2A40" stroke="#1A1220" strokeWidth={4} />
              {Array.from({ length: 12 }, (_, k) => <rect key={k} x={x + 30 + (k % 3) * (w / 3.4)} y={y + 40 + Math.floor(k / 3) * 120} width={40} height={60} fill={(k * 7 + i) % 4 === 0 ? '#FFB45A' : '#4A3A50'} opacity={0.85} />)}
            </g>
          ))}
          <rect x={980} y={120} width={1400} height={640} fill="#3A2630" stroke="#1A1220" strokeWidth={6} />
          <rect x={1060} y={300} width={760} height={420} fill="#FFB45A" stroke="#1A1220" strokeWidth={8} />
          <rect x={1060} y={300} width={760} height={420} fill="url(#noirGlow)" />
          <defs><radialGradient id="noirGlow" cx="0.5" cy="0.5" r="0.7"><stop offset="0" stopColor="#FFE0A0" /><stop offset="1" stopColor="#E07A2A" /></radialGradient></defs>
          <g transform="translate(1440 650)">
            <P d="M -230 0 L -230 -60 Q -220 -90 -170 -96 L -80 -96 L -30 -150 L 110 -150 L 170 -96 L 230 -86 Q 250 -70 250 -40 L 250 0 Z" fill="#C0282D" strokeWidth={5} />
            {[-140, 150].map((wx) => <circle key={wx} cx={wx} cy={0} r={36} fill="#1A1220" stroke={OL} strokeWidth={4} />)}
          </g>
          <rect x={1300} y={220} width={280} height={60} rx={8} fill="#1A1220" />
          <text x={1440} y={264} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={42} fill="#FFB45A">{sign}</text>
          <rect x={1860} y={300} width={120} height={460} fill="#4A3440" stroke="#1A1220" strokeWidth={6} />
          <path d="M 860 760 L 860 180 Q 860 140 900 140 L 960 140" stroke="#1A1220" strokeWidth={12} fill="none" />
          <circle cx={960} cy={160} r={22} fill="#FFD27A" />
          <circle cx={960} cy={300} r={240} fill="#FFB45A" opacity={0.08} />
          <rect x={-400} y={760} width={2720} height={560} fill="#1E1626" />
          <path d="M 1060 760 L 1820 760 L 2100 1300 L 900 1300 Z" fill="#FFB45A" opacity={0.18} />
          <path d="M -400 760 L 2320 760" stroke="#0E0A14" strokeWidth={6} />
          {c.fx > 0.5 ? Array.from({ length: 70 }, (_, i) => { const yy = ((c.t * 22 + i * 97) % 1300) - 200; const xx = (i * 233) % 2600 - 300; return <path key={i} d={`M ${xx} ${yy} l -8 34`} stroke="#B8A8C8" strokeWidth={2} opacity={0.5} />; }) : null}
        </g>
      );
    },
    ...STD(980),
    rim: 'popRimWarm',
  },
  crt: {
    label: 'Màn hình camera an ninh (Retro TV)',
    hint: 'Nen den, khung man hinh CRT vien trang o giua, nhan vat nho ben trong khung, nhan CAM goc tren trai, dong ho chay goc phai, chu phu duoi khung. board = nhan camera (mac dinh CAM 03 / SUBJECT). fx2 > 0.5 = nhieu song/nhap nhay.',
    actors: true,
    back: (c) => {
      const lab = (c.shot.board || 'CAM 03 / SUBJECT').toUpperCase().slice(0, 22);
      const secs = Math.floor(c.t / 30) + 18;
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill="#030305" />
          <text x={80} y={60} fontFamily="Fragment Mono, monospace" fontSize={22} fill="#5A5A66">NIGHT SIGNAL / CASE 003</text>
          <text x={1840} y={60} textAnchor="end" fontFamily="Fragment Mono, monospace" fontSize={22} fill="#5A5A66">PICTURE TRANSMISSION</text>
          <rect x={560} y={160} width={800} height={720} rx={30} fill="#08080C" stroke="#D8D8E0" strokeWidth={6} />
          <text x={600} y={210} fontFamily="Fragment Mono, monospace" fontSize={22} fill="#C8C8D0">{'● ' + lab}</text>
          <text x={1320} y={210} textAnchor="end" fontFamily="Fragment Mono, monospace" fontSize={22} fill="#C8C8D0">{`03:00:${String(secs % 60).padStart(2, '0')}`}</text>
          <path d="M 600 820 L 1320 820" stroke="#3A3A44" strokeWidth={3} />
          {Array.from({ length: 36 }, (_, i) => <rect key={i} x={566} y={170 + i * 20} width={788} height={2} fill="#FFFFFF" opacity={0.03} />)}
        </g>
      );
    },
    front: (c) => (c.fx > 0.5 && Math.sin(c.t * 1.7) > 0.3 ? (
      <g>
        {Array.from({ length: 10 }, (_, i) => <rect key={i} x={566} y={170 + ((c.t * 37 + i * 71) % 700)} width={788} height={6 + (i % 3) * 4} fill="#FFFFFF" opacity={0.18} />)}
      </g>
    ) : null),
    place: (u) => ({ x: lerp(800, 1120, u), y: 820 - 140 * 0.8, scale: 0.8 }),
    seat: (u) => ({ x: lerp(800, 1120, u), y: 820 - 70 * 0.8 - 4, scale: 0.8 }),
    surface: flat(800, 1120, 820),
    floor: flat(800, 1120, 820),
    wide: () => [960, 520, 1],
    rim: 'popRim',
  },
  chalkboard: {
    label: 'Bảng phấn trên bàn đêm (Survival Thriller)',
    hint: 'Can canh mot tam bang den/bang phan dat tren ban go toi, chu phan lon (board, "/" xuong dong), gach chan vang. Khong nhan vat (dung cho cau then chot, tieu de chuong). fx2 > 0.5 = rung nhe + den nhap nhay.',
    actors: false,
    back: (c) => {
      const t = lines(c.shot.board || 'DO NOT/OPEN', 3);
      const sh = c.fx > 0.5 ? Math.sin(c.t * 1.3) * 4 : 0;
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill="#14161C" />
          <rect x={-400} y={700} width={2720} height={600} fill="#2A2018" />
          {Array.from({ length: 6 }, (_, i) => <path key={i} d={`M -400 ${740 + i * 80} L 2320 ${730 + i * 82}`} stroke="#1E1610" strokeWidth={4} />)}
          <g transform={`translate(${sh} 0) rotate(-2 960 540)`}>
            <rect x={300} y={150} width={1320} height={760} rx={14} fill="#6B4A2A" stroke="#0E0A08" strokeWidth={6} />
            <rect x={340} y={190} width={1240} height={680} fill="#26302A" />
            {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M ${360 + i * 100} ${220 + (i % 3) * 200} l 160 ${-30 + (i % 2) * 60}`} stroke="#3A463E" strokeWidth={10} opacity={0.5} strokeLinecap="round" />)}
            <text x={380} y={232} fontFamily="Fragment Mono, monospace" fontSize={20} fill="#7A867E">NIGHT DISPATCH / ROLE 01</text>
            {t.map((ln, i) => <text key={i} x={960} y={(t.length === 1 ? 600 : t.length === 2 ? 500 : 430) + i * 170} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={170} fill="#E8E4D8" opacity={0.92}>{ln.slice(0, 13)}</text>)}
            <path d={`M 520 ${(t.length === 1 ? 640 : t.length === 2 ? 700 : 800)} q 440 26 880 -6`} stroke="#E0B040" strokeWidth={8} fill="none" strokeLinecap="round" />
          </g>
          {c.fx > 0.5 && Math.sin(c.t * 0.9) > 0.6 ? <rect x={-400} y={-200} width={2720} height={1500} fill="#000" opacity={0.35} /> : null}
        </g>
      );
    },
    place: (u) => ({ x: lerp(380, 1540, u), y: 960 - 140 * PS, scale: PS }),
    seat: (u) => ({ x: lerp(380, 1540, u), y: 960 - 70 * PS - 4, scale: PS }),
    surface: flat(380, 1540, 960),
    floor: flat(380, 1540, 960),
    wide: () => [960, 540, 1],
    rim: 'popRim',
  },
  oldtown: {
    label: 'Phố cổ châu Âu có tháp sắt (Meme / Travel)',
    hint: 'Pho co chau Au mau am: nha nhieu tang ban cong hoa, quan co mai che do, cay trong chau, thap sat xa ben trai. board = bien quan (mac dinh HOTEL). Hop canh can dau to (meme).',
    actors: true,
    back: (c) => {
      const n = night(c);
      const sign = (c.shot.board || 'HOTEL').toUpperCase().slice(0, 10);
      const cols = ['#F2D7A6', '#E9C3A0', '#F4C8C8', '#F1E2B8', '#E8CFA4'];
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill={n ? '#2A3050' : '#BFE3F7'} />
          {[[200, 120], [900, 80], [1500, 140]].map(([x, y], i) => <g key={i} opacity={n ? 0.2 : 1}><ellipse cx={x} cy={y} rx={110} ry={34} fill="#FFFFFF" /><ellipse cx={x + 60} cy={y - 20} rx={70} ry={30} fill="#FFFFFF" /></g>)}
          <g stroke={n ? '#5A6478' : '#8A7A9A'} strokeWidth={5} fill="none" transform="translate(80 0)">
            <path d="M 0 700 L 60 300 L 120 700 M 20 560 L 100 560 M 36 440 L 84 440 M 60 300 L 60 220" />
            <path d="M 0 700 Q 60 600 120 700" />
          </g>
          {cols.map((col, i) => {
            const x = 220 + i * 400; const h = 520 + (i % 2) * 60;
            return (
              <g key={i}>
                <rect x={x} y={760 - h} width={380} height={h} fill={n ? '#4A4458' : col} stroke={OL} strokeWidth={4} />
                <P d={`M ${x - 10} ${760 - h} L ${x + 30} ${700 - h} L ${x + 350} ${700 - h} L ${x + 390} ${760 - h} Z`} fill={n ? '#3A3448' : '#7A5A8A'} />
                {[0, 1, 2].map((k) => [0, 1].map((r) => <g key={`${k}${r}`}><rect x={x + 40 + k * 110} y={780 - h + r * 150} width={70} height={100} fill={n ? '#FFE38A' : '#5A8AA8'} stroke={OL} strokeWidth={3} /><rect x={x + 32 + k * 110} y={880 - h + r * 150} width={86} height={14} fill="#FFFFFF" stroke={OL} strokeWidth={2} />{(k + r + i) % 2 ? <circle cx={x + 75 + k * 110} cy={874 - h + r * 150} r={10} fill="#E8453C" /> : null}</g>))}
              </g>
            );
          })}
          <g transform="translate(1420 0)">
            <P d="M 0 470 L 340 470 L 320 530 L 20 530 Z" fill="#C0282D" />
            {Array.from({ length: 6 }, (_, i) => <path key={i} d={`M ${20 + i * 50} 530 l 25 0 q -12 16 -25 0`} fill="#FFFFFF" />)}
            <rect x={30} y={540} width={280} height={220} fill={n ? '#2A3A3A' : '#2E5A50'} stroke={OL} strokeWidth={4} />
            <rect x={110} y={410} width={140} height={46} rx={6} fill="#F4EBD6" stroke={OL} strokeWidth={3} />
            <text x={180} y={444} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={28} fill="#7A2A2A">{sign}</text>
          </g>
          {[180, 1180].map((x) => <g key={x}><path d={`M ${x - 40} 760 L ${x + 40} 760 L ${x + 30} 700 L ${x - 30} 700 Z`} fill="#C98E58" stroke={OL} strokeWidth={3} /><circle cx={x} cy={660} r={50} fill="#5AA65A" stroke={OL} strokeWidth={3} /></g>)}
          <rect x={-400} y={760} width={2720} height={560} fill={n ? '#4A4458' : '#E8C89A'} />
          {Array.from({ length: 8 }, (_, r) => <path key={r} d={`M -400 ${790 + r * 60} L 2320 ${790 + r * 60}`} stroke={n ? '#3A3448' : '#D2AE80'} strokeWidth={3} />)}
          <path d="M -400 760 L 2320 760" stroke={OL} strokeWidth={W} />
        </g>
      );
    },
    ...STD(990),
    rim: 'popRimWarm',
  },
};

export default STYLE;
