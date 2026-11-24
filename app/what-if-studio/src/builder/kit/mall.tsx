// Bo boi canh "Trung tam thuong mai" (Pop): hanh lang 2 tang, cua chinh co cua cuon, khu an uong co man hinh lon,
// sanh dai phun nuoc co bang dinh vang, cua hang (board = ten + loai hang), quay chup anh, mall mat dien.
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
const floorPlace = (x0: number, x1: number, feet = 930, scale = PS) => (u: number): Place => ({ x: lerp(x0, x1, u), y: feet - 140 * scale, scale });
const flat = (x0: number, x1: number, y: number, scale = 1) => (u: number): Place => ({ x: lerp(x0, x1, u), y, scale });
const ease = (x: number) => { const k = clamp(x); return k * k * (3 - 2 * k); };
const isNight = (c: Ctx) => todOf(c) === 'night';
const fit = (s: string, w: number, max: number) => Math.min(max, (w / Math.max(1, s.length)) * 1.7);

/** Chu bang hieu co nen. */
const Sign: React.FC<{ x: number; y: number; w: number; h: number; text: string; bg: string; fg?: string; glow?: boolean }> = ({ x, y, w, h, text, bg, fg = OL, glow }) => (
  <g>
    {glow ? <rect x={x - 14} y={y - 14} width={w + 28} height={h + 28} rx={18} fill={bg} opacity={0.25} /> : null}
    <B x={x} y={y} width={w} height={h} rx={10} fill={bg} />
    <text x={x + w / 2} y={y + h / 2 + fit(text, w, h * 0.62) * 0.36} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={fit(text, w, h * 0.62)} fill={fg}>{text}</text>
  </g>
);

/** San gach bong co phan chieu. */
const Floor: React.FC<{ y: number; col: string; line: string; c: Ctx }> = ({ y, col, line }) => (
  <g>
    <rect x={-400} y={y} width={2720} height={1300 - y} fill={col} />
    <path d={`M -400 ${y} L 2320 ${y}`} stroke={OL} strokeWidth={W} />
    <g stroke={line} strokeWidth={2.5} opacity={0.5}>
      {[0, 1, 2, 3, 4].map((i) => { const yy = y + 20 + Math.pow(i / 4, 1.5) * (1300 - y); return <path key={i} d={`M -400 ${yy} L 2320 ${yy}`} />; })}
      {Array.from({ length: 15 }, (_, i) => <path key={i} d={`M ${960 + (i - 7) * 170} ${y} L ${960 + (i - 7) * 600} 1300`} />)}
    </g>
    <rect x={-400} y={y + 4} width={2720} height={60} fill="#FFFFFF" opacity={0.12} />
  </g>
);

/** Mat tien cua hang trong mall. shut = cua cuon keo xuong (0..1). */
const Shop: React.FC<{ x: number; y: number; w: number; h: number; col: string; sign: string; night: boolean; shut?: number; glass?: boolean }> = ({ x, y, w, h, col, sign, night, shut = 0, glass = true }) => (
  <g>
    <B x={x} y={y} width={w} height={h} fill={col} />
    <Sign x={x + 24} y={y + 16} w={w - 48} h={Math.min(70, h * 0.2)} text={sign} bg={night ? '#2A2A40' : '#FFFFFF'} fg={night ? col : OL} glow={night} />
    {glass ? (
      <g>
        <B x={x + 24} y={y + Math.min(70, h * 0.2) + 34} width={w - 48} height={h - Math.min(70, h * 0.2) - 34} fill={night ? '#1E2238' : '#CFEFFF'} />
        <path d={`M ${x + 60} ${y + h - 20} L ${x + 140} ${y + 120}`} stroke="#FFFFFF" strokeWidth={14} opacity={night ? 0.06 : 0.45} />
        <path d={`M ${x + w / 2} ${y + 110} L ${x + w / 2} ${y + h}`} stroke={OL} strokeWidth={W} />
      </g>
    ) : null}
    {shut > 0 ? (
      <g>
        <rect x={x + 18} y={y + 92} width={w - 36} height={(h - 92) * shut} fill={night ? '#5A5E70' : '#A9AFBF'} stroke={OL} strokeWidth={W} />
        {Array.from({ length: Math.floor(((h - 92) * shut) / 22) }, (_, i) => <path key={i} d={`M ${x + 18} ${y + 92 + i * 22} L ${x + w - 18} ${y + 92 + i * 22}`} stroke={OL} strokeWidth={2} opacity={0.35} />)}
      </g>
    ) : null}
  </g>
);

/** Thang cuon cheo tu san len tang 2. */
const Escalator: React.FC<{ x: number; night: boolean; t: number }> = ({ x, night, t }) => (
  <g>
    <Pth d={`M ${x} 840 L ${x + 120} 840 L ${x + 470} 470 L ${x + 350} 470 Z`} fill={night ? '#3A3E52' : '#C9CEDA'} />
    {Array.from({ length: 12 }, (_, i) => { const k = ((i + (t * 0.02) % 1) / 12); return <path key={i} d={`M ${lerp(x + 10, x + 360, k)} ${lerp(830, 480, k)} L ${lerp(x + 110, x + 460, k)} ${lerp(830, 480, k)}`} stroke={OL} strokeWidth={2} opacity={0.4} />; })}
    <Pth d={`M ${x - 20} 790 L ${x + 330} 420`} fill="none" strokeWidth={14} stroke={night ? '#22263A' : '#3A3E52'} />
    <Pth d={`M ${x + 140} 790 L ${x + 490} 420`} fill="none" strokeWidth={14} stroke={night ? '#22263A' : '#3A3E52'} />
  </g>
);

const Plant: React.FC<{ x: number; y: number; s?: number }> = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    {[-50, -20, 10, 40].map((a, i) => <Pth key={i} d={`M 0 0 Q ${a} -90 ${a * 1.8} -150 Q ${a * 0.6} -80 0 0 Z`} fill={i % 2 ? '#3FBF7F' : '#2E9E66'} />)}
    <Pth d="M -46 0 L 46 0 L 34 70 L -34 70 Z" fill="#E8A35A" />
  </g>
);

