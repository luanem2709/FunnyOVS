// Bo do vat mo rong (30 mon) - ve vector phang, net vien dam cung phong cach Pop/Ink. Goc toa do = day do vat (dat tren san/mat ban).
import React from 'react';

const O = '#1B1530';
const st = { stroke: O, strokeWidth: 4, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
const F = 'Bricolage Grotesque, sans-serif';

export const PROPS2 = [
  'cage', 'bone', 'campfire', 'coffee', 'notebook', 'pen', 'tablet', 'katana', 'play_button', 'camera',
  'sleep_mask', 'price_tag', 'letter', 'lamp', 'chair', 'dog', 'box', 'clapper', 'bulb', 'sticky_note',
  'gift', 'basketball', 'umbrella', 'trophy', 'ticket', 'backpack', 'flashlight', 'key', 'money', 'cactus',
] as const;

export const NORM2: Record<string, number> = {
  cage: 1, bone: 1.2, campfire: 1, coffee: 1.2, notebook: 1, pen: 1.1, tablet: 1, katana: 1, play_button: 1, camera: 1,
  sleep_mask: 1.1, price_tag: 1.1, letter: 1.1, lamp: 1, chair: 1, dog: 1, box: 1, clapper: 1, bulb: 1, sticky_note: 1.1,
  gift: 1, basketball: 1, umbrella: 1, trophy: 1, ticket: 1.1, backpack: 1, flashlight: 1.1, key: 1.2, money: 1, cactus: 1,
};

export const Prop2: React.FC<{ type: string; x: number; y: number; t: number; text?: string }> = ({ type, x, y, t, text }) => {
  const tr = `translate(${x} ${y})`;
  switch (type) {
    case 'cage':
      return (
        <g transform={tr}>
          <rect x={-170} y={-380} width={340} height={380} fill="none" />
          <rect x={-180} y={-400} width={360} height={30} rx={6} fill="#C0282D" {...st} />
          <rect x={-180} y={-24} width={360} height={24} rx={6} fill="#C0282D" {...st} />
          {Array.from({ length: 9 }, (_, i) => <rect key={i} x={-166 + i * 41} y={-372} width={12} height={350} fill="#D9353A" {...st} strokeWidth={3} />)}
          <rect x={-180} y={-220} width={360} height={16} fill="#C0282D" {...st} />
          <rect x={-40} y={-250} width={80} height={60} rx={8} fill="#8E1B1F" {...st} />
          <circle cx={0} cy={-226} r={9} fill="#2A0A0C" />
        </g>
      );
    case 'bone':
      return (
        <g transform={`${tr} rotate(-12)`}>
          <rect x={-60} y={-26} width={120} height={20} rx={10} fill="#F4EBD6" {...st} />
          {[-1, 1].map((s) => <g key={s}><circle cx={s * 64} cy={-30} r={15} fill="#F4EBD6" {...st} /><circle cx={s * 64} cy={-6} r={15} fill="#F4EBD6" {...st} /></g>)}
        </g>
      );
    case 'campfire': {
      const f = Math.sin(t * 0.5) * 6;
      return (
        <g transform={tr}>
          <ellipse cx={0} cy={0} rx={110} ry={20} fill="#000" opacity={0.25} />
          {[-1, 1].map((s) => <rect key={s} x={-90} y={-26} width={180} height={24} rx={12} fill="#8A5A3C" {...st} transform={`rotate(${s * 14})`} />)}
          {[-70, -20, 30, 75].map((cx, i) => <circle key={i} cx={cx} cy={-6} r={16} fill="#8A8FA0" {...st} strokeWidth={3} />)}
          <path d={`M -60 -20 Q -70 ${-110 - f} 0 ${-190 + f} Q 70 ${-110 + f} 60 -20 Z`} fill="#FF7A1A" {...st} />
          <path d={`M -32 -24 Q -36 ${-90 + f} 0 ${-130 - f} Q 36 ${-90 - f} 32 -24 Z`} fill="#FFD23F" />
        </g>
      );
    }
    case 'coffee': {
      const s = Math.sin(t * 0.2) * 6;
      return (
        <g transform={tr}>
          <path d="M -40 -90 L 40 -90 L 32 0 L -32 0 Z" fill="#E8DCC4" {...st} />
          <rect x={-44} y={-104} width={88} height={18} rx={6} fill="#6B4A2A" {...st} />
          <path d="M 38 -70 q 34 0 30 26 q -4 22 -34 18" fill="none" {...st} strokeWidth={6} />
          <rect x={-40} y={-60} width={80} height={26} fill="#C98E58" />
          {[-14, 10].map((dx, i) => <path key={i} d={`M ${dx} -116 q ${10 + s} -20 0 -40 q ${-10 - s} -20 0 -40`} stroke="#B8BCC8" strokeWidth={5} fill="none" opacity={0.7} />)}
        </g>
      );
    }
    case 'notebook':
      return (
        <g transform={tr}>
          <path d="M -150 0 L -140 -30 L 0 -20 L 140 -30 L 150 0 L 0 8 Z" fill="#FFFFFF" {...st} />
          {Array.from({ length: 5 }, (_, i) => <path key={i} d={`M ${-128 + i * 4} ${-22 + i * 0} L -14 -16`} stroke="#8FB8D8" strokeWidth={2} transform={`translate(0 ${i * 4})`} />)}
          {Array.from({ length: 5 }, (_, i) => <path key={i} d={`M 14 ${-16 + i * 4} L 128 ${-22 + i * 4}`} stroke="#8FB8D8" strokeWidth={2} />)}
          <path d="M 0 -20 L 0 8" stroke={O} strokeWidth={3} />
          {text ? <text x={-70} y={-24} textAnchor="middle" fontFamily="Kalam, cursive" fontSize={22} fill="#3A2E50" transform="rotate(-4 -70 -24)">{text.slice(0, 10)}</text> : null}
        </g>
      );
    case 'pen':
      return (
        <g transform={`${tr} rotate(-20)`}>
          <rect x={-90} y={-14} width={150} height={16} rx={6} fill="#2E6FD6" {...st} />
          <path d="M 60 -14 L 92 -6 L 60 2 Z" fill="#F4EBD6" {...st} strokeWidth={3} />
          <rect x={-70} y={-20} width={50} height={6} rx={3} fill="#C9CEDA" stroke={O} strokeWidth={2} />
        </g>
      );
    case 'tablet':
      return (
        <g transform={tr}>
          <rect x={-120} y={-170} width={240} height={170} rx={16} fill="#2A2D3E" {...st} />
          <rect x={-104} y={-154} width={208} height={138} rx={6} fill="#8FB8D8" />
          <path d="M -104 -40 L -40 -90 L 10 -60 L 60 -110 L 104 -70 L 104 -16 L -104 -16 Z" fill="#7CC67A" opacity={0.7} />
          <circle cx={0} cy={-8} r={4} fill="#5A6478" />
        </g>
      );
    case 'katana':
      return (
        <g transform={`${tr} rotate(-6)`}>
          <path d="M -40 -14 Q 120 -24 230 -40 Q 140 -6 -40 2 Z" fill="#E6E9F2" {...st} strokeWidth={3} />
          <rect x={-56} y={-26} width={14} height={40} rx={4} fill="#C9A35A" {...st} strokeWidth={3} />
          <rect x={-160} y={-16} width={104} height={20} rx={8} fill="#2A2238" {...st} strokeWidth={3} />
          {[-140, -116, -92, -68].map((xx) => <path key={xx} d={`M ${xx} -16 l 12 20 m 0 -20 l -12 20`} stroke="#C9A35A" strokeWidth={2} />)}
        </g>
      );
    case 'play_button':
      return (
        <g transform={tr}>
          <rect x={-130} y={-180} width={260} height={180} rx={50} fill="#E8312F" {...st} />
          <path d="M -30 -132 L 50 -90 L -30 -48 Z" fill="#FFFFFF" />
          {text ? <text x={0} y={36} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={32} fill={O}>{text.slice(0, 12)}</text> : null}
        </g>
      );
    case 'camera':
      return (
        <g transform={tr}>
          <rect x={-120} y={-150} width={200} height={130} rx={18} fill="#3A3E52" {...st} />
          <path d="M 80 -120 L 140 -150 L 140 -20 L 80 -50 Z" fill="#5A6478" {...st} />
          <circle cx={-20} cy={-86} r={40} fill="#14182A" {...st} />
          <circle cx={-20} cy={-86} r={20} fill="#2E6FD6" />
          <circle cx={-30} cy={-96} r={6} fill="#FFFFFF" opacity={0.7} />
          <circle cx={-98} cy={-130} r={8} fill={Math.sin(t * 0.3) > 0 ? '#E8312F' : '#5A1A1A'} />
          <rect x={-60} y={-20} width={20} height={20} fill="#3A3E52" stroke={O} strokeWidth={3} />
        </g>
      );
    case 'sleep_mask':
      return (
        <g transform={tr}>
          <path d="M -110 -60 Q -110 -110 -40 -104 Q 0 -96 40 -104 Q 110 -110 110 -60 Q 110 -14 40 -22 Q 0 -40 -40 -22 Q -110 -14 -110 -60 Z" fill="#E6E2C4" {...st} />
          <path d="M -70 -64 q 20 14 40 0 M 30 -64 q 20 14 40 0" stroke={O} strokeWidth={4} fill="none" />
          <path d="M -110 -66 L -160 -74 M 110 -66 L 160 -74" stroke="#B58CFF" strokeWidth={6} />
        </g>
      );
    case 'price_tag':
      return (
        <g transform={`${tr} rotate(-10)`}>
          <path d="M -70 -110 L 50 -110 L 90 -70 L 50 -30 L -70 -30 Z" fill="#FFF3C4" {...st} />
          <circle cx={46} cy={-70} r={8} fill="none" stroke={O} strokeWidth={3} />
          <text x={-12} y={-58} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={34} fill="#C0282D">{(text || '$99').slice(0, 6)}</text>
        </g>
      );
    case 'letter':
      return (
        <g transform={tr}>
          <rect x={-110} y={-130} width={220} height={130} rx={8} fill="#FFFFFF" {...st} />
          <path d="M -110 -130 L 0 -56 L 110 -130" fill="none" {...st} />
          <circle cx={0} cy={-56} r={16} fill="#C0282D" {...st} strokeWidth={3} />
          {text ? <text x={-60} y={-16} fontFamily="Kalam, cursive" fontSize={20} fill={O}>{text.slice(0, 14)}</text> : null}
        </g>
      );
    case 'lamp': {
      const on = text !== 'off';
      return (
        <g transform={tr}>
          {on ? <path d="M -60 -230 L -150 -10 L 120 -10 L 40 -230 Z" fill="#FFE38A" opacity={0.25} /> : null}
          <ellipse cx={0} cy={-8} rx={70} ry={14} fill="#3A3E52" {...st} />
          <path d="M 0 -14 L -20 -150 L 30 -210" fill="none" stroke={O} strokeWidth={10} />
          <path d="M 30 -210 L -70 -270 L -100 -210 Z" fill={on ? '#FFD23F' : '#8FB8D8'} {...st} />
          {on ? <circle cx={-70} cy={-216} r={14} fill="#FFF7D6" /> : null}
        </g>
      );
    }
    case 'chair':
      return (
        <g transform={tr}>
          <rect x={-70} y={-300} width={140} height={150} rx={20} fill="#8A5A3C" {...st} />
          <rect x={-80} y={-160} width={160} height={30} rx={10} fill="#A86E44" {...st} />
          <rect x={-8} y={-130} width={16} height={90} fill="#3A3E52" {...st} strokeWidth={3} />
          <path d="M -80 -20 L 0 -40 L 80 -20 M 0 -40 L 0 -10" stroke={O} strokeWidth={8} fill="none" />
          {[-80, 0, 80].map((cx) => <circle key={cx} cx={cx} cy={-10} r={10} fill="#3A3E52" {...st} strokeWidth={3} />)}
        </g>
      );
    case 'dog': {
      const w = Math.sin(t * 0.8) * 18;
      return (
        <g transform={tr}>
          <path d={`M 90 -110 q 30 ${-20 + w} 40 ${-50 + w}`} stroke={O} strokeWidth={10} fill="none" strokeLinecap="round" />
          <ellipse cx={20} cy={-100} rx={90} ry={50} fill="#E0A45A" {...st} />
          {[-40, -10, 50, 80].map((lx) => <rect key={lx} x={lx - 9} y={-70} width={18} height={70} rx={8} fill="#E0A45A" {...st} strokeWidth={3} />)}
          <circle cx={-80} cy={-160} r={52} fill="#E0A45A" {...st} />
          <path d="M -120 -200 q -30 30 -16 70 q 20 -10 26 -46 Z" fill="#8A5A3C" {...st} strokeWidth={3} />
          <path d="M -40 -200 q 30 30 16 70 q -20 -10 -26 -46 Z" fill="#8A5A3C" {...st} strokeWidth={3} />
          <circle cx={-98} cy={-166} r={8} fill={O} /><circle cx={-62} cy={-166} r={8} fill={O} />
          <ellipse cx={-80} cy={-140} rx={12} ry={8} fill={O} />
          <path d="M -92 -124 q 12 10 24 0" stroke={O} strokeWidth={3} fill="none" />
        </g>
      );
    }
    case 'box':
      return (
        <g transform={tr}>
          <rect x={-90} y={-120} width={180} height={120} fill="#C98E58" {...st} />
          <path d="M -90 -120 L -60 -150 L 120 -150 L 90 -120 Z" fill="#E0A870" {...st} />
          <path d="M 90 -120 L 120 -150 L 120 -30 L 90 0 Z" fill="#A86E44" {...st} />
          <rect x={-20} y={-120} width={40} height={50} fill="#E6E2C4" opacity={0.8} />
          {text ? <text x={0} y={-36} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={24} fill="#5A3A2A">{text.slice(0, 8)}</text> : null}
        </g>
      );
    case 'clapper': {
      const a = Math.max(0, Math.sin(t * 0.25)) * -24;
      return (
        <g transform={tr}>
          <rect x={-110} y={-130} width={220} height={130} rx={6} fill="#2A2D3E" {...st} />
          <g transform={`rotate(${a} -110 -130)`}>
            <rect x={-110} y={-166} width={220} height={36} rx={4} fill="#FFFFFF" {...st} />
            {[-90, -40, 10, 60].map((sx) => <path key={sx} d={`M ${sx} -166 l 26 0 l -20 36 l -26 0 Z`} fill={O} />)}
          </g>
          <text x={0} y={-56} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={30} fill="#FFFFFF">{(text || 'TAKE 1').slice(0, 10)}</text>
        </g>
      );
    }
    case 'bulb': {
      const g = 0.5 + 0.5 * Math.sin(t * 0.3);
      return (
        <g transform={tr}>
          <circle cx={0} cy={-160} r={110} fill="#FFE38A" opacity={0.25 * g} />
          <path d="M -60 -170 A 70 70 0 1 1 60 -170 Q 40 -130 36 -80 L -36 -80 Q -40 -130 -60 -170 Z" fill="#FFD23F" {...st} />
          <path d="M -20 -80 L -10 -140 L 10 -140 L 20 -80" stroke="#E0A030" strokeWidth={4} fill="none" />
          <rect x={-36} y={-80} width={72} height={20} fill="#C9CEDA" {...st} strokeWidth={3} />
          <rect x={-30} y={-60} width={60} height={18} fill="#A8AEBE" {...st} strokeWidth={3} />
          <path d="M -14 -42 L 14 -42 L 6 -28 L -6 -28 Z" fill="#5A6478" stroke={O} strokeWidth={3} />
        </g>
      );
    }
    case 'sticky_note':
      return (
        <g transform={`${tr} rotate(-6)`}>
          <rect x={-90} y={-180} width={180} height={180} fill="#FFE38A" {...st} />
          <path d="M 50 0 L 90 -40 L 90 0 Z" fill="#E8C85A" stroke={O} strokeWidth={3} />
          {(text || 'TO DO').toUpperCase().split('\n').slice(0, 3).map((ln, i) => <text key={i} x={0} y={-120 + i * 44} textAnchor="middle" fontFamily="Kalam, cursive" fontWeight={700} fontSize={34} fill={O}>{ln.slice(0, 9)}</text>)}
        </g>
      );
    case 'gift':
      return (
        <g transform={tr}>
          <rect x={-80} y={-130} width={160} height={130} fill="#E8453C" {...st} />
          <rect x={-90} y={-160} width={180} height={34} fill="#FF6A5A" {...st} />
          <rect x={-14} y={-160} width={28} height={160} fill="#FFD23F" stroke={O} strokeWidth={3} />
          <path d="M 0 -160 q -60 -60 -70 -10 q 20 20 70 10 q 50 10 70 -10 q -10 -50 -70 10 Z" fill="#FFD23F" {...st} strokeWidth={3} />
        </g>
      );
    case 'basketball': {
      const b = Math.abs(Math.sin(t * 0.25)) * 60;
      return (
        <g transform={`translate(${x} ${y - b})`}>
          <circle cx={0} cy={-56} r={56} fill="#F27A1A" {...st} />
          <path d="M -56 -56 L 56 -56 M 0 -112 L 0 0 M -40 -96 Q 0 -56 -40 -16 M 40 -96 Q 0 -56 40 -16" stroke={O} strokeWidth={3} fill="none" />
        </g>
      );
    }
    case 'umbrella':
      return (
        <g transform={tr}>
          <path d="M 0 -300 L 0 -40 q 0 30 -30 30" fill="none" stroke={O} strokeWidth={8} />
          <path d="M -170 -300 Q 0 -460 170 -300 Q 128 -322 86 -300 Q 42 -322 0 -300 Q -42 -322 -86 -300 Q -128 -322 -170 -300 Z" fill="#2E6FD6" {...st} />
          <path d="M -86 -300 Q -40 -420 0 -420 M 86 -300 Q 40 -420 0 -420" stroke="#1E4FA6" strokeWidth={4} fill="none" />
        </g>
      );
    case 'trophy':
      return (
        <g transform={tr}>
          <rect x={-60} y={-40} width={120} height={40} fill="#6B4A2A" {...st} />
          <rect x={-14} y={-90} width={28} height={50} fill="#E0A030" {...st} strokeWidth={3} />
          <path d="M -70 -230 L 70 -230 Q 70 -110 0 -90 Q -70 -110 -70 -230 Z" fill="#FFD23F" {...st} />
          <path d="M -70 -210 q -50 0 -40 40 q 10 30 44 20 M 70 -210 q 50 0 40 40 q -10 30 -44 20" fill="none" stroke={O} strokeWidth={6} />
          <path d="M -30 -200 L -20 -130" stroke="#FFF3B0" strokeWidth={8} strokeLinecap="round" />
        </g>
      );
    case 'ticket':
      return (
        <g transform={`${tr} rotate(-8)`}>
          <path d="M -130 -110 L 130 -110 L 130 -80 A 16 16 0 0 0 130 -48 L 130 -20 L -130 -20 L -130 -48 A 16 16 0 0 0 -130 -80 Z" fill="#FF7AB6" {...st} />
          <path d="M 70 -110 L 70 -20" stroke={O} strokeWidth={3} strokeDasharray="8 8" />
          <text x={-28} y={-54} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={30} fill="#FFFFFF">{(text || 'ADMIT ONE').slice(0, 10)}</text>
        </g>
      );
    case 'backpack':
      return (
        <g transform={tr}>
          <path d="M -40 -250 q 40 -40 80 0" fill="none" stroke={O} strokeWidth={10} />
          <rect x={-90} y={-250} width={180} height={250} rx={50} fill="#2E9E66" {...st} />
          <rect x={-60} y={-120} width={120} height={90} rx={20} fill="#3DBF7E" {...st} />
          <path d="M -60 -96 L 60 -96" stroke={O} strokeWidth={3} />
          <circle cx={0} cy={-96} r={6} fill="#FFD23F" stroke={O} strokeWidth={2} />
        </g>
      );
    case 'flashlight': {
      const on = text !== 'off';
      return (
        <g transform={`${tr} rotate(-12)`}>
          {on ? <path d="M 80 -50 L 420 -170 L 420 70 Z" fill="#FFF3B0" opacity={0.35} /> : null}
          <rect x={-90} y={-70} width={130} height={40} rx={10} fill="#3A3E52" {...st} />
          <path d="M 40 -76 L 90 -90 L 90 -10 L 40 -24 Z" fill="#5A6478" {...st} />
          <rect x={-60} y={-60} width={20} height={20} rx={4} fill="#E8312F" />
        </g>
      );
    }
    case 'key':
      return (
        <g transform={`${tr} rotate(-20)`}>
          <circle cx={-60} cy={-40} r={34} fill="#FFD23F" {...st} />
          <circle cx={-60} cy={-40} r={13} fill="#FFF7E0" stroke={O} strokeWidth={3} />
          <rect x={-28} y={-50} width={120} height={20} fill="#FFD23F" {...st} />
          <path d="M 60 -30 L 60 -6 L 76 -6 L 76 -30 M 88 -30 L 88 -14" stroke={O} strokeWidth={6} fill="none" />
        </g>
      );
    case 'money':
      return (
        <g transform={tr}>
          {[0, 1, 2, 3].map((i) => (
            <g key={i} transform={`translate(${(i % 2) * 8 - 4} ${-i * 14}) rotate(${i % 2 ? 3 : -3})`}>
              <rect x={-110} y={-56} width={220} height={56} rx={6} fill="#7CC67A" {...st} strokeWidth={3} />
              <circle cx={0} cy={-28} r={18} fill="#B8E0A0" stroke={O} strokeWidth={2} />
              <text x={0} y={-20} textAnchor="middle" fontFamily={F} fontWeight={800} fontSize={22} fill="#2E6B3A">$</text>
            </g>
          ))}
        </g>
      );
    case 'cactus':
      return (
        <g transform={tr}>
          <path d="M -60 -90 L 60 -90 L 46 0 L -46 0 Z" fill="#E07A4A" {...st} />
          <rect x={-70} y={-104} width={140} height={20} rx={6} fill="#C9643A" {...st} strokeWidth={3} />
          <rect x={-26} y={-280} width={52} height={190} rx={26} fill="#3DBF7E" {...st} />
          <path d="M -26 -180 q -50 0 -50 -50 l 0 -20" fill="none" stroke={O} strokeWidth={4} />
          <rect x={-90} y={-262} width={34} height={86} rx={17} fill="#3DBF7E" {...st} />
          <rect x={56} y={-240} width={34} height={70} rx={17} fill="#3DBF7E" {...st} />
          <circle cx={0} cy={-284} r={12} fill="#FF7AB6" {...st} strokeWidth={3} />
        </g>
      );
    default:
      return null;
  }
};
