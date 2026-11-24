// Bo boi canh rieng "Pop": mau tuoi, net vien dam, phang 2.5D. Bau troi doi theo gio trong ngay (tod).
import React from 'react';
import { clamp, lerp } from '../../engine';
import type { StageDef, Ctx, Place } from '../stages';
import MALL_STAGES from './mall';
import EXTRA_STAGES from './extra';
import HOSP_STAGES from './hospital';
import SCHOOL_STAGES from './school';
import VENUE_STAGES from './venue';
import PROM_STAGES from './prom';
import STYLE_STAGES from './styles';

const OL = '#1B1530';
const W = 4;
export type Tod = 'day' | 'sunset' | 'night' | 'dawn';
export const todOf = (c: Ctx): Tod => ((c.shot as any).tod as Tod) || (c.shot.night ? 'night' : 'day');

const rnd = (i: number, s = 1) => Math.abs(Math.sin(i * 12.9898 + s * 78.233) * 43758.5453) % 1;

const SKY: Record<Tod, [string, string, string]> = {
  day: ['#5EC8F2', '#9FE0F7', '#E3F7FF'],
  sunset: ['#4B3B8F', '#E96C8A', '#FFC07A'],
  night: ['#0E1240', '#232A6B', '#3D3F86'],
  dawn: ['#7FA6E8', '#F4B6C8', '#FFE2B8'],
};

/** Bau troi: gradient, mat troi / mat trang, may troi cham. */
export const Sky: React.FC<{ c: Ctx; x0?: number; y0?: number; w?: number; h?: number; horizon?: number }> = ({ c, x0 = 0, y0 = 0, w = 1920, h = 1080, horizon }) => {
  const tod = todOf(c);
  const [a, b, d] = SKY[tod];
  const id = `${c.id}sky${x0}_${y0}`;
  const hz = horizon ?? y0 + h;
  return (
    <g>
      <defs>
        <linearGradient id={id} x1="0" y1={y0} x2="0" y2={hz} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={a} />
          <stop offset="0.6" stopColor={b} />
          <stop offset="1" stopColor={d} />
        </linearGradient>
      </defs>
      <rect x={x0} y={y0} width={w} height={h} fill={`url(#${id})`} />
      {tod === 'night'
        ? Array.from({ length: 40 }, (_, i) => <circle key={i} cx={x0 + rnd(i) * w} cy={y0 + rnd(i, 2) * h * 0.7} r={1.5 + rnd(i, 3) * 2} fill="#FFFFFF" opacity={0.5 + 0.5 * Math.sin(c.t * 0.1 + i)} />)
        : null}
      {tod === 'night' ? (
        <g>
          <circle cx={x0 + w * 0.78} cy={y0 + h * 0.22} r={46} fill="#FFF6D8" />
          <circle cx={x0 + w * 0.78 + 18} cy={y0 + h * 0.22 - 10} r={40} fill={a} opacity={0.9} />
        </g>
      ) : (
        <g>
          <circle cx={x0 + w * (tod === 'day' ? 0.8 : 0.7)} cy={tod === 'day' ? y0 + h * 0.18 : hz - 60} r={tod === 'day' ? 54 : 80} fill={tod === 'day' ? '#FFF2A8' : '#FFE08A'} opacity={0.95} />
          <circle cx={x0 + w * (tod === 'day' ? 0.8 : 0.7)} cy={tod === 'day' ? y0 + h * 0.18 : hz - 60} r={tod === 'day' ? 80 : 130} fill="#FFF2A8" opacity={0.25} />
        </g>
      )}
      {tod !== 'night'
        ? [0, 1, 2, 3].map((i) => {
            const cx = x0 + ((rnd(i, 5) * w + c.t * (0.4 + i * 0.15)) % (w + 300)) - 150;
            const cy = y0 + h * (0.12 + 0.12 * i);
            const s = 0.7 + rnd(i, 6) * 0.6;
            return (
              <g key={i} transform={`translate(${cx} ${cy}) scale(${s})`} opacity={tod === 'day' ? 0.95 : 0.6}>
                <path d="M -90 20 Q -100 -10 -60 -12 Q -50 -44 -10 -36 Q 20 -60 52 -30 Q 96 -30 92 10 Q 100 26 70 26 L -70 26 Q -98 28 -90 20 Z" fill="#FFFFFF" />
              </g>
            );
          })
        : null}
    </g>
  );
};

const B: React.FC<React.SVGProps<SVGRectElement>> = (p) => <rect stroke={OL} strokeWidth={W} strokeLinejoin="round" {...p} />;
const Pth: React.FC<React.SVGProps<SVGPathElement>> = (p) => <path stroke={OL} strokeWidth={W} strokeLinejoin="round" strokeLinecap="round" {...p} />;

