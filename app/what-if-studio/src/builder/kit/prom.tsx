// Bo boi canh: guong phong ngu (giay note) + da hoi trong phong the duc (den day, qua cau disco, dong ho lon).
import React from 'react';
import { clamp, lerp } from '../../engine';
import type { StageDef, Ctx, Place } from '../stages';
import { todOf } from './sets';

const PS = 1.3;
const OL = '#1B1530';
const W = 4;
const F = 'Bricolage Grotesque, sans-serif';
const B: React.FC<React.SVGProps<SVGRectElement>> = (p) => <rect stroke={OL} strokeWidth={W} strokeLinejoin="round" {...p} />;
const flat = (x0: number, x1: number, y: number, scale = 1) => (u: number): Place => ({ x: lerp(x0, x1, u), y, scale });
const night = (c: Ctx) => todOf(c) === 'night';

const PROM: Record<string, StageDef> = {
  mirror: {
    label: 'Gương phòng ngủ - giấy note (Pop)',
    hint: 'Can canh guong lon tren tuong phong ngu, nhan vat dung truoc guong (spot 0.5 = giua guong). Giay note vang dan goc guong: board = chu tren note (vd RULES / 7 DAYS, "/" xuong dong). fx2 > 0.5 = guong lap lanh phep thuat.',
    actors: true,
    back: (c) => {
      const n = night(c);
      const note = (c.shot.board || 'RULES').toUpperCase().split('\n');
      const glow = c.fx > 0.5;
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill={n ? '#3A2E50' : '#F7D6E6'} />
          {Array.from({ length: 14 }, (_, i) => <path key={i} d={`M ${-380 + i * 200} -200 L ${-380 + i * 200} 1300`} stroke="#FFFFFF" strokeWidth={14} opacity={0.18} />)}
          <rect x={540} y={60} width={840} height={980} rx={420} fill="#C9A35A" stroke={OL} strokeWidth={6} />
          <rect x={580} y={100} width={760} height={900} rx={380} fill={n ? '#2A3550' : '#CFE8F7'} stroke={OL} strokeWidth={4} />
          <path d="M 680 260 L 820 140 M 700 360 L 900 180" stroke="#FFFFFF" strokeWidth={14} strokeLinecap="round" opacity={0.6} />
          {glow ? (
            <g>
              <rect x={580} y={100} width={760} height={900} rx={380} fill="#B58CFF" opacity={0.25 + 0.15 * Math.sin(c.t * 0.2)} />
              {[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d="M 0 -18 L 5 -5 L 18 0 L 5 5 L 0 18 L -5 5 L -18 0 L -5 -5 Z" fill="#FFFFFF" transform={`translate(${640 + ((i * 137) % 640)} ${160 + ((i * 211) % 760)}) scale(${0.6 + 0.5 * Math.abs(Math.sin(c.t * 0.1 + i))})`} />)}
            </g>
          ) : null}
          <g transform="rotate(6 1300 260)">
            <B x={1150} y={170} width={320} height={200} fill="#FFE38A" />
            {note.slice(0, 3).map((ln, i) => <text key={i} x={1310} y={note.length > 1 ? 245 + i * 50 : 285} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={note.length > 1 ? 40 : 52} fill={OL}>{ln.slice(0, 10)}</text>)}
          </g>
          <rect x={-400} y={1000} width={2720} height={300} fill={n ? '#4A3E60' : '#E8B6CC'} />
          <path d="M -400 1000 L 2320 1000" stroke={OL} strokeWidth={W} />
          <B x={140} y={700} width={260} height={300} rx={10} fill="#FF7AB6" />
          <B x={170} y={740} width={200} height={20} rx={6} fill="#FFFFFF" opacity={0.6} />
          <B x={1560} y={760} width={220} height={240} rx={10} fill="#FFFFFF" />
          <circle cx={1670} cy={720} r={40} fill="#7CC67A" stroke={OL} strokeWidth={3} />
        </g>
      );
    },
    place: (u) => ({ x: lerp(560, 1360, u), y: 1000 - 140 * PS, scale: PS }),
    seat: (u) => ({ x: lerp(560, 1360, u), y: 1000 - 70 * PS - 4, scale: PS }),
    surface: flat(560, 1360, 1000),
    floor: flat(560, 1360, 1000),
    wide: () => [960, 560, 1],
    rim: 'popRimWarm',
  },
  promnight: {
    label: 'Dạ hội trong phòng thể dục (Pop)',
    hint: 'Da hoi mua xuan trong phong the duc: den day, qua cau disco, bang ron SPRING DANCE, dong ho lon tren tuong. board = gio tren dong ho (vd 11:40, 11:59, 12:00). fx2 > 0.5 = den nhap nhay (luc nua dem doi than); > 0.8 = toi han + chop trang.',
    actors: true,
    back: (c) => {
      const time = (c.shot.board || '11:40').toUpperCase();
      const flick = c.fx > 0.5 && Math.sin(c.t * 0.9) > 0.2;
      const dark = c.fx > 0.8;
      const cols = ['#FF7AB6', '#FFD23F', '#7CC67A', '#8FB8D8', '#B58CFF'];
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill="#1E1A36" />
          {[0, 1, 2].map((r) => <path key={r} d={`M -400 ${80 + r * 90} Q 960 ${200 + r * 90} 2320 ${80 + r * 90}`} stroke="#3A3E52" strokeWidth={3} fill="none" />)}
          {[0, 1, 2].map((r) => Array.from({ length: 22 }, (_, i) => {
            const x = -380 + i * 125; const k = (x + 400) / 2720; const y = 80 + r * 90 + Math.sin(k * Math.PI) * 120;
            const on = !flick && (i + r + Math.floor(c.t / 8)) % 3 !== 0;
            return <circle key={`${r}-${i}`} cx={x} cy={y} r={11} fill={on ? cols[(i + r) % 5] : '#3A3E52'} />;
          }))}
          <B x={560} y={330} width={800} height={110} rx={14} fill="#FF7AB6" />
          <text x={960} y={410} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={70} fill="#FFFFFF">SPRING DANCE</text>
          <g transform="translate(1660 300)">
            <circle r={120} fill="#FFFFFF" stroke={OL} strokeWidth={8} />
            <rect x={-95} y={-40} width={190} height={80} rx={10} fill="#14182A" />
            <text x={0} y={24} textAnchor="middle" fontFamily="Fragment Mono, monospace" fontSize={60} fill={time.startsWith('12') ? '#FF6A3D' : '#7CFFB2'}>{time.slice(0, 5)}</text>
          </g>
          <path d="M 960 -200 L 960 60" stroke="#C9CEDA" strokeWidth={4} />
          <g transform={`translate(960 120) rotate(${c.t * 2})`}>
            <circle r={70} fill="#C9CEDA" stroke={OL} strokeWidth={4} />
            {[-40, 0, 40].map((x) => <path key={x} d={`M ${x} -64 L ${x} 64`} stroke="#8A8FA0" strokeWidth={3} />)}
            {[-40, 0, 40].map((y) => <path key={y} d={`M -64 ${y} L 64 ${y}`} stroke="#8A8FA0" strokeWidth={3} />)}
          </g>
          {!flick ? [0, 1, 2, 3, 4].map((i) => <path key={i} d={`M 960 120 L ${200 + i * 380 + Math.sin(c.t * 0.05 + i) * 120} 900 L ${260 + i * 380 + Math.sin(c.t * 0.05 + i) * 120} 900 Z`} fill={cols[i]} opacity={0.12} />) : null}
          <rect x={-400} y={720} width={2720} height={600} fill="#8A6A4A" />
          <path d="M -400 720 L 2320 720" stroke={OL} strokeWidth={W} />
          {Array.from({ length: 10 }, (_, i) => <path key={i} d={`M -400 ${750 + i * 40} L 2320 ${750 + i * 40}`} stroke="#6E5238" strokeWidth={3} opacity={0.6} />)}
          {[100, 1820].map((x) => <g key={x}><B x={x - 90} y={560} width={180} height={160} rx={10} fill="#FFFFFF" /><rect x={x - 70} y={580} width={140} height={20} fill="#FF7AB6" /><circle cx={x - 30} cy={540} r={36} fill="#FFD23F" stroke={OL} strokeWidth={3} /><circle cx={x + 30} cy={530} r={30} fill="#8FB8D8" stroke={OL} strokeWidth={3} /></g>)}
          {flick ? <rect x={-400} y={-200} width={2720} height={1500} fill="#000000" opacity={0.45} /> : null}
          {dark && Math.sin(c.t * 1.3) > 0.7 ? <rect x={-400} y={-200} width={2720} height={1500} fill="#FFFFFF" opacity={0.5} /> : null}
        </g>
      );
    },
    place: (u) => ({ x: lerp(360, 1560, u), y: 960 - 140 * PS, scale: PS }),
    seat: (u) => ({ x: lerp(360, 1560, u), y: 960 - 70 * PS - 4, scale: PS }),
    surface: flat(360, 1560, 960),
    floor: flat(360, 1560, 960),
    wide: () => [960, 560, 1],
    rim: 'popRim',
  },
};

export default PROM;
