// Do vat dung san: ve bang cac do vat co trong engine, them vai do vat moi cung phong cach (coins).
import React from 'react';
import {
  Mug, Cat, Phone, OpenBook, BookTower, Paper, PaperStack, AlarmClock, LaptopBack, PizzaSlice, PizzaBox, Cookie, CookieStack,
  Plate, PlateTop, CookieTop, WallCalendar, PaperBall, PasteIn, clamp,
} from '../engine';
import type { PropSpec } from './types';
import { Prop2, PROPS2, NORM2 } from './props2';
import { ADDONS } from './kit/addonData';

/** Mot chong dong xu vang: phong cach phang, mat toi phia khuat sang, vien sang am. */
const Coins: React.FC<{ x: number; y: number; n?: number }> = ({ x, y, n = 6 }) => (
  <g>
    <ellipse cx={x + 6} cy={y + 4} rx={46} ry={13} fill="#000" opacity={0.3} />
    {Array.from({ length: n }).map((_, i) => (
      <g key={i} transform={`translate(${x + (i % 2 ? 3 : -2)} ${y - i * 11})`}>
        <ellipse cx={0} cy={0} rx={40} ry={12} fill="#B9862E" />
        <rect x={-40} y={-11} width={80} height={11} fill="#C99434" />
        <ellipse cx={0} cy={-11} rx={40} ry={12} fill="#F2C24E" stroke="#8A5E1E" strokeWidth={2} />
        <ellipse cx={0} cy={-11} rx={26} ry={7} fill="none" stroke="#FFE27A" strokeWidth={3} opacity={0.8} />
      </g>
    ))}
  </g>
);