/** Cua so co bau troi ben trong. */
const Win: React.FC<{ c: Ctx; x: number; y: number; w: number; h: number; frame?: string }> = ({ c, x, y, w, h, frame = '#FFFFFF' }) => {
  const cid = `${c.id}w${x}_${y}`;
  return (
    <g>
      <defs>
        <clipPath id={cid}>
          <rect x={x} y={y} width={w} height={h} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${cid})`}>
        <Sky c={c} x0={x} y0={y} w={w} h={h} />
        <path d={`M ${x} ${y + h} L ${x} ${y + h * 0.72} L ${x + w * 0.2} ${y + h * 0.72} L ${x + w * 0.2} ${y + h * 0.55} L ${x + w * 0.42} ${y + h * 0.55} L ${x + w * 0.42} ${y + h * 0.68} L ${x + w * 0.66} ${y + h * 0.68} L ${x + w * 0.66} ${y + h * 0.5} L ${x + w * 0.84} ${y + h * 0.5} L ${x + w * 0.84} ${y + h * 0.74} L ${x + w} ${y + h * 0.74} L ${x + w} ${y + h} Z`} fill={todOf(c) === 'night' ? '#2A2F66' : '#9BB8D8'} opacity={0.75} />
      </g>
      <rect x={x} y={y} width={w} height={h} fill="none" stroke={frame} strokeWidth={14} />
      <rect x={x - 7} y={y - 7} width={w + 14} height={h + 14} fill="none" stroke={OL} strokeWidth={W} />
      <path d={`M ${x + w / 2} ${y} L ${x + w / 2} ${y + h} M ${x} ${y + h / 2} L ${x + w} ${y + h / 2}`} stroke={frame} strokeWidth={10} />
    </g>
  );
};

const Plant: React.FC<{ x: number; y: number; s?: number; c?: string }> = ({ x, y, s = 1, c = '#3FBF7F' }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M 0 -40 Q -60 -90 -40 -150 Q -10 -110 0 -60 Q 10 -130 40 -170 Q 50 -100 6 -50 Q 50 -90 70 -110 Q 70 -60 6 -36 Z" fill={c} stroke={OL} strokeWidth={W} strokeLinejoin="round" />
    <path d="M -34 -40 L 34 -40 L 26 20 L -26 20 Z" fill="#E8875A" stroke={OL} strokeWidth={W} strokeLinejoin="round" />
  </g>
);

const Tree: React.FC<{ x: number; y: number; s?: number; t: number; c?: string }> = ({ x, y, s = 1, t, c = '#45C46A' }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <Pth d="M -14 0 L -10 -180 L 10 -180 L 14 0 Z" fill="#8A5A3C" />
    <g transform={`rotate(${Math.sin(t * 0.05 + x) * 1.5} 0 -180)`}>
      <circle cx={-50} cy={-220} r={70} fill={c} stroke={OL} strokeWidth={W} />
      <circle cx={50} cy={-230} r={74} fill={c} stroke={OL} strokeWidth={W} />
      <circle cx={0} cy={-290} r={80} fill={c} stroke={OL} strokeWidth={W} />
      <circle cx={-20} cy={-300} r={30} fill="#FFFFFF" opacity={0.18} />
    </g>
  </g>
);

const Wall: React.FC<{ col: string; floor: string; fy?: number; c: Ctx; trim?: string }> = ({ col, floor, fy = 840, trim = '#FFFFFF' }) => (
  <g>
    <rect x={-400} y={-200} width={2720} height={fy + 200} fill={col} />
    <rect x={-400} y={fy - 26} width={2720} height={26} fill={trim} stroke={OL} strokeWidth={W} />
    <rect x={-400} y={fy} width={2720} height={1080 - fy + 300} fill={floor} />
    <path d={`M -400 ${fy} L 2320 ${fy}`} stroke={OL} strokeWidth={W} />
  </g>
);

export const PS = 1.3;
const seatAt = (x0: number, x1: number, top: number) => (u: number): Place => ({ x: lerp(x0, x1, u), y: top - 70 * PS - 4, scale: PS });
const floorPlace = (x0: number, x1: number, feet = 930, scale = PS) => (u: number): Place => ({ x: lerp(x0, x1, u), y: feet - 140 * scale, scale });
const flat = (x0: number, x1: number, y: number, scale = 1) => (u: number): Place => ({ x: lerp(x0, x1, u), y, scale });


/** Cay dua nghieng, la dong dua theo gio. */
const Palm: React.FC<{ x: number; y: number; s?: number; t: number; lean?: number; nuts?: boolean }> = ({ x, y, s = 1, t, lean = 1, nuts = true }) => {
  const sw = Math.sin(t * 0.05 + x) * 3;
  const tx = 70 * lean;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d={`M -16 0 Q ${tx * 0.3} -160 ${tx} -330 L ${tx + 22} -326 Q ${tx * 0.3 + 26} -160 16 0 Z`} fill="#B07A4A" stroke={OL} strokeWidth={W} strokeLinejoin="round" />
      {[0.2, 0.4, 0.6, 0.8].map((k) => <path key={k} d={`M ${-14 + tx * k * 0.9} ${-330 * k} l 26 4`} stroke={OL} strokeWidth={3} opacity={0.5} />)}
      <g transform={`translate(${tx + 10} -330) rotate(${sw})`}>
        {[-160, -120, -70, -20, 20, 60].map((a, i) => (
          <path key={i} transform={`rotate(${a})`} d="M 0 0 Q 70 -40 150 10 Q 90 -10 0 10 Z" fill={i % 2 ? '#3FB565' : '#5ACB72'} stroke={OL} strokeWidth={W} strokeLinejoin="round" />
        ))}
        {nuts ? [[-12, 14], [10, 18], [0, 26]].map(([a, b], i) => <circle key={i} cx={a} cy={b} r={13} fill="#8A5A3C" stroke={OL} strokeWidth={3.5} />) : null}
      </g>
    </g>
  );
};

/** Bien: nhieu lop song chuyen dong. */
const Sea: React.FC<{ c: Ctx; y: number; storm?: number }> = ({ c, y, storm = 0 }) => {
  const night = todOf(c) === 'night';
  const cols = night ? ['#1E3A6E', '#264A86', '#2E5A9A'] : storm > 0.5 ? ['#3A5A7A', '#4A6A8A', '#5A7A96'] : ['#2FA3D8', '#4FC3E8', '#7FDBF2'];
  const amp = 8 + storm * 26;
  return (
    <g>
      {cols.map((col, k) => {
        const yy = y + k * 40;
        const ph = c.t * (0.05 + k * 0.03) * (1 + storm * 2);
        const d = Array.from({ length: 26 }, (_, i) => {
          const x = -400 + i * 110;
          return `${i ? 'L' : 'M'} ${x} ${yy + Math.sin(i * 0.9 + ph) * amp}`;
        }).join(' ');
        return <path key={k} d={`${d} L 2320 1300 L -400 1300 Z`} fill={col} />;
      })}
      {Array.from({ length: 14 }, (_, i) => {
        const x = ((rnd(i, 3) * 2400 + c.t * (2 + storm * 6)) % 2400) - 300;
        return <path key={i} d={`M ${x} ${y + 20 + rnd(i, 4) * 90} q 18 -8 36 0`} stroke="#FFFFFF" strokeWidth={4} fill="none" opacity={0.6} strokeLinecap="round" />;
      })}
    </g>
  );
};

const POP_STAGES_ISLAND: Record<string, StageDef> = {
  beach: {
    label: 'Bai bien dao hoang (Pop)',
    hint: 'Bai cat, song bien, cay dua. Chu tren bang = chu viet tren cat (vd. SOS). Hieu ung rieng > 0.5 = bao.',
    actors: true,
    back: (c) => {
      const storm = c.fx;
      return (
        <g>
          <Sky c={c} horizon={560} />
          {storm > 0.5 ? <rect x={-400} y={-200} width={2720} height={800} fill="#3A4660" opacity={0.55} /> : null}
          <path d="M 1300 520 Q 1420 400 1560 430 Q 1640 380 1720 450 L 1760 520 Z" fill="#5A9A6A" opacity={0.7} />
          <Sea c={c} y={520} storm={storm} />
          <path d={`M -400 760 Q 300 ${700 + Math.sin(c.t * 0.06) * 10} 960 730 Q 1600 ${700 + Math.cos(c.t * 0.06) * 10} 2320 750 L 2320 1300 L -400 1300 Z`} fill="#FFFFFF" opacity={0.8} />
          <path d="M -400 780 Q 400 730 960 760 Q 1500 790 2320 770 L 2320 1300 L -400 1300 Z" fill="#F6DFA4" stroke={OL} strokeWidth={W} />
          {Array.from({ length: 24 }, (_, i) => <circle key={i} cx={rnd(i, 5) * 1920} cy={820 + rnd(i, 6) * 240} r={3 + rnd(i, 7) * 3} fill="#D9BC7A" />)}
          <Palm x={120} y={900} s={1.3} t={c.t} lean={1} />
          <Palm x={1800} y={880} s={1.15} t={c.t} lean={-1} />
          {/* khuc go troi dat (cho ngoi) */}
          <g>
            <rect x={680} y={862} width={600} height={46} rx={23} fill="#A0703F" stroke={OL} strokeWidth={W} />
            <ellipse cx={1280} cy={885} rx={14} ry={23} fill="#D9A46C" stroke={OL} strokeWidth={3} />
            <path d="M 760 875 L 900 872 M 1000 892 L 1150 889" stroke="#7A5230" strokeWidth={3} />
          </g>
          {/* manh vo thuyen */}
          <g transform="translate(1500 860) rotate(-8)">
            <path d="M -110 0 L 110 0 L 80 50 L -80 50 Z" fill="#9A6A42" stroke={OL} strokeWidth={W} strokeLinejoin="round" />
            <path d="M -60 0 L -40 -70 M -40 -70 L 30 -40" stroke={OL} strokeWidth={6} />
          </g>
          {c.shot.board ? (
            <text x={960} y={1010} textAnchor="middle" fontFamily="Kalam, cursive" fontWeight={700} fontSize={120} fill="#B8935A" opacity={0.95} transform="rotate(-2 960 1000)">
              {(c.shot.board || '').toUpperCase()}
            </text>
          ) : null}
          {storm > 0.5 ? (
            <g>
              {Math.floor(c.t / 9) % 5 === 0 ? <rect x={-400} y={-200} width={2720} height={1500} fill="#FFFFFF" opacity={0.35} /> : null}
              <path d="M 700 60 L 660 200 L 720 200 L 680 360" stroke="#FFF6B0" strokeWidth={8} fill="none" opacity={Math.floor(c.t / 9) % 5 === 0 ? 1 : 0} />
            </g>
          ) : null}
        </g>
      );
    },
    place: (u) => ({ x: lerp(520, 1400, u), y: 930 - 140 * PS, scale: PS }),
    surface: flat(560, 1360, 920),
    floor: flat(560, 1360, 935),
    seat: (u) => ({ x: lerp(740, 1220, u), y: 864 - 70 * PS - 4, scale: PS }),
    wide: () => [960, 560, 1],
    rim: 'popRimWarm',
    mediumUp: 110,
  },
  jungle: {
    label: 'Rung rap (Pop)',
    hint: 'Rung nhiet doi day la, day leo, hoa la. Hieu ung rieng > 0.5 = toi va co mat thu sang trong bui.',
    actors: true,
    back: (c) => (
      <g>
        <rect x={-400} y={-200} width={2720} height={1500} fill="#2E7A52" />
        <rect x={-400} y={-200} width={2720} height={500} fill="#3F9A66" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <g key={i}>
            <rect x={-120 + i * 330} y={-200} width={70 + (i % 3) * 20} height={1100} fill={i % 2 ? '#6A4A34' : '#7A5A3E'} stroke={OL} strokeWidth={W} />
            <path d={`M ${-90 + i * 330} 100 Q ${-40 + i * 330 + Math.sin(c.t * 0.05 + i) * 10} 400 ${-110 + i * 330} 700`} stroke="#3FB565" strokeWidth={10} fill="none" />
          </g>
        ))}
        {Array.from({ length: 18 }, (_, i) => (
          <ellipse key={i} cx={rnd(i, 2) * 2000 - 40} cy={-60 + rnd(i, 3) * 260} rx={180} ry={110} fill={['#3FB565', '#2E9A55', '#5ACB72'][i % 3]} stroke={OL} strokeWidth={W} />
        ))}
        <rect x={-400} y={840} width={2720} height={500} fill="#5A8A3A" />
        <path d="M -400 840 L 2320 840" stroke={OL} strokeWidth={W} />
        {Array.from({ length: 22 }, (_, i) => {
          const x = rnd(i, 8) * 2000 - 40;
          return <path key={i} d={`M ${x} 900 Q ${x - 50} 780 ${x - 90} 760 Q ${x - 20} 800 ${x} 900 Q ${x + 30} 770 ${x + 80} 750 Q ${x + 30} 820 ${x} 900 Z`} fill={i % 2 ? '#3FB565' : '#5ACB72'} stroke={OL} strokeWidth={3} />;
        })}
        {[[300, 700], [1500, 640], [1750, 760]].map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            {[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx={0} cy={-14} rx={9} ry={16} fill="#FF6F9A" transform={`rotate(${a})`} />)}
            <circle r={8} fill="#FFD23F" />
          </g>
        ))}
        {c.fx > 0.5 ? (
          <g>
            <rect x={-400} y={-200} width={2720} height={1500} fill="#0E1A24" opacity={0.45} />
            {[[420, 600], [1650, 560]].map(([x, y], i) => (Math.floor(c.t / 20 + i) % 4 ? (
              <g key={i}>
                <ellipse cx={x} cy={y} rx={10} ry={7} fill="#FFE066" />
                <ellipse cx={x + 34} cy={y} rx={10} ry={7} fill="#FFE066" />
              </g>
            ) : null))}
          </g>
        ) : null}
      </g>
    ),
    place: floorPlace(560, 1360, 975),
    surface: flat(560, 1360, 960),
    floor: flat(560, 1360, 975),
    wide: () => [960, 560, 1],
    rim: 'popRim',
    mediumUp: 110,
  },
  camp: {
    label: 'Trai tren dao (Pop)',
    hint: 'Leu la, lua trai bap bung, bang go dem ngay (chu tren bang). Hop voi ban dem. Hieu ung rieng = lua to.',
    actors: true,
    back: (c) => {
      const night = todOf(c) === 'night';
      return (
        <g>
          <Sky c={c} horizon={600} />
          <Sea c={c} y={600} />
          <path d="M -400 700 Q 600 650 1300 690 Q 1800 720 2320 680 L 2320 1300 L -400 1300 Z" fill="#E8CF94" stroke={OL} strokeWidth={W} />
          <Palm x={1820} y={760} s={1} t={c.t} lean={-1} />
          {/* leu la */}
          <g transform="translate(330 860)">
            <path d="M -220 0 L 0 -300 L 220 0 Z" fill="#8FBF5A" stroke={OL} strokeWidth={W} strokeLinejoin="round" />
            {[-150, -90, -30, 30, 90, 150].map((x) => <path key={x} d={`M ${x * 0.7} ${-300 + Math.abs(x) * 1.36 + 40} L ${x} 0`} stroke="#6A9A3A" strokeWidth={6} />)}
            <path d="M -60 0 L 0 -110 L 60 0 Z" fill="#3A4A2A" />
            <path d="M 0 -300 L -24 -340 M 0 -300 L 26 -336" stroke="#8A5A3C" strokeWidth={10} strokeLinecap="round" />
          </g>
          {/* bang go */}
          <g transform="translate(1500 850)">
            <rect x={-8} y={-20} width={16} height={130} fill="#8A5A3C" stroke={OL} strokeWidth={3} />
            <rect x={-130} y={-190} width={260} height={170} rx={10} fill="#C98C5A" stroke={OL} strokeWidth={W} />
            <text x={0} y={-90} textAnchor="middle" fontFamily="Kalam, cursive" fontWeight={700} fontSize={(c.shot.board || '').length > 8 ? 44 : 70} fill="#3A2416">
              {c.shot.board || ''}
            </text>
            {!c.shot.board ? [0, 1, 2, 3].map((i) => <path key={i} d={`M ${-60 + i * 22} -150 L ${-60 + i * 22} -70`} stroke="#3A2416" strokeWidth={7} strokeLinecap="round" />) : null}
            {!c.shot.board ? <path d="M -72 -100 L 20 -124" stroke="#3A2416" strokeWidth={7} strokeLinecap="round" /> : null}
          </g>
          {night ? <circle cx={960} cy={900} r={420} fill="#FFB84D" opacity={0.18} /> : null}
        </g>
      );
    },
    front: (c) => {
      const big = 1 + c.fx * 0.8;
      const fl = (k: number) => 1 + 0.18 * Math.sin(c.t * (0.7 + k * 0.3) + k);
      return (
        <g transform="translate(960 975)">
          {[-50, -20, 20, 50].map((x, i) => <rect key={i} x={x - 40} y={-10} width={80} height={16} rx={8} fill="#7A4A2A" stroke={OL} strokeWidth={3} transform={`rotate(${i % 2 ? 18 : -18} ${x} 0)`} />)}
          <g transform={`scale(${big})`}>
            <path transform={`scale(1 ${fl(0)})`} d="M -46 0 Q -60 -60 -10 -120 Q -14 -70 10 -60 Q 20 -110 46 -140 Q 70 -60 46 0 Z" fill="#FF7A2A" stroke={OL} strokeWidth={3.5} />
            <path transform={`scale(1 ${fl(1)})`} d="M -24 0 Q -30 -40 0 -80 Q 6 -40 24 -50 Q 34 -20 24 0 Z" fill="#FFD23F" />
          </g>
          {[0, 1, 2, 3].map((i) => {
            const p = (c.t * 0.03 + i * 0.25) % 1;
            return <circle key={i} cx={Math.sin(i * 3 + c.t * 0.1) * 30} cy={-120 - p * 200} r={4} fill="#FFB84D" opacity={1 - p} />;
          })}
        </g>
      );
    },
    place: (u) => {
      const x = u < 0.5 ? lerp(560, 780, u * 2) : lerp(1140, 1360, (u - 0.5) * 2);
      return { x, y: 960 - 140 * PS, scale: PS };
    },
    seat: (u) => ({ x: u < 0.5 ? 640 : 1280, y: 930 - 70 * PS - 4, scale: PS }),
    surface: flat(600, 1320, 950),
    floor: flat(600, 1320, 965),
    wide: () => [960, 560, 1],
    rim: 'popRimWarm',
    mediumUp: 110,
  },
  sea: {
    label: 'Be giua bien (Pop)',
    hint: 'Nhan vat tren be go giua bien, chan troi rong. Hieu ung rieng > 0.5 = song to, bao.',
    actors: true,
    back: (c) => {
      const storm = c.fx;
      const bob = Math.sin(c.t * 0.12) * (6 + storm * 20);
      const rock = Math.sin(c.t * 0.09) * (2 + storm * 6);
      return (
        <g>
          <Sky c={c} horizon={540} />
          {storm > 0.5 ? <rect x={-400} y={-200} width={2720} height={800} fill="#3A4660" opacity={0.55} /> : null}
          <Sea c={c} y={540} storm={storm} />
          <g transform={`translate(960 ${905 + bob}) rotate(${rock})`}>
            {[-300, -180, -60, 60, 180].map((x) => <rect key={x} x={x} y={-20} width={120} height={46} rx={14} fill="#B07A4A" stroke={OL} strokeWidth={W} />)}
            <path d="M -320 -4 L 320 -4" stroke="#6A4A2A" strokeWidth={6} />
            <path d="M 250 -20 L 250 -330" stroke="#8A5A3C" strokeWidth={14} />
            <path d={`M 256 -320 Q ${330 + Math.sin(c.t * 0.1) * 20} -240 256 -140 Z`} fill="#F4F0E6" stroke={OL} strokeWidth={W} />
          </g>
        </g>
      );
    },
    front: (c) => (
      <path d={Array.from({ length: 26 }, (_, i) => `${i ? 'L' : 'M'} ${-400 + i * 110} ${960 + Math.sin(i * 0.8 + c.t * 0.12) * (10 + c.fx * 24)}`).join(' ') + ' L 2320 1300 L -400 1300 Z'} fill="#2FA3D8" opacity={0.85} />
    ),
    place: (u) => ({ x: lerp(720, 1100, u), y: 890 - 140 * PS + Math.sin(0) * 0, scale: PS }),
    seat: (u) => ({ x: lerp(760, 1080, u), y: 890 - 70 * PS - 4, scale: PS }),
    surface: flat(700, 1150, 885),
    floor: flat(700, 1150, 890),
    wide: () => [960, 560, 1],
    rim: 'popRimWarm',
    mediumUp: 110,
  },
  cliff: {
    label: 'Dinh doi nhin ra bien (Pop)',
    hint: 'Dinh doi tren dao, nhin ra bien rong. Hieu ung rieng > 0.5 = co tau xa xa o chan troi.',
    actors: true,
    back: (c) => (
      <g>
        <Sky c={c} horizon={640} />
        <Sea c={c} y={640} />
        {c.fx > 0.5 ? (
          <g transform={`translate(${1500 - c.t * 0.6} 628)`}>
            <path d="M -60 0 L 60 0 L 46 18 L -46 18 Z" fill="#E8453C" stroke={OL} strokeWidth={3} />
            <rect x={-30} y={-24} width={46} height={24} fill="#FFFFFF" stroke={OL} strokeWidth={3} />
            <rect x={-4} y={-44} width={12} height={20} fill="#3A3F5C" />
            <path d={`M 2 -48 q -20 -20 -10 -40`} stroke="#C9CEDA" strokeWidth={8} fill="none" opacity={0.7} />
          </g>
        ) : null}
        <path d="M -400 1300 L -400 820 Q 300 760 900 800 Q 1300 830 1520 900 L 1600 1300 Z" fill="#6CB85A" stroke={OL} strokeWidth={W} />
        <path d="M 1520 900 L 1600 1300 L 1700 1300 L 1560 920 Z" fill="#8A6A4A" stroke={OL} strokeWidth={W} />
        <Palm x={120} y={860} s={1.1} t={c.t} lean={1} />
        {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M ${rnd(i, 4) * 1400} ${860 + rnd(i, 5) * 160} l 8 -24 l 8 24`} stroke="#3F9A4A" strokeWidth={4} fill="none" />)}
      </g>
    ),
    place: floorPlace(600, 1380, 960),
    surface: flat(600, 1380, 950),
    floor: flat(600, 1380, 960),
    wide: () => [960, 560, 1],
    rim: 'popRimWarm',
    mediumUp: 110,
  },
  plane: {
    label: 'Trong may bay (Pop)',
    hint: 'Khoang may bay, cua so tron, ghe ngoi. Hieu ung rieng > 0.5 = nhieu dong: den do, mat na oxy roi xuong.',
    actors: true,
    back: (c) => {
      const alarm = c.fx > 0.5;
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill="#E9EDF5" />
          <path d="M -400 120 Q 960 30 2320 120 L 2320 -200 L -400 -200 Z" fill="#D6DCEA" stroke={OL} strokeWidth={W} />
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const x = -40 + i * 360;
            const cid = `${c.id}pw${i}`;
            return (
              <g key={i}>
                <defs>
                  <clipPath id={cid}>
                    <rect x={x} y={250} width={120} height={170} rx={56} />
                  </clipPath>
                </defs>
                <g clipPath={`url(#${cid})`}>
                  <Sky c={c} x0={x} y0={250} w={120} h={170} />
                  <rect x={x} y={250 + (alarm ? 60 + Math.sin(c.t * 0.3) * 40 : 110)} width={120} height={200} fill="#FFFFFF" opacity={0.7} />
                </g>
                <rect x={x} y={250} width={120} height={170} rx={56} fill="none" stroke="#C9CEDA" strokeWidth={14} />
                <rect x={x - 7} y={243} width={134} height={184} rx={62} fill="none" stroke={OL} strokeWidth={W} />
              </g>
            );
          })}
          <rect x={-400} y={150} width={2720} height={50} fill="#C9CEDA" stroke={OL} strokeWidth={W} />
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i} transform={`translate(${60 + i * 420} 0)`}>
              <rect x={0} y={520} width={150} height={300} rx={30} fill="#3D6FD9" stroke={OL} strokeWidth={W} />
              <rect x={-10} y={760} width={280} height={60} rx={20} fill="#3D6FD9" stroke={OL} strokeWidth={W} />
              <rect x={0} y={520} width={150} height={50} rx={22} fill="#FFFFFF" opacity={0.8} />
            </g>
          ))}
          <rect x={-400} y={850} width={2720} height={400} fill="#8A93A8" />
          <path d="M -400 850 L 2320 850" stroke={OL} strokeWidth={W} />
          {alarm ? (
            <g>
              {[260, 680, 1100, 1520].map((x, i) => {
                const drop = clamp((c.t - i * 3) / 10) * 180;
                return (
                  <g key={x}>
                    <path d={`M ${x} 200 L ${x} ${200 + drop}`} stroke="#F4F7FF" strokeWidth={3} />
                    <path d={`M ${x - 22} ${200 + drop} q 22 30 44 0 Z`} fill="#FFD23F" stroke={OL} strokeWidth={3} />
                  </g>
                );
              })}
              {Math.floor(c.t / 8) % 2 ? <rect x={-400} y={-200} width={2720} height={1500} fill="#FF3B3B" opacity={0.16} /> : null}
            </g>
          ) : null}
        </g>
      );
    },
    place: floorPlace(560, 1360, 975),
    seat: (u) => {
      const xs = [190, 610, 1030, 1450];
      return { x: xs[Math.min(3, Math.floor(u * 4))], y: 770 - 70 * PS - 4, scale: PS };
    },
    surface: flat(560, 1360, 960),
    floor: flat(560, 1360, 975),
    wide: () => [960, 560, 1],
    rim: 'popRim',
    mediumUp: 110,
  },
};

