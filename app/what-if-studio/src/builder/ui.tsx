// Chu va dau hieu tren man hinh (ve theo toa do man hinh, ngoai may quay).
import React from 'react';
import { TitleCard, Tag, Toast, FloatLabel, Sparkle, FocusRings, DizzyStars, Dial, Gauge, HudChip, CountUp, SchLabel, clamp, lerp, easeInOut } from '../engine';
import type { UISpec } from './types';

export const UI_IDS = ['title', 'tag', 'toast', 'float', 'sparkle', 'rings', 'dizzy', 'dial', 'gauge', 'chip', 'count', 'label', 'bubble', 'thought', 'question', 'exclaim', 'hearts', 'speed', 'pow', 'zzz', 'music', 'money', 'idea', 'sweat', 'anger'];

const OL = '#1B1530';
/** Font chu do nguoi dung chon (dat trong makeShot), mac dinh Bricolage. */
export const TEXT_FONT = { family: '', weight: 800, italic: false };
const tf = () => (TEXT_FONT.family ? `${TEXT_FONT.family}, Bricolage Grotesque, sans-serif` : 'Bricolage Grotesque, sans-serif');
const wrapText = (s: string, n: number) => {
  const out: string[] = [];
  let cur = '';
  for (const w of s.split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > n && cur) {
      out.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  return out.slice(0, 3);
};

/** Tach cau "What if you could rewind 10 seconds?" thanh hai dong tieu de. */
export const splitTitle = (text: string): [string, string] => {
  const s = text.trim().replace(/\s+/g, ' ').toUpperCase();
  const m = s.match(/^(WHAT IF (?:YOU|YOUR|WE|THE|A|EVERYONE|NOBODY|HUMANS?)?\s?(?:COULD|WERE|HAD|WAS|DID|CAN|NEVER|ALWAYS|STOPPED|LIVED)?)\s+(.*)$/);
  if (m && m[2]) return [m[1].trim(), m[2]];
  const w = s.split(' ');
  const cut = Math.max(1, Math.min(4, Math.floor(w.length / 2)));
  return [w.slice(0, cut).join(' '), w.slice(cut).join(' ')];
};

/** Tieu de kieu Pop: chu trang vien dam, tu dong xuong dong (toi da 3 dong), nhay vao tung dong. */
const PopTitle: React.FC<{ text: string; t: number; y?: number }> = ({ text, t, y = 150 }) => {
  const words = text.trim().replace(/\s+/g, ' ').toUpperCase().split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > (text.length > 48 ? 26 : 20) && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  const ls = lines.slice(0, 5);
  const longest = Math.max(...ls.map((l) => l.length), 1);
  const size = Math.round(Math.max(48, Math.min(140, 1640 / (longest * 0.7), 340 / (ls.length * 1.02))));
  return (
    <g>
      {ls.map((l, i) => {
        const k = clamp((t - i * 4) / 6);
        const sc = k <= 0 ? 0 : k < 1 ? 0.4 + 0.75 * Math.sin(k * Math.PI * 0.62) : 1;
        const yy = y + i * size * 1.02;
        const accent = i === ls.length - 1;
        return (
          <g key={i} transform={`translate(960 ${yy}) scale(${sc}) rotate(${i % 2 ? 1.5 : -1.5})`}>
            <text x={0} y={size * 0.36} textAnchor="middle" fontFamily={tf()} fontWeight={TEXT_FONT.weight} fontStyle={TEXT_FONT.italic ? 'italic' : 'normal'} fontSize={size} fill={accent ? '#FFD23F' : '#FFFFFF'} stroke="#1B1530" strokeWidth={size * 0.12} strokeLinejoin="round" paintOrder="stroke">
              {l}
            </text>
          </g>
        );
      })}
    </g>
  );
};


/** Nhan chu kieu Pop: to, dam, nen vang vien den, dat TREN dau nhan vat (hoac ben canh neu het cho), khong de len mat. */
const PopTag: React.FC<{ text: string; t: number; target: { x: number; y: number; r?: number }; x?: number; y?: number; mark?: 'x' | 'check' }> = ({ text, t, target, x, y, mark }) => {
  const T = text.toUpperCase();
  const fs = T.length > 14 ? 76 : T.length > 9 ? 90 : 108;
  const w = Math.max(160, T.length * fs * 0.8);
  const h = fs * 1.1;
  const r = target.r ?? 90;
  let px = x ?? target.x;
  let py = y ?? target.y - r * 1.15 - h / 2 - 10;
  if (y === undefined && py - h / 2 < 20) {
    const right = target.x < 960;
    px = x ?? target.x + (right ? 1 : -1) * (r * 1.1 + w / 2 + 20);
    py = Math.max(h / 2 + 24, target.y - r * 0.55);
  }
  px = Math.max(w / 2 + 20, Math.min(1900 - w / 2, px));
  py = Math.max(h / 2 + 20, Math.min(1060 - h / 2, py));
  const k = clamp(t / 7);
  const sc = k <= 0 ? 0 : k < 1 ? 0.5 + 0.62 * Math.sin(k * Math.PI * 0.62) : 1 + 0.02 * Math.sin(t * 0.25);
  const m = clamp((t - 9) / 5);
  return (
    <g transform={`translate(${px} ${py}) scale(${sc}) rotate(-3)`}>
      <BigText text={T} fs={fs} y={fs * 0.36} />
      {mark && m > 0 ? (
        mark === 'x' ? (
          <path d={`M ${w / 2 + 20} -34 L ${w / 2 + 84} 30 M ${w / 2 + 84} -34 L ${w / 2 + 20} 30`} stroke="#E8453C" strokeWidth={18} strokeLinecap="round" strokeDasharray={190} strokeDashoffset={190 * (1 - m)} />
        ) : (
          <path d={`M ${w / 2 + 18} 0 L ${w / 2 + 42} 28 L ${w / 2 + 90} -34`} stroke="#5ED36A" strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={120} strokeDashoffset={120 * (1 - m)} />
        )
      ) : null}
    </g>
  );
};

/** Chu kieu thumbnail: trang day, vien den rat day, bong do; tu co chu so to mau vang. */
export const BigText: React.FC<{ text: string; fs: number; x?: number; y?: number; anchor?: 'middle' | 'start' }> = ({ text, fs, x = 0, y = 0, anchor = 'middle' }) => {
  const words = text.split(' ');
  const props = { fontFamily: tf(), fontWeight: TEXT_FONT.weight, fontStyle: TEXT_FONT.italic ? 'italic' : 'normal', fontSize: fs, textAnchor: anchor, strokeLinejoin: 'round' as const, letterSpacing: fs * 0.04 };
  const spans = (outline: boolean) => words.map((wd, i) => (
    <tspan key={i} fill={outline ? '#0B0810' : /\d/.test(wd) ? '#FFD23F' : '#FFFFFF'}>{(i ? ' ' : '') + wd}</tspan>
  ));
  return (
    <g>
      <text x={x + fs * 0.05} y={y + fs * 0.1} {...props} fill="#0B0810" stroke="#0B0810" strokeWidth={fs * 0.42} opacity={0.5}>{text}</text>
      <text x={x} y={y} {...props} stroke="#0B0810" strokeWidth={fs * 0.34}>{spans(true)}</text>
      <text x={x} y={y} {...props}>{spans(false)}</text>
    </g>
  );
};

/** Bang chu tren cung (DAY 7, RULE #1...) kieu chu to vien den, khong nen. */
const PopToast: React.FC<{ text: string; t: number; x: number; y: number }> = ({ text, t, x, y }) => {
  const fs = text.length > 14 ? 80 : 104;
  const k = clamp(t / 6);
  const sc = k <= 0 ? 0 : k < 1 ? 0.45 + 0.7 * Math.sin(k * Math.PI * 0.62) : 1;
  return (
    <g transform={`translate(${x} ${y}) scale(${sc}) rotate(-2)`}>
      <BigText text={text} fs={fs} y={fs * 0.36} />
    </g>
  );
};

/** Phu de chay tren video: chu trang dam vien den o day khung hinh, toi da 2 dong. */
export const Subtitle: React.FC<{ text: string; t: number }> = ({ text, t }) => {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 34 && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  const ls = lines.length > 2 ? [lines.slice(0, Math.ceil(lines.length / 2)).join(' '), lines.slice(Math.ceil(lines.length / 2)).join(' ')] : lines;
  const fs = ls.some((l) => l.length > 40) ? 54 : 64;
  const a = clamp(t / 3);
  return (
    <g opacity={a}>
      {ls.map((l, i) => (
        <text key={i} x={960} y={1010 - (ls.length - 1 - i) * fs * 1.12} textAnchor="middle" fontFamily={tf()} fontWeight={TEXT_FONT.weight} fontStyle={TEXT_FONT.italic ? 'italic' : 'normal'} fontSize={fs} fill="#FFFFFF" stroke="#0B0810" strokeWidth={fs * 0.13} strokeLinejoin="round" paintOrder="stroke" style={{ filter: 'drop-shadow(0 5px 0 rgba(0,0,0,0.45))' }}>
          {l}
        </text>
      ))}
    </g>
  );
};

export const UIView: React.FC<{ u: UISpec; t: number; len: number; f: number; target: { x: number; y: number; r?: number }; k: number; pop?: boolean }> = ({ u, t, len, f, target, k, pop }) => {
  const t0 = Math.round(clamp(u.at ?? 0) * len);
  const tt = t - t0;
  const x = u.x ?? target.x;
  const y = u.y ?? target.y;
  switch (u.type) {
    case 'title': {
      if (pop) return <PopTitle text={u.text2 ? `${u.text || ''} ${u.text2}` : u.text || 'What if'} t={tt} y={u.y ?? 150} />;
      const lines: [string, string] = u.text2 ? [(u.text || '').toUpperCase(), u.text2.toUpperCase()] : splitTitle(u.text || 'What if');
      const size = Math.round(Math.max(48, Math.min(128, 1640 / (Math.max(lines[1].length, 1) * 0.76))));
      return <TitleCard t={tt} lines={lines} accent={u.accent ? u.accent.toUpperCase() : undefined} accentT={Math.round(len * 0.45)} size={size} y={u.y ?? 175} />;
    }
    case 'tag':
      if (pop) return tt < 0 ? null : <PopTag text={u.text || '?'} t={tt} target={target} x={u.x} y={u.y} mark={u.mark} />;
      return tt < 0 ? null : <Tag x={u.x ?? (target.x > 960 ? target.x - 420 : target.x + 280)} y={u.y ?? Math.max(160, target.y - 160)} t={tt} text={u.text || '?'} mark={u.mark} markT={8} w={Math.max(148, 40 + (u.text || '').length * 30)} />;
    case 'toast':
      if (pop) return tt < 0 ? null : <PopToast text={(u.text || 'DONE').toUpperCase()} t={tt} x={u.x ?? 960} y={u.y ?? 120} />;
      return tt < 0 ? null : <Toast x={u.x ?? 960} y={u.y ?? 200} t={tt} text={(u.text || 'DONE').toUpperCase()} hold={Math.max(20, len - t0 - 10)} />;
    case 'float':
      return tt < 0 ? null : <FloatLabel x={x} y={y - 80} t={tt} text={u.text || '+1'} />;
    case 'sparkle':
      return <Sparkle x={x + 90} y={y - 40} t={tt} s={1.4} />;
    case 'rings':
      return <FocusRings x={x} y={y} t={tt} />;
    case 'dizzy':
      return tt < 0 ? null : <DizzyStars x={x} y={y - 60} t={tt} />;
    case 'dial': {
      const a = u.from ?? 10;
      const b = u.to ?? 0;
      const v = lerp(a, b, easeInOut(k));
      const mx = Math.max(Math.abs(a), Math.abs(b), 1e-6);
      const read = u.text ? u.text : `${v < 0 ? '-' : ''}${String(Math.floor(Math.abs(v))).padStart(2, '0')}.${String(Math.floor((Math.abs(v) % 1) * 100)).padStart(2, '0')}`;
      return <Dial x={u.x ?? 1720} y={u.y ?? 160} p={clamp(Math.abs(v) / mx)} readout={read} />;
    }
    case 'gauge': {
      const p = lerp(u.from ?? 0, u.to ?? 1, easeInOut(k));
      return <Gauge x={u.x ?? 760} y={u.y ?? 140} p={clamp(p)} label={(u.text || 'LEVEL').toUpperCase()} />;
    }
    case 'chip':
      return <HudChip x={u.x ?? 96} y={u.y ?? 112} f={f} label={(u.text || 'POWER').toUpperCase()} icon={u.icon ?? 'dot'} />;
    case 'count':
    {
      const to = u.to ?? 100;
      const dec = Math.min(3, (String(to).split('.')[1] || '').length);
      // nam (1000-2199, khong don vi) hien khong co dau phay: 1997 thay vi 1,997
      const isYear = dec === 0 && to >= 1000 && to < 2200 && !u.text;
      const fmt = dec > 0 ? (v: number) => v.toFixed(dec) : isYear ? (v: number) => String(Math.round(v)) : undefined;
      // co chu tu dong nho lai cho vua khung; chu sau so cach mot khoang trang
      const suf = u.text ? ' ' + u.text.trim() : '';
      const chars = Math.round(to).toLocaleString('en-US').length + dec + suf.length;
      const size = Math.round(Math.max(56, Math.min(160, 1700 / (chars * 0.62))));
      return tt < 0 ? null : <CountUp x={u.x ?? 960} y={u.y ?? 560} t={tt} to={to} dur={Math.max(10, Math.round(len * 0.6))} size={size} suffix={suf} format={fmt} />;
    }
    case 'label':
      return tt < 0 ? null : <SchLabel x={u.x ?? 960} y={u.y ?? 300} t={tt} text={(u.text || '').toUpperCase()} size={44} />;
    case 'bubble':
    case 'thought': {
      if (tt < 0) return null;
      const lines = wrapText(u.text || '...', 16);
      const fs = 46;
      const w = Math.max(...lines.map((l) => l.length)) * fs * 0.56 + 70;
      const h = lines.length * fs * 1.15 + 50;
      const right = (u.x ?? target.x) < 1300;
      const bx = u.x ?? (right ? target.x + 120 : target.x - 120 - w);
      const by = u.y ?? Math.max(90, target.y - 170 - h);
      const s2 = clamp(tt / 5);
      const sc = s2 < 1 ? 0.6 + 0.5 * Math.sin(s2 * Math.PI * 0.75) : 1;
      const tx = right ? bx + 40 : bx + w - 40;
      return (
        <g transform={`translate(${tx} ${by + h}) scale(${sc}) translate(${-tx} ${-(by + h)})`}>
          {u.type === 'bubble' ? (
            <path d={`M ${tx - 18} ${by + h - 4} L ${right ? target.x + 40 : target.x - 40} ${target.y - 80} L ${tx + 22} ${by + h - 4} Z`} fill="#FFFFFF" stroke={OL} strokeWidth={5} strokeLinejoin="round" />
          ) : (
            <g fill="#FFFFFF" stroke={OL} strokeWidth={4}>
              <circle cx={lerp(tx, target.x, 0.45)} cy={lerp(by + h, target.y - 80, 0.45)} r={16} />
              <circle cx={lerp(tx, target.x, 0.75)} cy={lerp(by + h, target.y - 80, 0.75)} r={9} />
            </g>
          )}
          <rect x={bx} y={by} width={w} height={h} rx={u.type === 'bubble' ? 34 : h / 2} fill="#FFFFFF" stroke={OL} strokeWidth={5} />
          {u.type === 'bubble' ? <path d={`M ${tx - 15} ${by + h - 3} L ${tx + 19} ${by + h - 3}`} stroke="#FFFFFF" strokeWidth={8} /> : null}
          {lines.map((l, i) => (
            <text key={i} x={bx + w / 2} y={by + 25 + fs * 0.9 + i * fs * 1.15} textAnchor="middle" fontFamily={tf()} fontWeight={TEXT_FONT.weight} fontStyle={TEXT_FONT.italic ? 'italic' : 'normal'} fontSize={fs} fill={OL}>
              {l}
            </text>
          ))}
        </g>
      );
    }
    case 'question':
    case 'exclaim': {
      if (tt < 0) return null;
      const s2 = clamp(tt / 5);
      const sc = s2 < 1 ? 0.3 + 0.9 * Math.sin(s2 * Math.PI * 0.6) : 1 + 0.04 * Math.sin(tt * 0.4);
      const cx = u.x ?? target.x + 70;
      const cy = u.y ?? target.y - 200;
      const ch = u.type === 'question' ? '?' : '!';
      return (
        <g transform={`translate(${cx} ${cy}) scale(${sc}) rotate(${u.type === 'question' ? 10 : -6})`}>
          <text x={0} y={50} textAnchor="middle" fontFamily={tf()} fontWeight={TEXT_FONT.weight} fontStyle={TEXT_FONT.italic ? 'italic' : 'normal'} fontSize={170} fill={u.type === 'question' ? '#5AA9FF' : '#FF4D4D'} stroke={OL} strokeWidth={8} paintOrder="stroke">
            {u.text ? u.text : ch}
          </text>
        </g>
      );
    }
    case 'hearts': {
      if (tt < 0) return null;
      return (
        <g>
          {[0, 1, 2, 3, 4].map((i) => {
            const p = ((tt / 30 + i * 0.2) % 1);
            const hx = (u.x ?? target.x) + Math.sin(i * 2.3 + tt * 0.1) * 90;
            const hy = (u.y ?? target.y) - 60 - p * 260;
            return <path key={i} transform={`translate(${hx} ${hy}) scale(${1.4 + i * 0.2})`} d="M 0 10 C -22 -4 -12 -20 0 -9 C 12 -20 22 -4 0 10 Z" fill="#FF4D7A" stroke={OL} strokeWidth={2.5} opacity={1 - p} />;
          })}
        </g>
      );
    }
    case 'speed': {
      return (
        <g opacity={0.85}>
          {Array.from({ length: 34 }, (_, i) => {
            const a = (i / 34) * Math.PI * 2 + Math.sin(i * 7.1) * 0.05;
            const jitter = ((i * 37 + Math.floor(t)) % 7) / 7;
            const r0 = 430 + jitter * 120;
            return <path key={i} d={`M ${960 + Math.cos(a) * r0} ${540 + Math.sin(a) * r0 * 0.62} L ${960 + Math.cos(a) * 1400} ${540 + Math.sin(a) * 900}`} stroke="#FFFFFF" strokeWidth={6 + (i % 3) * 5} strokeLinecap="round" />;
          })}
        </g>
      );
    }
    case 'zzz':
    case 'music': {
      if (tt < 0) return null;
      return (
        <g>
          {[0, 1, 2].map((i) => {
            const p = (tt / 40 + i / 3) % 1;
            const x = (u.x ?? target.x + 60) + p * 80 + Math.sin(p * 6 + i) * 14;
            const y = (u.y ?? target.y - 90) - p * 160;
            const s2 = 0.6 + p * 0.8;
            return u.type === 'zzz' ? (
              <text key={i} x={x} y={y} fontFamily={tf()} fontWeight={TEXT_FONT.weight} fontStyle={TEXT_FONT.italic ? 'italic' : 'normal'} fontSize={54 * s2} fill="#FFFFFF" stroke={OL} strokeWidth={5} paintOrder="stroke" opacity={1 - p * 0.8}>
                Z
              </text>
            ) : (
              <g key={i} transform={`translate(${x} ${y}) scale(${s2}) rotate(${Math.sin(tt * 0.2 + i) * 14})`} opacity={1 - p * 0.8}>
                <path d="M 0 0 L 0 -46 L 28 -54 L 28 -10" stroke={OL} strokeWidth={6} fill="none" strokeLinejoin="round" />
                <ellipse cx={-8} cy={2} rx={11} ry={8} fill={['#5AA9FF', '#FF4D7A', '#FFD23F'][i]} stroke={OL} strokeWidth={4} />
                <ellipse cx={20} cy={-8} rx={11} ry={8} fill={['#5AA9FF', '#FF4D7A', '#FFD23F'][i]} stroke={OL} strokeWidth={4} />
              </g>
            );
          })}
        </g>
      );
    }
    case 'money': {
      if (tt < 0) return null;
      return (
        <g>
          {Array.from({ length: 26 }, (_, i) => {
            const x = ((i * 137) % 1920) + Math.sin(tt * 0.08 + i) * 30;
            const y = ((i * 211) % 400) - 300 + tt * (7 + (i % 4));
            return (
              <g key={i} transform={`translate(${x} ${y % 1300}) rotate(${tt * 3 + i * 40})`}>
                <rect x={-34} y={-16} width={68} height={32} rx={4} fill="#7ED67A" stroke={OL} strokeWidth={3.5} />
                <circle cx={0} cy={0} r={9} fill="none" stroke={OL} strokeWidth={3} />
                <text x={0} y={5} textAnchor="middle" fontSize={14} fontWeight={800} fontFamily="sans-serif" fill={OL}>$</text>
              </g>
            );
          })}
        </g>
      );
    }
    case 'idea': {
      if (tt < 0) return null;
      const s2 = clamp(tt / 5);
      const sc = s2 < 1 ? 0.3 + 0.9 * Math.sin(s2 * Math.PI * 0.6) : 1 + 0.03 * Math.sin(tt * 0.5);
      const cx = u.x ?? target.x;
      const cy = u.y ?? target.y - 210;
      return (
        <g transform={`translate(${cx} ${cy}) scale(${sc})`}>
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <path key={i} d={`M ${Math.cos(a) * 62} ${Math.sin(a) * 62 - 10} L ${Math.cos(a) * 84} ${Math.sin(a) * 84 - 10}`} stroke="#FFD23F" strokeWidth={8} strokeLinecap="round" />;
          })}
          <path d="M 0 -56 C 34 -56 46 -24 32 0 C 24 12 20 20 20 30 L -20 30 C -20 20 -24 12 -32 0 C -46 -24 -34 -56 0 -56 Z" fill="#FFE066" stroke={OL} strokeWidth={5} />
          <rect x={-18} y={30} width={36} height={22} rx={5} fill="#C9CEDA" stroke={OL} strokeWidth={4} />
        </g>
      );
    }
    case 'sweat': {
      if (tt < 0) return null;
      return (
        <g>
          {[0, 1, 2].map((i) => {
            const p = (tt / 18 + i / 3) % 1;
            const sx = (u.x ?? target.x) + [-70, 70, 50][i] + (i === 0 ? -p * 30 : p * 30);
            const sy = (u.y ?? target.y - 40) - 20 + p * 60;
            return <path key={i} transform={`translate(${sx} ${sy})`} d="M 0 -18 Q 12 0 0 10 Q -12 0 0 -18 Z" fill="#8FD3FF" stroke={OL} strokeWidth={3} opacity={1 - p} />;
          })}
        </g>
      );
    }
    case 'anger': {
      if (tt < 0) return null;
      const s2 = 1 + 0.15 * Math.sin(tt * 0.8);
      return (
        <g transform={`translate(${u.x ?? target.x + 70} ${u.y ?? target.y - 80}) scale(${s2})`}>
          {[0, 90, 180, 270].map((r) => (
            <path key={r} transform={`rotate(${r})`} d="M 8 -26 Q 6 -10 26 -8" stroke="#E8453C" strokeWidth={8} fill="none" strokeLinecap="round" />
          ))}
        </g>
      );
    }
    case 'pow': {
      if (tt < 0) return null;
      const s2 = clamp(tt / 4);
      const sc = s2 < 1 ? 0.2 + 1.0 * s2 : 1 + 0.03 * Math.sin(tt * 0.6);
      const cx = u.x ?? (target.x > 960 ? 520 : 1400);
      const cy = u.y ?? 250;
      const pts = Array.from({ length: 24 }, (_, i) => {
        const r = i % 2 ? 150 : 240;
        const a = (i / 24) * Math.PI * 2;
        return `${Math.cos(a) * r * 1.3},${Math.sin(a) * r * 0.75}`;
      }).join(' ');
      return (
        <g transform={`translate(${cx} ${cy}) scale(${sc}) rotate(-6)`}>
          <polygon points={pts} fill="#FFD23F" stroke={OL} strokeWidth={8} strokeLinejoin="round" />
          <text x={0} y={36} textAnchor="middle" fontFamily={tf()} fontWeight={TEXT_FONT.weight} fontStyle={TEXT_FONT.italic ? 'italic' : 'normal'} fontSize={110} fill="#E8453C" stroke={OL} strokeWidth={6} paintOrder="stroke">
            {(u.text || 'BOOM!').toUpperCase()}
          </text>
        </g>
      );
    }
    default:
      return null;
  }
};