const OLP = '#1B1530';
/** Do vat dao hoang: ve phang, net vien dam (bo Pop). Goc toa do = day do vat. */
const IslandProp: React.FC<{ type: string; x: number; y: number; t: number; text?: string }> = ({ type, x, y, t, text }) => {
  const st = { stroke: OLP, strokeWidth: 4, strokeLinejoin: 'round' as const };
  switch (type) {
    case 'coconut':
      return (
        <g transform={`translate(${x} ${y})`}>
          <circle cx={0} cy={-34} r={34} fill="#8A5A3C" {...st} />
          <path d="M -20 -48 q 6 -6 12 0 M 4 -52 q 6 -6 12 0" stroke="#5A3A2A" strokeWidth={4} fill="none" />
          <circle cx={-6} cy={-30} r={4} fill="#3A2416" />
          <circle cx={8} cy={-30} r={4} fill="#3A2416" />
          <circle cx={1} cy={-20} r={4} fill="#3A2416" />
        </g>
      );
    case 'fish': {
      const fl = Math.sin(t * 0.6) * 8;
      return (
        <g transform={`translate(${x} ${y - 30}) rotate(${fl})`}>
          <path d="M -60 0 Q -10 -40 40 0 Q -10 40 -60 0 Z" fill="#5AA9FF" {...st} />
          <path d="M 36 0 L 70 -26 L 70 26 Z" fill="#3D86D9" {...st} />
          <circle cx={-34} cy={-6} r={6} fill="#FFFFFF" stroke={OLP} strokeWidth={2.5} />
          <circle cx={-34} cy={-6} r={2.5} fill={OLP} />
          <path d="M -10 -14 Q 0 0 -10 14" stroke="#3D86D9" strokeWidth={4} fill="none" />
        </g>
      );
    }
    case 'crab': {
      const sn = Math.abs(Math.sin(t * 0.5)) * 10;
      return (
        <g transform={`translate(${x + Math.sin(t * 0.15) * 12} ${y})`}>
          {[-1, 1].map((sd) => (
            <g key={sd}>
              {[0, 1, 2].map((k) => <path key={k} d={`M ${sd * 20} -16 L ${sd * (44 + k * 6)} ${-4 + k * 6}`} stroke={OLP} strokeWidth={4} />)}
              <path d={`M ${sd * 26} -30 L ${sd * 46} -60`} stroke={OLP} strokeWidth={5} />
              <path d={`M ${sd * 46} -60 l ${sd * 16} ${-6 - sn} l ${sd * -4} 12 l ${sd * 10} 8 Z`} fill="#E8453C" {...st} />
            </g>
          ))}
          <ellipse cx={0} cy={-22} rx={34} ry={22} fill="#E8453C" {...st} />
          <path d="M -10 -44 L -10 -56 M 10 -44 L 10 -56" stroke={OLP} strokeWidth={4} />
          <circle cx={-10} cy={-58} r={6} fill="#FFFFFF" stroke={OLP} strokeWidth={2.5} />
          <circle cx={10} cy={-58} r={6} fill="#FFFFFF" stroke={OLP} strokeWidth={2.5} />
        </g>
      );
    }
    case 'bottle':
      return (
        <g transform={`translate(${x} ${y}) rotate(-70)`}>
          <rect x={-22} y={-90} width={44} height={90} rx={14} fill="#9FE3D0" opacity={0.85} {...st} />
          <rect x={-10} y={-120} width={20} height={34} fill="#9FE3D0" {...st} />
          <rect x={-11} y={-132} width={22} height={14} rx={3} fill="#B07A4A" {...st} />
          <rect x={-12} y={-74} width={24} height={50} rx={4} fill="#FFF6DD" stroke="#C9A86A" strokeWidth={2} />
        </g>
      );
    case 'banana':
      return (
        <g transform={`translate(${x} ${y})`}>
          {[-14, 0, 14].map((dx, i) => <path key={i} transform={`rotate(${dx} 0 -20)`} d="M -40 -30 Q 0 10 40 -40 Q 36 -26 30 -22 Q 0 -4 -36 -24 Z" fill="#FFD23F" {...st} />)}
          <rect x={30} y={-50} width={10} height={16} fill="#6A8A3A" stroke={OLP} strokeWidth={3} />
        </g>
      );
    case 'shell':
      return (
        <g transform={`translate(${x} ${y})`}>
          <path d="M -36 0 Q -40 -50 0 -56 Q 40 -50 36 0 Z" fill="#FFB8C8" {...st} />
          {[-24, -12, 0, 12, 24].map((dx) => <path key={dx} d={`M ${dx * 0.3} -52 L ${dx} -2`} stroke="#E88AA2" strokeWidth={3} />)}
          <rect x={-14} y={-4} width={28} height={10} rx={4} fill="#FFB8C8" {...st} />
        </g>
      );
    case 'spear':
      return (
        <g transform={`translate(${x} ${y}) rotate(-60)`}>
          <rect x={-5} y={-260} width={10} height={260} fill="#B07A4A" stroke={OLP} strokeWidth={3} />
          <path d="M 0 -300 L 14 -256 L -14 -256 Z" fill="#9AA3BC" {...st} />
        </g>
      );
    case 'raft_sign':
    case 'sign':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x={-6} y={-120} width={12} height={120} fill="#8A5A3C" stroke={OLP} strokeWidth={3} />
          <rect x={-90} y={-180} width={180} height={80} rx={8} fill="#C98C5A" {...st} />
          <text x={0} y={-128} textAnchor="middle" fontFamily="Kalam, cursive" fontWeight={700} fontSize={40} fill="#3A2416">{(text || 'HELP').toUpperCase()}</text>
        </g>
      );
    default:
      return null;
  }
};
export const ISLAND_PROPS = ['coconut', 'fish', 'crab', 'bottle', 'banana', 'shell', 'spear', 'sign'];

export const PROP_IDS = ['coconut', 'fish', 'crab', 'bottle', 'banana', 'shell', 'spear', 'sign', 'mug', 'cat', 'phone', 'phone_call', 'book', 'books', 'paper', 'papers', 'alarm', 'laptop', 'pizza', 'pizzabox', 'cookie', 'cookies', 'plate', 'plate_top', 'cookie_top', 'calendar', 'paperball', 'coins', ...PROPS2];