// ------------------------------------------------------------------ cac boi canh
export const POP_STAGES: Record<string, StageDef> = {
  street: {
    label: 'Duong pho (Pop)',
    hint: 'Via he truoc day cua hang, xe chay ngang phia sau. tod = gio trong ngay.',
    actors: true,
    back: (c) => {
      const night = todOf(c) === 'night';
      const shops = [
        { x: -560, w: 440, col: '#5ED3A8', sign: 'BAKERY' },
        { x: -120, w: 420, col: '#FF8A65', sign: 'CAFE' },
        { x: 300, w: 380, col: '#6FA8FF', sign: 'BOOKS' },
        { x: 680, w: 460, col: '#FFD15C', sign: 'PIZZA' },
        { x: 1140, w: 400, col: '#B98CFF', sign: 'GAMES' },
        { x: 1540, w: 520, col: '#5ED3A8', sign: 'MART' },
        { x: 2060, w: 460, col: '#FF8A65', sign: 'BANK' },
      ];
      return (
        <g>
          <Sky c={c} horizon={700} />
          {shops.map((s, i) => (
            <g key={i}>
              <B x={s.x} y={210 + (i % 2) * 40} width={s.w} height={560} fill={s.col} />
              <B x={s.x + 30} y={300 + (i % 2) * 40} width={s.w - 60} height={60} fill="#FFFFFF" rx={10} />
              <text x={s.x + s.w / 2} y={345 + (i % 2) * 40} textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif" fontWeight={800} fontSize={40} fill={OL}>{s.sign}</text>
              <B x={s.x + 40} y={420} width={s.w * 0.55} height={240} fill={night ? '#FFE38A' : '#CFEFFF'} />
              <B x={s.x + s.w * 0.62} y={460} width={s.w * 0.28} height={310} fill="#7A5A48" />
              <Pth d={`M ${s.x + 20} 410 L ${s.x + s.w - 20} 410 L ${s.x + s.w} 380 L ${s.x} 380 Z`} fill={i % 2 ? '#FFFFFF' : '#E8453C'} />
            </g>
          ))}
          <rect x={-400} y={770} width={2720} height={60} fill="#C9CEDA" stroke={OL} strokeWidth={W} />
          <rect x={-400} y={830} width={2720} height={400} fill="#8C93A8" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x={i * 380 - 100} y={846} width={200} height={14} rx={7} fill="#FFFFFF" opacity={0.7} />
          ))}
          {/* xe chay ngang */}
          {(() => {
            const x = ((c.t * 22) % 3400) - 900;
            return (
              <g transform={`translate(${x} 0)`}>
                <Pth d="M 0 820 L 0 760 Q 10 700 80 690 L 150 640 L 330 640 L 400 700 Q 460 708 460 760 L 460 820 Z" fill="#E8453C" />
                <B x={170} y={655} width={70} height={45} fill="#CFEFFF" />
                <B x={255} y={655} width={70} height={45} fill="#CFEFFF" />
                <circle cx={100} cy={825} r={36} fill={OL} />
                <circle cx={360} cy={825} r={36} fill={OL} />
                <circle cx={100} cy={825} r={14} fill="#C9CEDA" />
                <circle cx={360} cy={825} r={14} fill="#C9CEDA" />
              </g>
            );
          })()}
          <rect x={-400} y={880} width={2720} height={300} fill="#D9DDE8" stroke={OL} strokeWidth={W} />
          {night ? [200, 1000, 1800].map((x) => <g key={x}><rect x={x - 6} y={420} width={12} height={470} fill="#3A3F5C" /><circle cx={x} cy={415} r={22} fill="#FFE38A" /><circle cx={x} cy={415} r={90} fill="#FFE38A" opacity={0.2} /></g>) : null}
        </g>
      );
    },
    place: floorPlace(560, 1360, 990),
    surface: flat(600, 1320, 960),
    floor: flat(600, 1320, 975),
    wide: () => [960, 560, 1],
    rim: 'popRim',
    mediumUp: 110,
  },
  park: {
    seat: seatAt(400, 600, 770),
    label: 'Cong vien (Pop)',
    hint: 'Co xanh, cay, ghe da, chim bay. tod = gio trong ngay.',
    actors: true,
    back: (c) => (
      <g>
        <Sky c={c} horizon={640} />
        <path d="M -400 640 Q 300 560 900 620 Q 1500 680 2320 590 L 2320 1200 L -400 1200 Z" fill="#7ED67A" stroke={OL} strokeWidth={W} />
        <Tree x={180} y={720} s={1.1} t={c.t} />
        <Tree x={1640} y={700} s={1.25} t={c.t} c="#3FB565" />
        <Tree x={1180} y={640} s={0.7} t={c.t} c="#5ACB72" />
        <rect x={-400} y={800} width={2720} height={400} fill="#6CC96A" />
        <path d="M 700 1200 Q 860 900 980 800 L 1120 800 Q 1180 900 1500 1200 Z" fill="#F2D8A8" stroke={OL} strokeWidth={W} />
        {/* ghe da */}
        <g transform="translate(330 770)">
          <B x={0} y={0} width={340} height={26} fill="#C77B4A" rx={6} />
          <B x={0} y={-70} width={340} height={22} fill="#C77B4A" rx={6} />
          <B x={0} y={-36} width={340} height={22} fill="#C77B4A" rx={6} />
          <B x={20} y={26} width={18} height={70} fill="#3A3F5C" />
          <B x={300} y={26} width={18} height={70} fill="#3A3F5C" />
        </g>
        {[0, 1, 2].map((i) => {
          const x = ((c.t * (5 + i) + i * 600) % 2400) - 200;
          const y = 220 + i * 60 + Math.sin(c.t * 0.1 + i) * 20;
          const w = Math.sin(c.t * 0.6 + i) * 14;
          return <path key={i} d={`M ${x - 22} ${y - w} Q ${x - 10} ${y - 8} ${x} ${y} Q ${x + 10} ${y - 8} ${x + 22} ${y - w}`} stroke={OL} strokeWidth={4} fill="none" strokeLinecap="round" />;
        })}
        {Array.from({ length: 30 }, (_, i) => <circle key={i} cx={rnd(i, 9) * 1920} cy={820 + rnd(i, 4) * 220} r={5} fill={['#FF8FB8', '#FFE066', '#FFFFFF'][i % 3]} />)}
      </g>
    ),
    place: floorPlace(620, 1400, 980),
    surface: flat(380, 640, 770),
    floor: flat(640, 1360, 980),
    wide: () => [960, 560, 1],
    rim: 'popRim',
    mediumUp: 110,
  },
  office: {
    label: 'Van phong (Pop)',
    hint: 'Ban lam viec voi may tinh o ben trai, cua so thanh pho. Nhan vat dung giua phong.',
    actors: true,
    back: (c) => (
      <g>
        <Wall c={c} col="#DDE6F5" floor="#B9A58E" fy={850} />
        <Win c={c} x={1180} y={150} w={560} h={420} />
        <B x={120} y={170} width={360} height={220} fill="#FFFFFF" rx={8} />
        <path d="M 160 340 L 220 290 L 280 320 L 360 240 L 440 260" stroke="#E8453C" strokeWidth={8} fill="none" strokeLinecap="round" />
        <path d="M 160 350 L 440 350" stroke={OL} strokeWidth={4} />
        <Plant x={1820} y={850} s={1.2} />
        {/* ban + man hinh */}
        <B x={60} y={640} width={560} height={30} fill="#F2F2F7" rx={6} />
        <B x={90} y={670} width={24} height={180} fill="#5A6078" />
        <B x={560} y={670} width={24} height={180} fill="#5A6078" />
        <B x={200} y={470} width={260} height={160} fill="#2E3346" rx={10} />
        <rect x={214} y={484} width={232} height={132} fill={todOf(c) === 'night' ? '#6FD3FF' : '#9FE3FF'} />
        {[0, 1, 2, 3].map((i) => <rect key={i} x={230} y={500 + i * 26} width={80 + rnd(i, 3) * 120} height={10} rx={5} fill="#FFFFFF" opacity={0.8} />)}
        <B x={310} y={630} width={40} height={14} fill="#5A6078" />
        <B x={480} y={600} width={46} height={40} fill="#FF8A65" rx={8} />
      </g>
    ),
    place: floorPlace(760, 1500, 960),
    surface: flat(180, 560, 640),
    floor: flat(760, 1500, 960),
    wide: () => [960, 560, 1],
    rim: 'popRim',
    mediumUp: 110,
  },
  gym: {
    label: 'Phong gym (Pop)',
    hint: 'May chay bo ben phai (bang chuyen chay), gian ta, guong. fx2 > 0.5 = may chay nhanh.',
    actors: true,
    back: (c) => (
      <g>
        <Wall c={c} col="#8C7BEA" floor="#3A3F5C" fy={840} trim="#FFD15C" />
        <B x={140} y={150} width={720} height={360} fill="#CFE7FF" opacity={0.9} />
        <path d="M 200 480 L 340 180 M 380 480 L 520 180" stroke="#FFFFFF" strokeWidth={14} opacity={0.6} />
        <text x={1500} y={260} textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif" fontWeight={800} fontSize={110} fill="#FFFFFF" opacity={0.9}>NO PAIN</text>
        <text x={1500} y={380} textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif" fontWeight={800} fontSize={110} fill="#FFD15C">NO GAIN</text>
        {/* gian ta */}
        <B x={60} y={560} width={420} height={20} fill="#5A6078" />
        <B x={60} y={680} width={420} height={20} fill="#5A6078" />
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <B x={80 + i * 80} y={520} width={22} height={44} fill="#2E3346" rx={4} />
            <B x={130 + i * 80 - 30} y={532} width={34} height={20} fill="#C9CEDA" rx={4} />
            <circle cx={100 + i * 80} cy={650} r={30} fill="#2E3346" stroke={OL} strokeWidth={W} />
          </g>
        ))}
        <B x={70} y={700} width={20} height={140} fill="#5A6078" />
        <B x={450} y={700} width={20} height={140} fill="#5A6078" />
      </g>
    ),
    front: (c) => {
      const sp = 1 + 3 * c.fx;
      return (
        <g>
          {/* may chay bo */}
          <Pth d="M 1320 950 L 1880 950 L 1900 900 L 1340 900 Z" fill="#2E3346" />
          {Array.from({ length: 12 }, (_, i) => {
            const x = 1350 + (((i * 50 - c.t * 9 * sp) % 600) + 600) % 600;
            return x < 1890 ? <path key={i} d={`M ${x} 905 L ${x - 6} 945`} stroke="#5A6078" strokeWidth={4} /> : null;
          })}
          <Pth d="M 1840 900 L 1880 620 L 1910 620 L 1880 900 Z" fill="#5A6078" />
          <B x={1760} y={590} width={170} height={60} fill="#2E3346" rx={12} />
          <rect x={1778} y={604} width={90} height={30} rx={6} fill="#6FFFB0" />
          <text x={1823} y={628} textAnchor="middle" fontFamily="Fragment Mono, monospace" fontSize={22} fill={OL}>{(8 * sp).toFixed(1)}</text>
        </g>
      );
    },
    place: (u) => (u > 0.62 ? { x: lerp(1500, 1700, (u - 0.62) / 0.38), y: 905 - 140 * PS, scale: PS } : floorPlace(620, 1180, 950)(u / 0.62)),
    surface: flat(620, 1200, 940),
    floor: flat(620, 1200, 950),
    wide: () => [960, 560, 1],
    rim: 'popRim',
    shadow: 0.5,
    mediumUp: 110,
  },
  market: {
    label: 'Sieu thi (Pop)',
    hint: 'Day ke hang hai ben, xe day hang. Do vat dat tren xe day.',
    actors: true,
    back: (c) => (
      <g>
        <Wall c={c} col="#FFF1D6" floor="#E6E9F2" fy={830} trim="#5ED3A8" />
        {[0, 1].map((side) => (
          <g key={side} transform={`translate(${side ? 1240 : 40} 0)`}>
            <B x={0} y={200} width={640} height={630} fill="#F7F7FB" />
            {[0, 1, 2, 3].map((r) => (
              <g key={r}>
                <B x={10} y={330 + r * 125} width={620} height={16} fill="#C9CEDA" />
                {Array.from({ length: 9 }, (_, i) => (
                  <B key={i} x={24 + i * 68} y={262 + r * 125 + (i % 3) * 4} width={52} height={66 - (i % 3) * 4} rx={6} fill={['#FF6F61', '#FFD15C', '#6FA8FF', '#5ED3A8', '#B98CFF'][(i + r + side) % 5]} />
                ))}
              </g>
            ))}
            <B x={120} y={130} width={400} height={56} rx={12} fill="#E8453C" />
            <text x={320} y={172} textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif" fontWeight={800} fontSize={36} fill="#FFFFFF">{side ? 'SNACKS' : 'FRESH'}</text>
          </g>
        ))}
        {[0, 1, 2].map((i) => <rect key={i} x={760 + i * 140} y={40} width={90} height={24} rx={8} fill="#FFFFFF" opacity={0.9} />)}
      </g>
    ),
    front: () => (
      <g transform="translate(1180 720)">
        <Pth d="M 0 0 L 300 0 L 270 150 L 30 150 Z" fill="#C9CEDA" opacity={0.95} />
        {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M ${40 + i * 55} 6 L ${50 + i * 45} 146`} stroke={OL} strokeWidth={3} />)}
        <Pth d="M 300 0 L 360 -60" fill="none" strokeWidth={8} />
        <circle cx={60} cy={185} r={22} fill={OL} />
        <circle cx={250} cy={185} r={22} fill={OL} />
      </g>
    ),
    place: floorPlace(700, 1100, 960),
    surface: flat(1220, 1420, 726),
    floor: flat(700, 1100, 960),
    wide: () => [960, 560, 1],
    rim: 'popRim',
    mediumUp: 110,
  },
  hospital: {
    seat: seatAt(320, 680, 615),
    label: 'Benh vien (Pop)',
    hint: 'Giuong benh ben trai, man hinh nhip tim, rem xanh. fx2 > 0.5 = nhip tim nhanh/bao dong.',
    actors: true,
    back: (c) => {
      const alarm = c.fx > 0.5;
      return (
        <g>
          <Wall c={c} col="#D6F2EE" floor="#C9D6E8" fy={840} />
          <Win c={c} x={760} y={170} w={420} h={340} />
          <path d="M 1300 120 Q 1340 480 1300 840 L 1500 840 Q 1460 480 1500 120 Z" fill="#7FCFE0" stroke={OL} strokeWidth={W} />
          <path d="M 1360 140 L 1360 830 M 1430 140 L 1430 830" stroke="#5AB2C8" strokeWidth={6} />
          <B x={1290} y={110} width={600} height={14} fill="#C9CEDA" />
          {/* man hinh nhip tim */}
          <B x={120} y={240} width={280} height={190} rx={14} fill="#2E3346" />
          <rect x={140} y={260} width={240} height={150} fill="#0E1A24" />
          <path
            d={Array.from({ length: 24 }, (_, i) => {
              const x = 140 + i * 10;
              const ph = (i + Math.floor(c.t * (alarm ? 1.4 : 0.6))) % 12;
              const y = ph === 5 ? 290 : ph === 6 ? 380 : ph === 7 ? 320 : 335;
              return `${i ? 'L' : 'M'} ${x} ${y}`;
            }).join(' ')}
            stroke={alarm ? '#FF4D4D' : '#6FFFB0'}
            strokeWidth={5}
            fill="none"
          />
          {alarm && Math.floor(c.t / 6) % 2 ? <rect x={-400} y={-200} width={2720} height={1500} fill="#FF4D4D" opacity={0.12} /> : null}
          {/* giuong */}
          <B x={80} y={620} width={640} height={60} rx={14} fill="#FFFFFF" />
          <B x={80} y={560} width={150} height={70} rx={30} fill="#FFFFFF" />
          <B x={300} y={600} width={420} height={40} rx={14} fill="#7FB6F0" />
          <B x={60} y={520} width={24} height={330} fill="#9AA3BC" />
          <B x={716} y={600} width={24} height={250} fill="#9AA3BC" />
        </g>
      );
    },
    place: floorPlace(860, 1600, 960),
    surface: flat(300, 680, 600),
    floor: flat(860, 1600, 960),
    wide: () => [960, 560, 1],
    rim: 'popRim',
    mediumUp: 110,
  },
  bus: {
    seat: (u) => { const xs = [180, 820, 1460]; return { x: xs[Math.min(2, Math.floor(u * 3))], y: 742 - 70 * PS - 4, scale: PS }; },
    label: 'Tren xe buyt (Pop)',
    hint: 'Ben trong xe buyt, canh ngoai cua so troi qua. Nhan vat dung vin tay.',
    actors: true,
    back: (c) => {
      const off = (c.t * 18) % 1920;
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1400} fill="#FFD15C" />
          <defs>
            <clipPath id={`${c.id}bw`}>
              <rect x={-400} y={180} width={2720} height={330} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${c.id}bw)`}>
            <Sky c={c} y0={180} h={330} />
            <g transform={`translate(${-off} 0)`}>
              {[0, 1].map((rep) =>
                Array.from({ length: 10 }, (_, i) => (
                  <g key={`${rep}${i}`} transform={`translate(${rep * 1920 + i * 192} 0)`}>
                    <B x={0} y={330 + rnd(i, 2) * 80} width={150} height={260} fill={['#6FA8FF', '#FF8A65', '#B98CFF', '#5ED3A8'][i % 4]} />
                    <Tree x={170} y={520} s={0.45} t={c.t} />
                  </g>
                )),
              )}
            </g>
          </g>
          {[0, 1, 2, 3, 4].map((i) => <B key={i} x={-120 + i * 460} y={170} width={36} height={350} fill="#FFD15C" />)}
          <B x={-400} y={160} width={2720} height={20} fill="#E8B23C" />
          <B x={-400} y={510} width={2720} height={30} fill="#E8B23C" />
          {/* thanh vin */}
          <rect x={-400} y={90} width={2720} height={16} rx={8} fill="#C9CEDA" stroke={OL} strokeWidth={W} />
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const sw = Math.sin(c.t * 0.12 + i) * 4;
            return (
              <g key={i} transform={`rotate(${sw} ${200 + i * 320} 100)`}>
                <path d={`M ${200 + i * 320} 100 L ${200 + i * 320} 200`} stroke={OL} strokeWidth={6} />
                <circle cx={200 + i * 320} cy={222} r={24} fill="none" stroke={OL} strokeWidth={9} />
              </g>
            );
          })}
          {/* ghe */}
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${60 + i * 640} 0)`}>
              <B x={0} y={560} width={110} height={220} rx={20} fill="#3D6FD9" />
              <B x={0} y={740} width={260} height={50} rx={16} fill="#3D6FD9" />
            </g>
          ))}
          <rect x={-400} y={850} width={2720} height={400} fill="#6A6F88" />
          <path d="M -400 850 L 2320 850" stroke={OL} strokeWidth={W} />
        </g>
      );
    },
    place: (u) => {
      const p = floorPlace(500, 1450, 975)(u);
      return p;
    },
    surface: flat(400, 1500, 790),
    floor: flat(500, 1450, 975),
    wide: () => [960, 560, 1],
    rim: 'popRim',
    mediumUp: 110,
  },
  planet: {
    label: 'Hanh tinh la (Pop)',
    hint: 'Hanh tinh tim-xanh ngoc, cay tron, mai vom, ten lua. Da troi lo lung.',
    actors: true,
    back: (c) => (
      <g>
        <defs>
          <linearGradient id={`${c.id}pl`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3A1E6E" />
            <stop offset="0.6" stopColor="#C46BD8" />
            <stop offset="1" stopColor="#F6B6E8" />
          </linearGradient>
        </defs>
        <rect x={-400} y={-200} width={2720} height={1000} fill={`url(#${c.id}pl)`} />
        <circle cx={1500} cy={210} r={130} fill="#FFB86B" stroke={OL} strokeWidth={W} />
        <ellipse cx={1500} cy={210} rx={220} ry={34} fill="none" stroke="#FFE3B8" strokeWidth={12} transform="rotate(-14 1500 210)" />
        <circle cx={360} cy={150} r={40} fill="#9BF6FF" stroke={OL} strokeWidth={W} />
        {Array.from({ length: 30 }, (_, i) => <circle key={i} cx={rnd(i, 1) * 1920} cy={rnd(i, 2) * 400} r={2 + rnd(i, 3) * 2} fill="#FFFFFF" opacity={0.7} />)}
        {[0, 1, 2].map((i) => (
          <ellipse key={i} cx={300 + i * 650} cy={360 + i * 40 + Math.sin(c.t * 0.07 + i) * 18} rx={60} ry={36} fill="#8A64C8" stroke={OL} strokeWidth={W} />
        ))}
        <path d="M -400 700 Q 400 640 1000 690 Q 1600 740 2320 660 L 2320 1300 L -400 1300 Z" fill="#7FE6D2" stroke={OL} strokeWidth={W} />
        {[[160, 700, 1], [520, 680, 0.8], [1720, 690, 1.1], [1380, 670, 0.7]].map(([x, y, s], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            <path d="M -6 0 L -4 -260 L 6 -260 L 8 0 Z" fill={OL} />
            {[0, 1, 2].map((k) => <ellipse key={k} cx={0} cy={-270 - k * 60} rx={70 - k * 12} ry={42} fill={['#5AA9FF', '#7FC4FF', '#A8DBFF'][k]} stroke={OL} strokeWidth={W} />)}
          </g>
        ))}
        <path d="M 1000 830 Q 1000 620 1240 620 Q 1480 620 1480 830 Z" fill="#F4F0FF" stroke={OL} strokeWidth={W} />
        <path d="M 1100 700 L 1420 700" stroke="#C9C2E8" strokeWidth={8} />
        <g transform="translate(1600 520)">
          <Pth d="M 0 300 L 0 60 Q 40 -40 80 60 L 80 300 Z" fill="#FFFFFF" />
          <Pth d="M 0 230 L -40 300 L 0 300 Z M 80 230 L 120 300 L 80 300 Z" fill="#E8453C" />
          <circle cx={40} cy={120} r={20} fill="#9BF6FF" stroke={OL} strokeWidth={W} />
        </g>
        {Array.from({ length: 16 }, (_, i) => <path key={i} d={`M ${rnd(i, 7) * 1920} ${860 + rnd(i, 8) * 200} l 10 -36 l 10 36 Z`} fill="#B6FFF0" stroke={OL} strokeWidth={3} />)}
        <path d="M -400 840 L 2320 840" stroke="none" />
      </g>
    ),
    place: floorPlace(560, 1300, 975),
    surface: flat(560, 1300, 960),
    floor: flat(560, 1300, 975),
    wide: () => [960, 560, 1],
    rim: 'popRim',
    mediumUp: 110,
  },
  living: {
    seat: seatAt(720, 1200, 660),
    label: 'Phong khach (Pop)',
    hint: 'Sofa, TV, den cay, tranh. Do vat dat tren ban tra phia truoc sofa.',
    actors: true,
    back: (c) => (
      <g>
        <Wall c={c} col="#FFE2C8" floor="#C98C5A" fy={830} />
        <Win c={c} x={120} y={160} w={380} h={360} />
        <B x={720} y={200} width={300} height={200} fill="#5ED3A8" />
        <circle cx={800} cy={280} r={40} fill="#FFD15C" />
        <path d="M 730 390 L 840 300 L 920 360 L 1010 290 L 1010 390 Z" fill="#3FA77F" />
        {/* den cay */}
        <B x={1840} y={380} width={10} height={450} fill="#3A3F5C" />
        <Pth d="M 1790 380 L 1900 380 L 1870 290 L 1820 290 Z" fill="#FFD15C" />
        {todOf(c) === 'night' ? <circle cx={1845} cy={380} r={140} fill="#FFE38A" opacity={0.25} /> : null}
        {/* sofa */}
        <B x={600} y={560} width={720} height={160} rx={40} fill="#E86A8E" />
        <B x={560} y={640} width={800} height={130} rx={30} fill="#F07BA0" />
        <B x={540} y={600} width={90} height={190} rx={34} fill="#E86A8E" />
        <B x={1290} y={600} width={90} height={190} rx={34} fill="#E86A8E" />
        <B x={600} y={780} width={20} height={50} fill="#5A3A2A" />
        <B x={1300} y={780} width={20} height={50} fill="#5A3A2A" />
        <B x={1500} y={560} width={260} height={170} rx={10} fill="#2E3346" />
        <rect x={1514} y={574} width={232} height={142} fill={todOf(c) === 'night' ? '#7FD3FF' : '#5A6078'} />
        <B x={1480} y={730} width={300} height={100} fill="#8A5A3C" />
      </g>
    ),
    front: () => (
      <g>
        <B x={820} y={880} width={360} height={26} rx={10} fill="#8A5A3C" />
        <B x={850} y={906} width={18} height={70} fill="#5A3A2A" />
        <B x={1132} y={906} width={18} height={70} fill="#5A3A2A" />
      </g>
    ),
    place: floorPlace(560, 1440, 940),
    surface: flat(870, 1130, 880),
    floor: flat(560, 1440, 950),
    wide: () => [960, 560, 1],
    rim: 'popRim',
    mediumUp: 110,
  },
  diner: {
    seat: (u) => ({ x: u < 0.5 ? 470 : 1450, y: 860 - 70 * PS, scale: PS }),
    label: 'Nha hang (Pop)',
    hint: 'Ban an co nen va khan trai ban; nhan vat dung hai ben ban. Do vat dat tren ban.',
    actors: true,
    back: (c) => (
      <g>
        <Wall c={c} col="#7A2E3A" floor="#3A2430" fy={820} trim="#E8B23C" />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <path d={`M ${360 + i * 600} 0 L ${360 + i * 600} 160`} stroke={OL} strokeWidth={4} />
            <Pth d={`M ${310 + i * 600} 200 L ${410 + i * 600} 200 L ${390 + i * 600} 160 L ${330 + i * 600} 160 Z`} fill="#E8B23C" />
            <circle cx={360 + i * 600} cy={220} r={160} fill="#FFD27A" opacity={0.18} />
          </g>
        ))}
        {[0, 1].map((i) => (
          <g key={i}>
            <B x={170 + i * 1300} y={300} width={280} height={200} fill="#E8B23C" />
            <rect x={190 + i * 1300} y={320} width={240} height={160} fill="#3A1E2A" />
            <circle cx={310 + i * 1300} cy={400} r={50} fill="#C46B4A" />
          </g>
        ))}
      </g>
    ),
    front: (c) => (
      <g>
        <Pth d="M 600 760 L 1320 760 L 1360 830 L 560 830 Z" fill="#FFFFFF" />
        <path d="M 760 760 L 740 830 M 1160 760 L 1180 830" stroke="#E8453C" strokeWidth={6} />
        <B x={580} y={830} width={760} height={40} fill="#F2EEE6" />
        <B x={900} y={870} width={120} height={140} fill="#5A3A2A" />
        {[860, 1060].map((x) => (
          <g key={x}>
            <B x={x - 8} y={690} width={16} height={70} fill="#FFF6E0" />
            <path d={`M ${x} 690 q -10 -18 0 -34 q 10 16 0 34 Z`} fill="#FFB84D" opacity={0.85 + 0.15 * Math.sin(c.t * 0.8 + x)} />
            <circle cx={x} cy={670} r={40} fill="#FFD27A" opacity={0.2} />
          </g>
        ))}
      </g>
    ),
    place: (u) => {
      const x = u < 0.5 ? lerp(380, 560, u * 2) : lerp(1360, 1540, (u - 0.5) * 2);
      return { x, y: 960 - 140 * PS, scale: PS };
    },
    surface: flat(760, 1160, 762),
    floor: flat(400, 1500, 940),
    wide: () => [960, 560, 1],
    rim: 'popRimWarm',
    mediumUp: 110,
  },
  classroom2: {
    label: 'Lop hoc sang (Pop)',
    hint: 'Lop hoc ban ngay, bang xanh (board = chu tren bang). Nhan vat dung truoc bang.',
    actors: true,
    back: (c) => (
      <g>
        <Wall c={c} col="#FFEFB8" floor="#D9A46C" fy={840} />
        <B x={420} y={170} width={900} height={420} rx={10} fill="#2F6B55" />
        <rect x={436} y={186} width={868} height={388} fill="none" stroke="#C98C5A" strokeWidth={12} />
        {(c.shot.board ?? '').split('\n').slice(0, 3).map((ln, i, all) => (
          <text key={i} x={870} y={400 - (all.length - 1) * 50 + i * 100} textAnchor="middle" fontFamily="Kalam, cursive" fontSize={all.length > 1 ? 80 : 100} fill="#F2F2E8">{ln}</text>
        ))}
        <Win c={c} x={1480} y={170} w={320} h={360} />
        <circle cx={240} cy={260} r={70} fill="#FFFFFF" stroke={OL} strokeWidth={W} />
        <path d={`M 240 260 L 240 214 M 240 260 L ${240 + 34 * Math.cos(c.t * 0.05)} ${260 + 34 * Math.sin(c.t * 0.05)}`} stroke={OL} strokeWidth={6} strokeLinecap="round" />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <B x={140 + i * 640} y={700} width={280} height={24} fill="#F2C47A" />
            <B x={160 + i * 640} y={724} width={16} height={116} fill="#5A6078" />
            <B x={384 + i * 640} y={724} width={16} height={116} fill="#5A6078" />
          </g>
        ))}
      </g>
    ),
    place: floorPlace(560, 1400, 960),
    surface: flat(200, 1600, 700),
    floor: flat(560, 1400, 960),
    wide: () => [960, 560, 1],
    rim: 'popRim',
    mediumUp: 110,
  },
  bedroom2: {
    seat: seatAt(320, 680, 690),
    label: 'Phong ngu (Pop)',
    hint: 'Giuong, ban hoc nho, poster. Nhan vat dung canh giuong.',
    actors: true,
    back: (c) => (
      <g>
        <Wall c={c} col="#BFD8FF" floor="#8A6A9A" fy={840} />
        <Win c={c} x={760} y={170} w={360} h={330} />
        <B x={180} y={180} width={180} height={240} fill="#FF8A65" />
        <path d="M 210 380 L 270 230 L 330 380 Z" fill="#FFD15C" stroke={OL} strokeWidth={3} />
        <B x={1500} y={200} width={150} height={150} fill="#B98CFF" />
        <circle cx={1575} cy={275} r={44} fill="#FFFFFF" stroke={OL} strokeWidth={3} />
        {/* giuong */}
        <B x={60} y={600} width={40} height={250} fill="#8A5A3C" />
        <B x={80} y={680} width={640} height={110} rx={16} fill="#FFFFFF" />
        <B x={110} y={640} width={160} height={70} rx={30} fill="#FFFFFF" />
        <B x={280} y={660} width={440} height={90} rx={20} fill="#6FA8FF" />
        <B x={80} y={790} width={640} height={30} fill="#8A5A3C" />
        {/* ban nho */}
        <B x={1360} y={640} width={420} height={26} fill="#C98C5A" />
        <B x={1380} y={666} width={20} height={174} fill="#8A5A3C" />
        <B x={1740} y={666} width={20} height={174} fill="#8A5A3C" />
        <Pth d="M 1660 640 L 1700 520 L 1740 520" fill="none" strokeWidth={8} />
        <Pth d="M 1700 520 L 1760 500 L 1780 540 L 1720 556 Z" fill="#FFD15C" />
        {todOf(c) === 'night' ? <circle cx={1740} cy={560} r={160} fill="#FFE38A" opacity={0.22} /> : null}
      </g>
    ),
    place: floorPlace(820, 1300, 960),
    surface: flat(1400, 1720, 640),
    floor: flat(820, 1300, 960),
    wide: () => [960, 560, 1],
    rim: 'popRim',
    mediumUp: 110,
  },
  kitchen2: {
    label: 'Nha bep sang (Pop)',
    hint: 'Tu lanh, bep, quay bep; do vat tren quay. Nhan vat dung truoc quay.',
    actors: true,
    back: (c) => (
      <g>
        <Wall c={c} col="#C9F0E0" floor="#F2E2C4" fy={840} />
        {Array.from({ length: 30 }, (_, i) => <rect key={i} x={-200 + (i % 15) * 160} y={850 + Math.floor(i / 15) * 120} width={150} height={110} fill={(i + Math.floor(i / 15)) % 2 ? '#EAD3AE' : '#F2E2C4'} />)}
        <Win c={c} x={760} y={150} w={400} h={300} />
        {/* tu bep tren */}
        {[0, 1, 2].map((i) => <B key={i} x={160 + i * 170} y={150} width={160} height={190} rx={8} fill="#FF9F68" />)}
        {[0, 1].map((i) => <B key={i} x={1260 + i * 170} y={150} width={160} height={190} rx={8} fill="#FF9F68" />)}
        {/* tu lanh */}
        <B x={1660} y={260} width={220} height={580} rx={18} fill="#F4F7FF" />
        <path d="M 1660 470 L 1880 470" stroke={OL} strokeWidth={W} />
        <B x={1690} y={380} width={14} height={70} rx={7} fill="#9AA3BC" />
        <B x={1690} y={500} width={14} height={90} rx={7} fill="#9AA3BC" />
        <rect x={1760} y={520} width={60} height={46} rx={6} fill="#FFD15C" opacity={0.9} />
        {/* quay + bep */}
        <B x={100} y={560} width={1520} height={34} fill="#FFFFFF" />
        <B x={120} y={594} width={1480} height={246} fill="#5AA9C8" />
        {[0, 1, 2, 3].map((i) => <B key={i} x={150 + i * 370} y={620} width={340} height={190} rx={8} fill="#6FBCD8" />)}
        {[0, 1, 2, 3].map((i) => <B key={i} x={300 + i * 370} y={700} width={40} height={10} rx={5} fill="#F4F7FF" />)}
        <B x={1180} y={540} width={260} height={24} rx={6} fill="#3A3F5C" />
        <circle cx={1250} cy={540} r={30} fill="#3A3F5C" />
        <B x={1230} y={470} width={120} height={70} rx={14} fill="#E8453C" />
        {[0, 1, 2].map((i) => {
          const y = 450 - ((c.t * 1.2 + i * 20) % 60);
          return <path key={i} d={`M ${1260 + i * 30} ${y} q -10 -15 0 -30`} stroke="#FFFFFF" strokeWidth={6} fill="none" opacity={0.7} strokeLinecap="round" />;
        })}
      </g>
    ),
    place: floorPlace(560, 1500, 975),
    surface: flat(200, 1100, 560),
    floor: flat(560, 1500, 975),
    wide: () => [960, 560, 1],
    rim: 'popRim',
    mediumUp: 110,
  },
  burst: {
    label: 'Nen hieu ung (Pop)',
    hint: 'Nen tia sang kieu truyen tranh cho canh phan ung can mat. fx2 = toc do xoay.',
    actors: true,
    back: (c) => {
      const tod = todOf(c);
      const cols = tod === 'night' ? ['#2A2F66', '#3D3F86'] : tod === 'sunset' ? ['#FF8A65', '#FFB86B'] : ['#FFD15C', '#FFE38A'];
      const rot = c.t * (0.3 + c.fx * 2);
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill={cols[0]} />
          <g transform={`translate(960 520) rotate(${rot})`}>
            {Array.from({ length: 18 }, (_, i) => {
              const a = (i / 18) * Math.PI * 2;
              const b = a + Math.PI / 18;
              return <path key={i} d={`M 0 0 L ${Math.cos(a) * 2000} ${Math.sin(a) * 2000} L ${Math.cos(b) * 2000} ${Math.sin(b) * 2000} Z`} fill={cols[1]} />;
            })}
          </g>
          <circle cx={960} cy={520} r={300} fill="#FFFFFF" opacity={0.25} />
        </g>
      );
    },
    place: floorPlace(640, 1280, 980),
    surface: flat(640, 1280, 960),
    floor: flat(640, 1280, 980),
    wide: () => [960, 560, 1],
    rim: 'popRim',
    mediumUp: 110,
  },
};