/** Bang dinh vang "CAUTION" tren san, chay tu sau ra truoc tai x. */
const Tape: React.FC<{ x: number; y0: number; skew?: number }> = ({ x, y0, skew = 0 }) => {
  const x1 = x + skew;
  return (
    <g>
      <path d={`M ${x - 14} ${y0} L ${x + 14} ${y0} L ${x1 + 60} 1300 L ${x1 - 60} 1300 Z`} fill="#FFD23F" stroke={OL} strokeWidth={3} />
      {Array.from({ length: 9 }, (_, i) => { const k = (i + 0.5) / 9; const yy = lerp(y0, 1300, Math.pow(k, 1.3)); const xx = lerp(x, x1, Math.pow(k, 1.3)); const ww = lerp(14, 60, Math.pow(k, 1.3)); return <path key={i} d={`M ${xx - ww} ${yy} L ${xx + ww} ${yy - ww * 0.6}`} stroke={OL} strokeWidth={lerp(4, 12, k)} />; })}
    </g>
  );
};

/** Ma-no-canh (nguoi mau trung bay), ve bong toi khi mat dien. */
const Mannequin: React.FC<{ x: number; y: number; s?: number; col: string; pose?: number }> = ({ x, y, s = 1, col, pose = 0 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill={col} stroke={col === '#0B0E1A' ? '#1E2438' : OL} strokeWidth={3}>
    <circle cx={0} cy={-300} r={34} />
    <path d="M -10 -266 L 10 -266 L 12 -244 L -12 -244 Z" />
    <path d="M -54 -240 Q 0 -256 54 -240 L 44 -110 L -44 -110 Z" />
    <path d={`M -54 -236 L ${-80 - pose * 30} -130 L ${-70 - pose * 30} -126 L -44 -200 Z`} />
    <path d={`M 54 -236 L ${80} ${-130 - pose * 60} L ${70} ${-126 - pose * 60} L 44 -200 Z`} />
    <path d="M -44 -112 L -30 0 L -14 0 L -4 -104 L 4 -104 L 14 0 L 30 0 L 44 -112 Z" />
    <path d="M -30 0 L 30 0 L 40 14 L -40 14 Z" />
  </g>
);

/** Con vet xanh trong long, nhun nhay. */
const Parrot: React.FC<{ x: number; y: number; t: number; s?: number }> = ({ x, y, t, s = 1 }) => {
  const bob = Math.sin(t * 0.25) * 6, tilt = Math.sin(t * 0.09) * 10;
  return (
    <g transform={`translate(${x} ${y + bob}) scale(${s}) rotate(${tilt})`}>
      <Pth d="M -10 40 L -30 120 L 0 110 Z" fill="#2E8BFF" />
      <ellipse cx={0} cy={20} rx={34} ry={52} fill="#3FBF5F" stroke={OL} strokeWidth={W} />
      <ellipse cx={-14} cy={30} rx={16} ry={34} fill="#2E9E4E" stroke={OL} strokeWidth={3} />
      <circle cx={6} cy={-34} r={30} fill="#E8453C" stroke={OL} strokeWidth={W} />
      <Pth d="M 30 -40 Q 52 -34 40 -14 L 28 -24 Z" fill="#FFD23F" />
      <circle cx={14} cy={-40} r={8} fill="#FFFFFF" stroke={OL} strokeWidth={2} />
      <circle cx={16} cy={-40} r={4} fill={OL} />
      <path d="M 0 -48 L 24 -44" stroke={OL} strokeWidth={4} strokeLinecap="round" />
    </g>
  );
};

const Cage: React.FC<{ x: number; y: number; t: number; bird?: boolean }> = ({ x, y, t, bird = true }) => (
  <g>
    {bird ? <Parrot x={x} y={y + 40} t={t} s={1.1} /> : null}
    <Pth d={`M ${x - 110} ${y + 200} L ${x - 110} ${y - 40} Q ${x} ${y - 170} ${x + 110} ${y - 40} L ${x + 110} ${y + 200}`} fill="none" stroke="#C9A24A" strokeWidth={6} />
    {[-70, -35, 0, 35, 70].map((d) => <path key={d} d={`M ${x + d} ${y + 200} L ${x + d} ${y - 80 + Math.abs(d) * 0.5}`} stroke="#C9A24A" strokeWidth={4} />)}
    <path d={`M ${x - 80} ${y + 120} L ${x + 80} ${y + 120}`} stroke="#8A5A3A" strokeWidth={8} />
    <B x={x - 130} y={y + 200} width={260} height={30} fill="#C9A24A" />
    <path d={`M ${x} ${y - 125} L ${x} ${y - 180}`} stroke={OL} strokeWidth={4} />
  </g>
);

const shelfRows = (x: number, y: number, w: number, n: number, col: string) => (
  <g>
    <B x={x} y={y} width={w} height={n * 160 + 30} fill={col} />
    {Array.from({ length: n + 1 }, (_, i) => <B key={i} x={x - 10} y={y + i * 160 + 10} width={w + 20} height={20} fill="#8A5A3A" />)}
  </g>
);

const COLORS = ['#FF8A65', '#6FA8FF', '#FFD15C', '#5ED3A8', '#B98CFF', '#E8453C', '#FFFFFF'];

/** Noi dung cua hang theo tu khoa trong board. */
const storeKind = (s: string) => {
  const k = s.toUpperCase();
  if (/SHOE|SNEAK/.test(k)) return 'shoe';
  if (/PET|BIRD|PARROT/.test(k)) return 'pet';
  if (/TOY|GAME/.test(k)) return 'toy';
  if (/ELECTR|PHONE|TECH|TV/.test(k)) return 'tech';
  if (/MATTRESS|BED|SLEEP/.test(k)) return 'bed';
  if (/LAMP|LIGHT/.test(k)) return 'lamp';
  if (/BOOK/.test(k)) return 'book';
  if (/FASHION|CLOTH|WEAR|DRESS|BOUTIQUE/.test(k)) return 'cloth';
  if (/SPORT|SKATE/.test(k)) return 'sport';
  return 'gen';
};

const StoreStuff: React.FC<{ kind: string; c: Ctx; night: boolean }> = ({ kind, c, night }) => {
  const t = c.t;
  if (kind === 'shoe')
    return (
      <g>
        {[[160, 520], [1240, 520]].map(([x, w], j) => (
          <g key={j}>
            {shelfRows(x, 240, w, 3, '#F2E6D8')}
            {Array.from({ length: 3 }, (_, r) => Array.from({ length: Math.floor(w / 92) }, (_, i) => (
              <g key={`${r}${i}`}>
                <B x={x + 14 + i * 92} y={240 + r * 160 + 70} width={80} height={100} fill={COLORS[(i + r + j) % 6]} />
                <path d={`M ${x + 14 + i * 92} ${240 + r * 160 + 92} L ${x + 94 + i * 92} ${240 + r * 160 + 92}`} stroke={OL} strokeWidth={3} />
              </g>
            )))}
          </g>
        ))}
        {[760, 980].map((x, i) => <Pth key={x} d={`M ${x} 640 Q ${x + 10} 590 ${x + 60} 594 L ${x + 120} 620 Q ${x + 170} 628 ${x + 170} 660 L ${x} 660 Z`} fill={i ? '#E8453C' : '#6FA8FF'} />)}
        <B x={720} y={660} width={480} height={30} fill="#8A5A3A" />
      </g>
    );
  if (kind === 'pet')
    return (
      <g>
        <Cage x={600} y={380} t={t} />
        <Cage x={1320} y={400} t={t + 40} bird={false} />
        <B x={900} y={380} width={300} height={220} rx={10} fill={night ? '#12305A' : '#7FD3FF'} />
        {[0, 1, 2].map((i) => { const fx = 940 + ((t * (1.2 + i * 0.4) + i * 80) % 220); return <path key={i} d={`M ${fx} ${440 + i * 50} q 24 -16 44 0 q -20 16 -44 0 Z M ${fx} ${440 + i * 50} l -14 -10 l 0 20 Z`} fill={COLORS[i]} stroke={OL} strokeWidth={2} />; })}
        <B x={880} y={600} width={340} height={30} fill="#8A5A3A" />
        <Sign x={880} y={300} w={340} h={60} text="FISH" bg="#FFFFFF" />
      </g>
    );
  if (kind === 'toy')
    return (
      <g>
        {shelfRows(150, 230, 1620, 3, '#FFF3C4')}
        {Array.from({ length: 3 }, (_, r) => Array.from({ length: 14 }, (_, i) => {
          const x = 200 + i * 112, y = 230 + r * 160 + 160, col = COLORS[(i * 3 + r) % 6], k = (i + r) % 4;
          return k === 0 ? <circle key={`${r}${i}`} cx={x + 30} cy={y - 40} r={34} fill={col} stroke={OL} strokeWidth={3} />
            : k === 1 ? <B key={`${r}${i}`} x={x} y={y - 80} width={70} height={70} fill={col} />
            : k === 2 ? <g key={`${r}${i}`}><circle cx={x + 34} cy={y - 40} r={30} fill="#C98C5A" stroke={OL} strokeWidth={3} /><circle cx={x + 34} cy={y - 90} r={24} fill="#C98C5A" stroke={OL} strokeWidth={3} /></g>
            : <g key={`${r}${i}`}><B x={x + 10} y={y - 110} width={40} height={100} rx={8} fill="#FFD23F" /><path d={`M ${x + 40} ${y - 110} L ${x + 40} ${y - 150}`} stroke={OL} strokeWidth={4} /></g>;
        }))}
      </g>
    );
  if (kind === 'tech')
    return (
      <g>
        {Array.from({ length: 8 }, (_, i) => {
          const x = 220 + (i % 4) * 380, y = 230 + Math.floor(i / 4) * 230, hue = (t * 2 + i * 45) % 360;
          return <g key={i}><B x={x} y={y} width={340} height={200} rx={6} fill="#14182A" /><rect x={x + 12} y={y + 12} width={316} height={176} fill={`hsl(${hue} 70% ${night ? 35 : 55}%)`} opacity={0.85} /></g>;
        })}
        <B x={200} y={700} width={1520} height={40} fill="#E6E9F2" />
        {Array.from({ length: 10 }, (_, i) => <B key={i} x={260 + i * 145} y={640} width={50} height={60} rx={8} fill="#2A2F44" />)}
      </g>
    );
  if (kind === 'bed')
    return (
      <g>
        {[[200, '#6FA8FF'], [1080, '#FF8A65']].map(([x, col], i) => (
          <g key={i}>
            <B x={(x as number)} y={420} width={640} height={60} rx={14} fill="#8A5A3A" />
            <B x={(x as number) + 20} y={560} width={600} height={120} rx={20} fill="#FFFFFF" />
            <B x={(x as number) + 20} y={600} width={600} height={80} rx={12} fill={col as string} />
            <B x={(x as number) + 50} y={530} width={160} height={60} rx={26} fill="#F2EEE6" />
            <B x={(x as number)} y={480} width={30} height={220} fill="#8A5A3A" />
            <B x={(x as number) + 610} y={480} width={30} height={220} fill="#8A5A3A" />
            <Sign x={(x as number) + 420} y={470} w={160} h={60} text={i ? '$499' : '$899'} bg="#FFD23F" />
          </g>
        ))}
        <Sign x={760} y={250} w={400} h={110} text="SALE" bg="#E8453C" fg="#FFFFFF" />
      </g>
    );
  if (kind === 'lamp')
    return (
      <g>
        {Array.from({ length: 9 }, (_, i) => {
          const x = 200 + i * 190, len = 120 + (i % 3) * 60, col = COLORS[i % 6];
          return <g key={i}>
            <path d={`M ${x} 140 L ${x} ${140 + len}`} stroke={OL} strokeWidth={3} />
            <circle cx={x} cy={180 + len} r={90} fill="#FFE38A" opacity={night ? 0.35 : 0.18} />
            <Pth d={`M ${x - 50} ${180 + len} L ${x + 50} ${180 + len} L ${x + 30} ${140 + len} L ${x - 30} ${140 + len} Z`} fill={col} />
          </g>;
        })}
        {[400, 960, 1520].map((x) => <g key={x}><Pth d={`M ${x - 60} 520 L ${x + 60} 520 L ${x + 40} 450 L ${x - 40} 450 Z`} fill="#FFD15C" /><path d={`M ${x} 520 L ${x} 690`} stroke={OL} strokeWidth={8} /><circle cx={x} cy={520} r={110} fill="#FFE38A" opacity={0.25} /></g>)}
      </g>
    );
  if (kind === 'book')
    return (
      <g>
        {shelfRows(150, 220, 1620, 3, '#C98C5A')}
        {Array.from({ length: 3 }, (_, r) => Array.from({ length: 40 }, (_, i) => <B key={`${r}${i}`} x={170 + i * 40} y={220 + r * 160 + 60 + (i % 4) * 8} width={34} height={110 - (i % 4) * 8} fill={COLORS[(i * 7 + r) % 6]} strokeWidth={2} />))}
      </g>
    );
  if (kind === 'cloth')
    return (
      <g>
        {[300, 1200].map((x, j) => (
          <g key={x}>
            <path d={`M ${x} 330 L ${x + 460} 330`} stroke={OL} strokeWidth={8} />
            {Array.from({ length: 7 }, (_, i) => <Pth key={i} d={`M ${x + 20 + i * 62} 336 l 20 0 l 26 30 l -10 16 l -8 -6 l 0 150 l -36 0 l 0 -150 l -8 6 l -10 -16 Z`} fill={COLORS[(i + j * 3) % 6]} />)}
            <path d={`M ${x + 30} 330 L ${x + 30} 700 M ${x + 430} 330 L ${x + 430} 700`} stroke={OL} strokeWidth={6} />
          </g>
        ))}
        <B x={860} y={260} width={200} height={440} rx={100} fill="#BFE6FF" />
        <path d="M 900 340 L 960 290" stroke="#FFFFFF" strokeWidth={10} opacity={0.6} />
        <Mannequin x={1650} y={700} s={0.9} col="#F2EEE6" />
      </g>
    );
  if (kind === 'sport')
    return (
      <g>
        {shelfRows(150, 240, 700, 3, '#E6F2FF')}
        {Array.from({ length: 3 }, (_, r) => Array.from({ length: 6 }, (_, i) => <circle key={`${r}${i}`} cx={210 + i * 112} cy={240 + r * 160 + 130} r={40} fill={['#FF8A65', '#FFFFFF', '#FFD15C'][r]} stroke={OL} strokeWidth={3} />))}
        {Array.from({ length: 5 }, (_, i) => <g key={i} transform={`translate(${1050 + i * 150} 300) rotate(70)`}><B x={0} y={0} width={330} height={70} rx={34} fill={COLORS[i]} /><circle cx={60} cy={80} r={18} fill={OL} /><circle cx={270} cy={80} r={18} fill={OL} /></g>)}
      </g>
    );
  return (
    <g>
      {shelfRows(150, 240, 1620, 3, '#F2E6D8')}
      {Array.from({ length: 3 }, (_, r) => Array.from({ length: 18 }, (_, i) => <B key={`${r}${i}`} x={170 + i * 88} y={240 + r * 160 + 80} width={70} height={90} fill={COLORS[(i + r * 2) % 6]} strokeWidth={3} />))}
    </g>
  );
};

/** Man hinh LED lon treo tran (dong ho dem nguoc). */
const BigScreen: React.FC<{ x: number; y: number; w: number; h: number; text: string; c: Ctx; dark?: boolean }> = ({ x, y, w, h, text, c, dark }) => {
  const lines = text.split(/\n|\//).map((l) => l.trim()).slice(0, 2);
  const fs = Math.min(...lines.map((l) => fit(l, w - 80, (h - 60) / lines.length * 0.8)));
  return (
    <g>
      <path d={`M ${x + 80} -100 L ${x + 80} ${y} M ${x + w - 80} -100 L ${x + w - 80} ${y}`} stroke={OL} strokeWidth={6} />
      {!dark ? <rect x={x - 40} y={y - 40} width={w + 80} height={h + 80} rx={40} fill="#FF9A3C" opacity={0.18 + 0.05 * Math.sin(c.t * 0.2)} /> : null}
      <B x={x} y={y} width={w} height={h} rx={12} fill="#0B0E1A" />
      {!dark ? lines.map((l, i) => (
        <text key={i} x={x + w / 2} y={y + h / 2 + fs * 0.36 + (i - (lines.length - 1) / 2) * fs * 1.05} textAnchor="middle" fontFamily="Fragment Mono, monospace" fontWeight={700} fontSize={fs} fill="#FFB23F">{l}</text>
      )) : null}
      {!dark ? <rect x={x + 10} y={y + 10} width={w - 20} height={h - 20} fill="url(#mallScan)" opacity={0.25} /> : null}
    </g>
  );
};

const Defs = () => (
  <defs>
    <pattern id="mallScan" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="3" fill="#000" /></pattern>
  </defs>
);

const LOWER = [
  { col: '#5ED3A8', sign: 'SHOES' },
  { col: '#FF8A65', sign: 'PET STORE' },
  { col: '#6FA8FF', sign: 'TOYS' },
  { col: '#FFD15C', sign: 'BOOKS' },
];
const UPPER = [
  { col: '#B98CFF', sign: 'LAMPS' },
  { col: '#FF8A65', sign: 'FASHION' },
  { col: '#5ED3A8', sign: 'SPORTS' },
  { col: '#6FA8FF', sign: 'ELECTRONICS' },
  { col: '#FFD15C', sign: 'MATTRESS' },
];

/** Tran kinh lay sang. */
const Skylight: React.FC<{ c: Ctx; night: boolean }> = ({ c, night }) => (
  <g>
    <rect x={-400} y={-200} width={2720} height={330} fill={night ? '#0E1328' : '#BFE6FF'} />
    {night ? Array.from({ length: 14 }, (_, i) => <circle key={i} cx={(i * 211) % 1920} cy={20 + (i * 53) % 90} r={3} fill="#FFFFFF" opacity={0.5 + 0.4 * Math.sin(c.t * 0.1 + i)} />) : null}
    {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M ${i * 180 - 100} -200 L ${i * 180 - 60} 130`} stroke={night ? '#2A3050' : '#FFFFFF'} strokeWidth={10} />)}
    <rect x={-400} y={120} width={2720} height={20} fill={night ? '#2A3050' : '#E6E9F2'} stroke={OL} strokeWidth={W} />
    {!night ? Array.from({ length: 4 }, (_, i) => <path key={i} d={`M ${200 + i * 480} 140 L ${300 + i * 480} 140 L ${420 + i * 480} 840 L ${160 + i * 480} 840 Z`} fill="#FFFFFF" opacity={0.08} />) : null}
  </g>
);

const MALL: Record<string, StageDef> = {
  mall: {
    label: 'Hành lang trung tâm thương mại (Pop)',
    hint: 'Hanh lang mall 2 tang: cua hang, thang cuon, tran kinh. board = ten cua hang giua (vd PET STORE). fx2 > 0.5 = cua cuon cac cua hang da keo xuong (mall dong cua).',
    actors: true,
    back: (c) => {
      const night = isNight(c), shut = c.fx > 0.5 ? 1 : 0;
      const wall = night ? '#2A2F48' : '#FFF3DE';
      return (
        <g>
          <Defs />
          <rect x={-400} y={-200} width={2720} height={1500} fill={wall} />
          <Skylight c={c} night={night} />
          {UPPER.map((s, i) => <Shop key={i} x={-120 + i * 440} y={160} w={400} h={250} col={night ? '#4A4468' : s.col} sign={s.sign} night={night} shut={shut} />)}
          <B x={-400} y={410} width={2720} height={50} fill={night ? '#3A3E52' : '#E6E9F2'} />
          <rect x={-400} y={355} width={2720} height={55} fill="#BFE6FF" opacity={night ? 0.1 : 0.35} />
          <path d="M -400 355 L 2320 355" stroke={OL} strokeWidth={6} />
          {Array.from({ length: 16 }, (_, i) => <path key={i} d={`M ${i * 150 - 200} 355 L ${i * 150 - 200} 410`} stroke={OL} strokeWidth={3} opacity={0.5} />)}
          {LOWER.map((s, i) => <Shop key={i} x={-60 + i * 470} y={470} w={440} h={370} col={night ? '#4A4468' : s.col} sign={i === 1 && c.shot.board ? c.shot.board : s.sign} night={night} shut={shut} />)}
          <Escalator x={1420} night={night} t={c.t} />
          <Floor y={840} col={night ? '#3A3E52' : '#E9E3F2'} line={night ? '#555A70' : '#C9C2DA'} c={c} />
        </g>
      );
    },
    front: () => (
      <g>
        <Plant x={-40} y={1010} s={1.3} />
        <Plant x={1960} y={1010} s={1.3} />
      </g>
    ),
    place: floorPlace(520, 1400, 930),
    surface: flat(600, 1320, 930),
    floor: flat(520, 1400, 950),
    wide: () => [960, 560, 1],
    rim: 'popRim',
  },
  entrance: {
    label: 'Cửa chính trung tâm thương mại (Pop)',
    hint: 'Cua kinh lon nhin ra bai xe, cua cuon thep. fx2: 1 = dong han, 0.75 = cua cuon SAP xuong trong canh, 0.4 = cua cuon KEO LEN trong canh, 0 = mo (nang chieu vao). board = bien tren cua (mac dinh CLOSED FOR REPAIRS).',
    actors: true,
    back: (c) => {
      const night = isNight(c), f = c.fx;
      const g = f >= 0.9 ? 1 : f >= 0.6 ? ease(c.k / 0.3) : f >= 0.3 ? 1 - ease((c.k - 0.15) / 0.6) : 0;
      const gx = 300, gw = 1320, gy = 290, gh = 550;
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill={night ? '#2A2F48' : '#FFF3DE'} />
          <svg x={gx} y={gy} width={gw} height={gh} viewBox={`0 0 1920 1080`} preserveAspectRatio="xMidYMid slice"><Sky c={c} horizon={760} /></svg>
          <rect x={gx} y={gy + gh * 0.68} width={gw} height={gh * 0.32} fill={night ? '#2A2E3E' : '#8C93A8'} />
          {[0, 1, 2].map((i) => <g key={i}><Pth d={`M ${gx + 120 + i * 420} ${gy + gh - 70} l 0 -50 q 10 -40 60 -44 l 40 -36 l 140 0 l 50 40 q 50 4 50 40 l 0 50 Z`} fill={COLORS[i * 2]} /><circle cx={gx + 180 + i * 420} cy={gy + gh - 66} r={20} fill={OL} /><circle cx={gx + 360 + i * 420} cy={gy + gh - 66} r={20} fill={OL} /></g>)}
          {[0, 1, 2, 3].map((i) => <path key={i} d={`M ${gx + i * gw / 4} ${gy} L ${gx + i * gw / 4} ${gy + gh}`} stroke={OL} strokeWidth={10} />)}
          <rect x={gx} y={gy} width={gw} height={gh} fill="#CFEFFF" opacity={night ? 0.08 : 0.2} />
          <rect x={gx} y={gy} width={gw} height={gh} fill="none" stroke={OL} strokeWidth={14} />
          {g > 0 ? (
            <g>
              <rect x={gx} y={gy} width={gw} height={gh * g} fill={night ? '#5A5E70' : '#A9AFBF'} stroke={OL} strokeWidth={W} />
              {Array.from({ length: Math.floor((gh * g) / 26) }, (_, i) => <path key={i} d={`M ${gx} ${gy + gh * g - i * 26} L ${gx + gw} ${gy + gh * g - i * 26}`} stroke={OL} strokeWidth={2.5} opacity={0.4} />)}
              <B x={gx + gw / 2 - 60} y={gy + gh * g - 30} width={120} height={22} fill="#E8453C" />
            </g>
          ) : null}
          <B x={gx - 30} y={gy - 40} width={gw + 60} height={50} fill="#3A3E52" />
          <Sign x={gx + 260} y={150} w={gw - 520} h={80} text={c.shot.board || 'CLOSED FOR REPAIRS'} bg={g > 0.5 ? '#E8453C' : '#5ED3A8'} fg="#FFFFFF" glow />
          {g < 0.5 && !night ? <path d={`M ${gx} ${gy} L ${gx + gw} ${gy} L ${gx + gw + 300} 1300 L ${gx - 300} 1300 Z`} fill="#FFF6C8" opacity={0.18 * (1 - g * 2)} /> : null}
          <Floor y={840} col={night ? '#3A3E52' : '#E9E3F2'} line={night ? '#555A70' : '#C9C2DA'} c={c} />
        </g>
      );
    },
    front: () => (<g><Plant x={140} y={1010} s={1.2} /><Plant x={1780} y={1010} s={1.2} /></g>),
    place: floorPlace(520, 1400, 930),
    surface: flat(600, 1320, 930),
    floor: flat(520, 1400, 950),
    wide: () => [960, 560, 1],
    rim: 'popRim',
  },
  foodcourt: {
    label: 'Khu ăn uống trong mall (Pop)',
    hint: 'Quay an PIZZA, NOODLES, BURGERS, TACOS + man hinh LED lon treo tran. board = chu tren man hinh (vd OPENS IN 30 DAYS; xuong dong bang \\n). fx2 > 0.5 = man hinh tat (mat dien).',
    actors: true,
    back: (c) => {
      const night = isNight(c);
      const stalls = [['PIZZA', '#E8453C'], ['NOODLES', '#FFD15C'], ['BURGERS', '#FF8A65'], ['TACOS', '#5ED3A8']];
      return (
        <g>
          <Defs />
          <rect x={-400} y={-200} width={2720} height={1500} fill={night ? '#1E2A3A' : '#2F6B78'} />
          {stalls.map(([s, col], i) => {
            const x = -40 + i * 500;
            return (
              <g key={i}>
                <B x={x} y={330} width={460} height={510} fill={night ? '#3A3E52' : '#F2EEE6'} />
                <Pth d={`M ${x - 10} 330 ${Array.from({ length: 6 }, (_, j) => `Q ${x + 38 + j * 80} 400 ${x + 70 + j * 80} 330`).join(' ')} L ${x + 470} 330 L ${x + 470} 300 L ${x - 10} 300 Z`} fill={col} />
                <Sign x={x + 40} y={220} w={380} h={70} text={s} bg={night ? '#2A2A40' : '#FFFFFF'} fg={night ? col : OL} glow={night} />
                <B x={x + 40} y={440} width={380} height={130} fill="#14182A" />
                {[0, 1, 2].map((j) => <rect key={j} x={x + 60} y={460 + j * 36} width={200 + ((i + j) % 3) * 50} height={14} rx={7} fill="#FFFFFF" opacity={0.6} />)}
                <B x={x + 20} y={660} width={420} height={180} fill={col} />
                <B x={x + 10} y={640} width={440} height={30} fill="#FFFFFF" />
              </g>
            );
          })}
          <BigScreen x={560} y={30} w={800} h={170} text={c.shot.board || 'REOPENING IN\n30 DAYS'} c={c} dark={c.fx > 0.5} />
          <Floor y={840} col={night ? '#3A3E52' : '#D9D2E6'} line={night ? '#555A70' : '#B9B0CC'} c={c} />
        </g>
      );
    },
    front: (c) => (
      <g>
        {[110, 1810].map((x) => (
          <g key={x}>
            <ellipse cx={x} cy={850} rx={170} ry={30} fill="#FFFFFF" stroke={OL} strokeWidth={W} />
            <path d={`M ${x} 880 L ${x} 1010`} stroke={OL} strokeWidth={14} />
            <B x={x - 70} y={1000} width={140} height={20} fill="#8A5A3A" />
            {[-130, 130].map((d) => <g key={d}><B x={x + d - 40} y={930} width={80} height={20} rx={8} fill="#E8453C" /><path d={`M ${x + d} 950 L ${x + d} 1020`} stroke={OL} strokeWidth={8} /></g>)}
          </g>
        ))}
      </g>
    ),
    place: floorPlace(460, 1460, 930),
    surface: flat(110, 1810, 840),
    floor: flat(460, 1460, 950),
    wide: () => [960, 560, 1],
    rim: 'popRimWarm',
  },
  fountain: {
    label: 'Sảnh đài phun nước (Pop)',
    hint: 'Sanh giua mall co dai phun nuoc, tran kinh, ban cong 2 tang. fx2 = bang dinh vang chia doi san: 0 khong co, 0.3 mot vach, 0.7 ba vach. Nhan vat ngoi (sit) tren thanh dai phun nuoc.',
    actors: true,
    back: (c) => {
      const night = isNight(c), t = c.t;
      const n = c.fx >= 0.6 ? 3 : c.fx > 0.1 ? 1 : 0;
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill={night ? '#22283E' : '#FFF3DE'} />
          <Skylight c={c} night={night} />
          <path d="M 360 140 Q 960 -120 1560 140 Z" fill={night ? '#1A2040' : '#DFF3FF'} stroke={OL} strokeWidth={W} />
          {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M ${960 + (i - 2) * 140} 140 Q ${960 + (i - 2) * 60} 30 960 4`} stroke={OL} strokeWidth={3} fill="none" opacity={0.5} />)}
          {UPPER.slice(0, 4).map((s, i) => <Shop key={i} x={-260 + i * 620} y={180} w={540} h={230} col={night ? '#4A4468' : s.col} sign={s.sign} night={night} />)}
          <B x={-400} y={410} width={2720} height={50} fill={night ? '#3A3E52' : '#E6E9F2'} />
          <rect x={-400} y={355} width={2720} height={55} fill="#BFE6FF" opacity={night ? 0.1 : 0.35} />
          <path d="M -400 355 L 2320 355" stroke={OL} strokeWidth={6} />
          {[['SHOES', '#5ED3A8'], ['BOOKS', '#FFD15C'], ['TOYS', '#6FA8FF']].map(([s, col], i) => <Shop key={i} x={-300 + i * 900} y={470} w={540} h={370} col={night ? '#4A4468' : (col as string)} sign={s as string} night={night} />)}
          <Floor y={840} col={night ? '#3A3E52' : '#E9E3F2'} line={night ? '#555A70' : '#C9C2DA'} c={c} />
          {/* dai phun nuoc */}
          <ellipse cx={960} cy={860} rx={430} ry={70} fill="#8FD3FF" stroke={OL} strokeWidth={W} />
          <path d="M 530 860 L 530 900 Q 960 990 1390 900 L 1390 860" fill="#E6E9F2" stroke={OL} strokeWidth={W} />
          <ellipse cx={960} cy={860} rx={400} ry={56} fill={night ? '#2A5A8A' : '#7FD3FF'} />
          <path d="M 920 860 L 930 640 L 990 640 L 1000 860 Z" fill="#E6E9F2" stroke={OL} strokeWidth={W} />
          <ellipse cx={960} cy={640} rx={150} ry={26} fill="#E6E9F2" stroke={OL} strokeWidth={W} />
          {[-1, 1].map((s) => [0, 1, 2].map((j) => {
            const w = Math.sin(t * 0.3 + j) * 6;
            return <path key={`${s}${j}`} d={`M 960 560 Q ${960 + s * (120 + j * 60)} ${470 + j * 20 + w} ${960 + s * (230 + j * 70)} ${840 - j * 6}`} stroke="#BFEFFF" strokeWidth={8 - j * 2} fill="none" opacity={0.85} />;
          }))}
          <path d="M 960 640 L 960 520" stroke="#BFEFFF" strokeWidth={14} opacity={0.9} />
          {Array.from({ length: 10 }, (_, i) => { const k = ((t * 0.04 + i / 10) % 1); return <circle key={i} cx={960 + Math.sin(i * 7) * 60 * k} cy={520 - 60 * Math.sin(k * Math.PI)} r={5} fill="#FFFFFF" opacity={1 - k} />; })}
          {n >= 1 ? <Tape x={960} y0={845} skew={0} /> : null}
          {n >= 3 ? <><Tape x={760} y0={845} skew={-260} /><Tape x={1160} y0={845} skew={260} /></> : null}
        </g>
      );
    },
    front: () => (<g><Plant x={-60} y={1010} s={1.3} /><Plant x={1980} y={1010} s={1.3} /></g>),
    seat: (u) => ({ x: lerp(560, 1360, u), y: 900 - 70 * PS - 4, scale: PS }),
    place: (u) => ({ x: u < 0.5 ? lerp(300, 700, u * 2) : lerp(1220, 1620, (u - 0.5) * 2), y: 960 - 140 * PS, scale: PS }),
    surface: flat(600, 1320, 930),
    floor: flat(400, 1500, 980),
    wide: () => [960, 560, 1],
    rim: 'popRim',
  },
  store: {
    label: 'Bên trong cửa hàng (Pop)',
    hint: 'board = ten cua hang, quyet dinh do ben trong: SHOES (hop giay), PET STORE (long vet nhun nhay + be ca), TOYS, ELECTRONICS (tuong TV), MATTRESS (giuong), LAMPS, BOOKS, FASHION (moc ao, guong), SPORTS (bong, van truot). Khac = ke hang chung.',
    actors: true,
    back: (c) => {
      const night = isNight(c), name = c.shot.board || 'STORE', kind = storeKind(name);
      const wall = { shoe: '#FFE0D0', pet: '#DFF7E6', toy: '#FFF0F6', tech: '#2A2F44', bed: '#E6EEFF', lamp: '#3A3150', book: '#FFF3DE', cloth: '#FFE8F0', sport: '#E6FFF4', gen: '#FFF3DE' }[kind] as string;
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill={night ? '#22263A' : wall} />
          <B x={-400} y={40} width={2720} height={130} fill={night ? '#2A2A40' : '#FFFFFF'} />
          <text x={960} y={140} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={fit(name, 1300, 96)} fill={night ? '#FFB23F' : OL}>{name}</text>
          <StoreStuff kind={kind} c={c} night={night} />
          <Floor y={840} col={night ? '#3A3E52' : '#E3D2C0'} line={night ? '#555A70' : '#C9B29A'} c={c} />
          {night ? <rect x={-400} y={-200} width={2720} height={1500} fill="#0B0E1A" opacity={0.35} /> : null}
        </g>
      );
    },
    front: (c) => (
      <g>
        <B x={1640} y={780} width={420} height={200} fill="#8A5A3A" />
        <B x={1620} y={760} width={460} height={30} fill="#C98C5A" />
        <B x={1700} y={680} width={120} height={80} rx={8} fill="#3A3E52" />
        <rect x={1714} y={694} width={92} height={40} fill="#5ED3A8" opacity={0.8} />
      </g>
    ),
    place: floorPlace(420, 1360, 930),
    surface: flat(1660, 1980, 760),
    floor: flat(420, 1400, 950),
    wide: () => [960, 560, 1],
    rim: 'popRim',
  },
  photobooth: {
    label: 'Quầy chụp ảnh tự động (Pop)',
    hint: 'Quay photo booth co rem do, den bong quanh bien. Nhan vat dung ben trai/giua (spot 0.2-0.6). fx2 > 0 = den flash nhay 4 lan trong canh.',
    actors: true,
    back: (c) => {
      const night = isNight(c), t = c.t;
      const flashOn = c.fx > 0 && [0.15, 0.38, 0.66, 0.88].some((k) => Math.abs(c.k - k) < 0.02);
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill={night ? '#2A2F48' : '#FFF3DE'} />
          {LOWER.map((s, i) => <Shop key={i} x={-300 + i * 540} y={250} w={500} h={590} col={night ? '#3A3658' : s.col} sign={s.sign} night={night} />)}
          <rect x={-400} y={-200} width={2720} height={1500} fill={night ? '#000' : '#FFF3DE'} opacity={night ? 0.35 : 0.45} />
          {/* booth */}
          <B x={1180} y={180} width={520} height={680} rx={16} fill="#E8453C" />
          <B x={1220} y={130} width={440} height={110} rx={14} fill="#FFD23F" />
          <text x={1440} y={208} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={60} fill={OL}>PHOTO BOOTH</text>
          {Array.from({ length: 12 }, (_, i) => <circle key={i} cx={1236 + i * 37} cy={130} r={9} fill="#FFFFFF" opacity={0.5 + 0.5 * Math.sin(t * 0.4 + i)} stroke={OL} strokeWidth={2} />)}
          <B x={1250} y={280} width={260} height={540} fill="#14182A" />
          <Pth d={`M 1250 280 ${Array.from({ length: 5 }, (_, i) => `Q ${1266 + i * 36} ${550 + Math.sin(t * 0.2 + i) * 6} ${1280 + i * 36} 820`).join(' ')} L 1430 820 L 1440 280 Z`} fill="#B0243A" />
          <B x={1540} y={300} width={120} height={300} fill="#FFFFFF" />
          {[0, 1, 2, 3].map((i) => <rect key={i} x={1556} y={314 + i * 70} width={88} height={60} fill={COLORS[i]} stroke={OL} strokeWidth={2} />)}
          <B x={1560} y={660} width={80} height={14} fill={OL} />
          <Floor y={840} col={night ? '#3A3E52' : '#E9E3F2'} line={night ? '#555A70' : '#C9C2DA'} c={c} />
          {flashOn ? <rect x={-400} y={-200} width={2720} height={1500} fill="#FFFFFF" opacity={0.75} /> : null}
        </g>
      );
    },
    place: floorPlace(340, 1240, 930),
    surface: flat(400, 1200, 930),
    floor: flat(340, 1240, 950),
    wide: () => [960, 560, 1],
    rim: 'popRim',
  },
  blackout: {
    label: 'Mall mất điện (Pop)',
    hint: 'Mall toi om: chi con vien cua hang, bien EXIT xanh, hang ma-no-canh dang sau. fx2: 0 = toi han, 0.3-0.6 = den pin chieu theo nhan vat chinh, > 0.7 = den khan cap do nhap nhay.',
    actors: true,
    back: (c) => {
      const t = c.t, f = c.fx;
      const red = f > 0.7 ? 0.25 + 0.2 * Math.max(0, Math.sin(t * 0.5)) : 0;
      return (
        <g>
          <rect x={-400} y={-200} width={2720} height={1500} fill="#070A14" />
          {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={-200 + i * 480} y={300} width={420} height={540} fill="none" stroke="#1E2438" strokeWidth={6} />)}
          <path d="M -400 290 L 2320 290" stroke="#1E2438" strokeWidth={8} />
          <rect x={1580} y={180} width={180} height={70} rx={8} fill="#0E3A22" />
          <text x={1670} y={232} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={48} fill="#3FFF8A">EXIT</text>
          <ellipse cx={1670} cy={215} rx={180} ry={90} fill="#3FFF8A" opacity={0.08} />
          {Array.from({ length: 9 }, (_, i) => <Mannequin key={i} x={-160 + i * 280} y={840} s={0.9 + (i % 3) * 0.08} col="#0B0E1A" pose={(i % 3) * 0.5} />)}
          <rect x={-400} y={840} width={2720} height={460} fill="#0C1020" />
          <path d="M -400 840 L 2320 840" stroke="#1E2438" strokeWidth={4} />
          {red > 0 ? <rect x={-400} y={-200} width={2720} height={1500} fill="#FF2A2A" opacity={red} /> : null}
        </g>
      );
    },
    front: (c, hero) => {
      const f = c.fx;
      const hx = hero ? hero.x : 960;
      return (
        <g>
          <Mannequin x={-20} y={1080} s={1.5} col="#05070E" />
          <Mannequin x={1960} y={1080} s={1.5} col="#05070E" pose={1} />
          {f >= 0.3 && f <= 0.6 ? (
            <g>
              <path d={`M ${hx + 40} 760 L ${hx + 900} 560 L ${hx + 900} 1080 Z`} fill="#FFF6C8" opacity={0.18} />
              <ellipse cx={hx + 700} cy={900} rx={260} ry={120} fill="#FFF6C8" opacity={0.15} />
            </g>
          ) : null}
        </g>
      );
    },
    place: floorPlace(460, 1460, 930),
    surface: flat(600, 1320, 930),
    floor: flat(460, 1460, 950),
    wide: () => [960, 560, 1],
    rim: 'popRim',
  },
};

export default MALL;