/** He so de moi do vat co kich co hop ly canh coc ca phe (do vat goc cua engine co kich co khac nhau). */
const NORM: Record<string, number> = {
  phone: 0.38, phone_call: 0.38, paper: 0.4, papers: 0.8, pizzabox: 0.45, plate_top: 0.42, calendar: 0.45, cookie: 1.6,
  cookie_top: 0.8, alarm: 0.6, laptop: 0.7, pizza: 0.6, book: 0.8, books: 0.75, coins: 0.8, plate: 1.0, cookies: 0.9,
  coconut: 1.5, fish: 1.4, crab: 1.4, bottle: 1.3, banana: 1.4, shell: 1.3, spear: 1.2, sign: 1.3,
};

export const PropView: React.FC<{ p: PropSpec; x: number; y: number; scale: number; t: number; len: number }> = ({ p, x, y, scale, t, len }) => {
  const s = scale * (p.size ?? 1) * (NORM[p.type] ?? NORM2[p.type] ?? 1);
  const yy = y - (p.dy ?? 0);
  let el: React.ReactNode = null;
  switch (p.type) {
    case 'mug': el = <Mug x={x} y={yy} rot={0} f={t} />; break;
    case 'cat': el = <Cat x={x} y={yy} mood={p.mood ?? 'sleep'} f={t} />; break;
    case 'phone': el = <Phone x={x} y={yy} w={170} f={t} />; break;
    case 'phone_call': el = <Phone x={x} y={yy} w={170} on={1} caller={(p.text || 'MUM').toUpperCase()} buzz={1} f={t} />; break;
    case 'book': el = <OpenBook x={x} y={yy} w={200} turn={clamp(t / Math.max(1, len))} />; break;
    case 'books': el = <BookTower x={x} y={yy} n={6} />; break;
    case 'paper': el = <Paper x={x} y={yy} w={300} done={!!p.text} grade={p.text || 'A+'} fill={1} />; break;
    case 'papers': el = <PaperStack x={x} y={yy} n={6} />; break;
    case 'alarm': el = <AlarmClock x={x} y={yy} text={p.text || '03:00'} />; break;
    case 'laptop': el = <LaptopBack x={x} y={yy} w={180} />; break;
    case 'pizza': el = <PizzaSlice x={x} y={yy} len={200} />; break;
    case 'pizzabox': el = <PizzaBox x={x} y={yy} />; break;
    case 'cookie': el = <Cookie x={x} y={yy} />; break;
    case 'cookies': el = <CookieStack x={x} y={yy} n={5} />; break;
    case 'plate': el = <Plate x={x} y={yy} />; break;
    case 'plate_top': el = <PlateTop x={x} y={yy} r={170} />; break;
    case 'cookie_top': el = <CookieTop x={x} y={yy} r={70} />; break;
    case 'calendar': el = <WallCalendar x={x} y={yy} crossed={Number(p.text) || 9} />; break;
    case 'paperball': el = <PaperBall x={x} y={yy} />; break;
    case 'coins': el = <Coins x={x} y={yy} />; break;
    default: if (ADDONS.props[p.type]) {
      const ap = ADDONS.props[p.type];
      const w = ap.w || 200;
      const h = ap.h || 200;
      el = <image x={x - w / 2} y={yy - h} width={w} height={h}
        href={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '">' + ap.svg + '</svg>')} />;
      break;
    }
    el = ISLAND_PROPS.includes(p.type) ? <IslandProp type={p.type} x={x} y={yy} t={t} text={p.text} /> : (PROPS2 as readonly string[]).includes(p.type) ? <Prop2 type={p.type} x={x} y={yy} t={t} text={p.text} /> : null;
  }
  if (!el) return null;
  const body = s === 1 ? el : <g transform={`translate(${x} ${yy}) scale(${s}) translate(${-x} ${-yy})`}>{el}</g>;
  if (p.at !== undefined && p.at !== null) {
    const t0 = Math.round(clamp(p.at) * len);
    if (t < t0) return null;
    return (
      <PasteIn x={x} y={yy - 40 * s} t={t - t0} color="#FFD27A" ring={70 * s}>
        {body}
      </PasteIn>
    );
  }
  return <g filter="url(#rimR)">{body}</g>;
};