// ------------------------------------------------------------------ thoi tiet + bang mau toan canh
export type Weather = 'none' | 'rain' | 'snow' | 'leaves' | 'confetti';

/** Hat roi theo thoi tiet, ve trong khong gian man hinh (tren cung). */
export const WeatherFx: React.FC<{ kind?: Weather; t: number }> = ({ kind, t }) => {
  if (!kind || kind === 'none') return null;
  const n = kind === 'rain' ? 90 : kind === 'snow' ? 70 : 40;
  return (
    <g>
      {kind === 'rain' ? <rect width={1920} height={1080} fill="#2A3A6A" opacity={0.18} /> : null}
      {Array.from({ length: n }, (_, i) => {
        const sp = kind === 'rain' ? 34 : kind === 'snow' ? 3 : 4;
        const x0 = rnd(i, 1) * 2100 - 90;
        const y = ((rnd(i, 2) * 1200 + t * sp * (0.7 + rnd(i, 3) * 0.6)) % 1200) - 60;
        if (kind === 'rain') return <path key={i} d={`M ${x0 - y * 0.2} ${y} l -8 34`} stroke="#CFE4FF" strokeWidth={3} opacity={0.7} strokeLinecap="round" />;
        const x = x0 + Math.sin(t * 0.05 + i) * 30;
        if (kind === 'snow') return <circle key={i} cx={x} cy={y} r={4 + rnd(i, 4) * 5} fill="#FFFFFF" opacity={0.9} />;
        const col = kind === 'leaves' ? ['#FF8A3D', '#E8453C', '#FFD15C'][i % 3] : ['#FF4D7A', '#FFD23F', '#5AA9FF', '#5ED3A8', '#B98CFF'][i % 5];
        return <rect key={i} x={x} y={y} width={kind === 'leaves' ? 22 : 14} height={kind === 'leaves' ? 12 : 8} rx={kind === 'leaves' ? 6 : 1} fill={col} transform={`rotate(${t * 4 + i * 40} ${x} ${y})`} />;
      })}
    </g>
  );
};

/** Lop mau phu theo gio trong ngay, ap tren boi canh cu (classic) de dong bo voi bo Pop. */
export const TodWash: React.FC<{ tod: Tod; classic: boolean }> = ({ tod, classic }) => {
  if (tod === 'day' && !classic) return null;
  if (tod === 'sunset') return <rect x={-2000} y={-2000} width={6000} height={6000} fill="#FF7A45" opacity={0.12} style={{ mixBlendMode: 'multiply' }} />;
  if (tod === 'night' && !classic) return <rect x={-2000} y={-2000} width={6000} height={6000} fill="#3A3F8C" opacity={0.42} style={{ mixBlendMode: 'multiply' }} />;
  if (tod === 'dawn') return <rect x={-2000} y={-2000} width={6000} height={6000} fill="#FFB6C8" opacity={0.14} style={{ mixBlendMode: 'multiply' }} />;
  return null;
};

/** Bang mau cua ca tap (CSS filter tren toan canh). */
export const GRADES: Record<string, string> = {
  none: '',
  pop: 'saturate(1.18) contrast(1.04)',
  pastel: 'saturate(0.78) brightness(1.06) contrast(0.94)',
  neon: 'saturate(1.45) contrast(1.12) hue-rotate(-8deg)',
  warm: 'sepia(0.18) saturate(1.15)',
  cool: 'hue-rotate(12deg) saturate(1.05) brightness(1.02)',
  retro: 'sepia(0.32) contrast(0.92) saturate(0.9)',
  dark: 'brightness(0.86) contrast(1.12) saturate(1.05)',
};
export const GRADE_IDS = Object.keys(GRADES);
Object.assign(POP_STAGES, POP_STAGES_ISLAND);
// Studio phong nen cong (cyclorama) kieu anh 3D: tuong xanh, san xam co vach, den roi giua san.
const POP_STAGES_STUDIO: Record<string, StageDef> = {
  studio: {
    label: 'Studio phông nền (3D)',
    hint: 'Phong nen cong mau xanh, san co vach, den roi. Hop voi bo Doll 3D. fx2 = den roi bat theo nhan vat.',
    actors: true,
    back: (c) => {
      const tod = todOf(c);
      const wall = tod === 'night' ? ['#141B33', '#0B1022'] : tod === 'sunset' ? ['#7A4A6E', '#3E2A4E'] : tod === 'dawn' ? ['#6E86B8', '#3A4C7E'] : ['#3A5A92', '#1E2C52'];
      const floor = tod === 'night' ? ['#2A2F44', '#14182A'] : tod === 'sunset' ? ['#6A5A6E', '#3A3044'] : ['#5C6478', '#343A4C'];
      const id = c.id;
      return (
        <g>
          <defs>
            <linearGradient id={`stw${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={wall[1]} />
              <stop offset="1" stopColor={wall[0]} />
            </linearGradient>
            <linearGradient id={`stf${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={floor[0]} />
              <stop offset="1" stopColor={floor[1]} />
            </linearGradient>
            <radialGradient id={`stl${id}`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity={tod === 'night' ? 0.32 : 0.22} />
              <stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </radialGradient>
            <radialGradient id={`stv${id}`} cx="0.5" cy="0.45" r="0.75">
              <stop offset="0.55" stopColor="#000" stopOpacity={0} />
              <stop offset="1" stopColor="#000" stopOpacity={0.45} />
            </radialGradient>
          </defs>
          <rect x={-400} y={-200} width={2720} height={1500} fill={`url(#stw${id})`} />
          {/* nen cong: chuyen tu tuong sang san */}
          <path d="M -400 690 Q 960 640 2320 690 L 2320 1300 L -400 1300 Z" fill={`url(#stf${id})`} />
          <path d="M -400 690 Q 960 640 2320 690" stroke="#FFFFFF" strokeOpacity={0.08} strokeWidth={6} fill="none" />
          {/* vach san phoi canh */}
          <g stroke="#FFFFFF" strokeOpacity={0.09} strokeWidth={2.5}>
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const y = 720 + Math.pow(i / 5, 1.6) * 520;
              return <path key={`h${i}`} d={`M -400 ${y} L 2320 ${y - 30 + i * 4}`} />;
            })}
            {Array.from({ length: 13 }, (_, i) => {
              const x0 = 960 + (i - 6) * 150;
              const x1 = 960 + (i - 6) * 520;
              return <path key={`v${i}`} d={`M ${x0} 700 L ${x1} 1300`} />;
            })}
          </g>
          {(() => {
            const sx = c.fx > 0.5 && (c as any).hero ? (c as any).hero.x : 960;
            return <ellipse cx={sx} cy={930} rx={520} ry={150} fill={`url(#stl${id})`} />;
          })()}
          <rect x={-400} y={-200} width={2720} height={1500} fill={`url(#stv${id})`} />
        </g>
      );
    },
    place: floorPlace(560, 1360, 930),
    surface: flat(600, 1320, 930),
    floor: flat(560, 1360, 950),
    wide: () => [960, 560, 1],
    rim: 'popRim',
    mediumUp: 110,
  },
};
Object.assign(POP_STAGES, POP_STAGES_STUDIO);
Object.assign(POP_STAGES, MALL_STAGES);
Object.assign(POP_STAGES, EXTRA_STAGES);
Object.assign(POP_STAGES, HOSP_STAGES);
Object.assign(POP_STAGES, SCHOOL_STAGES);
Object.assign(POP_STAGES, VENUE_STAGES);
Object.assign(POP_STAGES, PROM_STAGES);
Object.assign(POP_STAGES, STYLE_STAGES);

export const POP_IDS = Object.keys(POP_STAGES);
export { clamp };
